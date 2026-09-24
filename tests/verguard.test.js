/* R2: sw.js の VER 上げ忘れ検査（tests/_verguard.js）の回帰テスト。実行: node tests/verguard.test.js
   一時ディレクトリに使い捨ての git リポジトリを作り、
   「アセットを変えてコミットしたのに VER を上げていない」を、作業ツリーが綺麗な状態でも NG にできることを確かめる
   （旧版は git diff HEAD しか見ていなかったので、コミットした瞬間に見逃していた）。 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { execFileSync } = require('child_process');
const { checkVer, verOf } = require('./_verguard');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  OK ' : '  NG ') + n); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oral-verguard-' + process.pid + '-'));
const g = (...a) => execFileSync('git', a, { cwd: tmp, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const w = (f, s) => { fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true }); fs.writeFileSync(path.join(tmp, f), s); };
const commit = m => { g('add', '.'); g('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', m); };
const sw = v => `const VER = '${v}';\nconst ASSETS = ['./'];\n`;

try {
  g('init', '-q');
  w('sw.js', sw('v1')); w('js/a.js', 'var a=1;\n'); w('index.html', '<p>x</p>\n'); w('README.md', 'r\n');
  commit('init');

  console.log('[0] VER の読み取り');
  ok("verOf で VER 値を読める", verOf(sw('oral-exam-v9')) === 'oral-exam-v9' && verOf('var x') === null);

  console.log('[1] 基準=最後に VER が変わったコミット（origin/main なし）');
  let r = checkVer(tmp);
  ok('アセット変更なし → OK', r.ok && r.touched.length === 0 && /最後に VER/.test(r.label));
  w('README.md', 'r2\n'); commit('docs only');
  r = checkVer(tmp);
  ok('アセット以外の変更だけ → OK', r.ok);
  w('js/a.js', 'var a=2;\n'); commit('feat: asset change without VER');
  ok('作業ツリーは綺麗（旧検査 git diff HEAD では何も見えない）', g('diff', 'HEAD', '--name-only').trim() === '');
  r = checkVer(tmp);
  ok('コミット済みのアセット変更で VER 据え置き → NG', !r.ok && r.touched.includes('js/a.js'));
  ok('NG の説明にそのコミットが挙がる', r.commits.some(c => /asset change without VER/.test(c)));

  console.log('[2] VER を上げると OK・その後のアセット変更は再び NG');
  w('sw.js', sw('v2')); commit('chore: bump VER');
  r = checkVer(tmp);
  ok('VER を上げたコミットが最新 → OK', r.ok);
  w('styles.css', 'p{}\n'); commit('style: new css');
  r = checkVer(tmp);
  ok('VER を上げた後にアセットを足したコミット → NG', !r.ok && r.touched.includes('styles.css'));
  w('sw.js', sw('v3')); commit('chore: bump VER');

  console.log('[3] 基準=origin/main（push 済みの版）');
  g('update-ref', 'refs/remotes/origin/main', 'HEAD');
  r = checkVer(tmp);
  ok('origin/main と同じ → OK・基準は origin/main', r.ok && r.label === 'origin/main');
  w('index.html', '<p>y</p>\n'); commit('feat: 1');
  w('sw.js', sw('v4')); commit('chore: bump');
  w('js/a.js', 'var a=3;\n'); commit('feat: 2 (VER は上げない)');
  r = checkVer(tmp);
  ok('未 push の範囲で1回でも VER が上がっていれば OK（1 push につき1回で良い）', r.ok && r.commits.length === 2);
  w('sw.js', sw('v3')); commit('revert VER');
  r = checkVer(tmp);
  ok('VER を上げて戻した（値が origin/main と同じ）→ NG', !r.ok && r.verBase === 'v3' && r.verNow === 'v3');
  w('sw.js', sw('v5')); commit('bump');

  console.log('[4] 作業ツリー（未コミット・未追跡）も見る');
  g('update-ref', 'refs/remotes/origin/main', 'HEAD');
  w('js/a.js', 'var a=4;\n');
  r = checkVer(tmp);
  ok('未コミットのアセット変更で VER 据え置き → NG', !r.ok && r.touched.includes('js/a.js'));
  g('checkout', '-q', '--', 'js/a.js');
  w('js/new.js', 'var n=1;\n');
  r = checkVer(tmp);
  ok('未追跡の js を足して VER 据え置き → NG', !r.ok && r.touched.includes('js/new.js'));
  w('sw.js', sw('v6'));
  r = checkVer(tmp);
  ok('作業ツリーで VER を上げれば OK', r.ok);

  console.log('[5] git でない場所');
  const nog = fs.mkdtempSync(path.join(os.tmpdir(), 'oral-verguard-nogit-'));
  r = checkVer(nog);
  ok('git が無い／リポジトリでない → 省略（落ちない）', !!r.skipped);
  fs.rmSync(nog, { recursive: true, force: true });
} catch (e) {
  ok('例外なし: ' + (e.stderr || e.message), false);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true }); // このテストが作った一時リポジトリだけを消す
}

console.log(`\n結果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
