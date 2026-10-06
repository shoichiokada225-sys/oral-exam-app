/* 監査 G-sw: Service Worker の入り方・更新・弱い電波（M-21 / M-23 / L-10）。実行: node tests/audit-G-sw.test.js
   file:// では SW が動かないため、リポジトリの写しを一時フォルダに置き、localhost の小さな HTTP サーバーで出す。
   外への通信は --host-resolver-rules で全部止める（CDN・Webフォント・script.google.com に届かない＝本物の GAS へは送らない）。
   [1] M-21: CDN に届かなくても SW が入り、サーバーが落ちても（圏外相当）アプリが開ける。初回インストールでは再読み込みしない
   [2] L-10: 電波が弱く HTML の応答が 8 秒かかっても、キャッシュがあれば 5 秒以内に開ける。遅れて届いた HTML でキャッシュは更新される
   [3] M-23: 新しい版を置いて1回開き直すだけで、新しい JS で動く（2回目を待たない）
   [4] M-23: 録音中に新しい版が入ってもページは勝手に再読み込みされず、短い案内だけ出る。録音が終わって画面に戻ったら新しい版になる */
'use strict';
const env = require('./_env');
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const T = env.counter();

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let root = null, slowMs = 0, down = false, slowHtml = null;
const srv = http.createServer((q, s) => {
  if (down) { q.socket.destroy(); return; }
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { s.writeHead(403); s.end(); return; }
  fs.readFile(f, (e, d) => {
    if (e) { s.writeHead(404); s.end('nf'); return; }
    const isHtml = path.extname(f) === '.html';
    const send = () => {
      if (down) { q.socket.destroy(); return; }
      s.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      s.end(isHtml && slowHtml ? slowHtml : d);
    };
    if (slowMs && isHtml) setTimeout(send, slowMs); else send();
  });
});

function makeCopy() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'oral-sw-'));
  for (const f of fs.readdirSync(env.ROOT)) {
    if (/^(index\.html|sw\.js|styles\.css|manifest\.webmanifest|icon-.*\.png)$/.test(f)) fs.copyFileSync(path.join(env.ROOT, f), path.join(d, f));
  }
  fs.mkdirSync(path.join(d, 'js'));
  for (const f of fs.readdirSync(path.join(env.ROOT, 'js'))) if (f.endsWith('.js')) fs.copyFileSync(path.join(env.ROOT, 'js', f), path.join(d, 'js', f));
  return d;
}
/* [2]〜[4] は M-21（CDN でインストール失敗）と切り分けるため、写しの sw.js から CDN の行を外す */
function stripCdn(d) {
  const sw = path.join(d, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/^\s*'https:\/\/[^']*',?\s*\n/gm, '').replace(/,(\s*)\]/g, '$1]'));
  return d;
}
/* 新しい版を置く（app.js に印・sw.js の VER を変える） */
function deploy(d, tag) {
  fs.appendFileSync(path.join(d, 'js', 'app.js'), `\nwindow.__V=${JSON.stringify(tag)};\n`);
  const sw = path.join(d, 'sw.js');
  fs.writeFileSync(sw, fs.readFileSync(sw, 'utf8').replace(/const VER = '([^']+)'/, `const VER = '$1-${tag}'`));
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
/* 再読み込みで実行文脈が壊れても待ち続ける */
async function waitEval(page, fn, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await page.evaluate(fn)) return true; } catch (e) { /* 読み込み中 */ }
    await sleep(250);
  }
  return false;
}
const swReady = (page, ms) => page.evaluate(ms => Promise.race([
  navigator.serviceWorker.ready.then(() => true), new Promise(r => setTimeout(() => r(false), ms))]), ms).catch(() => false);
const loads = page => page.evaluate(() => +sessionStorage.getItem('__loads') || 0).catch(() => -1);

(async () => {
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const BASE = `http://localhost:${srv.address().port}/`;
  const rules = 'MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1';
  const b = await env.launch({ args: env.ARGS.concat(['--host-resolver-rules=' + rules]) });
  const newCtx = async () => {
    const c = await b.newContext();
    await c.addInitScript(() => { try { sessionStorage.setItem('__loads', String((+sessionStorage.getItem('__loads') || 0) + 1)); } catch (e) { /* 無視 */ } });
    const page = await c.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    return { c, page, errors };
  };
  const copies = [];
  try {
    console.log('[1] M-21: CDN に届かなくても SW が入り、圏外でも開ける');
    {
      root = copies[copies.push(makeCopy()) - 1]; down = false; slowMs = 0; slowHtml = null;
      const { c, page } = await newCtx();
      await page.goto(BASE, { waitUntil: 'load' });
      const ready = await swReady(page, 15000);
      T.ok('CDN 遮断でも SW のインストールが終わる（ready）', ready);
      await sleep(1500);
      T.ok('初回インストールでは勝手に再読み込みしない（読み込み1回）', (await loads(page)) === 1);
      const cached = await page.evaluate(async () => !!(await caches.match('./js/app.js')) && !!(await caches.match('./index.html'))).catch(() => false);
      T.ok('同じ場所のファイルはキャッシュ済み（app.js / index.html）', cached);
      await page.reload({ waitUntil: 'load' });
      T.ok('2回目は SW の制御下', await page.evaluate(() => !!navigator.serviceWorker.controller));
      down = true;
      const r = await page.reload({ waitUntil: 'load', timeout: 15000 }).then(() => 'ok').catch(e => 'ERR ' + e.message.split('\n')[0]);
      T.ok(`サーバーに届かなくてもアプリが開ける（${r}）`, r === 'ok' && await page.evaluate(() => !!document.querySelector('.tabs') && typeof toggleRec === 'function').catch(() => false));
      down = false;
      await c.close();
    }

    console.log('[2] L-10: 電波が弱くてもキャッシュがあれば待たずに開ける');
    {
      root = copies[copies.push(stripCdn(makeCopy())) - 1]; down = false; slowMs = 0; slowHtml = null;
      const { c, page } = await newCtx();
      await page.goto(BASE, { waitUntil: 'load' });
      T.ok('SW が入る', await swReady(page, 15000));
      await page.reload({ waitUntil: 'load' });
      slowMs = 8000;
      slowHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8').replace('</body>', '<!--SLOWNEW--></body>');
      const t0 = Date.now();
      await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const ms = Date.now() - t0;
      T.ok(`HTML の応答が 8 秒かかっても 5 秒以内に開ける（${ms}ms）`, ms < 5000);
      T.ok('開いたのはアプリの画面（キャッシュの index.html）', await page.evaluate(() => !!document.querySelector('.tabs')).catch(() => false));
      await sleep(7000);
      const upd = await page.evaluate(async () => { const r = await caches.match(location.href); return !!r && (await r.text()).includes('SLOWNEW'); }).catch(() => false);
      T.ok('遅れて届いた HTML でキャッシュが更新される（裏で取得を続ける）', upd);
      slowMs = 0; slowHtml = null;
      await c.close();
    }

    console.log('[3] M-23: 新しい版を置いて1回開き直せば新しい JS で動く');
    {
      root = copies[copies.push(stripCdn(makeCopy())) - 1]; down = false; slowMs = 0; slowHtml = null;
      const { c, page } = await newCtx();
      await page.goto(BASE, { waitUntil: 'load' });
      T.ok('SW が入る', await swReady(page, 15000));
      await page.reload({ waitUntil: 'load' });
      T.ok('旧版で動いている', await page.evaluate(() => !!navigator.serviceWorker.controller && !window.__V));
      deploy(root, 'upd1');
      await page.reload({ waitUntil: 'load' });
      const got = await waitEval(page, () => window.__V === 'upd1', 15000);
      T.ok('1回の開き直しで新しい JS（自動で1回だけ読み直す）', got);
      await sleep(1500);
      const n = await loads(page);
      T.ok(`読み直しは1回だけ（読み込み ${n} 回＝初回+制御確認+手動+自動の4回）`, n === 4);
      await c.close();
    }

    console.log('[4] M-23: 録音中は勝手に再読み込みしない');
    {
      root = copies[copies.push(stripCdn(makeCopy())) - 1]; down = false; slowMs = 0; slowHtml = null;
      const { c, page, errors } = await newCtx();
      await page.goto(BASE, { waitUntil: 'load' });
      T.ok('SW が入る', await swReady(page, 15000));
      await page.reload({ waitUntil: 'load' });
      await page.evaluate(() => { window.__mark = 'keep'; });
      const before = await loads(page);
      await page.click('#rb-q1');
      await sleep(1200);
      T.ok('録音中', await page.evaluate(() => !!active));
      deploy(root, 'upd2');
      await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r && r.update())).catch(() => {});
      const toastOk = await waitEval(page, () => { const el = document.getElementById('toast'); return el.classList.contains('show') && el.textContent === t('tUpdate'); }, 15000);
      T.ok('新しい版が入ったら短い案内（トースト）を出す', toastOk);
      await sleep(1500);
      const still = await page.evaluate(() => window.__mark === 'keep' && !!active).catch(() => false);
      T.ok('録音中のページは再読み込みされず、録音が続いている', still && (await loads(page)) === before);
      T.ok('まだ旧版の JS のまま（勝手に差し替わらない）', await page.evaluate(() => !window.__V).catch(() => false));
      await page.click('#rb-q1');
      await waitEval(page, () => !active && (typeof pendingTakes !== 'function' || !pendingTakes().length), 8000);
      await sleep(1500);
      T.ok('録音を止めた後もページは同じまま（停止だけでは読み直さない）', await page.evaluate(() => window.__mark === 'keep').catch(() => false));
      // 画面に戻った（visibilitychange）ときに安全なら新しい版へ
      await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))).catch(() => {});
      const got = await waitEval(page, () => window.__V === 'upd2', 10000);
      T.ok('録音が終わって画面に戻ったら新しい版になる', got);
      T.ok(`ページエラーなし${errors.length ? ' ' + errors.join(' | ') : ''}`, errors.length === 0);
      await c.close();
    }
  } catch (e) {
    T.ok('例外なし: ' + (e && e.stack || e), false);
  } finally {
    await b.close().catch(() => {});
    srv.close();
    for (const d of copies) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* 一時フォルダ */ } }
  }
  T.done();
})();
