/* 辛口レビュー R8（スマホ現場）の回帰テスト。実行: node tests/r8-mobile.test.js
   [1] 録音は1秒ごとに IndexedDB の一時キー（live__…）へ書かれる（停止前でも0バイトではない）
   [2] 画面が消えた（visibilitychange=hidden）ら、そこまでを確定保存して止め、戻ったら知らせる
   [3] マイクを取られた（track停止）ら録音中表示を解除・トーストで知らせる／stopRec() が待ちっぱなしにならない
   [4] 録音中に端末が落ちた（ページを閉じた）→ 次の起動で「中断された録音を復元」→ 正式キーに戻る（続きの録音・新しい試問の両方）
   [5] 一時停止／再開（MediaRecorder.pause/resume・タイマーが止まる）
   [6] 停止後の「続きを録音」＝前の録音の後ろにつなぐ（確認なし・上書きしない）／「元に戻す」は10秒で消えない
   [7] 横向き（740x375）：ヘッダーは固定しない・ヒーロー1行・タブ44px。タブの裏のボタンは「見えていない」扱い、録音開始で見える位置へ
   [8] ○の二度押し（80ms）で合否が消えない／解除はトーストで知らせる
   [9] 開始・停止の振動、Wake Lock の取得と解放、Wake Lock が無い端末の常時案内
   [10] 孤児音声GCは一時キーを消さない
   Googleドライブは未設定（送信なし） */
const env = require('./_env');
const T = env.counter();
const VIB = `(()=>{window.__vib=[];try{Object.defineProperty(Navigator.prototype,'vibrate',{configurable:true,value:function(p){window.__vib.push(JSON.stringify(p));return true}})}catch(e){}})();`;
const WAKE_OK = `(()=>{window.__wake={req:0,rel:0};const wl={request:async()=>{window.__wake.req++;const s=new EventTarget();s.released=false;s.release=async()=>{if(!s.released){s.released=true;window.__wake.rel++;s.dispatchEvent(new Event('release'))}};return s}};try{Object.defineProperty(Navigator.prototype,'wakeLock',{configurable:true,get:()=>wl})}catch(e){}})();`;
const WAKE_NONE = `(()=>{try{Object.defineProperty(Navigator.prototype,'wakeLock',{configurable:true,get:()=>undefined})}catch(e){}})();`;
/* ページ内の検査用ヘルパー（一時キー一覧・録音の長さ） */
const HELP = `window.__liveKeys=()=>new Promise(res=>{openDB().then(db=>{const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();rq.onsuccess=()=>res((rq.result||[]).filter(k=>isLiveHead(k)))})});
window.__dur=async key=>{const b=await getAudio(key);if(!b)return -1;const ac=new AudioContext();try{const x=await ac.decodeAudioData(await b.arrayBuffer());return x.duration}finally{ac.close()}};`;
const liveKeysJs = () => window.__liveKeys();
const dur = (p, id) => p.evaluate(id => window.__dur(cur.id + '_' + id), id);

async function mkPage(ctx, init) {
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.on('dialog', d => { p.__dialogs = (p.__dialogs || 0) + 1; d.accept(); });
  await env.routeChart(p);
  for (const s of [HELP].concat(init || [])) await p.addInitScript(s);
  await p.goto(env.URL); await p.waitForTimeout(400);
  return { p, errors };
}
/* 端末が落ちた（タブのプロセスが死んだ）を再現：pagehide/visibilitychange は走らない */
async function crash(p) { const c = await p.context().newCDPSession(p); c.send('Page.crash').catch(() => {}); await new Promise(r => setTimeout(r, 800)); }
const setHidden = (p, hidden) => p.evaluate(h => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);

(async () => {
  const b = await env.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  let { p, errors } = await mkPage(ctx, [VIB, WAKE_OK]);
  let errors2 = [];
  const ids = await p.evaluate(() => getItems().map(i => i.id));
  const [A, B, C] = ids;
  await p.fill('#fEe', 'グエン');

  console.log('[1] 1秒ごとの一時保存');
  await p.click('#rb-' + A); await p.waitForTimeout(3500);
  const live1 = await p.evaluate(async () => { const ks = await window.__liveKeys(); if (!ks.length) return null; const r = await getLive(ks[0]); return { n: ks.length, size: r && r.blob ? r.blob.size : 0, chunks: active.chunks.length, sid: r.sid, item: r.itemId }; });
  T.ok('録音中に chunk が届いている: ' + JSON.stringify(live1), live1 && live1.chunks >= 2);
  T.ok('一時キーに録音が書かれている（停止前・0バイトでない）', live1 && live1.n === 1 && live1.size > 0 && live1.item === A);
  T.ok('振動：開始 60ms', await p.evaluate(() => window.__vib.includes('60')));
  T.ok('Wake Lock を取得', await p.evaluate(() => window.__wake.req >= 1));
  T.ok('Wake Lock が取れた端末では案内を出さない', await p.locator('#wakeNote').count() === 0);

  console.log('[2] 画面が消えたら確定保存して止める');
  await setHidden(p, true); await p.waitForTimeout(1200);
  T.ok('録音中を解除（active=null）', await p.evaluate(() => active === null));
  T.ok('MediaRecorder の録音ボタン表示も停止', await p.locator('#rb-' + A + '.recording').count() === 0 && await p.locator('#recPill').count() === 0);
  T.ok('そこまでを正式キーに保存（hasAudio）', await p.evaluate(async id => cur.items[id] && cur.items[id].hasAudio && !!(await getAudio(cur.id + '_' + id)), A));
  T.ok('一時キーは片付いた', await p.evaluate(liveKeysJs).then(k => k.length === 0));
  T.ok('Wake Lock を解放', await p.evaluate(() => window.__wake.rel >= 1));
  T.ok('振動：停止 [40,60,40]', await p.evaluate(() => window.__vib.includes('[40,60,40]')));
  await setHidden(p, false); await p.waitForTimeout(150);
  const tx = await p.locator('#toast').textContent();
  T.ok('戻ったら「画面が消えたため録音を止めました（N秒まで保存）」: ' + tx, /画面が消えたため録音を止めました（\d+秒まで保存）/.test(tx));
  T.ok('カードに「途中で停止（N秒まで保存）」が残る', /途中で停止/.test(await p.locator('#rs-' + A).textContent()));

  console.log('[3] マイクを取られた（track停止）');
  await p.click('#rb-' + B); await p.waitForTimeout(1500);
  await p.evaluate(() => active.stream.getTracks().forEach(t => t.stop()));
  await p.waitForTimeout(900);
  T.ok('録音中を解除（active=null）', await p.evaluate(() => active === null));
  T.ok('「録音中」表示が残らない: ' + await p.locator('#rs-' + B).textContent(), !/録音中/.test(await p.locator('#rs-' + B).textContent()) && await p.locator('#recPill').count() === 0);
  T.ok('そこまでは保存（hasAudio）', await p.evaluate(id => !!(cur.items[id] && cur.items[id].hasAudio), B));
  T.ok('トースト「録音が途中で止まりました（N秒まで保存）」', /録音が途中で止まりました（\d+秒まで保存）/.test(await p.locator('#toast').textContent()));
  // track停止の直後（onstop前後）に stopRec() を呼んでも永久に待たない
  await p.click('#rb-' + C); await p.waitForTimeout(1200);
  const race = await p.evaluate(() => { active.stream.getTracks().forEach(t => t.stop()); return Promise.race([stopRec().then(() => 'ok'), new Promise(r => setTimeout(() => r('hang'), 3000))]); });
  T.ok('stopRec() が解決する: ' + race, race === 'ok');
  await p.waitForTimeout(600);
  T.ok('その録音も保存', await p.evaluate(id => !!(cur.items[id] && cur.items[id].hasAudio), C));

  console.log('[5] 一時停止／再開');
  await p.evaluate(() => { window.confirm = () => true; });
  await p.click('#rb-' + A); await p.waitForTimeout(1300);
  T.ok('録音中は一時停止ボタンがある', await p.locator('#rp-' + A).count() === 1);
  await p.click('#rp-' + A); await p.waitForTimeout(200);
  T.ok('MediaRecorder が paused', await p.evaluate(() => active.mr.state === 'paused'));
  T.ok('状態が「一時停止中」', /一時停止中/.test(await p.locator('#rs-' + A).textContent()));
  const t1 = await p.locator('#rt-' + A).textContent(); await p.waitForTimeout(1500);
  const t2 = await p.locator('#rt-' + A).textContent();
  T.ok('一時停止中はタイマーが進まない: ' + t1 + '→' + t2, t1 === t2);
  await p.click('#rp-' + A); await p.waitForTimeout(1200);
  T.ok('再開で recording に戻る', await p.evaluate(() => active.mr.state === 'recording'));
  T.ok('再開後はタイマーが進む', (await p.locator('#rt-' + A).textContent()) !== t2);
  await p.click('#rb-' + A); await p.waitForTimeout(900);
  T.ok('停止で一時停止ボタンは消える', await p.locator('#rp-' + A).count() === 0);

  console.log('[6] 続きを録音');
  await p.evaluate(() => { const ub = document.getElementById('undoBar'); if (ub) ub.remove(); });
  const d0 = await dur(p, A);
  T.ok('停止後に「続きを録音」ボタン', await p.locator('#rc-' + A).isVisible());
  p.__dialogs = 0;
  await p.evaluate(() => { window.confirm = () => { window.__cf = (window.__cf || 0) + 1; return true; }; window.__cf = 0; });
  await p.click('#rc-' + A); await p.waitForTimeout(2000);
  T.ok('確認なしで録音開始（上書きの確認を出さない）', await p.evaluate(() => window.__cf === 0 && !!active));
  T.ok('録音中は「続きを録音」を隠す', !(await p.locator('#rc-' + A).isVisible()));
  await p.click('#rb-' + A); await p.waitForTimeout(2500);
  const d1 = await dur(p, A);
  const mime = await p.evaluate(id => cur.items[id].mime, A);
  T.ok(`つないだ録音＝前(${d0.toFixed(2)}s)＋続き ≒ ${d1.toFixed(2)}s`, d1 > d0 + 1.2);
  T.ok('つないだ録音は WAV で保存: ' + mime, mime === 'audio/wav');
  T.ok('「続きを追加しました」＋元に戻す', /続き/.test(await p.locator('#undoBar').textContent().catch(() => '')));
  await p.waitForTimeout(10500);
  T.ok('「元に戻す」は10秒で消えない', await p.locator('#undoBar').count() === 1);
  await p.click('#undoBar button:has-text("元に戻す")'); await p.waitForTimeout(800);
  const d2 = await dur(p, A);
  T.ok(`元に戻すで前の録音に戻る（${d2.toFixed(2)}s）`, Math.abs(d2 - d0) < 0.3);
  T.ok('ドライブ送信名の拡張子は wav', await p.evaluate(() => audioExt('audio/wav') === 'wav' && audioExt('audio/webm;codecs=opus') === 'webm' && audioExt('audio/mp4') === 'mp4'));

  console.log('[8] ○の二度押し');
  await p.evaluate(id => { cur.items[id].score = null; buildExamCards(); }, B);
  await p.click('#vp-' + B); await p.waitForTimeout(80); await p.click('#vp-' + B); await p.waitForTimeout(100);
  T.ok('80ms の二度押しでも合格のまま', await p.evaluate(id => cur.items[id].score === 'pass', B));
  await p.waitForTimeout(600); await p.click('#vp-' + B); await p.waitForTimeout(100);
  T.ok('間を空けた再押下は解除（従来どおり）', await p.evaluate(id => cur.items[id].score == null, B));
  T.ok('解除はトーストで知らせる', /合否を取り消しました/.test(await p.locator('#toast').textContent()));
  await p.click('#vf-' + B); await p.waitForTimeout(60); await p.click('#vp-' + B); await p.waitForTimeout(100);
  T.ok('別のボタンへの切替は即時（不合格→合格）', await p.evaluate(id => cur.items[id].score === 'pass', B));

  console.log('[4] 録音中に端末が落ちた → 復元（続きの録音）');
  await p.click('#rc-' + C); await p.waitForTimeout(2600);
  const sid = await p.evaluate(() => cur.id);
  const dC0 = await dur(p, C);
  await crash(p); // 停止しないまま端末が落ちた（CDP Page.crash＝pagehide も走らない）
  ({ p, errors: errors2 } = await mkPage(ctx, [VIB, WAKE_OK]));
  await p.waitForTimeout(900);
  T.ok('起動時に「中断された録音を復元」', await p.locator('#liveRec #lrRestore').count() === 1);
  T.ok('受験者名・問が出る: ' + (await p.locator('#liveRec .lrmsg').textContent()), /グエン/.test(await p.locator('#liveRec .lrmsg').textContent()));
  T.ok('同じ試問の下書きが戻っている', await p.evaluate(s => cur.id === s, sid));
  await p.click('#lrRestore'); await p.waitForTimeout(1500);
  const dC1 = await dur(p, C);
  T.ok(`続きの途中だった録音は前の録音の後ろにつながる（${dC0.toFixed(2)}s→${dC1.toFixed(2)}s）`, dC1 > dC0 + 1);
  T.ok('復元後は一時キーが消え、案内も消える', (await p.evaluate(liveKeysJs)).length === 0 && await p.locator('#liveRec').count() === 0);

  console.log('[10] 孤児音声GCは一時キーを消さない');
  const gc = await p.evaluate(async () => {
    await putAudio('live__zzz_q9_1', { sid: 'zzz', itemId: 'q9', blob: new Blob(['x'], { type: 'audio/webm' }), t0: 1, ts: 2 });
    let asked = 0; const oc = window.confirm; window.confirm = () => { asked++; return true; };
    await gcOrphanAudio(); window.confirm = oc;
    const still = !!(await getAudio('live__zzz_q9_1')); await delAudio('live__zzz_q9_1');
    return { asked, still };
  });
  T.ok('GCが一時キーを対象にしない: ' + JSON.stringify(gc), gc.still && gc.asked === 0);
  T.ok('JSエラーなし（1・2ページ目） ' + errors.concat(errors2).join('|'), !errors.length && !errors2.length);
  await ctx.close();

  console.log('[4b] まだ何も保存していない試問の最初の録音中に落ちた → 新しい試問として復元');
  const ctx2 = await b.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
  let q = await mkPage(ctx2, [WAKE_NONE]);
  await q.p.fill('#fEe', 'ブディ');
  await q.p.click('#rb-' + B); await q.p.waitForTimeout(1300);
  T.ok('Wake Lock の無い端末は「画面を消さないで」を録音中ずっと表示', await q.p.locator('#wakeNote').isVisible() && /画面を消さない/.test(await q.p.locator('#wakeNote').textContent()));
  await q.p.waitForTimeout(1300);
  const sid2 = await q.p.evaluate(() => cur.id);
  await crash(q.p); // p.close() だと pagehide で停止・保存が走り「落ちた」再現にならない（保存が間に合うかは運次第＝不安定）
  q = await mkPage(ctx2, []);
  await q.p.waitForTimeout(900);
  T.ok('新しい試問（下書きなし）でも復元の案内', await q.p.locator('#lrRestore').count() === 1);
  await q.p.click('#lrRestore'); await q.p.waitForTimeout(1000);
  T.ok('試問IDを引き継いで正式キー（session.id+"_"+itemId）へ', await q.p.evaluate(([s, id]) => cur.id === s && cur.items[id] && cur.items[id].hasAudio, [sid2, B]) && await q.p.evaluate(async ([s, id]) => { const x = await getAudio(s + '_' + id); return !!(x && x.size); }, [sid2, B]));
  T.ok('受験者名も戻る', await q.p.inputValue('#fEe') === 'ブディ');
  T.ok('下書きに保存（再読み込みでも残る）', await q.p.evaluate(([s, id]) => { const d = JSON.parse(localStorage.getItem('oral_exam_draft_v1')); return d.id === s && d.items[id].hasAudio; }, [sid2, B]));
  T.ok('JSエラーなし ' + q.errors.join('|'), !q.errors.length);
  await ctx2.close();

  console.log('[7] 横向き（740x375）');
  const ctx3 = await b.newContext({ viewport: { width: 740, height: 375 }, isMobile: true, hasTouch: true });
  q = await mkPage(ctx3, [WAKE_OK]);
  const P = q.p;
  await P.fill('#fEe', 'グエン');
  await P.evaluate(() => window.scrollTo(0, 400)); await P.waitForTimeout(200);
  const lay = await P.evaluate(() => {
    const r = s => document.querySelector(s).getBoundingClientRect();
    return { hdrPos: getComputedStyle(document.querySelector('.hdr')).position, progH: r('#examProg').height, progB: r('#examProg').bottom, tabsH: r('.tabs').height, tabsT: r('.tabs').top, band: recBand() };
  });
  T.ok('ヘッダーは固定しない: ' + lay.hdrPos, lay.hdrPos !== 'sticky' && lay.hdrPos !== 'fixed');
  T.ok('ヒーローは1行（高さ≤40px）: ' + lay.progH.toFixed(0), lay.progH <= 40);
  T.ok('タブは44px前後: ' + lay.tabsH.toFixed(0), lay.tabsH <= 48);
  T.ok('見える高さ ≥ 250px: ' + (lay.band.bot - lay.band.top).toFixed(0), lay.band.bot - lay.band.top >= 250);
  // 録音ボタンをタブの裏に置く
  const hid = await P.evaluate(id => {
    const rb = document.getElementById('rb-' + id), tb = document.querySelector('.tabs').getBoundingClientRect();
    const r = rb.getBoundingClientRect(); window.scrollBy(0, r.top - (tb.top + 6)); const r2 = rb.getBoundingClientRect();
    return { top: r2.top, tabsTop: tb.top, inBand: inBand(rb) };
  }, A);
  T.ok('タブの裏の録音ボタンは「見えていない」: ' + JSON.stringify(hid), hid.top > hid.tabsTop && !hid.inBand);
  await P.evaluate(id => toggleRec(id), A); await P.waitForTimeout(700);
  T.ok('録音開始で録音行が見える範囲へ', await P.evaluate(id => inBand(document.querySelector('#q-' + id + ' .recrow')), A));
  T.ok('ピル＝「停止」（ボタンが見えている）: ' + await P.locator('#recPill').textContent(), /停止/.test(await P.locator('#recPill').textContent()));
  await P.evaluate(() => window.scrollBy(0, -window.innerHeight)); await P.waitForTimeout(400);
  T.ok('スクロールで隠れたらピル＝「録音中の項目へ」: ' + await P.locator('#recPill').textContent(), /録音中の項目へ/.test(await P.locator('#recPill').textContent()));
  await P.click('#recPill'); await P.waitForTimeout(900);
  T.ok('ピルで録音行が見える範囲に戻る（まだ止めない）', await P.evaluate(id => !!active && inBand(document.getElementById('rb-' + id)), A));
  await P.setViewportSize({ width: 375, height: 740 }); await P.waitForTimeout(500);
  T.ok('縦へ回転しても録音行は見える範囲', await P.evaluate(id => inBand(document.querySelector('#q-' + id + ' .recrow')), A));
  await P.click('#rb-' + A); await P.waitForTimeout(800);
  T.ok('縦向きの固定表示は従来どおり（ヘッダー sticky）', await P.evaluate(() => getComputedStyle(document.querySelector('.hdr')).position === 'sticky'));
  T.ok('375px幅で横スクロールなし', await P.evaluate(() => document.documentElement.scrollWidth <= 375));
  T.ok('設定に「録音の合図」', await P.evaluate(() => !!document.getElementById('beepChk') && document.getElementById('beepLbl').textContent.length > 5));
  T.ok('JSエラーなし ' + q.errors.join('|'), !q.errors.length);
  await ctx3.close();
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
