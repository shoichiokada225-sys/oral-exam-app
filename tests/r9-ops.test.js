/* R9「試問当日の運用」の回帰テスト。実行: node tests/r9-ops.test.js
   ・名前の候補（datalist）と表記ゆれの確認（既存の表記にそろえる）・履歴から名前を直す（1件／同じ人の全件）
   ・名前を直してドライブへ送り直すと、旧名フォルダの旧ファイルを driveOrphan に記録し案内する
   ・受験者名の入力中は送らず、欄を離れたら送る
   ・保存済みの試問を「続ける」（同じ id・音声キーそのまま）／同じ日の同じ人：まとめる・追試（_2回目）
   ・保存後は受験者名欄へフォーカス／名前なし録音の促し／下書き復元の案内（○×だけの下書きも復元）
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
const env = require('./_env');
const T = env.counter();
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();

async function setup(b, opt) {
  const { page: p, errors } = await env.newPage(b);
  const posts = []; let n = 0;
  await p.route('https://script.google.com/**', async r => {
    const j = JSON.parse(r.request().postData());
    if (j.ping) return r.fulfill({ contentType: 'application/json', body: '{"ok":true,"ping":true}' });
    n++; posts.push({ examinee: j.examinee, date: j.date, name: j.name, replaceId: j.replaceId || null, id: 'F' + n });
    await new Promise(s => setTimeout(s, 150));
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'F' + n, url: 'https://drive/F' + n }) });
  });
  const dlg = { log: [], plan: [] };
  p.on('dialog', d => { dlg.log.push(d.message()); const a = dlg.plan.shift() || 'accept'; (a === 'accept' ? d.accept() : d.dismiss()).catch(() => {}); });
  await p.goto(env.URL);
  await p.evaluate(o => {
    localStorage.clear();
    if (o && o.drive) localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: 'https://script.google.com/macros/s/x/exec', auto: true, autoSet: true }));
    if (o && o.sessions) localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: o.sessions }));
  }, opt || {});
  await p.reload(); await p.waitForTimeout(350);
  return { p, errors, posts, dlg };
}
async function rec(p, id) { await p.click('#rb-' + id); await p.waitForTimeout(1000); await p.click('#rb-' + id); await p.waitForTimeout(1300); }
const sess = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1') || '{"sessions":[]}').sessions);
const hasKey = (p, k) => p.evaluate(k => getAudio(k).then(b => !!b), k);
const mk = (id, ee, date, items, extra) => Object.assign({ id, date, examiner: '岡田', examinee: ee, items, overall: '', status: 'scored', createdAt: date + 'T01:00:00.000Z' }, extra || {});

(async () => {
  const b = await env.launch();

  // ---- 1. 名前の比較キー・候補・表記ゆれの確認 ----
  console.log('[1] 名前の候補と表記ゆれ');
  {
    const XSS = '"><img src=x onerror="window.__x=1">';
    const { p, errors, dlg } = await setup(b, { sessions: [
      mk('s1', 'グエン・ヴァン・A', '2026-09-01', { q1: { score: 'pass' } }),
      mk('s2', XSS, '2026-09-02', { q1: { score: 'fail' } }),
    ] });
    const k = await p.evaluate(() => [nameKey('グエン・ヴァン・A') === nameKey('グエン ヴァン A '), nameKey('ｸﾞｴﾝ ｳﾞｧﾝ a') === nameKey('グエン・ヴァン・A'),
      nameKey('Nguyễn Văn An') === nameKey('nguyen  van an'), nameKey('Đặng') === nameKey('dang'), nameKey('ガ') !== nameKey('カ')]);
    T.ok('比較キー: 中黒/空白/半角カナ/大小文字/声調記号をそろえ、濁点は区別 ' + k.join(','), k.every(Boolean));
    const dl = await p.evaluate(() => ({ list: document.getElementById('fEe').getAttribute('list'), er: document.getElementById('fEr').getAttribute('list'),
      opts: [...document.querySelectorAll('#dlEe option')].map(o => o.value) }));
    T.ok('受験者名欄に候補（datalist）: ' + dl.opts.length + '件', dl.list === 'dlEe' && dl.er === 'dlEr' && dl.opts.includes('グエン・ヴァン・A'));
    T.ok('候補の名前はエスケープ（値として保持・実行されない）', dl.opts.includes(XSS) && !(await p.evaluate(() => window.__x)));
    // 表記違いで保存 → 「同じ人ですか？」→ OK で既存の表記にそろう
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン ヴァン A'); await rec(p, 'q1');
    dlg.log.length = 0; dlg.plan = ['accept', 'dismiss']; // nameSame=OK, confirmScored=キャンセル
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(500);
    const ss = await sess(p);
    T.ok('確認文に既存の表記が出る', dlg.log.some(m => m.includes('グエン・ヴァン・A') && m.includes('グエン ヴァン A')));
    T.ok('保存名は既存の表記「グエン・ヴァン・A」', ss.filter(s => s.examinee === 'グエン・ヴァン・A').length === 2 && !ss.some(s => s.examinee === 'グエン ヴァン A'));
    // 保存後：受験者名欄にフォーカス・見える位置
    const f = await p.evaluate(() => { const e = document.getElementById('fEe'); return { act: document.activeElement === e, vis: inBand(e), v: e.value }; });
    T.ok('保存後は受験者名欄にフォーカス（空・見える位置）', f.act && f.vis && f.v === '');
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 2. 履歴から名前を直す（全件）＋ドライブの送り直しと旧名ファイルの案内 ----
  console.log('[2] 名前を直す・ドライブの旧名ファイル');
  {
    const { p, errors, posts, dlg } = await setup(b, { drive: true, sessions: [
      mk('s1', 'Nguyen Van An', '2026-09-01', { q1: { score: 'pass' } }),
      mk('s2', 'nguyen  van an', '2026-09-02', { q1: { score: 'fail' } }),
    ] });
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'Nguyen Van An'); await rec(p, 'q1');
    await p.click('#vp-q1'); await p.waitForTimeout(2200);
    dlg.plan = ['dismiss']; // confirmScored=キャンセル
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(600);
    const sent = posts.length;
    T.ok('旧名で送信済み（' + sent + '件）', sent >= 1 && posts.every(x => x.examinee === 'Nguyen Van An'));
    // 履歴 → 詳細 → 名前を直す
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(300);
    const cards0 = await p.locator('#hList button.cd').count();
    const sid = (await sess(p)).find(s => s.date === TODAY).id;
    await p.evaluate(id => showDet(id), sid); await p.waitForTimeout(300);
    T.ok('履歴詳細に「名前を直す」', await p.locator('#rnBtn').count() === 1);
    await p.click('#rnBtn'); await p.waitForTimeout(200);
    T.ok('名前の入力欄2つと範囲の選択', await p.locator('#rnEe').count() === 1 && await p.locator('#rnEr').count() === 1 && await p.locator('input[name="rnScope"]').count() === 2);
    await p.fill('#rnEe', 'Nguyen Van Anh'); await p.check('input[name="rnScope"][value="all"]');
    // 表記ゆれ（大小文字・空白の違い）は既定では含めない＝利用者が「同じ人」として選んだ時だけ
    T.ok('表記の違う名前は選択式（既定は未選択）', await p.locator('input[name="rnVar"]').count() === 1 && !(await p.locator('input[name="rnVar"]').isChecked()));
    await p.check('input[name="rnVar"]');
    await p.click('#rnOk'); await p.waitForTimeout(1200);
    const ss = await sess(p);
    T.ok('同じ人の全3件（表記ゆれ含む）が新しい名前に', ss.length === 3 && ss.every(s => s.examinee === 'Nguyen Van Anh'));
    const re = posts.slice(sent);
    T.ok('送った録音を新しい名前で送り直し（replaceId付き）: ' + JSON.stringify(re.map(x => x.examinee + '/' + x.replaceId)), re.length >= 1 && re.every(x => x.examinee === 'Nguyen Van Anh' && x.replaceId));
    const it = ss.find(s => s.id === sid).items.q1;
    T.ok('旧名フォルダの旧ファイルを driveOrphan に記録: ' + JSON.stringify(it.driveOrphan), Array.isArray(it.driveOrphan) && it.driveOrphan[0].folder === 'Nguyen Van An_' + TODAY && /合格/.test(it.driveOrphan[0].name));
    T.ok('履歴詳細に旧名ファイルの案内', (await p.locator('#moBody .orph').count()) >= 1);
    await p.evaluate(() => closeMo());
    await p.evaluate(() => drawHist()); await p.waitForTimeout(200);
    const cards = await p.locator('#hList button.cd').count();
    T.ok('受験者サマリが1枚にまとまる（' + cards0 + '→' + cards + '）', cards === 1);
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(300);
    T.ok('設定のドライブ欄にも旧名ファイルの案内', await p.locator('#drvOrphans').count() === 1);
    await p.evaluate(() => { const o = document.getElementById('drvOrphans'); let d = o && o.closest('details'); while (d) { d.open = true; d = d.parentElement && d.parentElement.closest('details'); } });
    await p.click('#orphClr'); await p.waitForTimeout(300);
    T.ok('「削除しました」で案内だけ消える（録音の情報は残る）', await p.locator('#drvOrphans').count() === 0 && (await sess(p)).find(s => s.id === sid).items.q1.driveFileId);
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 3. 名前の入力中は送らない ----
  console.log('[3] 名前の入力中は送らない');
  {
    const { p, errors, posts, dlg } = await setup(b, { drive: true });
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'Siti'); await rec(p, 'q1');
    const n0 = posts.length;
    await p.click('#vp-q1');              // 1.5秒後に付け直し送信
    await p.focus('#fEe'); await p.keyboard.type(' Nur');  // 入力中（欄を離れない）
    await p.waitForTimeout(2200);
    T.ok('入力中は付け直しを送らない（' + (posts.length - n0) + '件）', posts.length === n0);
    dlg.plan = ['dismiss']; // 受験者名の書き換え確認＝キャンセル（名前の訂正）
    await p.click('#rb-q4'); await p.waitForTimeout(300); await p.click('#rb-q4'); await p.waitForTimeout(1500); // 欄を離れる
    const late = posts.slice(n0);
    T.ok('欄を離れたら確定した名前で送る: ' + JSON.stringify(late.map(x => x.examinee)), late.length >= 1 && late.every(x => x.examinee === 'Siti Nur'));
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 4. 保存済みの試問を続ける ----
  console.log('[4] この試問を続ける');
  {
    const { p, errors, dlg } = await setup(b, {});
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'Siti'); await rec(p, 'q1');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(500);
    const sid = (await sess(p))[0].id;
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(300);
    await p.click('#scList .hi'); await p.waitForTimeout(500);
    T.ok('採点画面に「この試問を続ける（未録音2問）」', await p.locator('#resume-sc').count() === 1 && /2/.test(await p.locator('#resume-sc').innerText()));
    await p.click('#resume-sc'); await p.waitForTimeout(500);
    const st = await p.evaluate(() => ({ on: document.getElementById('pgExam').classList.contains('on'), id: cur.id, ee: document.getElementById('fEe').value, q1: !!cur.items.q1.hasAudio, cs: curScore }));
    T.ok('試問タブで同じ試問（同じid・録音済みq1）を開く', st.on && st.id === sid && st.ee === 'Siti' && st.q1 && st.cs === null);
    await rec(p, 'q4');
    // リロードしても「続き」の下書きが戻る
    await p.reload(); await p.waitForTimeout(500);
    const rs = await p.evaluate(() => ({ id: cur.id, q4: !!(cur.items.q4 && cur.items.q4.hasAudio), note: !!document.getElementById('draftNote') }));
    T.ok('リロード後も続きの下書きを復元し案内を出す', rs.id === sid && rs.q4 && rs.note);
    dlg.log.length = 0;
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(600);
    const ss = await sess(p);
    T.ok('保存しても1件のまま（q1・q4 の録音）', ss.length === 1 && ss[0].id === sid && ss[0].items.q1.hasAudio && ss[0].items.q4.hasAudio && !('_resume' in ss[0]));
    T.ok('音声キーは session.id+"_"+itemId のまま', await hasKey(p, sid + '_q1') && await hasKey(p, sid + '_q4'));
    T.ok('同日の重複確認は出ない（同じ試問の上書き）', !dlg.log.some(m => /件保存されています|already saved/.test(m)));
    // 履歴詳細からも続けられる／全問録音済みなら出さない
    await p.evaluate(id => showDet(id), sid); await p.waitForTimeout(300);
    T.ok('履歴詳細に「続ける」（未録音1問）', await p.locator('#resume-mo').count() === 1);
    await p.click('#resume-mo'); await p.waitForTimeout(400); await rec(p, 'q5');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(600);
    await p.evaluate(id => showDet(id), sid); await p.waitForTimeout(300);
    T.ok('全問録音済みなら「続ける」は出さない', await p.locator('#resume-mo').count() === 0 && (await sess(p)).length === 1);
    await p.evaluate(() => closeMo());
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 5. 同じ日に同じ人をもう一度保存 ----
  console.log('[5] 同じ日の再保存：まとめる／追試');
  {
    const { p, errors, posts, dlg } = await setup(b, { drive: true });
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'Nguyen Van Anh'); await rec(p, 'q1');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(700);
    const sid = (await sess(p))[0].id;
    // 2回目（別の問）→ OK＝まとめる
    await p.fill('#fEe', 'nguyen van anh'); await rec(p, 'q4');
    const oldId = await p.evaluate(() => cur.id);
    dlg.log.length = 0; dlg.plan = ['accept', 'accept', 'dismiss']; // nameSame, dupAsk=まとめる, confirmScored
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(900);
    let ss = await sess(p);
    T.ok('同日の記録があると確認する', dlg.log.some(m => /件保存されています/.test(m)));
    T.ok('まとめる＝1件のまま q1・q4', ss.length === 1 && ss[0].id === sid && ss[0].items.q1.hasAudio && ss[0].items.q4.hasAudio);
    T.ok('録音は まとめ先id_q4 に写し、元のキーは片付け', await hasKey(p, sid + '_q4') && !(await hasKey(p, oldId + '_q4')));
    // 3回目（同じ問）→ 重なるので追試として別に保存・ファイル名に _2回目
    await p.fill('#fEe', 'Nguyen Van Anh'); await rec(p, 'q1');
    const n0 = posts.length;
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(2500);
    ss = await sess(p);
    const second = ss.find(s => s.id !== sid);
    T.ok('同じ問の録音が重なる→追試として別に保存（attempt=2）', ss.length === 2 && second && second.attempt === 2);
    const names = posts.filter(x => x.examinee === 'Nguyen Van Anh').map(x => x.name);
    T.ok('追試のドライブ名に「_2回目」: ' + posts.slice(n0).map(x => x.name).join(','), posts.slice(n0).some(x => /_2回目\.webm$/.test(x.name)));
    T.ok('1回目のファイル名は今までどおり（回数なし）', names.some(x => /^.+_未判定_[^_]+\.webm$/.test(x) && !/回目/.test(x)));
    T.ok('ペイロードのキーは従来どおり', await p.evaluate(() => true) && posts.every(x => 'examinee' in x && 'date' in x && 'name' in x));
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 6. 名前なし録音の促し・下書き復元の案内 ----
  console.log('[6] 名前なし録音の促し・下書きの案内');
  {
    const { p, errors } = await setup(b, {});
    await p.fill('#fEr', '岡田');
    await p.click('#rb-q1'); await p.waitForTimeout(300);
    const nag = await p.evaluate(() => ({ t: document.getElementById('toast').textContent, inv: document.getElementById('fEe').getAttribute('aria-invalid'), recOn: !!active }));
    T.ok('受験者名が空で録音開始→名前を促す（録音は続く）', /受験者名が未入力/.test(nag.t) && nag.inv === 'true' && nag.recOn);
    await p.waitForTimeout(700); await p.click('#rb-q1'); await p.waitForTimeout(1200);
    await p.fill('#fEe', '<b>スリ</b>'); await p.click('#vp-q1'); await p.waitForTimeout(300);
    await p.reload(); await p.waitForTimeout(500);
    const dn = await p.evaluate(() => { const e = document.getElementById('draftNote'); return e ? { txt: e.innerText, b: !!e.querySelector('b'), btn: e.querySelectorAll('button').length } : null; });
    T.ok('復元したら常設の案内（受験者・録音1問・合否1問・試問者）', dn && dn.txt.includes('<b>スリ</b>') && /録音1問/.test(dn.txt) && /合否1問/.test(dn.txt) && dn.txt.includes('岡田') && dn.btn === 3);
    T.ok('案内の名前はエスケープ', dn && !dn.b);
    await p.click('#dnCont'); await p.waitForTimeout(100);
    T.ok('［続ける］で案内を閉じる（試問はそのまま）', await p.locator('#draftNote').count() === 0 && await p.evaluate(() => !!cur.items.q1.hasAudio));
    // ○×だけの下書き（録音なし）もリロードで失わない
    await p.evaluate(() => { localStorage.setItem('oral_exam_draft_v1', JSON.stringify({ id: 'd-pf', date: '2026-09-24', examiner: '岡田', examinee: 'Budi', items: { q4: { score: 'fail' } }, overall: '', status: 'rec', createdAt: new Date().toISOString() })); });
    await p.reload(); await p.waitForTimeout(500);
    const pf = await p.evaluate(() => ({ id: cur.id, ee: document.getElementById('fEe').value, on: document.getElementById('vf-q4').classList.contains('on'), note: !!document.getElementById('draftNote') }));
    T.ok('○×だけの下書きも復元し案内を出す', pf.id === 'd-pf' && pf.ee === 'Budi' && pf.on && pf.note);
    // 破棄して新規（確認つき）→ 受験者名欄へ
    await p.click('#dnDrop'); await p.waitForTimeout(400);
    const af = await p.evaluate(() => ({ id: cur.id, note: !!document.getElementById('draftNote'), act: document.activeElement && document.activeElement.id }));
    T.ok('［破棄して新規］で新しい試問・名前欄へフォーカス', af.id !== 'd-pf' && !af.note && af.act === 'fEe');
    // 4言語
    for (const l of ['en', 'vi', 'id']) {
      await p.evaluate(() => localStorage.setItem('oral_exam_draft_v1', JSON.stringify({ id: 'd2', date: '2026-09-24', examiner: 'A', examinee: 'B', items: { q1: { score: 'pass' } }, overall: '', status: 'rec' })));
      await p.evaluate(l => localStorage.setItem('oral_exam_lang', l), l);
      await p.reload(); await p.waitForTimeout(400);
      const tx = await p.evaluate(() => { const e = document.getElementById('draftNote'); return e ? e.innerText : ''; });
      T.ok(l + ': 案内が訳されている', tx && !/[ぁ-ん]/.test(tx));
    }
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
