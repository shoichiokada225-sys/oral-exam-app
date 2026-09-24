/* R9 検証NGの回帰テスト。実行: node tests/r9-safety.test.js
   ・「この試問を続ける」の最中に採点タブで同じ試問を保存しても、試問の保存で採点を消さない（3方向マージ）
   ・旧形式の「続き」の下書き（開いた時点の版を持たない）でも、保存済みの合否・コメントを消さない
   ・声調・字形記号だけ違う名前（Hùng / Hưng）は候補として聞くだけ。「別の人」と答えたら同日まとめ・追試（_2回目）にしない
   ・候補が複数あれば順に聞く／名前の一括訂正は完全一致＋利用者が選んだ表記だけ
   ・続きで録り直した保存済みの問は「破棄して新規」で元の録音に戻る（保存すれば新しい録音・退避は片付け）
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
const env = require('./_env');
const T = env.counter();
const TODAY = (() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); })();
const HUNG = 'Nguyễn Văn Hùng', HUNG2 = 'Nguyễn Văn Hưng';

async function setup(b, opt) {
  const { page: p, errors } = await env.newPage(b);
  const posts = []; let n = 0;
  await p.route('https://script.google.com/**', async r => {
    const j = JSON.parse(r.request().postData());
    if (j.ping) return r.fulfill({ contentType: 'application/json', body: '{"ok":true,"ping":true}' });
    n++; posts.push({ examinee: j.examinee, name: j.name, replaceId: j.replaceId || null });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'F' + n, url: 'https://drive/F' + n }) });
  });
  const dlg = { log: [], plan: [] };
  p.on('dialog', d => { dlg.log.push(d.message()); const a = dlg.plan.shift() || 'accept'; (a === 'accept' ? d.accept() : d.dismiss()).catch(() => {}); });
  await p.goto(env.URL);
  await p.evaluate(o => {
    localStorage.clear();
    if (o && o.drive) localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: 'https://script.google.com/macros/s/x/exec', auto: true, autoSet: true }));
    if (o && o.sessions) localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: o.sessions }));
    if (o && o.draft) localStorage.setItem('oral_exam_draft_v1', JSON.stringify(o.draft));
  }, opt || {});
  await p.reload(); await p.waitForTimeout(350);
  return { p, errors, posts, dlg };
}
async function rec(p, id, ms) { await p.click('#rb-' + id); await p.waitForTimeout(ms || 1000); await p.click('#rb-' + id); await p.waitForTimeout(1300); }
const sess = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1') || '{"sessions":[]}').sessions);
const size = (p, k) => p.evaluate(k => getAudio(k).then(b => b ? b.size : -1), k);
const mk = (id, ee, date, items, extra) => Object.assign({ id, date, examiner: '岡田', examinee: ee, items, overall: '', status: 'scored', createdAt: date + 'T01:00:00.000Z' }, extra || {});

(async () => {
  const b = await env.launch();

  // ---- 1. 続けている最中に採点タブで同じ試問を保存 ----
  console.log('[1] 続きの保存で採点を消さない');
  {
    const { p, errors, dlg } = await setup(b, {});
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'Tran'); await rec(p, 'q1'); await rec(p, 'q4');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(600);
    const X = (await sess(p))[0].id;
    await p.evaluate(id => resumeExam(id), X); await p.waitForTimeout(500);
    await rec(p, 'q5');
    // 採点タブで同じ試問を開いて採点・保存
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(300);
    await p.evaluate(id => openScore(id), X); await p.waitForTimeout(600);
    await p.click('.sb[data-id="q1"][data-s="pass"]'); await p.click('.sb[data-id="q4"][data-s="fail"]');
    await p.fill('#cm-q1', 'よくできた'); await p.fill('#scOv', '総評A'); await p.waitForTimeout(200);
    await p.evaluate(() => saveScore()); await p.waitForTimeout(500);
    let x = (await sess(p)).find(s => s.id === X);
    T.ok('採点タブで保存（scored）', x.status === 'scored' && x.items.q1.score === 'pass' && x.items.q4.score === 'fail');
    // 試問タブへ戻る→合否が試問画面にも映る
    await p.click('.tabs button[data-pg="pgExam"]'); await p.waitForTimeout(400);
    const shown = await p.evaluate(() => ({ p1: document.getElementById('vp-q1').classList.contains('on'), f4: document.getElementById('vf-q4').classList.contains('on'), c: cur.items.q1.score }));
    T.ok('試問タブに戻ると採点の合否が映る ' + JSON.stringify(shown), shown.p1 && shown.f4 && shown.c === 'pass');
    dlg.log.length = 0; dlg.plan = ['dismiss', 'dismiss'];
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(700);
    const ss = await sess(p); x = ss.find(s => s.id === X);
    T.ok('試問の保存で採点が消えない（q1=合格・q4=不合格・コメント・総評）', ss.length === 1 && x.items.q1.score === 'pass' && x.items.q4.score === 'fail' && x.items.q1.comment === 'よくできた' && x.overall === '総評A');
    T.ok('続きの録音 q5 も保存', x.items.q5 && x.items.q5.hasAudio && await size(p, X + '_q5') > 0);
    T.ok('未採点の録音を足したので採点待ちに戻る（status=rec）', x.status === 'rec');
    T.ok('下書きだけの印は保存しない', !('_resume' in x) && !('_base' in x) && !('_origBak' in x));
    // 足した q5 も採点して確定できる
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(300);
    await p.evaluate(id => openScore(id), X); await p.waitForTimeout(600);
    await p.click('.sb[data-id="q5"][data-s="pass"]'); await p.waitForTimeout(100);
    await p.evaluate(() => saveScore()); await p.waitForTimeout(400);
    x = (await sess(p)).find(s => s.id === X);
    T.ok('採点し直すと全問の合否がそろう', x.status === 'scored' && x.items.q1.score === 'pass' && x.items.q4.score === 'fail' && x.items.q5.score === 'pass');
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 2. 旧形式の続きの下書き（開いた時点の版なし） ----
  console.log('[2] 旧形式の続きの下書き');
  {
    const X = 'old-resume-1';
    const saved = mk(X, 'Budi', TODAY, { q1: { hasAudio: true, score: 'pass', comment: 'c1', transcript: 't1' } }, { overall: 'ov' });
    const draft = { id: X, date: TODAY, examiner: '岡田', examinee: 'Budi', items: { q1: { hasAudio: true, score: null }, q4: { hasAudio: true } }, overall: '', status: 'rec', createdAt: saved.createdAt, _resume: true };
    const { p, errors, dlg } = await setup(b, { sessions: [saved], draft });
    T.ok('旧形式の続きの下書きを復元', await p.evaluate(() => cur.id === 'old-resume-1' && !!cur._resume));
    dlg.plan = ['dismiss'];
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(600);
    const x = (await sess(p)).find(s => s.id === X);
    T.ok('保存済みの合否・コメント・文字起こし・総評を残す ' + JSON.stringify(x.items.q1), x.items.q1.score === 'pass' && x.items.q1.comment === 'c1' && x.items.q1.transcript === 't1' && x.overall === 'ov');
    T.ok('続きの q4 も入る・1件のまま', x.items.q4.hasAudio && (await sess(p)).length === 1);
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 3. Hùng / Hưng：別の人と答えたら同日まとめ・追試にしない ----
  console.log('[3] 声調・字形記号だけ違う名前');
  {
    const { p, errors, posts, dlg } = await setup(b, { drive: true, sessions: [mk('h1', HUNG, TODAY, { q1: { hasAudio: true, score: 'pass' } })] });
    T.ok('比較キー（候補用）は同じ・完全一致は別', await p.evaluate(([a, c]) => nameKey(a) === nameKey(c) && nameExact(a) !== nameExact(c) && nameExact(' ' + a + ' ') === nameExact(a), [HUNG, HUNG2]));
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', HUNG2); await rec(p, 'q4');
    dlg.log.length = 0; dlg.plan = ['dismiss', 'dismiss', 'dismiss']; // nameSame=別の人
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(1500);
    const ss = await sess(p);
    T.ok('同じ人か確認は出る（候補の提示）', dlg.log.some(m => m.includes(HUNG) && m.includes(HUNG2)));
    T.ok('「別の人」なら同日まとめの確認を出さない', !dlg.log.some(m => /件保存されています/.test(m)));
    const hg = ss.find(s => s.examinee === HUNG2), hu = ss.find(s => s.id === 'h1');
    T.ok('Hưng は別の試問（attempt なし）・Hùng の試問は無傷', ss.length === 2 && hg && !hg.attempt && Object.keys(hu.items).join() === 'q1');
    T.ok('ドライブ名に「回目」を付けない: ' + posts.map(x => x.name).join(','), posts.length >= 1 && posts.every(x => !/回目/.test(x.name) && x.examinee === HUNG2));
    // 同じ人と答えたら表記をそろえて同日まとめの確認
    await p.fill('#fEe', HUNG2 + ' '); await rec(p, 'q5');
    dlg.log.length = 0; dlg.plan = ['accept', 'dismiss']; // Hưng は完全一致＝名前は聞かない → dupAsk=まとめる, confirmScored
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(1200);
    const ss2 = await sess(p);
    T.ok('完全一致（空白違い）は聞かずに同日まとめへ ' + dlg.log.length, !dlg.log.some(m => m.includes('同じ人ですか')) && dlg.log.some(m => /件保存されています/.test(m) && m.includes(HUNG2)));
    T.ok('まとめ先は Hưng の試問（Hùng に入らない）', ss2.length === 2 && ss2.find(s => s.examinee === HUNG2).items.q5 && !ss2.find(s => s.id === 'h1').items.q5);
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 4. 候補が複数：順に聞く ----
  console.log('[4] 候補が複数');
  {
    const { p, errors, dlg } = await setup(b, { sessions: [
      mk('a1', HUNG, '2026-09-01', { q1: { score: 'pass' } }), mk('a2', HUNG, '2026-09-02', { q1: { score: 'pass' } }), mk('a3', HUNG2, '2026-09-03', { q1: { score: 'fail' } })] });
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'Nguyen Van Hung'); await rec(p, 'q1');
    dlg.log.length = 0; dlg.plan = ['dismiss', 'accept', 'dismiss'];
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(600);
    const ss = await sess(p);
    const asks = dlg.log.filter(m => m.includes('同じ人ですか'));
    T.ok('多い表記から順に2回聞く', asks.length === 2 && asks[0].includes(HUNG) && asks[1].includes(HUNG2));
    T.ok('2つ目で OK→その表記で保存', ss.filter(s => s.examinee === HUNG2).length === 2 && !ss.some(s => s.examinee === 'Nguyen Van Hung'));
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 5. 名前の一括訂正：完全一致＋選んだ表記だけ ----
  console.log('[5] 一括訂正の範囲');
  {
    const XSS = HUNG + '"><img src=x onerror="window.__x=1">';
    const { p, errors } = await setup(b, { sessions: [
      mk('r1', HUNG, '2026-09-01', { q1: { score: 'pass' } }), mk('r2', HUNG + ' ', '2026-09-02', { q1: { score: 'pass' } }),
      mk('r3', HUNG2, '2026-09-03', { q1: { score: 'fail' } }), mk('r4', 'Other', '2026-09-03', { q1: { score: 'fail' } })] });
    await p.evaluate(() => showDet('r1')); await p.waitForTimeout(300);
    await p.click('#rnBtn'); await p.waitForTimeout(200);
    const f = await p.evaluate(() => ({ all: document.querySelector('input[name="rnScope"][value="all"]').parentElement.textContent, vars: [...document.querySelectorAll('input[name="rnVar"]')].map(x => [x.value, x.checked]) }));
    T.ok('全件＝完全一致の2件・表記違いは選択式（未選択） ' + JSON.stringify(f), /2/.test(f.all) && f.vars.length === 1 && f.vars[0][0] === HUNG2 && !f.vars[0][1]);
    await p.fill('#rnEe', 'Nguyễn Văn Hùng A'); await p.check('input[name="rnScope"][value="all"]');
    await p.click('#rnOk'); await p.waitForTimeout(400);
    let ss = await sess(p);
    T.ok('選ばなければ Hưng は変えない', ss.find(s => s.id === 'r1').examinee === 'Nguyễn Văn Hùng A' && ss.find(s => s.id === 'r2').examinee === 'Nguyễn Văn Hùng A' && ss.find(s => s.id === 'r3').examinee === HUNG2 && ss.find(s => s.id === 'r4').examinee === 'Other');
    // 選んだ表記は含める（チェックで範囲が「全件」に切り替わる）
    await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('oral_exam_sessions_v1')); s.sessions.push({ id: 'r5', date: '2026-09-04', examiner: '岡田', examinee: 'nguyễn văn hùng a', items: {}, overall: '', status: 'rec' }); localStorage.setItem('oral_exam_sessions_v1', JSON.stringify(s)); });
    await p.evaluate(() => showDet('r1')); await p.waitForTimeout(300);
    await p.click('#rnBtn'); await p.waitForTimeout(200);
    await p.fill('#rnEe', 'Nguyễn Văn Hùng B'); await p.check('input[name="rnVar"][value="nguyễn văn hùng a"]');
    T.ok('表記を選ぶと範囲が全件になる', await p.locator('input[name="rnScope"][value="all"]').isChecked());
    await p.click('#rnOk'); await p.waitForTimeout(400);
    ss = await sess(p);
    T.ok('選んだ表記も含めて直す', ['r1', 'r2', 'r5'].every(id => ss.find(s => s.id === id).examinee === 'Nguyễn Văn Hùng B') && ss.find(s => s.id === 'r3').examinee === HUNG2);
    // 表記違いの名前はエスケープして出す
    await p.evaluate(x => { const s = JSON.parse(localStorage.getItem('oral_exam_sessions_v1')); s.sessions.push({ id: 'r6', date: '2026-09-05', examiner: '岡田', examinee: x, items: {}, overall: '', status: 'rec' }); localStorage.setItem('oral_exam_sessions_v1', JSON.stringify(s)); }, XSS.replace('ù', 'u'));
    await p.evaluate(() => showDet('r3')); await p.waitForTimeout(300);
    await p.click('#rnBtn'); await p.waitForTimeout(200);
    T.ok('表記違いの名前はエスケープ', !(await p.evaluate(() => window.__x)) && await p.locator('#moBody img').count() === 0);
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  // ---- 6. 続きで録り直して破棄→元の録音に戻る ----
  console.log('[6] 録り直しの破棄');
  {
    const { p, errors, dlg } = await setup(b, {});
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'Siti'); await rec(p, 'q1', 1000);
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(600);
    const X = (await sess(p))[0].id, K = X + '_q1';
    const s0 = await size(p, K);
    await p.evaluate(id => resumeExam(id), X); await p.waitForTimeout(500);
    await rec(p, 'q1', 3000); // 録り直し（確認はOK）
    const s1 = await size(p, K), bk = await size(p, K + '#orig');
    T.ok('録り直し中は元の録音を退避（' + s0 + '→' + s1 + ' / 退避' + bk + '）', s1 !== s0 && bk === s0);
    dlg.log.length = 0; dlg.plan = ['accept'];
    await p.evaluate(() => resetExam()); await p.waitForTimeout(600);
    T.ok('破棄の確認に件数', dlg.log.some(m => /1件/.test(m)));
    T.ok('破棄すると元の録音に戻る（' + await size(p, K) + '）', await size(p, K) === s0 && await size(p, K + '#orig') === -1);
    let x = (await sess(p))[0];
    T.ok('保存済みの試問は無傷', x.items.q1.hasAudio && (await sess(p)).length === 1);
    // 録り直して保存→新しい録音・退避は片付け
    await p.evaluate(id => resumeExam(id), X); await p.waitForTimeout(500);
    await rec(p, 'q1', 3000); const s2 = await size(p, K);
    await rec(p, 'q4');
    dlg.plan = ['dismiss'];
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(700);
    T.ok('保存すると新しい録音・退避は片付け', await size(p, K) === s2 && s2 !== s0 && await size(p, K + '#orig') === -1);
    x = (await sess(p))[0];
    T.ok('保存は1件・q1/q4', (await sess(p)).length === 1 && x.items.q1.hasAudio && x.items.q4.hasAudio && !('_origBak' in x));
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
