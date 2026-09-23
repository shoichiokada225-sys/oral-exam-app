/* Service Worker のキャッシュ一覧（sw.js の ASSETS）と VER の静的検査。実行: node tests/sw-assets.test.js
   file:// では SW が動かないため、ブラウザを使わず fs と git だけで確認する。
   (1) ASSETS のローカルパスが実在する
   (2) index.html が読み込む js/・styles.css・manifest・アイコンがすべて ASSETS にある（外部CDNのscriptも）
   (3) 作業ツリーでアセットが変わっているのに VER 行が変わっていなければ警告（WARN 行→run.js が集計に表示） */
'use strict';
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  OK ' : '  NG ') + n); };

const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const mArr = sw.match(/const ASSETS\s*=\s*\[([\s\S]*?)\];/);
ok('sw.js に ASSETS 配列がある', !!mArr);
const assets = mArr ? [...mArr[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
const norm = p => p.replace(/^\.\//, '');
const local = assets.filter(a => !/^https?:/.test(a));
const set = new Set(assets.map(norm));

console.log('[1] ASSETS の実在');
for (const a of local) {
  const f = norm(a) || 'index.html';
  ok(`実在: ${a}`, fs.existsSync(path.join(ROOT, f)));
}
ok('ASSETS に重複なし', new Set(assets).size === assets.length);

console.log('[2] index.html が参照するアセットが ASSETS にある');
const refs = [
  ...[...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(x => x[1]),
  ...[...html.matchAll(/<link[^>]*rel="(?:stylesheet|manifest|apple-touch-icon|icon)"[^>]*href="([^"]+)"/g)].map(x => x[1]),
].filter(u => !/fonts\.googleapis\.com/.test(u)); // Webフォントはfetch時にキャッシュ（ASSETSに入れない方針）
ok('参照を検出できている（script 9本以上）', refs.filter(r => /^js\//.test(r)).length >= 9);
for (const r of refs) ok(`ASSETS に含む: ${r}`, set.has(norm(r)));
// manifest のアイコンも
try {
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const ic of mf.icons || []) ok(`ASSETS に含む（manifestアイコン）: ${ic.src}`, set.has(norm(ic.src)));
} catch (e) { ok('manifest.webmanifest を読める', false); }

console.log('[3] アセット変更時の VER 更新（git 作業ツリー vs HEAD）');
let changed = null;
try {
  changed = execFileSync('git', ['diff', 'HEAD', '--name-only'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  changed = changed.concat(execFileSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean));
} catch (e) { console.log('  （git が使えないため VER 検査は省略）'); }
if (changed) {
  const isAsset = f => f === 'index.html' || f === 'styles.css' || f === 'manifest.webmanifest' || /^js\/.+\.js$/.test(f) || /^icon-.+\.png$/.test(f);
  const touched = changed.filter(isAsset);
  let verChanged = false;
  try {
    const d = execFileSync('git', ['diff', 'HEAD', '-U0', '--', 'sw.js'], { cwd: ROOT, encoding: 'utf8' });
    verChanged = /^\+\s*const VER\s*=/m.test(d);
  } catch (e) { /* 無視 */ }
  if (touched.length && !verChanged) console.log(`  WARN アセット変更（${touched.join(', ')}）があるのに sw.js の VER が上がっていない`);
  else console.log(`  （アセット変更 ${touched.length} 件・VER 変更 ${verChanged ? 'あり' : 'なし'}）`);
}

console.log(`\n結果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
