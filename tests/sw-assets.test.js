/* Service Worker のキャッシュ一覧（sw.js の ASSETS）と VER の静的検査。実行: node tests/sw-assets.test.js
   file:// では SW が動かないため、ブラウザを使わず fs と git だけで確認する。
   (1) ASSETS のローカルパスが実在する
   (2) index.html が読み込む js/・styles.css・manifest・アイコンがすべて ASSETS にある（外部CDNのscriptも）
   (2b) 逆向き：ASSETS の js/・css・外部scriptが index.html から読み込まれている（script タグを消し忘れ/付け忘れの検出）
   (3) origin/main（無ければ最後に VER が変わったコミット）以降、コミット済み・作業ツリーを問わずアセットが変わっているのに
       VER の値が基準と同じなら NG（旧版は作業ツリー vs HEAD だけ見ていて、コミットした瞬間に見逃していた） */
'use strict';
const path = require('path'), fs = require('fs');
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
// 逆向き：ASSETS にあるのに index.html が読み込んでいない js/css/外部script（キャッシュだけされて動かない）
{
  const refSet = new Set(refs.map(norm));
  for (const a of assets.filter(a => /\.(js|css)$/.test(a))) ok(`index.html が読み込む: ${a}`, refSet.has(norm(a)));
}
// manifest のアイコンも
try {
  const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  for (const ic of mf.icons || []) ok(`ASSETS に含む（manifestアイコン）: ${ic.src}`, set.has(norm(ic.src)));
} catch (e) { ok('manifest.webmanifest を読める', false); }

console.log('[3] アセット変更時の VER 更新（origin/main〔無ければ最後に VER が変わったコミット〕→作業ツリー。コミット済みも含む）');
{
  const r = require('./_verguard').checkVer(ROOT);
  if (r.skipped) console.log(`  （${r.skipped}ため VER 検査は省略）`);
  else {
    console.log(`  基準: ${r.label}（VER ${r.verBase} → 今 ${r.verNow}）・アセット変更 ${r.touched.length} 件・アセットを変えたコミット ${r.commits.length} 本`);
    ok(r.ok ? 'VER が基準から上がっている（またはアセット変更なし）'
      : `アセット変更（${r.touched.join(', ')}${r.commits.length ? ' ／ コミット: ' + r.commits.join(' ; ') : ''}）があるのに sw.js の VER が基準（${r.verBase}）のまま`, r.ok);
  }
}

console.log(`\n結果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
