/* テスト共通環境（Mac/Windows両対応・npm不要）
   - Playwright の解決: PLAYWRIGHT_PATH → ~/anpi-kakunin → ~/farm-shift-app → C:/Users/so/farm-shift-app
   - ブラウザ: PW_CHANNEL（Mac既定 'chrome'／その他は同梱Chromium。PW_CHANNEL= と空にすると同梱Chromium）
   - ページURL: __dirname 基準の file://（リポジトリの置き場所に依存しない）
   - Chart.js CDN: ローカルの写し（CHART_JS_PATH → tests/fixtures → ~/.cache/oral-exam-app）で応答。
     写しが無ければ一度だけCDNから取得してSRI一致を確かめて ~/.cache に保存。取得できなければ最小スタブ
     OFFLINE=1 でCDN取得を試さない・CHART_STUB=1 で写しがあってもスタブを強制
     （スタブ時は "[env] CHART=STUB" を出力し、run.js が「グラフ検査はスタブ（オフライン）」と表示する） */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), crypto = require('crypto');
const { pathToFileURL } = require('url');

const ROOT = path.resolve(__dirname, '..');
const URL = pathToFileURL(path.join(ROOT, 'index.html')).href;

function resolvePlaywright() {
  const home = os.homedir();
  const cands = [
    process.env.PLAYWRIGHT_PATH,
    path.join(home, 'anpi-kakunin/node_modules/playwright'),
    path.join(home, 'farm-shift-app/node_modules/playwright'),
    'C:/Users/so/farm-shift-app/node_modules/playwright',
  ].filter(Boolean);
  for (const c of cands) {
    try { return require(c); } catch (e) { if (e.code !== 'MODULE_NOT_FOUND') throw e; }
  }
  console.error('[env] Playwright が見つかりません。以下を探しました:\n  ' + cands.join('\n  ') +
    '\n  → PLAYWRIGHT_PATH=<.../node_modules/playwright> を指定してください');
  process.exit(2);
}
const { chromium } = resolvePlaywright();

const CHANNEL = process.env.PW_CHANNEL !== undefined ? (process.env.PW_CHANNEL || undefined)
  : (process.platform === 'darwin' ? 'chrome' : undefined);
const ARGS = ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];

/* 既存テストは「標準の3問（q1/q4/q5）」の端末を前提に書かれている。2026-09-25 に既定が「その場で出題（空欄3問）」へ
   変わったため、既定では各ページの読み込み前に「空欄3問への切り替え済み」印だけを立て、従来どおり標準の3問で起動させる
   （印が無いと store.js の一度きりの切り替えが走る）。空欄3問そのものを試すテストは launch({ freeDefault: true }) */
const CLASSIC_INIT = `try{if(!localStorage.getItem('oral_exam_cfg_free_migrated'))localStorage.setItem('oral_exam_cfg_free_migrated','1')}catch(e){}`;
/* 既定の保存先（drive.js applyDefaultDrive）はテストで本物のドライブへ送らないよう、全テストで「入れ済み」印を立てて止める。
   既定の保存先そのものを試すテストは launch({ driveDefault: true }) */
const NODRIVE_INIT = `try{if(!localStorage.getItem('oral_exam_gdefault_v1'))localStorage.setItem('oral_exam_gdefault_v1','1')}catch(e){}`;
function launch(extra) {
  const o = Object.assign({}, extra || {});
  const free = !!o.freeDefault; delete o.freeDefault;
  const drv = !!o.driveDefault; delete o.driveDefault;
  return chromium.launch(Object.assign({ channel: CHANNEL, args: ARGS }, o)).then(b => {
    if (free && drv) return b;
    const nc = b.newContext.bind(b), np = b.newPage.bind(b);
    b.newContext = async (opts) => { const c = await nc(opts); if (!free) await c.addInitScript(CLASSIC_INIT); if (!drv) await c.addInitScript(NODRIVE_INIT); return c; };
    b.newPage = async (opts) => { const c = await b.newContext(opts); const pg = await c.newPage(); return pg; };
    return b;
  });
}

/* ---- Chart.js（CDN）をローカルで賄う ---- */
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHART_TAG = HTML.match(/<script src="(https:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js@[^"]+)"[^>]*integrity="([^"]+)"/);
const CHART_URL = CHART_TAG ? CHART_TAG[1] : null;
const CHART_SRI = CHART_TAG ? CHART_TAG[2] : null;
const CACHE = path.join(os.homedir(), '.cache', 'oral-exam-app', 'chart.umd.min.js');

function sriOk(buf) {
  if (!CHART_SRI) return true;
  const [alg, want] = CHART_SRI.split(/-(.+)/);
  return crypto.createHash(alg).update(buf).digest('base64') === want;
}
let chartSrc; // {buf, from} | null
async function loadChart() {
  if (chartSrc !== undefined) return chartSrc;
  if (process.env.CHART_STUB) return (chartSrc = null); // スタブ経路の確認用
  const cands = [process.env.CHART_JS_PATH, path.join(__dirname, 'fixtures', 'chart.umd.min.js'), CACHE].filter(Boolean);
  for (const c of cands) {
    try { const b = fs.readFileSync(c); if (sriOk(b)) return (chartSrc = { buf: b, from: c }); } catch (e) { /* 次へ */ }
  }
  if (CHART_URL && !process.env.OFFLINE) {
    try {
      const r = await fetch(CHART_URL, { signal: AbortSignal.timeout(5000) });
      const b = Buffer.from(await r.arrayBuffer());
      if (r.ok && sriOk(b)) {
        try { fs.mkdirSync(path.dirname(CACHE), { recursive: true }); fs.writeFileSync(CACHE, b); } catch (e) { /* 保存失敗は無視 */ }
        return (chartSrc = { buf: b, from: CHART_URL });
      }
    } catch (e) { /* オフライン */ }
  }
  return (chartSrc = null);
}
/* 最小スタブ（アプリが使う Chart.defaults / new Chart / Chart.getChart / destroy のみ） */
const CHART_STUB = `(()=>{const reg=new Map();class Chart{constructor(el,c){this.canvas=el;this.config=c;reg.set(el,this)}
destroy(){reg.delete(this.canvas)}update(){}}Chart.defaults={font:{}};Chart.getChart=el=>reg.get(el);Chart.__stub=true;window.Chart=Chart})();`;

/* page に Chart.js のローカル応答を仕込む（goto の前に呼ぶ） */
async function routeChart(page) {
  if (!CHART_URL) return;
  const src = await loadChart();
  if (src) {
    await page.route(CHART_URL, r => r.fulfill({ status: 200, contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' }, body: src.buf }));
  } else {
    if (!routeChart.warned) { console.log('[env] CHART=STUB（Chart.js を取得できないためスタブで代用）'); routeChart.warned = true; }
    await page.route(CHART_URL, r => r.abort()); // SRI付きなのでスタブ本文は返せない→遮断して初期化スクリプトで代用
    await page.addInitScript(CHART_STUB);
  }
}

/* 標準のページを用意（エラー収集・Chart.js ルーティング込み） */
async function newPage(ctxOrBrowser) {
  const page = await ctxOrBrowser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await routeChart(page);
  return { page, errors };
}

/* 簡易アサーション（各テストの集計形式を「結果: N passed / M failed」に統一） */
function counter() {
  const c = { pass: 0, fail: 0 };
  c.ok = (name, cond) => { if (cond) { c.pass++; console.log('  OK ' + name); } else { c.fail++; console.log('  NG ' + name); } };
  c.done = () => { console.log(`\n結果: ${c.pass} passed / ${c.fail} failed`); process.exit(c.fail ? 1 : 0); };
  return c;
}

module.exports = { ROOT, URL, chromium, CHANNEL, ARGS, launch, routeChart, newPage, counter, CHART_URL };
