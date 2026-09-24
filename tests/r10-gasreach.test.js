/* R3 検証NGの回帰テスト（実際の http オリジンから、本物の通信で確かめる）。実行: node tests/r10-gasreach.test.js
   file:// + page.route のモックでは「CORSなしのHTML 200 が読めてしまう」ため、本番と同じ失敗の形にならない。
   ここでは Node の http サーバを2つ立てる: アプリ配信（オリジンA）と GAS の代役（オリジンB＝別オリジン）。
   G1 公開範囲が「全員」でない（302→ログイン画面・CORSなし）／URL違い（404・CORSなし）は fetch/XHR が通信失敗になる
      → navigator.onLine=true なら「GASに届きません（URL・公開範囲を確認）」。「圏外・自動で再送」とは言わない
   G2 端末が圏外（navigator.onLine=false）の時だけ「圏外」
   G3 保存した失敗理由（詳細なし）から出す文言に空の括弧「（）」「()」を残さない（4言語）
   G4 遅くても進んでいる送信は上限時間で切らない／まったく進まない送信は打ち切る
   G5 送り終えた後に応答が切れた＝届いた可能性（maybe）→ 自動再送しない・タップで再送できる
   G6 録音の実体が無い（noaudio）ものは電波復帰の一括再送の対象外・未送信件数にも入れない
   本番GASには一切送らない（GAS の代役は 127.0.0.1） */
'use strict';
const env = require('./_env');
const http = require('http'), fs = require('fs'), path = require('path');
const c = env.counter();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
function listen(handler) {
  return new Promise(res => { const s = http.createServer(handler); s.listen(0, '127.0.0.1', () => res(s)); });
}
const rd = req => new Promise(res => { const ch = []; req.on('data', d => ch.push(d)); req.on('end', () => res(Buffer.concat(ch).toString())); });

(async () => {
  // オリジンA: アプリ本体（リポジトリの静的ファイル）
  const app = await listen((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(env.ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(env.ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('nf'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  // オリジンB: GAS の代役
  let posts = 0; const hold = [];
  const gas = await listen(async (req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p === '/login') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!DOCTYPE html><html><body>Sign in - Google Accounts</body></html>'); }
    if (p === '/private') { await rd(req); res.writeHead(302, { location: '/login' }); return res.end(); } // 「全員」でない GAS（CORS ヘッダなし）
    if (p === '/gone') { await rd(req); res.writeHead(404, { 'content-type': 'text/html' }); return res.end('<html>Not Found</html>'); } // 削除済み・URL違い（CORSなし）
    if (p === '/gone-cors') { await rd(req); res.writeHead(404, { 'content-type': 'text/html', 'access-control-allow-origin': '*' }); return res.end('nf'); }
    if (p === '/noreply') { await rd(req); posts++; hold.push(res); return; } // 受け取ったが応答が届かない
    if (p === '/slow') { // 25ms おきに 64KB ずつしか読まない（弱い上り回線の代わり。OSの送信バッファで吸収しきれない大きさで送る）
      req.pause(); const t = setInterval(() => { let n = 0, ch; while (n < 65536 && (ch = req.read(Math.min(8192, 65536 - n)))) n += ch.length; }, 25);
      req.on('end', () => { clearInterval(t); posts++; res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' }); res.end(JSON.stringify({ ok: true, id: 'S' + posts, url: 'https://drive/S' + posts })); });
      req.on('readable', () => {}); // 読み取りは上のタイマーで少しずつ
      return;
    }
    if (p === '/stall') { req.pause(); hold.push(res); return; } // 一切読まない（電波が途中で止まった）
    await rd(req); posts++;
    res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
    res.end(JSON.stringify({ ok: true, id: 'F' + posts, url: 'https://drive/F' + posts }));
  });
  const A = 'http://127.0.0.1:' + app.address().port + '/index.html';
  const G = 'http://127.0.0.1:' + gas.address().port;
  const cfg = u => JSON.stringify({ url: G + u, token: '', auto: true, autoSet: true });
  const toastTxt = p => p.evaluate(() => document.getElementById('toast').textContent);
  async function rec(p, id) { await p.click('#rb-' + id); await p.waitForTimeout(900); await p.click('#rb-' + id); await p.waitForTimeout(900); }

  const b = await env.launch();
  const ctx = await b.newContext({ serviceWorkers: 'block' });
  const { page: p, errors } = await env.newPage(ctx);
  await p.goto(A);
  c.ok('前提: http オリジンで開いている ' + (await p.evaluate(() => location.origin)), /^http:\/\/127\.0\.0\.1/.test(await p.evaluate(() => location.origin)));

  /* ---------- G1 設定ミスは「届かない」、圏外とは言わない ---------- */
  await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), cfg('/private')); await p.reload(); await p.waitForTimeout(300);
  const raw = await p.evaluate(async u => { try { await fetch(u, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: '{}' }); return 'resolved'; } catch (e) { return e.name + ':' + e.message; } }, G + '/private');
  c.ok('G1 前提: 302・CORSなしは本物のブラウザで通信失敗になる（HTMLは読めない）: ' + raw, /TypeError/.test(raw));
  c.ok('G1 前提: navigator.onLine は true', await p.evaluate(() => navigator.onLine === true));
  await p.evaluate(() => gasTest()); await p.waitForTimeout(600);
  let tt = await toastTxt(p);
  c.ok('G1 302（公開範囲が全員でない）→ URL・公開範囲を確認: ' + tt, tt.includes('GASに届きません') && tt.includes('全員') && !tt.includes('圏外') && !tt.includes('自動で再送'));
  await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), cfg('/gone')); await p.reload(); await p.waitForTimeout(300);
  await p.evaluate(() => gasTest()); await p.waitForTimeout(600); tt = await toastTxt(p);
  c.ok('G1 404・CORSなし（URL違い・削除済み）→ 同じ案内: ' + tt, tt.includes('GASに届きません') && !tt.includes('圏外'));
  // 録音ごとの送信でも同じ理由がカードに残る
  await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン');
  await rec(p, 'q1'); await p.waitForTimeout(700);
  let cl = await p.textContent('#cl-q1');
  c.ok('G1 カードの理由も「届きません」: ' + cl, cl.includes('⚠') && cl.includes('GASに届きません') && !cl.includes('圏外'));
  c.ok('G1 下書きに reach が残る', await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_draft_v1')).items.q1.driveErr === 'reach'));

  /* ---------- G2 本当に圏外 ---------- */
  await ctx.setOffline(true); await p.waitForTimeout(200);
  await p.evaluate(() => gasTest()); await p.waitForTimeout(500); tt = await toastTxt(p);
  c.ok('G2 圏外（onLine=false）の時だけ「圏外」: ' + tt, tt.includes('圏外'));
  await ctx.setOffline(false); await p.waitForTimeout(300);

  /* ---------- G3 空の括弧を残さない ---------- */
  await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), cfg('/gone-cors'));
  await p.evaluate(() => gasTest()); await p.waitForTimeout(600); tt = await toastTxt(p);
  c.ok('G3 接続テストは HTTP 404 を括弧で添える: ' + tt, tt.includes('（HTTP 404）'));
  await p.click('#cl-q1'); await p.waitForTimeout(800);
  cl = await p.textContent('#cl-q1');
  const ti = await p.getAttribute('#cl-q1', 'title') || '';
  c.ok('G3 カードに URL 確認・空の「（）」なし: ' + cl, cl.includes('ウェブアプリURLを確認してください') && !/[（(]\s*[)）]/.test(cl));
  c.ok('G3 title にも空の括弧なし: ' + ti, ti.includes('URL') && !/[（(]\s*[)）]/.test(ti));
  const langs = await p.evaluate(() => ['ja', 'en', 'vi', 'id'].map(l => { const o = lang; lang = l; const m = gasErrMsg('http'); const d = gasErrMsg('http', 'HTTP 404'); lang = o; return [l, m, d]; }));
  langs.forEach(([l, m, d]) => c.ok(`G3 ${l}: 詳細なしで空の括弧なし・{s}なし「${m}」／詳細ありは入る`, !/[（(]\s*[)）]/.test(m) && !m.includes('{s}') && d.includes('HTTP 404')));
  const miss = await p.evaluate(() => ['ja', 'en', 'vi', 'id'].flatMap(l => ['drvErrReach', 'drvErrMaybe'].filter(k => !(TX2[l] && TX2[l][k])).map(k => l + ':' + k)));
  c.ok('G3 新しい理由（reach/maybe）は4言語すべてに訳がある ' + miss.join(','), miss.length === 0);

  /* ---------- G4 遅くても進んでいれば切らない／止まったら切る ---------- */
  await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), cfg('/slow'));
  const big = 'A'.repeat(1400000); // 約1.4MB
  const slow = await p.evaluate(async big => {
    GAS_TO_BASE = 600; GAS_TO_PER_MB = 0; GAS_STALL = 4000; // 上限0.6秒でも、進んでいる間は切らない
    const t0 = Date.now();
    try { const j = await gasPost({ token: '', name: 'x', dataB64: big.repeat(6) }); return { ok: true, id: j.id, ms: Date.now() - t0 }; }
    catch (e) { return { ok: false, kind: e.kind, msg: e.message, ms: Date.now() - t0 }; }
  }, big);
  c.ok('G4 上限(0.6秒)を過ぎても進んでいる送信は届く: ' + JSON.stringify(slow), slow.ok && slow.ms > 600);
  await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), cfg('/stall'));
  const st = await p.evaluate(async big => {
    GAS_TO_BASE = 60000; GAS_TO_PER_MB = 0; GAS_STALL = 1500;
    const t0 = Date.now();
    try { await gasPost({ token: '', name: 'x', dataB64: big + big + big }); return { ok: true }; }
    catch (e) { return { ok: false, kind: e.kind, ms: Date.now() - t0 }; }
  }, big);
  c.ok('G4 まったく進まない送信は打ち切って「応答なし」: ' + JSON.stringify(st), !st.ok && st.kind === 'timeout' && st.ms < 20000);

  /* ---------- G5 送り終えた後の応答切れ＝届いた可能性 ---------- */
  await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), cfg('/noreply'));
  await p.evaluate(() => { GAS_TO_BASE = 60000; GAS_TO_PER_MB = 0; GAS_STALL = 90000; GAS_RESP_MAX = 1500; });
  const n0 = posts;
  await rec(p, 'q4');
  await p.waitForFunction(() => /ドライブに保存されている可能性/.test(document.getElementById('cl-q4').textContent), null, { timeout: 10000 }).catch(() => {});
  cl = await p.textContent('#cl-q4');
  c.ok('G5 GASに届いた後の応答切れは「保存されている可能性」: ' + cl, posts === n0 + 1 && cl.includes('ドライブに保存されている可能性'));
  c.ok('G5 下書きに maybe が残る（未送信として見える）', await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('oral_exam_draft_v1')).items.q4; return r.driveErr === 'maybe' && !!r.driveSt; }));
  // 電波復帰の一括再送では送らない（二重保存を作らない）
  await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), cfg('/ok'));
  const n1 = posts;
  const nRes = await p.evaluate(() => resendAllUnsent());
  await p.waitForTimeout(800);
  const q4Posted = posts - n1;
  c.ok('G5 一括再送は maybe を送らない（q1 の reach だけ送る）: 件数=' + nRes + ' 送信=' + q4Posted, nRes === 1 && q4Posted === 1 && (await p.textContent('#cl-q4')).includes('可能性'));
  // 利用者がドライブを確かめてタップすれば送れる
  const n2 = posts;
  await p.click('#cl-q4'); await p.waitForTimeout(800);
  c.ok('G5 タップで再送できる', posts === n2 + 1 && (await p.textContent('#cl-q4')).includes('保存済み'));

  /* ---------- G6 noaudio は一括再送・件数の対象外 ---------- */
  const g6 = await p.evaluate(() => {
    cur.items.q7 = { hasAudio: true, driveSt: 'fail', driveErr: 'noaudio' };
    const before = Object.keys(cur.items).filter(k => isUnsent(cur, k)).length;
    return { unsentShown: isUnsent(cur, 'q7'), count: unsentCount(cur), before, resent: resendAllUnsent() };
  });
  c.ok('G6 noaudio は案内として表示は残す（isUnsent）', g6.unsentShown);
  c.ok('G6 noaudio は未送信件数に入れない・一括再送しない ' + JSON.stringify(g6), g6.count === 0 && g6.resent === 0);
  await p.evaluate(() => { delete cur.items.q7; });

  c.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
  hold.forEach(r => { try { r.destroy ? r.destroy() : r.end(); } catch (e) { /* 済 */ } });
  await b.close(); app.close(); gas.close();
  c.done();
})().catch(e => { console.error(e); process.exit(1); });
