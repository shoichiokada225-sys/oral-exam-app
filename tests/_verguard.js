/* sw.js の VER 上げ忘れ検査（sw-assets.test.js と verguard.test.js から使う）
   基準 base = origin/main（取れなければ「最後に VER 行が変わったコミット」）。
   base から「今の作業ツリー」までにアセット（index.html/styles.css/manifest/js/*.js/icon-*.png）が
   変わっているのに、sw.js の VER の値が base と同じなら NG。
   ・コミット済みの変更も見る（git diff <base> は base→作業ツリーの差分なので、HEAD までのコミット分を含む）
   ・未追跡ファイルも含める
   ・VER は「差分行があるか」ではなく「値が base と違うか」で判定（上げて戻した場合を見逃さない） */
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');

const isAsset = f => f === 'index.html' || f === 'styles.css' || f === 'manifest.webmanifest' || /^js\/.+\.js$/.test(f) || /^icon-.+\.png$/.test(f);
const verOf = src => { const m = String(src || '').match(/^\s*const VER\s*=\s*['"]([^'"]+)['"]/m); return m ? m[1] : null; };

function git(root, args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }

function findBase(root, prefer) {
  const cands = prefer ? [prefer] : ['origin/main'];
  for (const c of cands) {
    try { return { base: git(root, ['rev-parse', '--verify', '--quiet', c + '^{commit}']).trim(), label: c }; } catch (e) { /* 次へ */ }
  }
  try {
    const h = git(root, ['log', '-1', '--format=%H', '-G', 'const VER *=', '--', 'sw.js']).trim();
    if (h) return { base: h, label: '最後に VER が変わったコミット ' + h.slice(0, 7) };
  } catch (e) { /* 次へ */ }
  return null;
}

/* 戻り値: { skipped, base, label, touched[], commits[], verBase, verNow, ok } */
function checkVer(root, prefer) {
  let b;
  try { git(root, ['rev-parse', '--git-dir']); b = findBase(root, prefer); } catch (e) { return { skipped: 'git が使えない' }; }
  if (!b) return { skipped: '基準コミットが見つからない' };
  const changed = git(root, ['diff', b.base, '--name-only']).split('\n').filter(Boolean)
    .concat(git(root, ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean));
  const touched = [...new Set(changed.filter(isAsset))];
  // アセットを変えたコミット（表示用）
  const commits = [];
  const log = git(root, ['log', '--format=@@%h %s', '--name-only', b.base + '..HEAD']);
  for (const blk of log.split('@@').filter(Boolean)) {
    const [head, ...fs2] = blk.split('\n').filter(Boolean);
    if (fs2.some(isAsset)) commits.push(head);
  }
  let verBase = null;
  try { verBase = verOf(git(root, ['show', b.base + ':sw.js'])); } catch (e) { /* base に sw.js が無い */ }
  let verNow = null;
  try { verNow = verOf(fs.readFileSync(path.join(root, 'sw.js'), 'utf8')); } catch (e) { /* 無し */ }
  const ok = !touched.length || (verNow !== null && verNow !== verBase);
  return { skipped: null, base: b.base, label: b.label, touched, commits, verBase, verNow, ok };
}

module.exports = { checkVer, isAsset, verOf, findBase };
