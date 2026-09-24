/* 辛口レビュー R5「初回利用の導線」の回帰テスト。実行: node tests/r5-firstrun.test.js
   [1] 新しい端末：URLを初めて保存すると続けて接続テスト→つながれば自動保存が既定ON→録音が実際に送られる
   [1b] 自分でOFFにした人・既存のOFF設定は既定ONで上書きしない／接続OKでもOFFなら「自動保存できます」と言わない
   [2] ドライブ自動保存ONで受験者名が空なら録音を始めない（欄へフォーカス・赤枠）／名前の訂正は保存時に replaceId で付け直す
   [3] 保存せずに受験者名を書き換えると確認→OKで前の人を保存してから次の人へ（録音と○×を付け替えない）
   [4] 名前未入力で「試問を保存」→空の欄へスクロール・フォーカス・aria-invalid
   [5] ドライブ未設定の案内（試問タブ）・閉じたら出さない・設定のドライブ欄へ飛ぶ／ヒーローの状態表示
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
const env = require('./_env');
const T = env.counter();
const GURL = 'https://script.google.com/macros/s/r5test/exec';
async function rec(p, id) { await p.click('#rb-' + id); await p.waitForTimeout(900); await p.click('#rb-' + id); await p.waitForTimeout(900); }
async function setup(b, dialogAns) {
  const { page: p, errors } = await env.newPage(b);
  const posts = []; let n = 0;
  await p.route('https://script.google.com/**', async r => {
    const j = JSON.parse(r.request().postData());
    if (j.ping) { posts.push({ ping: true }); return r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }); }
    n++; posts.push({ name: j.name, examinee: j.examinee, replaceId: j.replaceId || null });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'F' + n, url: 'https://drive/F' + n }) });
  });
  const dialogs = [];
  p.on('dialog', async d => { dialogs.push(d.message()); if (dialogAns.v) await d.accept(); else await d.dismiss(); });
  await p.goto(env.URL); await p.waitForTimeout(300);
  return { p, errors, posts, dialogs };
}
const gcfg = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_google_v1') || 'null'));
const toastTxt = p => p.textContent('#toast');
const audioPosts = posts => posts.filter(x => !x.ping);

(async () => {
  const b = await env.launch();
  const ans = { v: true };

  /* ---------- [1] 新しい端末：URL保存→接続テスト→録音が送られる ---------- */
  {
    console.log('[1] 新しい端末で自動保存が既定ONになる');
    const { p, errors, posts } = await setup(b, ans);
    T.ok('ヒーローに「ドライブ：未設定」', (await p.textContent('#epDrv')).includes('未設定'));
    // 試問タブの案内から設定のドライブ欄へ（閉じた折りたたみを開いて連れて行く）
    await p.click('#drvHintGo'); await p.waitForTimeout(400);
    T.ok('設定タブのドライブ欄が開いてURL欄が見える', await p.isVisible('#gUrl'));
    T.ok('既定では自動保存チェックOFF（未設定）', !(await p.isChecked('#gAuto')));
    await p.fill('#gUrl', GURL);
    await p.click('#pgCfg button[onclick="saveGoogleCfg()"]'); await p.waitForTimeout(500);
    T.ok('初めてのURL保存で続けて接続テストが走る', posts.filter(x => x.ping).length === 1);
    T.ok('接続できたので自動保存が既定ON（保存値）', (await gcfg(p)).auto === true);
    T.ok('チェックボックスもONになる', await p.isChecked('#gAuto'));
    T.ok('トーストでONにしたことを知らせる: ' + await toastTxt(p), (await toastTxt(p)).includes('自動保存をONにしました'));
    await p.click('#gTestBtn'); await p.waitForTimeout(400);
    T.ok('接続OK：自動保存できます', (await p.textContent('#gStatus')).includes('自動保存できます'));
    await p.click('.tabs button[data-pg="pgExam"]'); await p.waitForTimeout(250);
    T.ok('ヒーローに「自動保存：ON」', (await p.textContent('#epDrv')).includes('ON'));
    T.ok('設定済みなら未設定の案内は出ない', !(await p.isVisible('#drvHint')));
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン'); await p.press('#fEe', 'Tab');
    await rec(p, 'q1'); await p.click('#vp-q1'); await p.waitForTimeout(2400);
    const ap = audioPosts(posts);
    T.ok('録音が実際に送信される（1件目） ' + JSON.stringify(ap[0]), ap.length >= 1 && ap[0].examinee === 'グエン');
    T.ok('○で合格名に付け直し ' + JSON.stringify(ap[1]), ap.length === 2 && ap[1].name.includes('_合格_') && ap[1].replaceId === 'F1');
    T.ok('カードに☁保存済み', (await p.textContent('#cl-q1')).includes('ドライブ保存済み'));
    T.ok('[1] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- [1b] OFFを選んだ人は変えない・接続OKでもOFFなら中立の文言 ---------- */
  {
    console.log('[1b] 明示的なOFF・既存のOFF設定を尊重する');
    const { p, errors, posts } = await setup(b, ans);
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(250);
    await p.click('#pgCfg summary[data-t="gTitle"]'); await p.waitForTimeout(150);
    await p.fill('#gUrl', GURL);
    await p.click('#pgCfg button[onclick="saveGoogleCfg()"]'); await p.waitForTimeout(150);
    await p.uncheck('#gAuto'); await p.waitForTimeout(100); // 自分でOFFにした
    const g1 = await gcfg(p);
    T.ok('自分でOFF→auto=false・autoSet=true', g1.auto === false && g1.autoSet === true);
    await p.click('#pgCfg button[onclick="saveGoogleCfg()"]'); await p.waitForTimeout(150);
    T.ok('設定を保存し直してもOFFのまま', (await gcfg(p)).auto === false);
    await p.click('#gTestBtn'); await p.waitForTimeout(400);
    const st = await p.textContent('#gStatus');
    T.ok('接続OKでもOFFなら「自動保存できます」と言わない: ' + st, !st.includes('自動保存できます') && st.includes('自動保存はOFF'));
    T.ok('接続テストでもOFFのまま', (await gcfg(p)).auto === false);
    T.ok('OFFの文言は中立色（緑の接続OK色ではない）', await p.evaluate(() => document.getElementById('gStatus').style.color) === 'var(--sub)');
    await p.click('.tabs button[data-pg="pgExam"]'); await p.waitForTimeout(250);
    T.ok('ヒーローに「自動保存：OFF（録音は端末のみ）」', (await p.textContent('#epDrv')).includes('OFF'));
    // 既存ユーザーの保存値 {url, auto:false}（autoSet なし）も接続テストで勝手にONにしない
    await p.evaluate(u => localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: u, token: '', folder: 'x', auto: false })), GURL);
    await p.reload(); await p.waitForTimeout(300);
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(250);
    await p.click('#pgCfg summary[data-t="gTitle"]'); await p.waitForTimeout(150);
    await p.click('#gTestBtn'); await p.waitForTimeout(400);
    T.ok('既存のOFF設定は接続テストでもOFFのまま', (await gcfg(p)).auto === false);
    T.ok('OFFでは録音を送らない（pingのみ）', audioPosts(posts).length === 0);
    T.ok('[1b] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- [2] 受験者名が空なら録音を始めない／名前の訂正は保存時に付け直す ---------- */
  {
    console.log('[2] 名前なしで録音を始めない・名前の訂正を保存時に付け直す');
    const { p, errors, posts, dialogs } = await setup(b, ans);
    await p.evaluate(u => localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: u, auto: true })), GURL);
    await p.reload(); await p.waitForTimeout(300);
    await p.setViewportSize({ width: 375, height: 700 });
    await p.locator('#rb-q4').scrollIntoViewIfNeeded();
    await p.click('#rb-q4'); await p.waitForTimeout(700);
    T.ok('録音が始まらない', await p.locator('.recbtn.recording').count() === 0 && await p.evaluate(() => !active));
    T.ok('受験者名を促すトースト: ' + await toastTxt(p), (await toastTxt(p)).includes('受験者名'));
    T.ok('受験者名欄にフォーカス', await p.evaluate(() => document.activeElement.id) === 'fEe');
    T.ok('受験者名欄に赤枠（aria-invalid）', await p.getAttribute('#fEe', 'aria-invalid') === 'true');
    T.ok('受験者名欄が画面内', await p.evaluate(() => { const r = document.getElementById('fEe').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    T.ok('何も送られない', audioPosts(posts).length === 0);
    await p.fill('#fEe', 'グエン');
    T.ok('入力で赤枠が消える', await p.getAttribute('#fEe', 'aria-invalid') === null);
    await p.press('#fEe', 'Tab');
    await rec(p, 'q4'); await p.waitForTimeout(500);
    T.ok('名前を入れると録音でき、受験者名で送る ' + JSON.stringify(audioPosts(posts)), audioPosts(posts).length === 1 && audioPosts(posts)[0].examinee === 'グエン');
    // 綴りの訂正だけ（確認→キャンセル＝名前の訂正）
    ans.v = false; dialogs.length = 0;
    await p.fill('#fEe', 'グエン・ヴァン・アン'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(200);
    T.ok('名前変更で確認が出る: ' + (dialogs[0] || '').split('\n')[0], dialogs.some(d => d.includes('グエンさんの録音1問')));
    T.ok('キャンセル＝訂正：名前は新しいまま・録音は残る', await p.inputValue('#fEe') === 'グエン・ヴァン・アン' && await p.evaluate(() => cur.items.q4 && cur.items.q4.hasAudio));
    await p.fill('#fEr', '岡田');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(2400);
    const last = audioPosts(posts).pop();
    T.ok('保存時に確定した名前で付け直し送信（replaceId=F1） ' + JSON.stringify(last), audioPosts(posts).length === 2 && last.examinee === 'グエン・ヴァン・アン' && last.replaceId === 'F1');
    const s = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions[0]);
    T.ok('保存済みのドライブ情報が新しいファイル・名前に更新', s.items.q4.driveFileId === 'F2' && s.items.q4.driveEe === 'グエン・ヴァン・アン');
    T.ok('[2] JSエラーなし ' + errors.join('|'), errors.length === 0);
    ans.v = true;
    await p.close();
  }

  /* ---------- [3] 保存せずに名前を書き換え→前の人を保存してから次の人へ ---------- */
  {
    console.log('[3] 名前の書き換えで前の人の録音と○×を付け替えない');
    const { p, errors, dialogs } = await setup(b, ans);
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン'); await p.press('#fEe', 'Tab');
    await rec(p, 'q1'); await p.click('#vp-q1'); await p.waitForTimeout(200);
    dialogs.length = 0;
    await p.fill('#fEe', 'スリ'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(800);
    T.ok('確認が出る（録音1問・合否1問） ' + (dialogs[0] || '').split('\n')[0], dialogs[0] && dialogs[0].includes('グエンさんの録音1問・合否1問'));
    const ss = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1') || '{"sessions":[]}').sessions);
    T.ok('グエンの試問として保存された（q1=合格）', ss.length === 1 && ss[0].examinee === 'グエン' && ss[0].items.q1.hasAudio && ss[0].items.q1.score === 'pass');
    T.ok('名前欄はスリ・新しい試問は空', await p.inputValue('#fEe') === 'スリ' && await p.evaluate(() => cur.examinee === 'スリ' && !Object.keys(cur.items).length && cur.id !== undefined));
    T.ok('カードは未録音・○×なしに戻る', (await p.textContent('#rs-q1')).includes('未録音') && await p.locator('#q-q1 .vb.on').count() === 0);
    T.ok('下書きもスリ・録音なし', await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('oral_exam_draft_v1') || 'null'); return !d || (d.examinee === 'スリ' && !Object.values(d.items || {}).some(x => x && x.hasAudio)); }));
    T.ok('次の人を始めたトースト: ' + await toastTxt(p), (await toastTxt(p)).includes('スリさんの試問を始めます'));
    T.ok('グエンの録音は端末に残る', await p.evaluate(async id => !!(await getAudio(id + '_q1')), ss[0].id));
    // 前の人の名前が空（初回入力）なら確認しない
    dialogs.length = 0;
    await p.fill('#fEe', ''); await p.press('#fEe', 'Tab'); await p.fill('#fEe', 'ブディ'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(200);
    T.ok('録音も○×も無ければ確認しない', dialogs.length === 0);
    T.ok('[3] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- [4] 名前未入力の保存→空の欄へ ---------- */
  {
    console.log('[4] 保存時の入力漏れを欄で示す');
    const { p, errors } = await setup(b, ans);
    await p.setViewportSize({ width: 375, height: 700 });
    await p.evaluate(() => localStorage.removeItem('oral_exam_last_examiner'));
    await p.fill('#fEr', ''); await p.fill('#fEe', '');
    await rec(p, 'q1');
    await p.locator('button:has-text("試問を保存")').scrollIntoViewIfNeeded();
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(700);
    T.ok('試問者名欄にフォーカス', await p.evaluate(() => document.activeElement.id) === 'fEr');
    T.ok('両方の欄に赤枠', await p.getAttribute('#fEr', 'aria-invalid') === 'true' && await p.getAttribute('#fEe', 'aria-invalid') === 'true');
    T.ok('欄が画面内に来る', await p.evaluate(() => { const r = document.getElementById('fEr').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }));
    await p.fill('#fEr', '岡田'); await p.waitForTimeout(100);
    await p.locator('button:has-text("試問を保存")').scrollIntoViewIfNeeded();
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(700);
    T.ok('次は受験者名欄にフォーカス', await p.evaluate(() => document.activeElement.id) === 'fEe');
    await p.fill('#fEe', 'テスト'); await p.fill('#fDate', '');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(700);
    T.ok('日付が空なら日付欄にフォーカス・赤枠', await p.evaluate(() => document.activeElement.id) === 'fDate' && await p.getAttribute('#fDate', 'aria-invalid') === 'true');
    T.ok('375px幅で横スクロールなし', await p.evaluate(() => document.documentElement.scrollWidth <= 375));
    T.ok('[4] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- [5] 未設定の案内：閉じたら出さない・4言語 ---------- */
  {
    console.log('[5] ドライブ未設定の案内');
    const { p, errors } = await setup(b, ans);
    T.ok('未設定の案内が出る', await p.isVisible('#drvHint') && (await p.textContent('#drvHint')).includes('この端末だけ'));
    const order = await p.evaluate(() => { const h = document.getElementById('examHowto'), d = document.getElementById('drvHint'); return !!(h.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING); });
    T.ok('使い方の下に置かれる', order);
    await p.click('#drvHintX'); await p.waitForTimeout(100);
    T.ok('閉じると消える・新しいキーに記録', !(await p.isVisible('#drvHint')) && await p.evaluate(() => localStorage.getItem('oral_exam_drvhint_off')) === '1');
    await p.reload(); await p.waitForTimeout(300);
    T.ok('再読み込み後も出さない', !(await p.isVisible('#drvHint')));
    T.ok('ヒーローの状態表示は残る', (await p.textContent('#epDrv')).includes('未設定'));
    for (const [L, w] of [['vi', 'Drive'], ['id', 'Drive'], ['en', 'Drive']]) {
      await p.click(`.lsw button:has-text("${L.toUpperCase()}")`); await p.waitForTimeout(150);
      T.ok(`ヒーローが${L}に追従: ` + await p.textContent('#epDrv'), (await p.textContent('#epDrv')).includes(w) && !(await p.textContent('#epDrv')).includes('未設定'));
    }
    await p.click('.lsw button:has-text("JP")');
    T.ok('追加文言が ja/en/vi/id に揃う', await p.evaluate(() => ['drvConnNoAuto', 'gAutoOn', 'drvOn', 'drvOff', 'drvNone', 'drvHint', 'drvHintGo', 'needEe', 'eeSwitch', 'eeSwitched', 'eeSwitchFail'].every(k => ['ja', 'en', 'vi', 'id'].every(L => TX2[L][k]))));
    T.ok('既存のlocalStorageキー名は不変', await p.evaluate(() => GKEY === 'oral_exam_google_v1' && DRAFTKEY === 'oral_exam_draft_v1'));
    T.ok('[5] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
