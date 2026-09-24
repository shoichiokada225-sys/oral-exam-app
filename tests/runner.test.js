/* R2: テスト入口 tests/run.js の回帰テスト。実行: node tests/runner.test.js
   一時ディレクトリに run.js の写しと偽のテスト（待ち時間の違うもの・wip・失敗するもの）を置いて流し、
   ① 既定では wip（tests/wip/*.test.js・*.wip.js）を拾わず exit 0 ② --all で wip を拾い exit 1
   ③ -j 並列で速くなる ④ 出力は終わった順でなくファイル名順 ⑤ 結果行なし/失敗/タイムアウトは NG
   を確かめる。ブラウザは使わない。 */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), { spawnSync } = require('child_process');
let pass = 0, fail = 0;
const ok = (n, c) => { c ? pass++ : fail++; console.log((c ? '  OK ' : '  NG ') + n); };

const { parseArgs, listTests } = require('./run.js');
console.log('[0] 引数の解釈');
{
  const a = parseArgs([]);
  ok('既定の並列数は 1〜4', a.jobs >= 1 && a.jobs <= 4 && !a.all);
  const b = parseArgs(['-j', '3', '--all', 'smoke', 'verdict']);
  ok('-j 3 --all smoke verdict', b.jobs === 3 && b.all && b.filt.join(',') === 'smoke,verdict');
  ok('-j2 / --jobs=5 / -j 0→1', parseArgs(['-j2']).jobs === 2 && parseArgs(['--jobs=5']).jobs === 5 && parseArgs(['-j', '0']).jobs === 1);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oral-runner-' + process.pid + '-'));
const td = path.join(root, 'tests');
fs.mkdirSync(path.join(td, 'wip'), { recursive: true });
fs.copyFileSync(path.join(__dirname, 'run.js'), path.join(td, 'run.js'));
const fake = (ms, p, f, extra) => `setTimeout(()=>{ ${extra || ''} console.log('結果: ${p} passed / ${f} failed'); process.exit(${f ? 1 : 0}); }, ${ms});\n`;
// 名前順 a < b < c だが、終わるのは c → b → a の順
fs.writeFileSync(path.join(td, 'a-slow.test.js'), fake(1500, 3, 0, "console.log('A-OUT');"));
fs.writeFileSync(path.join(td, 'b-mid.test.js'), fake(900, 2, 0, "console.log('B-OUT'); console.log('  WARN 注意して');"));
fs.writeFileSync(path.join(td, 'c-fast.test.js'), fake(300, 1, 0, "console.log('C-OUT');"));
fs.writeFileSync(path.join(td, 'wip', 'w-broken.test.js'), "require('./nope');\n");
fs.writeFileSync(path.join(td, 'x.wip.js'), fake(10, 0, 1));
fs.writeFileSync(path.join(td, 'helper.js'), 'throw new Error("拾ってはいけない");\n');

const run = (args, env) => {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(td, 'run.js'), ...args], { cwd: root, encoding: 'utf8', env: Object.assign({}, process.env, env || {}), timeout: 60000 });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || ''), ms: Date.now() - t0 };
};

try {
  console.log('[1] 対象の選び方');
  ok('既定は tests/*.test.js だけ（wip・*.wip.js・helper は拾わない）',
    JSON.stringify(listTests(td, false)) === JSON.stringify(['a-slow.test.js', 'b-mid.test.js', 'c-fast.test.js']));
  ok('--all で wip も拾う', JSON.stringify(listTests(td, true)) === JSON.stringify(['a-slow.test.js', 'b-mid.test.js', 'c-fast.test.js', 'x.wip.js', 'wip/w-broken.test.js']));

  console.log('[2] 既定（wip なし）は全緑で exit 0');
  const r1 = run(['-j', '3']);
  ok('exit 0', r1.code === 0);
  ok('集計 6 passed / 0 failed ／ 3/3 OK', /合計: 6 passed \/ 0 failed ／ ファイル 3\/3 OK/.test(r1.out));
  ok('WARN 行を集計に出す', /警告: 注意して/.test(r1.out));
  const ia = r1.out.indexOf('A-OUT'), ib = r1.out.indexOf('B-OUT'), ic = r1.out.indexOf('C-OUT');
  ok('出力はファイル名順（a→b→c。終わった順 c→b→a ではない）', ia >= 0 && ia < ib && ib < ic);
  ok('見出しの直後にその本の出力', /===== a-slow\.test\.js =====\s*\nA-OUT/.test(r1.out));

  console.log('[3] 直列 -j 1 も動く・並列の方が速い');
  const r2 = run(['-j', '1']);
  ok('exit 0・直列なので 2.7s 以上', r2.code === 0 && r2.ms >= 2700);
  ok(`並列 3（${r1.ms}ms）は直列（${r2.ms}ms）より 0.8s 以上速い`, r2.ms - r1.ms >= 800);

  console.log('[4] --all で wip を含めると赤');
  const r3 = run(['--all', '-j', '4']);
  ok('exit 1', r3.code === 1);
  ok('wip/w-broken は 結果行なし で NG', /NG\s+wip\/w-broken\.test\.js.*結果行なし/.test(r3.out));
  ok('x.wip.js は 1 failed で NG', /NG\s+x\.wip\.js.*1 failed/.test(r3.out));
  ok('ファイル 3/5 OK', /ファイル 3\/5 OK/.test(r3.out));

  console.log('[5] 絞り込み・タイムアウト');
  const r4 = run(['mid']);
  ok('絞り込み語で1本だけ', r4.code === 0 && /ファイル 1\/1 OK/.test(r4.out) && !/A-OUT/.test(r4.out));
  const r5 = run(['slow'], { TEST_TIMEOUT_SEC: '1' });
  ok('上限超えは timeout で NG', r5.code === 1 && /NG\s+a-slow\.test\.js.*timeout/.test(r5.out));
  const r6 = run(['nothing-matches']);
  ok('該当なしは exit 2', r6.code === 2);
} catch (e) {
  ok('例外なし: ' + e.message, false);
} finally {
  fs.rmSync(root, { recursive: true, force: true }); // このテストが作った一時ディレクトリだけを消す
}

console.log(`\n結果: ${pass} passed / ${fail} failed`);
process.exit(fail ? 1 : 0);
