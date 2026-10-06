/* 通し検査 2 回目【F2】の回帰テスト。実行: node tests/audit-F2.test.js
   F2-1 試問の途中で書き出したバックアップを同じ端末へ戻して保存しても、出題の記録（setId/setName/setN）が消えない。
        通常の保存と同じ setId:'free'・setN:3 になり、「1問 未出題」も残る。
        書き出したファイルの下書きにも出題の記録が入る。記録の無い古いバックアップを戻したときは取り込み前の出題で補う。
   VIS-1 狭い画面（390/360）の録音中に最下部までスクロールすると、録音ピルが「試問を保存」「リセット」に重ならない。
        録音を止めたら下の余白は元に戻る。
   本物の GAS へは送らない（script.google は遮断）。 */
'use strict';
const env = require('./_env');
const fs = require('fs');
const c = env.counter();
const SK = 'oral_exam_sessions_v1';
const sessions = p => p.evaluate(k => (JSON.parse(localStorage.getItem(k) || 'null') || { sessions: [] }).sessions, SK);
async function rec(p, id, ms) {
  await p.evaluate(i => toggleRec(i), id);
  await p.waitForFunction(() => !!active, null, { timeout: 15000 }).catch(() => { });
  await p.waitForTimeout(ms || 900);
  await p.evaluate(() => stopRec());
  await p.waitForFunction(i => !active && cur && cur.items[i] && cur.items[i].hasAudio, id, { timeout: 15000 }).catch(() => { });
  await p.waitForTimeout(400);
}
async function exportFiles(p) {
  const dls = []; const on = d => dls.push(d); p.on('download', on);
  await p.evaluate(() => exportBackup());
  await p.waitForTimeout(1500);
  p.off('download', on);
  const out = [];
  for (const d of dls) out.push(await d.path());
  return out;
}

async function run(b, mode) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, permissions: ['microphone'] });
  await ctx.route('**/script.google*/**', r => r.abort());
  const { page: p, errors } = await env.newPage(ctx);
  p.on('dialog', d => d.accept());
  await p.goto(env.URL); await p.waitForTimeout(500);
  await p.fill('#fEe', 'グエン'); await p.locator('#fEe').blur(); await p.waitForTimeout(300);
  const I = await p.evaluate(() => getItems().map(i => i.id));
  for (const [k, i] of I.entries()) { await p.fill('#qt-' + i, 'Q' + k); }
  await rec(p, I[0]); await rec(p, I[1]);
  await p.evaluate(([a, b]) => { setVerdict(a, 'pass'); setVerdict(b, 'fail'); }, [I[0], I[1]]); await p.waitForTimeout(200);
  const cid = await p.evaluate(() => cur.id);
  let fileSet = null;
  if (mode !== 'plain') {
    const files = await exportFiles(p);
    const bk = JSON.parse(fs.readFileSync(files[0], 'utf8'));
    const d = bk.sessions.find(s => s.id === cid) || {};
    fileSet = { setId: d.setId, setN: d.setN };
    if (mode === 'old') { // 記録の無い古いバックアップ
      bk.sessions.forEach(s => { delete s.setId; delete s.setName; delete s.setN; });
      fs.writeFileSync(files[0], JSON.stringify(bk));
    }
    await p.setInputFiles('#bkFile', files); await p.waitForTimeout(1500);
    await p.evaluate(i => setVerdict(i, 'pass'), I[1]); await p.waitForTimeout(200);
  }
  await p.evaluate(() => saveSession()); await p.waitForTimeout(1000);
  const sv = (await sessions(p)).filter(s => s.id === cid);
  const un = await p.evaluate(id => unaskedCount(getAll().find(s => s.id === id)), cid);
  await ctx.close();
  return { n: I.length, sv, un, fileSet, errors };
}

(async () => {
  const b = await env.launch({ freeDefault: true });
  console.log('[F2-1]');
  const plain = await run(b, 'plain');
  c.ok('前提：その場の出題は3問', plain.n === 3);
  c.ok('前提：通常の保存は setId=free・setN=3 ' + JSON.stringify(plain.sv[0] && [plain.sv[0].setId, plain.sv[0].setN]), plain.sv.length === 1 && plain.sv[0].setId === 'free' && plain.sv[0].setN === 3);
  for (const mode of ['imp', 'old']) {
    const r = await run(b, mode);
    const s = r.sv[0] || {};
    if (mode === 'imp') c.ok('書き出したファイルの下書きにも出題の記録 ' + JSON.stringify(r.fileSet), r.fileSet.setId === 'free' && r.fileSet.setN === 3);
    c.ok(mode + ': 保存済みは1件', r.sv.length === 1);
    c.ok(mode + ': 取り込み後の保存でも出題の記録が通常の保存と同じ ' + JSON.stringify([s.setId, s.setName, s.setN]), s.setId === plain.sv[0].setId && s.setName === plain.sv[0].setName && s.setN === 3);
    c.ok(mode + ': 「1問 未出題」が残る ' + r.un, r.un === 1);
    c.ok(mode + ': 取り込み後に変えた○が残る', s.items && Object.values(s.items).filter(x => x && x.score === 'pass').length === 2);
    c.ok(mode + ': JSエラーなし ' + r.errors.join('|'), !r.errors.length);
  }
  await b.close();

  console.log('[VIS-1]');
  const b2 = await env.launch({ freeDefault: true });
  for (const w of [390, 360]) {
    const ctx = await b2.newContext({ viewport: { width: w, height: 780 }, permissions: ['microphone'] });
    await ctx.route('**/script.google*/**', r => r.abort());
    const { page: p, errors } = await env.newPage(ctx);
    p.on('dialog', d => d.accept());
    await p.goto(env.URL); await p.waitForTimeout(500);
    const pb0 = await p.evaluate(() => getComputedStyle(document.body).paddingBottom);
    const id = await p.evaluate(() => getItems()[0].id);
    await p.evaluate(i => toggleRec(i), id);
    await p.waitForFunction(() => !!active && !!document.getElementById('recPill'), null, { timeout: 15000 }).catch(() => { });
    await p.waitForTimeout(600);
    await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(400);
    const ov = await p.evaluate(() => {
      const pr = document.getElementById('recPill').getBoundingClientRect();
      const hit = el => { const r = el.getBoundingClientRect(); return !(r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom); };
      return [...document.querySelectorAll('#pgExam .bg button')].map(el => hit(el));
    });
    c.ok(w + 'px 録音中・最下部で録音ピルが保存・リセットに重ならない ' + JSON.stringify(ov), ov.length === 2 && ov.every(x => !x));
    await p.evaluate(() => stopRec());
    await p.waitForFunction(() => !active && !document.getElementById('recPill'), null, { timeout: 15000 }).catch(() => { });
    await p.waitForTimeout(300);
    const pb1 = await p.evaluate(() => getComputedStyle(document.body).paddingBottom);
    c.ok(w + 'px 停止後は下の余白が元に戻る ' + pb0 + ' / ' + pb1, pb0 === pb1);
    c.ok(w + 'px JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  await b2.close();
  c.done();
})().catch(e => { console.error(e); process.exit(2); });
