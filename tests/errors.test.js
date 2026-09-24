/* エラー・空状態（辛口レビュー R3）の回帰テスト。実行: node tests/errors.test.js
   - 試問の保存が容量不足で失敗しても下書き・入力・録音を消さない／「保存しました」と言わない
   - 録音の端末保存(IndexedDB)失敗を表示し、保存し直し／ダウンロードで取り戻せる
   - ドライブ送信の失敗が採点・履歴にも残り再送できる／付け直しの再試行は replaceId 付き／復帰時にまとめて再送
   - マイクの失敗理由（権限／無し／使用中）で文言が分かれる
   - 質問0件の試問画面に設定への導線が出る
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
'use strict';
const env = require('./_env');
const c = env.counter();
const GURL = 'https://script.google.com/macros/s/x/exec';
const toastTxt = p => p.evaluate(() => document.getElementById('toast').textContent);
const draft = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_draft_v1') || 'null'));
const sessions = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1') || 'null'));
async function rec(p, id) { await p.click('#rb-' + id); await p.waitForTimeout(900); await p.click('#rb-' + id); await p.waitForTimeout(900); }

(async () => {
  const b = await env.launch();

  /* ---------- A: 試問の保存が QuotaExceeded で失敗 ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await rec(p, 'q1');
    await p.fill('#fEe', 'グエン');
    await p.evaluate(() => {
      const o = Storage.prototype.setItem; window.__origSet = o;
      Storage.prototype.setItem = function (k, v) { if (k === 'oral_exam_sessions_v1') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return o.call(this, k, v); };
    });
    p.once('dialog', d => d.dismiss());
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(400);
    const tt = await toastTxt(p);
    c.ok('A 失敗時に「保存しました」と出さない: ' + tt, !tt.includes('試問を保存しました') && tt.includes('保存に失敗'));
    const d = await draft(p);
    c.ok('A 下書きが残る（受験者・録音）', !!d && d.examinee === 'グエン' && d.items.q1 && d.items.q1.hasAudio);
    c.ok('A 受験者欄が空にならない', await p.inputValue('#fEe') === 'グエン');
    c.ok('A q1 は録音済みのまま', (await p.textContent('#rs-q1')).includes('録音済'));
    c.ok('A 画面内に常設の退避案内（バックアップ/もう一度保存）', await p.locator('#saveErr').count() === 1 && await p.locator('#saveErr button').count() === 2);
    // 再読み込みしても試問が戻り、孤児GCの削除確認が出ない
    let gcAsked = false; p.on('dialog', dd => { if (/どのセッションにも属さない/.test(dd.message())) gcAsked = true; dd.dismiss(); });
    await p.reload(); await p.waitForTimeout(3200);
    c.ok('A 再読み込みで下書きが復元', await p.inputValue('#fEe') === 'グエン' && (await p.textContent('#rs-q1')).includes('録音済'));
    c.ok('A 未保存の試問の録音を「不要な録音」として削除確認しない', !gcAsked);
    // 容量が戻れば保存できる
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(400);
    const s = await sessions(p);
    c.ok('A 復旧後の保存で1件保存・下書き消去', s && s.sessions.length === 1 && s.sessions[0].examinee === 'グエン' && !(await draft(p)));
    c.ok('A 保存成功で案内が消える', await p.locator('#saveErr').count() === 0);
    // 採点の保存失敗：画面を閉じない
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(300);
    await p.click('#scList .hi'); await p.waitForTimeout(500);
    await p.click('.sb[data-id="q1"][data-s="pass"]'); await p.waitForTimeout(100);
    await p.evaluate(() => { const o = window.__origSet = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'oral_exam_sessions_v1') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return o.call(this, k, v); }; });
    await p.click('text=採点を保存'); await p.waitForTimeout(400);
    c.ok('A 採点の保存失敗で採点画面を閉じない', await p.isVisible('#scDetail') && await p.locator('.sb[data-id="q1"][data-s="pass"].sel').count() === 1);
    c.ok('A 採点の保存失敗で「採点を保存しました」と出さない', (await toastTxt(p)).includes('保存に失敗'));
    c.ok('A 保存値は未確定のまま', (await sessions(p)).sessions[0].status !== 'scored');
    await p.evaluate(() => { Storage.prototype.setItem = window.__origSet; });
    await p.click('text=採点を保存'); await p.waitForTimeout(400);
    const st = (await sessions(p)).sessions[0]; c.ok('A 復旧後の採点保存は確定 ' + st.status + ' ' + await toastTxt(p), st.status === 'scored');
    c.ok('A JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- B: 録音の端末保存(IndexedDB)が失敗 ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await p.evaluate(() => { window.__putAudio = putAudio; window.putAudio = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; return Promise.reject(e); }; });
    await rec(p, 'q1');
    c.ok('B 失敗トーストが出る', (await toastTxt(p)).includes('保存に失敗'));
    c.ok('B ステータスに⚠保存失敗が残る', (await p.textContent('#rs-q1')).includes('⚠'));
    c.ok('B 保存し直す／ダウンロードの導線', await p.locator('#rfr-q1').count() === 1 && await p.locator('#rfd-q1[download]').count() === 1);
    c.ok('B hasAudio は立てない', !((await draft(p)) || { items: {} }).items.q1?.hasAudio);
    await p.evaluate(() => { window.putAudio = window.__putAudio; });
    await p.click('#rfr-q1'); await p.waitForTimeout(400);
    c.ok('B 保存し直すと録音済みになる', (await p.textContent('#rs-q1')).includes('録音済') && await p.locator('#rf-q1').count() === 0);
    c.ok('B IndexedDB に音声が入った', await p.evaluate(async () => !!(await getAudio(cur.id + '_q1'))));
    // 録り直しでの失敗は「前の録音が残っています」
    await p.evaluate(() => { window.putAudio = () => Promise.reject(new Error('full')); });
    p.once('dialog', d => d.accept());
    await rec(p, 'q1');
    c.ok('B 録り直し失敗で旧テイクが残る旨を表示', (await p.textContent('#rs-q1')).includes('前の録音が残っています'));
    c.ok('B pageerror（未処理のPromise拒否）なし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- C: ドライブ送信の失敗の見える化・replaceId 付き再送・一括再送 ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    const posts = []; let n = 0, down = false;
    await p.route('https://script.google.com/**', async r => {
      if (down) return r.abort();
      const j = JSON.parse(r.request().postData()); n++; posts.push({ name: j.name, replaceId: j.replaceId || null });
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'F' + n, url: 'https://drive/F' + n }) });
    });
    await p.goto(env.URL);
    await p.evaluate(u => localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: u, auto: true })), GURL);
    await p.reload(); await p.waitForTimeout(300);
    // R5: ドライブ自動保存ONでは受験者名を先に入れないと録音を始めない
    await p.fill('#fEe', 'ブディ');
    await rec(p, 'q1'); await p.waitForTimeout(400);
    c.ok('C 1本目は未判定で送信 ' + posts[0]?.name, posts.length === 1 && posts[0].name.includes('_未判定_'));
    down = true;
    await p.click('#vp-q1'); await p.waitForTimeout(2300);
    c.ok('C 付け直しの失敗がカードに出る', (await p.textContent('#cl-q1')).includes('⚠'));
    c.ok('C 送信状態が下書きに残る（failR）', (await draft(p)).items.q1.driveSt === 'failR');
    down = false;
    await p.click('#cl-q1'); await p.waitForTimeout(600);
    c.ok('C 再試行は replaceId=F1 付き（二重ファイルにしない） ' + JSON.stringify(posts[1]), posts[1] && posts[1].name.includes('_合格_') && posts[1].replaceId === 'F1');
    c.ok('C 成功で送信状態が消える', !(await draft(p)).items.q1.driveSt);
    // 最初の送信から失敗した録音を保存→採点・履歴に「未送信」
    down = true;
    await rec(p, 'q4'); await p.waitForTimeout(500);
    c.ok('C q4 の送信失敗', (await draft(p)).items.q4.driveSt === 'fail');
    await p.fill('#fEe', 'ブディ');
    p.once('dialog', d => d.dismiss());
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(400);
    c.ok('C 保存済みセッションに送信状態が残る', (await sessions(p)).sessions[0].items.q4.driveSt === 'fail');
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(300);
    c.ok('C 採点一覧に☁未送信バッジ', (await p.textContent('#scList')).includes('☁ 1'));
    await p.click('#scList .hi'); await p.waitForTimeout(500);
    c.ok('C 採点画面の q4 に「未送信（タップで再送）」', await p.isVisible('#scl-q4') && (await p.textContent('#scl-q4')).includes('未送信'));
    c.ok('C 送信済みの q1 には出さない', !(await p.isVisible('#scl-q1')));
    // 採点画面で合否を変えて付け直しに失敗→トーストと各問表示
    await p.click('.sb[data-id="q1"][data-s="fail"]'); await p.waitForTimeout(2300);
    c.ok('C 採点画面での送信失敗をトーストで知らせる', (await toastTxt(p)).includes('Googleドライブへ送れません'));
    c.ok('C 採点画面の q1 にも未送信表示', (await p.textContent('#scl-q1')).includes('未送信'));
    await p.click('text=採点を保存'); await p.waitForTimeout(400);
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(300);
    await p.click('#hList .hi'); await p.waitForTimeout(500);
    c.ok('C 履歴詳細にも未送信の再送ボタン', await p.locator('#dcl-q1').count() === 1 && await p.locator('#dcl-q4').count() === 1);
    await p.click('.mx'); await p.waitForTimeout(200);
    // 電波復帰でまとめて再送（付け直しは replaceId 付き・初回失敗分は新規）
    down = false; const before = posts.length;
    await p.evaluate(() => window.dispatchEvent(new Event('online'))); await p.waitForTimeout(2600);
    const sent = posts.slice(before);
    c.ok('C 復帰で2件を再送 ' + JSON.stringify(sent), sent.length === 2);
    c.ok('C q1 は replaceId=F2 で不合格名', sent.some(x => x.name.includes('_不合格_') && x.replaceId === 'F2'));
    c.ok('C q4 は新規送信', sent.some(x => x.replaceId === null));
    const s = (await sessions(p)).sessions[0];
    c.ok('C 再送後は未送信が0件 ' + JSON.stringify([s.items.q1.driveSt, s.items.q4.driveSt, s.status]), !s.items.q1.driveSt && !s.items.q4.driveSt);
    c.ok('C JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- D: マイク失敗の理由別メッセージ ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    await p.goto(env.URL); await p.waitForTimeout(300);
    const msgs = {};
    for (const nm of ['NotAllowedError', 'NotFoundError', 'NotReadableError']) {
      await p.evaluate(nm => { navigator.mediaDevices.getUserMedia = () => { const e = new Error('x'); e.name = nm; return Promise.reject(e); }; }, nm);
      await p.click('#rb-q1'); await p.waitForTimeout(200);
      msgs[nm] = { toast: await toastTxt(p), stat: await p.textContent('#rs-q1') };
    }
    c.ok('D 権限拒否=権限の案内', msgs.NotAllowedError.toast.includes('権限'));
    c.ok('D マイク無し=接続の案内 ' + msgs.NotFoundError.toast, msgs.NotFoundError.toast.includes('見つかりません') && msgs.NotFoundError.stat.includes('見つかりません'));
    c.ok('D 使用中=通話終了の案内 ' + msgs.NotReadableError.toast, msgs.NotReadableError.toast.includes('他のアプリ') && msgs.NotReadableError.stat.includes('使用中'));
    c.ok('D 3つの文言がすべて異なる', new Set(Object.values(msgs).map(x => x.toast)).size === 3);
    await p.evaluate(() => { Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true }); });
    await p.click('#rb-q1'); await p.waitForTimeout(200);
    c.ok('D mediaDevices無し=httpsの案内', (await toastTxt(p)).includes('https'));
    // 4言語すべてに文言がある
    c.ok('D 追加文言が ja/en/vi/id に揃う', await p.evaluate(() => ['micNotFound', 'micBusy', 'micInsecure', 'drvUnsent', 'noItems', 'saveErrMsg', 'recSaveFail'].every(k => ['ja', 'en', 'vi', 'id'].every(L => TX2[L][k]))));
    c.ok('D JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- E: 質問0件の空状態 ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await p.evaluate(() => { cfg.items = []; buildExamCards(); });
    c.ok('E 空状態の案内が出る', await p.locator('#examEmpty').count() === 1 && (await p.textContent('#examEmpty')).includes('質問がありません'));
    await p.fill('#fEe', 'テスト');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(200);
    c.ok('E 保存は「録音がありません」ではなく質問追加の案内', (await toastTxt(p)).includes('質問がありません'));
    await p.click('#emPickSet'); await p.waitForTimeout(300);
    c.ok('E 質問セットを選ぶ→設定タブが開く', await p.evaluate(() => document.getElementById('pgCfg').classList.contains('on')) && await p.locator('#qsetArea').count() === 1);
    c.ok('E JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  await b.close();
  c.done();
})().catch(e => { console.error(e); process.exit(2); });
