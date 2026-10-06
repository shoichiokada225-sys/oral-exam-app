/* 口頭試問 評価システム — Service Worker
 * 方針:
 *  - ページ(navigate)はネットワーク優先＋キャッシュフォールバック（更新が止まらない／圏外でも開ける）。
 *    電波が弱く応答が NAV_WAIT ミリ秒を越えたら、キャッシュがあればそれを返し、裏で取得してキャッシュを更新する（L-10）
 *  - 静的アセットとChart.js CDNはキャッシュ優先
 *  - インストールで必ず揃えるのは同じ場所のファイル（ASSETS）だけ。CDN（OPT_ASSETS）は取れたらキャッシュし、
 *    取れなくても SW は入る（CDN に届かない端末で SW が入らず、オフライン起動も更新も止まっていた・M-21）
 *  - インストール時は HTTP キャッシュを通さず取り直す（古い JS を新しい版のキャッシュに入れない・M-23）
 *  - GAS(script.google.com)やAPI等の外部リクエストには一切関与しない
 */
const VER = 'oral-exam-v42';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './js/util.js',
  './js/i18n.js',
  './js/works-qa.js',
  './js/qbank.js',
  './js/data.js',
  './js/store.js',
  './js/media.js',
  './js/drive.js',
  './js/verdict.js',
  './js/ui-core.js',
  './js/ui-exam.js',
  './js/ui-score.js',
  './js/ui-hist.js',
  './js/ui-chart.js',
  './js/ui-cfg.js',
  './js/ui-ops.js',
  './js/app.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];
/* 取れたらキャッシュする（失敗してもインストールは止めない） */
const OPT_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
];
const NAV_WAIT = 3000; // ページ取得をこれ以上待ったらキャッシュを返す（ms）
const OPT_WAIT = 10000; // CDN の取得をこれ以上待たない（ms）

function optFetch(c, u) {
  const ac = typeof AbortController === 'function' ? new AbortController() : null;
  const tm = setTimeout(() => ac && ac.abort(), OPT_WAIT);
  return fetch(new Request(u, { mode: 'cors', cache: 'reload' }), ac ? { signal: ac.signal } : undefined)
    .then(res => { if (res.ok) return c.put(u, res); })
    .catch(() => {})
    .then(() => clearTimeout(tm));
}

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c =>
    c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))
      .then(() => Promise.all(OPT_ASSETS.map(u => optFetch(c, u))))
  ).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const isCdn = url.href.startsWith('https://cdn.jsdelivr.net/')
    || url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'; // Webフォントもオフライン用にキャッシュ
  if (url.origin !== location.origin && !isCdn) return; // GAS/外部APIは素通し

  if (req.mode === 'navigate') {
    // ネットワーク優先（成功したらキャッシュ更新）→ 圏外はキャッシュ。
    // 応答が NAV_WAIT を越えたらキャッシュを返す（取得は続けてキャッシュを更新・L-10）。キャッシュが無ければ取得を待つ
    const fromCache = () => caches.match(req).then(r => r || caches.match('./index.html'));
    let saved = Promise.resolve();
    const net = fetch(req).then(res => {
      // エラー応答(404/500等)はキャッシュに入れない（壊れたページが圏外時に固定されるのを防ぐ）
      if (res.ok) {
        const cp = res.clone();
        saved = caches.open(VER).then(c => c.put(req, cp)).catch(() => {});
      }
      return res;
    });
    e.waitUntil(net.then(() => saved, () => {}));
    e.respondWith(new Promise(resolve => {
      let done = false;
      const fin = r => { if (!done && r) { done = true; resolve(r); } };
      const tm = setTimeout(() => fromCache().then(r => { if (r) fin(r); }), NAV_WAIT);
      net.then(res => { clearTimeout(tm); fin(res); })
        .catch(() => { clearTimeout(tm); fromCache().then(r => { if (done) return; done = true; resolve(r || Response.error()); }); });
    }));
    return;
  }

  // 静的アセット: キャッシュ優先（なければ取得してキャッシュ）
  e.respondWith(
    caches.match(req).then(r => r || fetch(req).then(res => {
      // CDNのno-cors取得はopaque(ok=false)になるため許可し、通常のエラー応答は弾く
      if (res.ok || res.type === 'opaque') {
        const cp = res.clone();
        caches.open(VER).then(c => c.put(req, cp));
      }
      return res;
    }))
  );
});
