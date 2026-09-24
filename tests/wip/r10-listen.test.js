/* R10 採点の聴取動線の回帰テスト。実行: node tests/r10-listen.test.js
   [1] webm 録音の長さ（duration）が Infinity のままにならない（試問・採点・履歴）→ シークが効く
   [2] 採点カードの ↺5秒/▶/5秒↻ と保存バーの ▶/⏸ トグル・↺5秒
   [3] 自動送りは「未判定→初判定・再生中でない・カードを触っていない」ときだけ
   [4] 保存バーの合否は件数（分数は「判定 n/m」だけ）
   [5] 速度 0.75x〜2x・端末に記憶（oral_exam_rate）・試問/履歴にも速度と排他再生 */
const env = require('../_env');
const T = env.counter();
(async () => {
  const b = await env.launch();
  const { page: p, errors } = await env.newPage(b);
  await p.setViewportSize({ width: 375, height: 740 });
  await p.goto(env.URL);
  await p.waitForTimeout(400);
  await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'R10 テスト');
  const ids = await p.evaluate(() => [...document.querySelectorAll('#examCards .qc')].map(c => c.id.replace(/^q-/, '')));
  T.ok('既定の設問は3問: ' + ids.join(','), ids.length === 3);
  const [A, B, C] = ids;
  const rec = async (id, ms) => { await p.click('#rb-' + id); await p.waitForTimeout(ms); await p.click('#rb-' + id); await p.waitForTimeout(900); };
  await rec(A, 7000); await rec(B, 3000); await rec(C, 3000);

  console.log('[1] 試問タブ：長さの補正・排他再生');
  const dur = sel => p.evaluate(s => { const a = document.querySelector(s); return a ? String(a.duration) : 'none'; }, sel);
  await p.waitForFunction(id => isFinite(document.getElementById('au-' + id).duration), A, { timeout: 5000 }).catch(() => {});
  const dA = await dur('#au-' + A);
  T.ok('試問の au- の長さが有限（Infinity でない）: ' + dA, isFinite(+dA) && +dA > 5);
  await p.evaluate(ids => { document.getElementById('au-' + ids[0]).play(); }, ids); await p.waitForTimeout(400);
  await p.evaluate(ids => { document.getElementById('au-' + ids[1]).play(); }, ids); await p.waitForTimeout(400);
  const ex = await p.evaluate(ids => ids.map(id => document.getElementById('au-' + id).paused), ids);
  T.ok('試問タブでも同時再生しない（後から再生した方だけ鳴る）: ' + ex, ex[0] === true && ex[1] === false);
  await p.evaluate(() => document.querySelectorAll('audio').forEach(a => a.pause()));

  // 試問を保存→採点画面
  await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(500);
  await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(300);
  await p.click('#scList .hi'); await p.waitForTimeout(800);
  await p.waitForFunction(ids => ids.every(id => isFinite(document.getElementById('sa-' + id).duration)), ids, { timeout: 6000 }).catch(() => {});
  const ds = await p.evaluate(ids => ids.map(id => document.getElementById('sa-' + id).duration), ids);
  T.ok('採点の sa- 3件とも長さが有限: ' + ds.map(x => String(x)).join(','), ds.every(x => isFinite(x) && x > 1));
  T.ok('補正後は頭（0秒）に戻っている', await p.evaluate(ids => ids.every(id => document.getElementById('sa-' + id).currentTime === 0), ids));
  // シーク：55%の位置へ
  const sk = await p.evaluate(async id => { const a = document.getElementById('sa-' + id); const tgt = a.duration * 0.55; a.currentTime = tgt; await new Promise(r => setTimeout(r, 300)); return { tgt, now: a.currentTime }; }, A);
  T.ok(`55%の位置へシークできる（目標 ${sk.tgt.toFixed(2)} → ${sk.now.toFixed(2)}）`, Math.abs(sk.now - sk.tgt) < 0.3);

  console.log('[2] カードの ↺5秒/▶/5秒↻ と保存バーの ▶/⏸');
  const pc = await p.evaluate(id => { const c = document.getElementById('sc-' + id); return { n: c.querySelectorAll('.pctl .pcb').length, pp: !!c.querySelector('.ppb[data-au="sa-' + id + '"]') }; }, A);
  T.ok('採点カードに再生操作3つ（↺5秒・▶/⏸・5秒↻）', pc.n === 3 && pc.pp);
  const geo = await p.evaluate(id => { const c = document.getElementById('sc-' + id); const a = c.querySelector('.pctl').getBoundingClientRect(), s = c.querySelector('.sr').getBoundingClientRect(); return s.top - a.bottom; }, A);
  T.ok('再生操作は○×の直上（間隔 ' + Math.round(geo) + 'px ≤ 30）', geo >= -2 && geo <= 30);
  await p.evaluate(id => { document.getElementById('sa-' + id).currentTime = 1; }, A); await p.waitForTimeout(150);
  await p.click(`#sc-${A} .pctl .pcb >> nth=2`); await p.waitForTimeout(200);
  const f5 = await p.evaluate(id => document.getElementById('sa-' + id).currentTime, A);
  T.ok('5秒↻ で 1→6 秒: ' + f5.toFixed(2), Math.abs(f5 - 6) < 0.3);
  await p.click(`#sc-${A} .pctl .pcb >> nth=0`); await p.waitForTimeout(200);
  const b5 = await p.evaluate(id => document.getElementById('sa-' + id).currentTime, A);
  T.ok('↺5秒 で 6→1 秒: ' + b5.toFixed(2), Math.abs(b5 - 1) < 0.3);
  await p.click(`#sc-${A} .ppb`); await p.waitForTimeout(500);
  const st1 = await p.evaluate(id => ({ play: !document.getElementById('sa-' + id).paused, card: document.querySelector('#sc-' + id + ' .ppb').textContent, sb: document.getElementById('sbPause').textContent }), A);
  T.ok('カードの ▶ で再生・表示は ⏸（カード/保存バーとも）: ' + JSON.stringify(st1), st1.play && st1.card === '⏸' && st1.sb === '⏸');
  await p.click('#sbPause'); await p.waitForTimeout(200);
  const t1 = await p.evaluate(id => ({ paused: document.getElementById('sa-' + id).paused, t: document.getElementById('sa-' + id).currentTime, sb: document.getElementById('sbPause').textContent }), A);
  T.ok('保存バーの ⏸ で一時停止・表示は ▶: ' + JSON.stringify(t1), t1.paused && t1.sb === '▶');
  await p.click('#sbPause'); await p.waitForTimeout(400);
  const t2 = await p.evaluate(id => ({ paused: document.getElementById('sa-' + id).paused, t: document.getElementById('sa-' + id).currentTime }), A);
  T.ok(`保存バーの ▶ で同じ音声を続きから再開（${t1.t.toFixed(2)}→${t2.t.toFixed(2)}）`, !t2.paused && t2.t >= t1.t);
  await p.click('#sbBack'); await p.waitForTimeout(150);
  const t3 = await p.evaluate(id => document.getElementById('sa-' + id).currentTime, A);
  T.ok('保存バーの ↺5秒 で最後に再生した音声が戻る: ' + t3.toFixed(2), t3 < t2.t);
  await p.evaluate(() => document.querySelectorAll('audio').forEach(a => a.pause()));

  console.log('[3] 自動送りの条件');
  const snap = () => p.evaluate(ids => ({ y: scrollY, pl: ids.map(id => !document.getElementById('sa-' + id).paused) }), ids);
  // (a) 未判定→初判定・再生していない・触っていない → 次の未判定へ送る（従来どおり）
  await p.evaluate(id => document.getElementById('sc-' + id).scrollIntoView({ block: 'center' }), A); await p.waitForTimeout(200);
  const y0 = (await snap()).y;
  await p.click(`.sb[data-id="${A}"][data-s="pass"]`); await p.waitForTimeout(1300);
  const s1 = await snap();
  T.ok(`初判定（再生なし）は次へ送り、次の音声を再生: y ${y0}→${s1.y} ${s1.pl}`, s1.pl[1] === true && s1.y !== y0);
  const sbt = await p.evaluate(() => document.getElementById('sbCnt').textContent);
  T.ok('[4] 保存バーは「判定 1/3」＋「合格1・不合格0」（合格 1/1 と出さない）: ' + sbt, sbt.includes('判定 1/3') && sbt.includes('合格1・不合格0') && !/1\/1/.test(sbt));
  await p.evaluate(() => document.querySelectorAll('audio').forEach(a => a.pause()));
  // (b) 再生中に判定 → 送らない・止めない
  await p.evaluate(id => { document.getElementById('sc-' + id).scrollIntoView({ block: 'center' }); document.getElementById('sa-' + id).play(); }, C); await p.waitForTimeout(400);
  const y1 = (await snap()).y;
  await p.click(`.sb[data-id="${C}"][data-s="pass"]`); await p.waitForTimeout(900);
  const s2 = await snap();
  T.ok(`再生中の初判定では送らない（${C}は再生継続・${B}は止まったまま・y ${y1}→${s2.y}）`, s2.pl[2] === true && s2.pl[1] === false && Math.abs(s2.y - y1) < 5);
  await p.evaluate(() => document.querySelectorAll('audio').forEach(a => a.pause()));
  // (c) 訂正（合格→不合格）では送らない
  await p.click(`.sb[data-id="${C}"][data-s="fail"]`); await p.waitForTimeout(900);
  const s3 = await snap();
  T.ok(`判定の訂正では送らない（y ${s2.y}→${s3.y}・${B}停止のまま）`, !s3.pl[1] && Math.abs(s3.y - s2.y) < 5);
  // (d) ○を押してすぐコメント欄へ → 送らない・入力欄は画面内
  await p.check(`.nachk[data-id="${C}"]`); await p.uncheck(`.nachk[data-id="${C}"]`); await p.waitForTimeout(200); // C を未判定に戻す
  await p.click(`.sb[data-id="${C}"][data-s="pass"]`); await p.waitForTimeout(250);
  await p.click('#cm-' + C); await p.keyboard.type('声が小さい'); await p.waitForTimeout(900);
  const s4 = await p.evaluate(ids => { const cm = document.getElementById('cm-' + ids[2]); const r = cm.getBoundingClientRect(); return { foc: document.activeElement === cm, top: r.top, bot: r.bottom, val: cm.value, pl: !document.getElementById('sa-' + ids[1]).paused }; }, ids);
  T.ok('判定直後にコメント欄を触ったら送らない（フォーカス・画面内・入力値）: ' + JSON.stringify(s4), s4.foc && s4.top >= 0 && s4.bot <= 740 && s4.val === '声が小さい' && !s4.pl);

  await p.click(`.sb[data-id="${B}"][data-s="pass"]`); await p.waitForTimeout(700);
  console.log('[5] 速度');
  const rates = [];
  for (let i = 0; i < 4; i++) { await p.click('#sbSpd'); rates.push(await p.evaluate(() => document.getElementById('sbSpd').textContent)); }
  T.ok('速度は 1→1.25→1.5→2→0.75: ' + rates.join(','), rates.join(',') === '1.25x,1.5x,2x,0.75x');
  T.ok('速度を oral_exam_rate に記憶', await p.evaluate(() => localStorage.getItem('oral_exam_rate')) === '0.75');
  await p.click('text=採点を保存'); await p.waitForTimeout(400);
  await p.reload(); await p.waitForTimeout(500);
  T.ok('再読み込み後も 0.75x', await p.evaluate(() => playRate) === 0.75);
  // 履歴：長さの補正・速度・排他再生
  await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(300);
  await p.click('#hList .hi'); await p.waitForTimeout(900);
  await p.waitForFunction(id => { const a = document.getElementById('da-' + id); return a && isFinite(a.duration); }, A, { timeout: 5000 }).catch(() => {});
  const hd = await p.evaluate(ids => ids.map(id => { const a = document.getElementById('da-' + id); return { d: a.duration, r: a.playbackRate }; }), ids);
  T.ok('履歴の da- も長さが有限・速度 0.75x: ' + JSON.stringify(hd), hd.every(x => isFinite(x.d) && x.r === 0.75));
  await p.evaluate(ids => { document.getElementById('da-' + ids[0]).play(); }, ids); await p.waitForTimeout(300);
  await p.evaluate(ids => { document.getElementById('da-' + ids[1]).play(); }, ids); await p.waitForTimeout(300);
  const hx = await p.evaluate(ids => ids.slice(0, 2).map(id => document.getElementById('da-' + id).paused), ids);
  T.ok('履歴でも同時再生しない: ' + hx, hx[0] === true && hx[1] === false);
  await p.evaluate(() => document.querySelectorAll('audio').forEach(a => a.pause()));
  // 保存データの形式は不変（score は pass/fail・音声キーは session.id_itemId）
  const sv = await p.evaluate(async ids => { const s = JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions[0]; const b = await getAudio(s.id + '_' + ids[0]); return { sc: ids.map(id => s.items[id].score), cm: s.items[ids[2]].comment, blob: !!b }; }, ids);
  T.ok('保存値と音声キーは従来どおり: ' + JSON.stringify(sv), sv.sc.join(',') === 'pass,pass,pass' && sv.cm === '声が小さい' && sv.blob);
  T.ok('375px幅で横スクロールなし', await p.evaluate(() => document.documentElement.scrollWidth <= 375));
  T.ok('ページエラーなし ' + errors.join('|'), errors.length === 0);
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
