/* 口頭試問 評価システム — Service Worker
 * 方針:
 *  - ページ(navigate)はネットワーク優先＋キャッシュフォールバック（更新が止まらない／圏外でも開ける）
 *  - 静的アセットとChart.js CDNはキャッシュ優先
 *  - GAS(script.google.com)やAPI等の外部リクエストには一切関与しない
 */
const VER = 'oral-exam-v33';
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
  './icon-512.png',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
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
    // ネットワーク優先（成功したらキャッシュ更新）→ 圏外はキャッシュ
    e.respondWith(
      fetch(req).then(res => {
        // エラー応答(404/500等)はキャッシュに入れない（壊れたページが圏外時に固定されるのを防ぐ）
        if (res.ok) {
          const cp = res.clone();
          caches.open(VER).then(c => c.put(req, cp));
        }
        return res;
      }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    );
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
