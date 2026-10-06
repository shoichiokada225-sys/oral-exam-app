/* 検査 2026-10-06【B-verdict】の回帰テスト。実行: node tests/audit-B-verdict.test.js
   M-1 「この試問を続ける」はその試問の出題（setId）の質問で出す・未録音の数もその出題で数える・出題の違う試問はまとめない
   M-2 出題を切り替えたら、録音のない○×を持ち越さない（確認文は「消えます」）
   M-4 採点画面で同じ○×をもう一度押すと外れる（録音のない問の誤タップも外せる）
   M-5 「質問しなかった」の問に試問画面で○×を付けると na が外れる／試問画面の催促で na は判定済み
   L-2 名前を書き換えてそのまま「録音」を押した：切り替え後に「もう一度押して」と知らせる
   本物の GAS へは送らない（ドライブ設定なし・script.google は遮断）。 */
'use strict';
const env = require('./_env');
const c = env.counter();
const toastTxt = p => p.evaluate(() => document.getElementById('toast').textContent);
async function rec(p, id, ms) { await p.evaluate(i => toggleRec(i), id); await p.waitForTimeout(ms || 900); await p.evaluate(() => stopRec()); await p.waitForTimeout(600); }
function dialogs(p) {
  const h = { log: [], ans: () => true };
  p.on('dialog', d => { h.log.push(d.message()); if (d.type() === 'beforeunload') return d.accept(); return h.ans(d.message()) ? d.accept() : d.dismiss(); });
  return h;
}
const isScoredQ = m => m.includes('採点も確定');
async function open(b) {
  const ctx = await b.newContext();
  const { page, errors } = await env.newPage(ctx);
  await page.route('**/script.google*/**', r => r.abort());
  await page.goto(env.URL); await page.waitForTimeout(500);
  return { p: page, errors, ctx };
}
const all = p => p.evaluate(() => getAll());
const cardIds = p => p.$$eval('#examCards .qc', cs => cs.map(x => x.id.replace(/^q-/, '')));

(async () => {
  const b = await env.launch();

  /* ---------- M-1 ---------- */
  {
    const { p, errors, ctx } = await open(b);
    const dg = dialogs(p); dg.ans = m => !isScoredQ(m);
    c.ok('M-1 前提: 標準の3問で始まる', await p.evaluate(() => curSetInfo().id) === 'def');
    await p.fill('#fEe', '中断さん');
    await rec(p, 'q1'); await p.evaluate(() => setVerdict('q1', 'pass'));
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    const sid = (await all(p))[0].id;
    await p.evaluate(() => useFreeCfg()); await p.waitForTimeout(400);
    c.ok('M-1 前提: その場で出題へ切り替えた', await p.evaluate(() => curSetInfo().id) === 'free');
    c.ok('M-1 未録音の数はその試問の出題で数える（2問）', await p.evaluate(id => unrecCount(getAll().find(s => s.id === id)), sid) === 2);
    await p.evaluate(id => resumeExam(id), sid); await p.waitForTimeout(700);
    c.ok('M-1 続けると、その試問の出題（標準の3問）に戻る', await p.evaluate(() => curSetInfo().id) === 'def');
    c.ok('M-1 試問画面のカードは q1/q4/q5 ' + JSON.stringify(await cardIds(p)), JSON.stringify(await cardIds(p)) === '["q1","q4","q5"]');
    c.ok('M-1 出題を戻したことを知らせる', (await toastTxt(p)).includes('標準'));
    await rec(p, 'q4'); await p.evaluate(() => setVerdict('q4', 'pass'));
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    const s = (await all(p)).find(x => x.id === sid);
    c.ok('M-1 続きの保存は元の出題の問だけ ' + JSON.stringify(Object.keys(s.items)), JSON.stringify(Object.keys(s.items).sort()) === '["q1","q4"]' && s.setId === 'def');
    // 出題の違う同じ日の試問はまとめない（「前回の続きにまとめる」を出さない）
    await p.evaluate(() => useFreeCfg()); await p.waitForTimeout(400);
    await p.fill('#fEe', '中断さん'); await p.press('#fEe', 'Tab');
    dg.log.length = 0;
    await rec(p, 'f1');
    await p.evaluate(() => saveSession()); await p.waitForTimeout(600);
    c.ok('M-1 出題の違う試問には「まとめる」を出さない ' + JSON.stringify(dg.log), !dg.log.some(m => m.includes('前回の続きにまとめる')));
    const ss = await all(p);
    c.ok('M-1 別の試問として保存（追試の番号も付けない）', ss.length === 2 && ss.every(x => !x.attempt));
    // 同じ出題どうしなら従来どおり聞く
    await p.fill('#fEe', '中断さん'); await p.press('#fEe', 'Tab');
    dg.log.length = 0; dg.ans = m => !isScoredQ(m) && !m.includes('前回の続きにまとめる');
    await rec(p, 'f2'); // 前回と同じ問の録音があると「まとめる」は聞かない（従来の仕様）ので別の問
    await p.evaluate(() => saveSession()); await p.waitForTimeout(600);
    c.ok('M-1 同じ出題なら従来どおり「まとめる」を聞く', dg.log.some(m => m.includes('前回の続きにまとめる')));
    c.ok('M-1 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-2 ---------- */
  {
    const { p, errors, ctx } = await open(b);
    const dg = dialogs(p); dg.ans = m => !isScoredQ(m);
    await p.fill('#fEe', '切替花子'); await p.press('#fEe', 'Tab');
    await p.evaluate(() => { setVerdict('q1', 'pass'); setVerdict('q4', 'fail'); });
    await p.waitForTimeout(600);
    await p.evaluate(() => useFreeCfg()); await p.waitForTimeout(400);
    c.ok('M-2 確認文は「消えます」 ' + JSON.stringify(dg.log), dg.log.some(m => m.includes('消えます')));
    c.ok('M-2 切り替えたら録音のない○×を持ち越さない', await p.evaluate(() => Object.values(cur.items).every(x => !isPF(x.score))));
    await rec(p, 'f1'); await p.evaluate(() => setVerdict('f1', 'pass'));
    dg.ans = () => true; // 採点も確定
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    const s = (await all(p))[0];
    c.ok('M-2 保存した試問に前の出題の○×が混ざらない ' + JSON.stringify(Object.keys(s.items)), !s.items.q1 && !s.items.q4);
    c.ok('M-2 合格率は実際の1問で100%', await p.evaluate(id => passRate(getAll().find(x => x.id === id)), s.id) === 100);
    // キャンセルなら切り替えず、○×も残す
    await p.fill('#fEe', '残す太郎'); await p.press('#fEe', 'Tab');
    await p.evaluate(() => setVerdict('f2', 'pass')); await p.waitForTimeout(600);
    dg.ans = () => false;
    await p.evaluate(() => resetCfg()); await p.waitForTimeout(400);
    c.ok('M-2 キャンセルなら○×は残る', await p.evaluate(() => cur.items.f2 && cur.items.f2.score === 'pass' && curSetInfo().id === 'free'));
    c.ok('M-2 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-4 ---------- */
  {
    const { p, errors, ctx } = await open(b);
    const dg = dialogs(p); dg.ans = m => !isScoredQ(m);
    await p.fill('#fEe', '誤タップ'); await p.press('#fEe', 'Tab');
    await p.evaluate(() => setVerdict('q4', 'pass')); // 録音していない問に誤タップ
    await rec(p, 'q1'); await p.evaluate(() => setVerdict('q1', 'fail'));
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    const sid = (await all(p))[0].id;
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(200);
    await p.evaluate(id => openScore(id), sid); await p.waitForTimeout(700);
    c.ok('M-4 前提: q4 の○が選ばれている', await p.locator('.sb[data-id="q4"][data-s="pass"].sel').count() === 1);
    await p.locator('.sb[data-id="q4"][data-s="pass"]').click(); await p.waitForTimeout(400);
    c.ok('M-4 同じ○をもう一度押すと外れる', await p.locator('.sb[data-id="q4"].sel').count() === 0);
    c.ok('M-4 外したことを知らせる', (await toastTxt(p)).includes('取り消しました'));
    c.ok('M-4 外した状態が保存される', await p.evaluate(id => getAll().find(s => s.id === id).items.q4.score, sid) == null);
    // 二度押し（500ms以内）は外さない
    await p.locator('.sb[data-id="q1"][data-s="pass"]').click(); await p.waitForTimeout(100);
    await p.locator('.sb[data-id="q1"][data-s="pass"]').click(); await p.waitForTimeout(300);
    c.ok('M-4 500ms以内の二度押しでは外れない', await p.locator('.sb[data-id="q1"][data-s="pass"].sel').count() === 1);
    await p.evaluate(() => saveScore()); await p.waitForTimeout(500);
    const s = (await all(p)).find(x => x.id === sid);
    c.ok('M-4 確定後の合格率に外した○は入らない ' + JSON.stringify(await p.evaluate(id => pfCount(getAll().find(x => x.id === id)), sid)),
      s.status === 'scored' && await p.evaluate(id => { const x = pfCount(getAll().find(y => y.id === id)); return x.pass === 1 && x.total === 1; }, sid));
    c.ok('M-4 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-5 ---------- */
  {
    const { p, errors, ctx } = await open(b);
    const dg = dialogs(p); dg.ans = m => !isScoredQ(m);
    await p.fill('#fEe', '質問なし'); await p.press('#fEe', 'Tab');
    await rec(p, 'q1'); await rec(p, 'q4');
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    const sid = (await all(p))[0].id;
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(200);
    await p.evaluate(id => openScore(id), sid); await p.waitForTimeout(700);
    await p.evaluate(() => { pickNA('q1', true); pickNA('q4', true); document.querySelectorAll('.nachk').forEach(x => { x.checked = true; }); saveScore(); });
    await p.waitForTimeout(400);
    await p.evaluate(id => resumeExam(id), sid); await p.waitForTimeout(700);
    c.ok('M-5 前提: 続きで開いた q1 は na', await p.evaluate(() => !!cur.items.q1.na));
    await p.evaluate(() => setVerdict('q1', 'pass')); await p.waitForTimeout(100);
    c.ok('M-5 ○を付けると「質問しなかった」が外れる', await p.evaluate(() => cur.items.q1.na === false && cur.items.q1.score === 'pass'));
    c.ok('M-5 na の q4 を「○×未入力」と催促しない ' + await p.textContent('#epPf'), !(await p.textContent('#epPf')).includes('未入力'));
    await rec(p, 'q5'); await p.evaluate(() => setVerdict('q5', 'pass'));
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(200);
    await p.evaluate(id => openScore(id), sid); await p.waitForTimeout(700);
    c.ok('M-5 採点画面で q1 は○で「質問しなかった」は外れている', await p.evaluate(() => document.querySelector('.nachk[data-id="q1"]').checked === false && !!document.querySelector('.sb[data-id="q1"][data-s="pass"].sel')));
    await p.evaluate(() => saveScore()); await p.waitForTimeout(500);
    const pc = await p.evaluate(id => pfCount(getAll().find(x => x.id === id)), sid);
    c.ok('M-5 確定後も q1 の○が残る（2/2） ' + JSON.stringify(pc), pc.pass === 2 && pc.total === 2);
    c.ok('M-5 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- L-2 ---------- */
  {
    const { p, errors, ctx } = await open(b);
    const dg = dialogs(p); dg.ans = m => !isScoredQ(m);
    await p.fill('#fEe', 'Aさん'); await p.press('#fEe', 'Tab');
    await rec(p, 'q1'); await p.evaluate(() => setVerdict('q1', 'pass'));
    await p.click('#fEe'); await p.fill('#fEe', 'Bさん');
    await p.click('#rb-q4'); await p.waitForTimeout(1200);
    c.ok('L-2 前提: 前の人の分を保存した ' + JSON.stringify(dg.log.map(m => m.slice(0, 20))), (await all(p)).some(s => s.examinee === 'Aさん'));
    if (await p.evaluate(() => !!active)) { await p.evaluate(() => stopRec()); await p.waitForTimeout(600); }
    c.ok('L-2 「録音はもう一度押して」と知らせる: ' + await toastTxt(p), (await toastTxt(p)).includes('もう一度'));
    // 名前を書き換えただけ（録音を押していない）なら付けない
    await rec(p, 'q4');
    await p.click('#fEe'); await p.fill('#fEe', 'Cさん'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(1200);
    c.ok('L-2 録音を押していなければ付けない: ' + await toastTxt(p), (await toastTxt(p)).includes('Cさん') && !(await toastTxt(p)).includes('もう一度'));
    c.ok('L-2 4言語に文言がある', await p.evaluate(() => ['ja', 'en', 'vi', 'id'].every(l => { const o = lang; lang = l; const v = t2('recTapAgain'); lang = o; return v && v !== 'recTapAgain'; })));
    c.ok('L-2 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  await b.close();
  c.done();
})().catch(e => { console.error(e); process.exit(2); });
