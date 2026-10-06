/* 検査 2026-10-06【E-layout】の回帰テスト。実行: node tests/audit-E-layout.test.js
   M-9  最初の録音を止めた瞬間に進捗パネルが現れても、停止ボタン・合否ボタンの位置が動かない（○×でパネルの行が増減しても同じ）。
        停止の直後は「ドライブ：…」の行を押しても設定タブへ飛ばない
   M-20 録音中に画面の高さだけが変わっても（アドレスバー・キーボード）、入力中の別の問から録音中の問へ引き戻さない
        （幅が変わったときは従来どおり録音行を見える所へ戻す）
   M-22 スクロールで進捗パネルが小さくなる／戻るときに、カードが跳ばない（10pxずつ動かして毎回10pxだけ動く）
   L-11 キーボードで移動した先が下のタブバーの裏に隠れない
   L-12 小型の進捗パネルは1行（320×568・ベトナム語でも高さ52px以下）。マイクの準備や名前入力後の自動スクロールが遅くても前提（録音1件・「次の未判定へ」）が崩れない
   L-13 採点の保存バーのボタン文言が「…」で切れない（601/768/1280・4言語）
   L-14 試問タブのトーストはタブのすぐ上（カードの中ほどを覆わない）。採点画面では保存バーより上
   L-15 名前なしで録音を押したときの赤いトーストは、名前を入れて録音を始めたら消える／名前を入れたら消える（マイクの準備が遅い端末でも）
   L-16 ダークで停止ボタン・録音ピル・エラーのトーストの白文字が 4.5:1 以上
   L-17 ダークでカード上の赤い文字（リセット）が 4.5:1 以上
   L-20 ヘッダーのタイトルが切れない（320/360/390・4言語）
   L-22 名前訂正ダイアログの枠は --bdr（ダークで #ccc に浮かない）
   L-26 「画面を消さないで」の表示が進捗パネルを覆わない（2問目を録音中に400px下へ送り、パネルが上に貼り付いた状態でも）
   L-27 試問タブ上部の小さいボタン（?・変更・詳しく・×・言語）が44px以上。「詳しく」「ドライブを設定」は
        四隅まで実際に押せる（次の行や×に下端・角を奪われない＝押しても設定タブへ飛ばない）
   本物の GAS へは送らない（script.google は代役で応答 or 遮断）。 */
'use strict';
const env = require('./_env');
const c = env.counter();

const WAKE_NONE = `(()=>{try{Object.defineProperty(Navigator.prototype,'wakeLock',{configurable:true,get:()=>undefined})}catch(e){}})();`;
// 負荷が高い端末の再現：マイクの準備（getUserMedia）が1.5秒遅れる（L-12 の全体実行での1件NG＝録音が始まる前に停止を押していた）
// なめらかスクロールが遅い端末（behavior:'smooth' の scrollIntoView を 1.2 秒かけて動かす）。名前欄を離れた直後の自動スクロール中に押すと、指の下は別の要素になる
const SLOW_SCROLL = `(()=>{const o=Element.prototype.scrollIntoView;Element.prototype.scrollIntoView=function(a){if(!a||typeof a!=='object'||a.behavior!=='smooth')return o.apply(this,arguments);const y0=scrollY;o.call(this,Object.assign({},a,{behavior:'instant'}));const y1=scrollY;scrollTo({top:y0,behavior:'instant'});const t0=performance.now();const f=t=>{const k=Math.min(1,(t-t0)/1200);scrollTo({top:y0+(y1-y0)*k,behavior:'instant'});if(k<1)requestAnimationFrame(f)};requestAnimationFrame(f)}})();`;
const SLOW_MIC = `(()=>{const md=navigator.mediaDevices;if(!md)return;const g=md.getUserMedia.bind(md);md.getUserMedia=c=>new Promise(r=>setTimeout(r,1500)).then(()=>g(c))})();`;
const rect = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, w: r.width, h: r.height, cx: r.left + r.width / 2, cy: r.top + r.height / 2 }; }, sel);
const tabsTop = p => p.evaluate(() => document.querySelector('.tabs').getBoundingClientRect().top);

async function open(b, opts) {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: opts.vp || { width: 390, height: 844 }, colorScheme: opts.dark ? 'dark' : 'light', permissions: ['microphone'], isMobile: !!opts.mobile, hasTouch: !!opts.mobile });
  await ctx.route('**/script.google*/**', r => opts.gas ? r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"ok":true,"id":"F1","url":"https://drive.example/F1"}' }) : r.abort());
  const init = [];
  if (opts.lang) init.push(`localStorage.setItem('oral_exam_lang',${JSON.stringify(opts.lang)});`);
  if (opts.howtoOff) init.push(`localStorage.setItem('oral_exam_howto_off','1');localStorage.setItem('oral_exam_drvhint_off','1');`);
  if (opts.google) init.push(`localStorage.setItem('oral_exam_google_v1',${JSON.stringify(JSON.stringify(opts.google))});`);
  if (opts.sessions) init.push(`localStorage.setItem('oral_exam_sessions_v1',${JSON.stringify(JSON.stringify({ sessions: opts.sessions }))});`);
  if (init.length) await ctx.addInitScript(`try{if(!sessionStorage.getItem('__seedE')){sessionStorage.setItem('__seedE','1');${init.join('')}}}catch(e){}`);
  if (opts.noWake) await ctx.addInitScript(WAKE_NONE);
  if (opts.slowMic) await ctx.addInitScript(SLOW_MIC);
  if (opts.slowScroll) await ctx.addInitScript(SLOW_SCROLL);
  const { page, errors } = await env.newPage(ctx);
  page.on('dialog', d => (opts.dismiss ? d.dismiss() : d.accept()));
  if (opts.slowScroll) page._aimMs = 300;
  await page.goto(env.URL); await page.waitForTimeout(600);
  return { p: page, errors, ctx };
}
// 指で押すのと同じ（画面外なら先に見える所へ送ってから、その座標を押す）
const tap = async (p, sel) => {
  await p.evaluate(s => { const e = document.querySelector(s), r = e.getBoundingClientRect(), tb = document.querySelector('.tabs').getBoundingClientRect().top; if (r.top < 110 || r.bottom > tb) e.scrollIntoView({ block: 'center' }); }, sel);
  const r = await rect(p, sel);
  // 狙ってから押すまで時間がかかる指（p._aimMs）：位置を読んでから押すまでの間に画面が動いていれば別の要素を押す
  if (p._aimMs) { await p.mouse.move(r.cx, r.cy); await p.waitForTimeout(p._aimMs); await p.mouse.down(); await p.mouse.up(); } else await p.mouse.click(r.cx, r.cy);
  return r;
};
async function recordStop(p, id, ms) {
  await p.fill('#fEe', 'グエン'); await p.locator('#fEe').blur();
  // 名前欄を離れると1問目の録音ボタンへ自動でなめらかスクロールする（scrollFirstRecIntoView）。動き終わる前に押すと別の要素を押してしまう（L-12）
  await settled(p, '#rb-' + id);
  await tap(p, '#rb-' + id);
  // 録音が本当に始まってから（マイクの準備は負荷が高いと遅れる）。始まらなければ黙って進まず NG にする
  const started = await p.waitForFunction(() => !!active, null, { timeout: 15000 }).then(() => true, () => false);
  c.ok('前提：録音ボタンを押したら録音が始まる（' + id + '）', started);
  await p.waitForTimeout(ms || 1200);
}
// スクロールとボタンの位置が 8 フレーム続けて動かなくなるまで待つ
const settled = (p, sel) => p.waitForFunction(s => new Promise(res => {
  const pos = () => { const e = document.querySelector(s); return scrollY + ',' + (e ? Math.round(e.getBoundingClientRect().top) : ''); };
  let last = pos(), n = 0; const f = () => { const v = pos(); if (v === last) { if (++n >= 8) return res(true); } else { n = 0; last = v; } requestAnimationFrame(f); }; requestAnimationFrame(f);
}), sel, { timeout: 15000 });
// 停止のあと、録音が保存されて進捗パネルに「次の未判定へ」が出るまで待つ（固定の待ち時間は負荷が高いと足りない・L-12）
const stopped = async p => { await p.waitForSelector('#epNextUnj', { state: 'attached', timeout: 15000 }).catch(() => { }); await p.waitForTimeout(300); };
const lum = c2 => { const m = c2.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => v / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]; };
const ratio = (a, b2) => { const x = lum(a), y = lum(b2); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const colors = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); const cs = getComputedStyle(e); return { fg: cs.color, bg: cs.backgroundColor }; }, sel);

(async () => {
  const bf = await env.launch({ freeDefault: true });
  const b = await env.launch();

  /* ---------- M-9 ---------- */
  for (const v of [{ vp: { width: 390, height: 844 } }, { vp: { width: 390, height: 844 }, howtoOff: true }, { vp: { width: 768, height: 1024 } }]) {
    const tag = 'M-9 ' + v.vp.width + (v.howtoOff ? ' 初回カードなし' : ' 初回カードあり');
    const { p, errors, ctx } = await open(bf, Object.assign({ dismiss: true }, v));
    await recordStop(p, 'f1');
    const rb0 = await rect(p, '#rb-f1');
    await p.mouse.click(rb0.cx, rb0.cy); await stopped(p); await p.waitForTimeout(600); // 停止
    const rb1 = await rect(p, '#rb-f1'), vp1 = await rect(p, '#vp-f1'), tt = await tabsTop(p);
    c.ok(tag + ` 停止ボタンが動かない ${Math.round(rb0.top)}→${Math.round(rb1.top)}`, Math.abs(rb1.top - rb0.top) <= 12);
    c.ok(tag + ` 合否ボタンがタブの裏に入らない ${Math.round(vp1.bottom)} <= ${Math.round(tt)}`, vp1.bottom <= tt);
    c.ok(tag + ' 進捗パネルが出ている', await p.isVisible('#examProg'));
    // 同じ所をもう一度押す（手袋の二度押し）→ 録り直しの確認（キャンセル）だけで、設定タブへは飛ばない
    await p.mouse.click(rb0.cx, rb0.cy); await p.waitForTimeout(300);
    c.ok(tag + ' 二度押ししても試問タブのまま', await p.evaluate(() => document.querySelector('.pg.on').id) === 'pgExam');
    // ○を押す（合否の行が変わる）→ 合格ボタンの位置が動かない
    const vpa = await tap(p, '#vp-f1'); await p.waitForTimeout(400);
    const vpb = await rect(p, '#vp-f1');
    c.ok(tag + ` ○を押しても合格ボタンが動かない ${Math.round(vpa.top)}→${Math.round(vpb.top)}`, Math.abs(vpb.top - vpa.top) <= 2);
    c.ok(tag + ' JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  {
    // 停止の直後はドライブの行を押しても設定タブへ飛ばない／時間がたてば従来どおり設定へ
    const { p, ctx } = await open(bf, { howtoOff: true });
    await recordStop(p, 'f1'); await tap(p, '#rb-f1'); await p.waitForTimeout(150);
    await p.evaluate(() => document.getElementById('epDrv').click()); await p.waitForTimeout(200);
    c.ok('M-9 停止の直後のドライブ行は押しても試問タブのまま', await p.evaluate(() => document.querySelector('.pg.on').id) === 'pgExam');
    await p.waitForTimeout(1100);
    await p.evaluate(() => document.getElementById('epDrv').click()); await p.waitForTimeout(200);
    c.ok('M-9 少し後なら従来どおり設定タブへ', await p.evaluate(() => document.querySelector('.pg.on').id) === 'pgCfg');
    await ctx.close();
  }

  /* ---------- M-20 ---------- */
  {
    const { p, errors, ctx } = await open(bf, { vp: { width: 390, height: 788 }, howtoOff: true });
    await recordStop(p, 'f1');
    // 出-3 の問題文を入力中に、画面の高さだけが変わる
    await p.evaluate(() => { const q = document.getElementById('qt-f3'); q.scrollIntoView({ block: 'center' }); q.focus({ preventScroll: true }); });
    await p.keyboard.type('Q3'); await p.waitForTimeout(200);
    const y0 = await p.evaluate(() => scrollY);
    await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(400);
    const y1 = await p.evaluate(() => scrollY), q3 = await rect(p, '#qt-f3');
    // （下端近くでは画面が伸びたぶんブラウザが scrollY を詰めることがある＝最大で伸びた56pxまで）
    c.ok(`M-20 高さだけ変わっても入力中の問から引き戻さない scrollY ${y0}→${y1} q3=${Math.round(q3.top)}`, y1 >= y0 - 58 && y1 <= y0 + 2 && q3.top >= 0 && q3.bottom <= 844);
    // 入力していなくても、高さだけの変化（アドレスバーの出入り）では動かさない
    await p.evaluate(() => document.activeElement.blur());
    const y2 = await p.evaluate(() => scrollY);
    await p.setViewportSize({ width: 390, height: 760 }); await p.waitForTimeout(400);
    c.ok('M-20 アドレスバーの出入り（高さだけ）では動かさない', Math.abs(await p.evaluate(() => scrollY) - y2) <= 2);
    // 幅が変わったとき（回転）は従来どおり録音行を見える所へ戻す
    await p.setViewportSize({ width: 760, height: 390 }); await p.waitForTimeout(500);
    c.ok('M-20 幅が変わったら録音中の行を見える所へ戻す', await p.evaluate(() => inBand(document.querySelector('#q-f1 .recrow'))));
    c.ok('M-20 録音中のまま', await p.evaluate(() => !!active));
    await tap(p, '#rb-f1'); await p.waitForTimeout(800);
    c.ok('M-20 JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- M-22 / L-12 ---------- */
  for (const v of [{ vp: { width: 390, height: 844 } }, { vp: { width: 390, height: 844 }, lang: 'vi' }, { vp: { width: 768, height: 1024 } }]) {
    const tag = 'M-22 ' + v.vp.width + (v.lang ? ' ' + v.lang : '');
    const { p, errors, ctx } = await open(bf, Object.assign({ howtoOff: true }, v));
    await recordStop(p, 'f1'); await tap(p, '#rb-f1'); await stopped(p);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(100);
    const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const pos = async () => p.evaluate(() => ({ y: scrollY, t: document.getElementById('qt-f2').getBoundingClientRect().top, mini: document.getElementById('examProg').classList.contains('mini') }));
    let prev = await pos(), jumps = [], sawMini = false;
    const end = Math.min(700, max);
    for (let y = 10; y <= end; y += 10) {
      await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(30);
      const cur = await pos(); if (cur.mini) sawMini = true;
      const exp = prev.t - (cur.y - prev.y);
      if (Math.abs(cur.t - exp) > 1.5) jumps.push(`${prev.y}→${cur.y}:${Math.round(cur.t - exp)}`);
      prev = cur;
    }
    for (let y = end - 10; y >= 0; y -= 10) {
      await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(30);
      const cur = await pos();
      const exp = prev.t - (cur.y - prev.y);
      if (Math.abs(cur.t - exp) > 1.5) jumps.push(`${prev.y}→${cur.y}:${Math.round(cur.t - exp)}`);
      prev = cur;
    }
    c.ok(tag + ' スクロールの途中で小型になる', sawMini);
    c.ok(tag + ' 先頭へ戻ると元の大きさ', !prev.mini);
    c.ok(tag + ' カードが跳ばない（10pxずつで毎回10px） ' + jumps.join(' '), !jumps.length);
    c.ok(tag + ' JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  for (const v of [{ vp: { width: 320, height: 568 }, lang: 'vi' }, { vp: { width: 320, height: 568 } }, { vp: { width: 390, height: 844 }, lang: 'id' }, { vp: { width: 320, height: 568 }, slowMic: true }, { vp: { width: 320, height: 568 }, slowScroll: true }]) {
    const tag = 'L-12 ' + v.vp.width + 'x' + v.vp.height + ' ' + (v.lang || 'ja') + (v.slowMic ? ' マイクの準備が遅い端末' : '') + (v.slowScroll ? ' 名前を入れた後の自動スクロールが遅く、狙ってから押すまで0.3秒の指' : '');
    const { p, ctx } = await open(bf, Object.assign({ howtoOff: true }, v));
    await recordStop(p, 'f1'); await tap(p, '#rb-f1'); await stopped(p);
    await p.evaluate(() => window.scrollTo(0, 2000)); await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const g = document.getElementById('examProg'); return { mini: g.classList.contains('mini'), h: Math.round(g.getBoundingClientRect().height), btn: !!document.getElementById('epNextUnj') }; });
    c.ok(tag + ' 小型の進捗パネルは1行（○×未入力の「次へ」付きでも52px以下） ' + JSON.stringify(r), r.mini && r.btn && r.h <= 52);
    await ctx.close();
  }

  /* ---------- L-11 ---------- */
  {
    const { p, errors, ctx } = await open(bf, { howtoOff: true });
    // 出-2 の録音ボタンをタブバーの裏に置き、その前の問題文の欄から Tab で移る
    await p.evaluate(() => {
      document.getElementById('qt-f2').focus({ preventScroll: true });
      const tb = document.querySelector('.tabs').getBoundingClientRect().top, r = document.getElementById('rb-f2').getBoundingClientRect();
      window.scrollBy(0, r.top - (tb + 4));
    });
    await p.waitForTimeout(100);
    const before = await rect(p, '#rb-f2'), tt = await tabsTop(p);
    c.ok('L-11 前提: 録音ボタンがタブの裏にある', before.top >= tt);
    await p.keyboard.press('Tab'); await p.waitForTimeout(300);
    const after = await rect(p, '#rb-f2');
    c.ok('L-11 フォーカスは出-2の録音ボタン', await p.evaluate(() => document.activeElement.id) === 'rb-f2');
    c.ok(`L-11 タブバーの裏に隠れない ${Math.round(after.bottom)} <= ${Math.round(tt)}`, after.bottom <= tt);
    c.ok('L-11 JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- L-13 ---------- */
  {
    const sess = [{ id: 's1', date: '2026-10-05', examiner: '', examinee: 'グエン', status: 'rec', createdAt: '2026-10-05T01:00:00Z', updatedAt: '2026-10-05T01:00:00Z', setId: 'def', setN: 3,
      items: { q1: { hasAudio: true, score: 'pass' }, q4: { hasAudio: true }, q5: { hasAudio: true, score: 'fail' } } }];
    for (const w of [601, 768, 1280]) for (const lang of ['ja', 'en', 'vi', 'id']) {
      const { p, ctx } = await open(b, { vp: { width: w, height: 900 }, lang, sessions: sess });
      await p.evaluate(async () => { swTab(document.querySelector('.tabs [data-pg="pgScore"]')); await openScore('s1'); }); await p.waitForTimeout(400);
      const cut = await p.evaluate(() => [...document.querySelectorAll('.savebar .b')].filter(x => x.offsetParent && x.scrollWidth > x.clientWidth + 1).map(x => x.textContent.trim()));
      c.ok(`L-13 ${w} ${lang} 保存バーの文言が切れない ${cut.join('|')}`, !cut.length);
      if (w === 768 && lang === 'ja') {
        // L-14（採点画面）：トーストは保存バーより上
        await p.evaluate(() => toast('テスト')); await p.waitForTimeout(400);
        const t = await rect(p, '#toast'), sb = await rect(p, '.savebar');
        c.ok(`L-14 採点画面のトーストは保存バーより上 ${Math.round(t.bottom)} <= ${Math.round(sb.top)}`, t.bottom <= sb.top + 1);
      }
      await ctx.close();
    }
    for (const w of [320, 390]) {
      const { p, ctx } = await open(b, { vp: { width: w, height: 800 }, sessions: sess });
      await p.evaluate(async () => { swTab(document.querySelector('.tabs [data-pg="pgScore"]')); await openScore('s1'); }); await p.waitForTimeout(400);
      await p.evaluate(() => toast('テスト')); await p.waitForTimeout(400);
      const t = await rect(p, '#toast'), sb = await rect(p, '.savebar');
      c.ok(`L-14 ${w} 採点画面（2段の保存バー）のトーストは保存バーより上`, t.bottom <= sb.top + 1);
      await ctx.close();
    }
  }

  /* ---------- L-14（試問タブ） ---------- */
  {
    const { p, ctx } = await open(b, { howtoOff: true });
    await p.evaluate(() => toast('テスト')); await p.waitForTimeout(400);
    const t = await rect(p, '#toast'), tt = await tabsTop(p);
    const hit = await p.evaluate(tr => ['rb-q1', 'vp-q1', 'vf-q1', 'fEe'].filter(id => { const r = document.getElementById(id).getBoundingClientRect(); return r.bottom > tr.top && r.top < tr.bottom && r.right > tr.left && r.left < tr.right; }), t);
    c.ok(`L-14 試問タブのトーストはタブのすぐ上 bottom=${Math.round(t.bottom)} tabs=${Math.round(tt)}`, t.bottom > tt - 100 && t.bottom <= tt);
    c.ok('L-14 出-1の録音・合否ボタンを覆わない ' + hit.join(','), !hit.length);
    await ctx.close();
  }

  /* ---------- L-15 ---------- */
  // 録音が始まるまで待つ（固定の待ち時間はマイクの準備が遅い端末・高負荷で足りない）
  const recOn = p => p.waitForFunction(() => !!active, null, { timeout: 15000 }).then(() => true, () => false);
  for (const slowMic of [false, true]) {
    const sm = slowMic ? '（マイクの準備が遅い端末）' : '';
    {
      const { p, errors, ctx } = await open(b, { howtoOff: true, slowMic, gas: true, google: { url: 'https://script.google.com/macros/s/eTest/exec', auto: true, autoSet: true, folder: 'T' } });
      await tap(p, '#rb-q1'); await p.waitForTimeout(300);
      const t0 = await p.evaluate(() => ({ show: document.getElementById('toast').classList.contains('show'), ok: document.getElementById('toast').textContent === t2('needEe'), rec: !!active }));
      c.ok('L-15 前提: 名前なしで録音→赤いトースト・録音しない' + sm, t0.show && t0.ok && !t0.rec);
      await p.fill('#fEe', 'グエン'); await p.waitForTimeout(100);
      c.ok('L-15 名前を入れたら赤いトーストは消える' + sm, !(await p.evaluate(() => document.getElementById('toast').classList.contains('show'))));
      // 名前を入れずにもう一度押す→トースト→名前を貼り付けずに録音（change イベント経由でなく）でも、録音が始まったら消える
      await p.evaluate(() => { const f = document.getElementById('fEe'); f.value = ''; });
      await tap(p, '#rb-q1'); await p.waitForTimeout(200);
      await p.evaluate(() => { document.getElementById('fEe').value = 'グエン'; });
      await tap(p, '#rb-q1'); await recOn(p); await p.waitForTimeout(300);
      const t1 = await p.evaluate(() => ({ show: document.getElementById('toast').classList.contains('show'), rec: !!active }));
      c.ok('L-15 録音を始めたら「先に受験者名を」のトーストは残らない' + sm + ' ' + JSON.stringify(t1), t1.rec && !t1.show);
      await tap(p, '#rb-q1'); await p.waitForTimeout(800);
      c.ok('L-15 JSエラーなし' + sm + ' ' + errors.join('|'), !errors.length);
      await ctx.close();
    }
    {
      // ドライブなし：名前が空のまま録音→「名前が未入力」→名前を入れたら消える
      const { p, ctx } = await open(b, { howtoOff: true, slowMic });
      await tap(p, '#rb-q1'); await recOn(p); await p.waitForTimeout(200);
      c.ok('L-15 前提: 名前が空の録音で注意のトースト' + sm, await p.evaluate(() => document.getElementById('toast').textContent === t2('eeEmptyRec') && !!active));
      await p.fill('#fEe', 'グエン'); await p.waitForTimeout(100);
      c.ok('L-15 名前を入れたら「名前が未入力」のトーストは消える' + sm, !(await p.evaluate(() => document.getElementById('toast').classList.contains('show'))));
      await tap(p, '#rb-q1'); await p.waitForTimeout(800);
      await ctx.close();
    }
  }

  /* ---------- L-16 / L-17 ---------- */
  {
    const { p, errors, ctx } = await open(b, { howtoOff: true, dark: true });
    await p.fill('#fEe', 'グエン');
    await tap(p, '#rb-q1'); await p.waitForTimeout(800);
    const rb = await colors(p, '#rb-q1'), pill = await colors(p, '#recPill');
    c.ok(`L-16 ダークの停止ボタン ${ratio(rb.fg, rb.bg).toFixed(2)}:1`, ratio(rb.fg, rb.bg) >= 4.5);
    c.ok(`L-16 ダークの録音ピル ${ratio(pill.fg, pill.bg).toFixed(2)}:1`, ratio(pill.fg, pill.bg) >= 4.5);
    await p.evaluate(() => togglePause()); await p.waitForTimeout(200);
    const pp = await colors(p, '#recPill');
    c.ok(`L-16 ダークの一時停止中のピル ${ratio(pp.fg, pp.bg).toFixed(2)}:1`, ratio(pp.fg, pp.bg) >= 4.5);
    await p.evaluate(() => togglePause());
    await tap(p, '#rb-q1'); await p.waitForTimeout(800);
    await p.evaluate(() => toast('エラー', 1)); await p.waitForTimeout(100);
    const te = await colors(p, '#toast');
    c.ok(`L-16 ダークのエラーのトースト ${ratio(te.fg, te.bg).toFixed(2)}:1`, ratio(te.fg, te.bg) >= 4.5);
    const card = await p.evaluate(() => getComputedStyle(document.querySelector('#q-q1')).backgroundColor);
    const s1 = await p.evaluate(() => { const d = document.createElement('div'); d.style.color = 'var(--s1)'; document.querySelector('#q-q1').appendChild(d); const c2 = getComputedStyle(d).color; d.remove(); return c2; });
    c.ok(`L-17 ダークのカード上の赤い文字 ${ratio(s1, card).toFixed(2)}:1`, ratio(s1, card) >= 4.5);
    const rs = await colors(p, '#pgExam .b2');
    c.ok(`L-17 ダークのリセットボタン ${ratio(rs.fg, rs.bg).toFixed(2)}:1`, ratio(rs.fg, rs.bg) >= 4.5);
    c.ok('L-16 JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  {
    // ライトも 4.5:1 を保つ（退行なし）
    const { p, ctx } = await open(b, { howtoOff: true });
    await p.fill('#fEe', 'グエン'); await tap(p, '#rb-q1'); await p.waitForTimeout(800);
    const rb = await colors(p, '#rb-q1'), pill = await colors(p, '#recPill');
    c.ok('L-16 ライトの停止ボタン・ピルも4.5:1以上', ratio(rb.fg, rb.bg) >= 4.5 && ratio(pill.fg, pill.bg) >= 4.5);
    await tap(p, '#rb-q1'); await p.waitForTimeout(800);
    await ctx.close();
  }

  /* ---------- L-20 ---------- */
  for (const w of [320, 360, 390, 430, 768]) for (const lang of ['ja', 'en', 'vi', 'id']) {
    const { p, ctx } = await open(b, { vp: { width: w, height: 700 }, lang });
    const r = await p.evaluate(() => { const h = document.querySelector('.hdr h1'); const sp = [...h.children].find(x => getComputedStyle(x).display !== 'none') || h; return { txt: sp.textContent, cut: h.scrollWidth > h.clientWidth + 1, sw: document.documentElement.scrollWidth, w: innerWidth }; });
    c.ok(`L-20 ${w} ${lang} タイトルが切れない「${r.txt}」`, r.txt && !r.cut && r.sw <= r.w);
    await ctx.close();
  }

  /* ---------- L-22 ---------- */
  {
    const mk = (id, d) => ({ id, date: d, examiner: '', examinee: 'グエン', status: 'scored', createdAt: d + 'T01:00:00Z', updatedAt: d + 'T01:00:00Z', setId: 'def', setN: 3, items: { q1: { hasAudio: true, score: 'pass' } } });
    const { p, ctx } = await open(b, { dark: true, sessions: [mk('a1', '2026-10-01'), mk('a2', '2026-10-02')] });
    await p.evaluate(() => renameForm('a1')); await p.waitForTimeout(300);
    const r = await p.evaluate(() => { const f = document.querySelector('#modal fieldset'); const d = document.createElement('div'); d.style.color = 'var(--bdr)'; document.body.appendChild(d); const want = getComputedStyle(d).color; d.remove(); return { got: f && getComputedStyle(f).borderTopColor, want }; });
    c.ok(`L-22 名前訂正の枠はテーマの枠線色 ${r.got} = ${r.want}`, r.got && r.got === r.want);
    await ctx.close();
  }

  /* ---------- L-26 ---------- */
  for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const { p, errors, ctx } = await open(b, { vp, howtoOff: true, noWake: true });
    await p.fill('#fEe', 'グエン'); await tap(p, '#rb-q1'); await p.waitForTimeout(800);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    const wn = await rect(p, '#wakeNote'), pr = await rect(p, '#examProg'), pill = await rect(p, '#recPill'), tt = await tabsTop(p);
    const ov = (a, b2) => a && b2 && a.bottom > b2.top && a.top < b2.bottom && a.right > b2.left && a.left < b2.right;
    c.ok(`L-26 ${vp.width} 「画面を消さないで」が出ている`, !!wn);
    c.ok(`L-26 ${vp.width} 進捗パネルを覆わない`, !ov(wn, pr));
    c.ok(`L-26 ${vp.width} 録音ピル・タブとも重ならない`, !ov(wn, pill) && wn.bottom <= tt);
    await tap(p, '#rb-q1'); await p.waitForTimeout(800);
    c.ok('L-26 JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  // 報告の手順どおり：スマホで初回カードを閉じ、1問目を録音→停止、2問目を録音中に 400px 下へ（進捗パネルが上に貼り付く）
  for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const { p, errors, ctx } = await open(b, { vp, noWake: true, mobile: true });
    await p.click('#howtoX'); await p.waitForTimeout(200);
    const ids = await p.evaluate(() => [...document.querySelectorAll('#examCards .recbtn:not(.pausebtn)')].map(x => x.id));
    await recordStop(p, ids[0].slice(3)); await tap(p, '#' + ids[0]); await stopped(p);
    await tap(p, '#' + ids[1]);
    c.ok(`L-26 ${vp.width} 前提：2問目の録音が始まる`, await p.waitForFunction(() => !!active, null, { timeout: 15000 }).then(() => true, () => false)); await p.waitForTimeout(1200);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(200);
    await p.evaluate(() => window.scrollBy(0, 400)); await p.waitForTimeout(400);
    const st = await p.evaluate(() => ({ y: scrollY, rec: !!active, stuck: Math.round(document.getElementById('examProg').getBoundingClientRect().top) }));
    const wn = await rect(p, '#wakeNote'), pr = await rect(p, '#examProg'), cnt = await rect(p, '#epCnt'), pill = await rect(p, '#recPill'), tt = await tabsTop(p);
    const ov = (a, b2) => !!(a && b2 && a.bottom > b2.top && a.top < b2.bottom && a.right > b2.left && a.left < b2.right);
    const tag = `L-26 ${vp.width} 2問目を録音中・400px下 ${JSON.stringify(st)}`;
    c.ok(tag + ' 前提：録音中・パネルが上に貼り付き・「画面を消さないで」が出ている', st.rec && st.y >= 200 && st.stuck <= 80 && !!wn && wn.h > 0 && !!pr && pr.h > 0);
    c.ok(tag + ' 進捗パネルを覆わない', !ov(wn, pr));
    c.ok(tag + ' 数（epCnt）を覆わない', !ov(wn, cnt));
    c.ok(tag + ' 録音ピル・タブとも重ならない', !ov(wn, pill) && wn.bottom <= tt);
    await tap(p, '#' + ids[1]); await p.waitForTimeout(800);
    c.ok(`L-26 ${vp.width} 2問目 JSエラーなし ` + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- L-27 ---------- */
  {
    const { p, ctx } = await open(b, {});
    const sz = async sel => p.evaluate(s => [...document.querySelectorAll(s)].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }), sel);
    for (const sel of ['#howtoMore', '#howtoX', '#examSetBtn', '.lsw button']) {
      const a = await sz(sel);
      c.ok(`L-27 ${sel} は44px以上 ${JSON.stringify(a)}`, a.length && a.every(([w, h]) => w >= 44 && h >= 44));
    }
    await p.evaluate(() => toggleHowto(false)); await p.waitForTimeout(200);
    const q = await sz('#howtoBtn');
    c.ok(`L-27 ? は44px以上 ${JSON.stringify(q)}`, q.length && q.every(([w, h]) => w >= 44 && h >= 44));
    await ctx.close();
  }
  // 箱の大きさだけでなく、実際に押せる範囲：初回（ドライブ未設定・案内を閉じていない）で四辺・四隅・中央を elementFromPoint で確かめる
  for (const lang of ['ja', 'vi', 'en', 'id']) for (const w of [320, 360, 390, 430, 600, 768]) {
    const { p, ctx } = await open(b, { vp: { width: w, height: 800 }, lang });
    const r = await p.evaluate(() => {
      const d = t => t ? (t.id ? '#' + t.id : t.tagName + '.' + t.className) : 'null';
      const hit = s => { const e = document.querySelector(s); if (!e || !e.getClientRects().length) return null; const r = e.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2; /* 四辺の中点（1px内側）＋四隅（角丸ぶん6px内側）＋中央 */ const pts = [[cx, r.top + 1], [cx, r.bottom - 1], [r.left + 1, cy], [r.right - 1, cy], [r.left + 6, r.top + 6], [r.right - 6, r.top + 6], [r.left + 6, r.bottom - 6], [r.right - 6, r.bottom - 6], [cx, cy]]; return { w: Math.round(r.width), h: Math.round(r.height), miss: pts.map(([x, y]) => { const t = document.elementFromPoint(x, y); return t === e || e.contains(t) ? '' : d(t); }).filter(Boolean) }; };
      return { more: hit('#howtoMore'), go: hit('#drvHintGo'), x: hit('#howtoX') };
    });
    const ok = h => !!h && h.w >= 44 && h.h >= 44 && !h.miss.length;
    c.ok(`L-27 ${lang} ${w} 「詳しく」は四隅まで押せる ${JSON.stringify(r.more)}`, ok(r.more));
    c.ok(`L-27 ${lang} ${w} 「ドライブを設定」は四隅まで押せる ${JSON.stringify(r.go)}`, ok(r.go));
    c.ok(`L-27 ${lang} ${w} × は四隅まで押せる ${JSON.stringify(r.x)}`, ok(r.x));
    if (w === 390) {
      // 「詳しく」の下端を押す → 使い方が開くだけで、設定タブへは飛ばない
      const m = await rect(p, '#howtoMore');
      await p.mouse.click(m.left + 3, m.bottom - 2); await p.waitForTimeout(250);
      const st = await p.evaluate(() => ({ pg: document.querySelector('.pg.on').id, open: !document.getElementById('howtoLong').hidden }));
      c.ok(`L-27 ${lang} 「詳しく」の下端を押すと使い方が開き、試問タブのまま ${JSON.stringify(st)}`, st.pg === 'pgExam' && st.open);
    }
    await ctx.close();
  }

  await bf.close(); await b.close();
  c.done();
})().catch(e => { console.error(e); process.exit(1); });
