/* 全テストの入口（npm不要）。実行: node tests/run.js [絞り込み語...]
   tests/*.test.js を1本ずつ子プロセスで順に実行し、各本の終了コードと「結果: N passed / M failed」行を集計する。
   判定は二重: 終了コード≠0 または M>0 または 結果行なし → NG。1本でもNGなら exit 1 */
'use strict';
const path = require('path'), fs = require('fs'), { spawnSync } = require('child_process');
const dir = __dirname, filt = process.argv.slice(2);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.js')).sort()
  .filter(f => !filt.length || filt.some(k => f.includes(k)));
if (!files.length) { console.error('テストが見つかりません'); process.exit(2); }

const rows = []; let stub = false;
for (const f of files) {
  console.log(`\n===== ${f} =====`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [path.join(dir, f)], { cwd: path.resolve(dir, '..'), encoding: 'utf8', env: process.env, maxBuffer: 64 << 20, timeout: 10 * 60 * 1000 });
  const out = (r.stdout || '') + (r.stderr || '');
  process.stdout.write(out);
  const m = [...out.matchAll(/結果:\s*(\d+)\s*passed\s*\/\s*(\d+)\s*failed/g)].pop();
  const p = m ? +m[1] : 0, fl = m ? +m[2] : 0;
  const warn = [...out.matchAll(/^\s*WARN (.*)$/gm)].map(x => x[1]);
  if (/\[env\] CHART=STUB/.test(out)) stub = true;
  const why = [];
  if (r.error) why.push(String(r.error.message || r.error));
  if (r.status !== 0) why.push('exit=' + (r.status === null ? r.signal : r.status));
  if (!m) why.push('結果行なし');
  if (fl > 0) why.push(fl + ' failed');
  rows.push({ f, p, fl, ok: !why.length, why, warn, sec: ((Date.now() - t0) / 1000).toFixed(1) });
}

console.log('\n==================== 集計 ====================');
let tp = 0, tf = 0;
for (const x of rows) {
  tp += x.p; tf += x.fl;
  console.log(`${x.ok ? 'OK' : 'NG'}  ${x.f.padEnd(24)} ${String(x.p).padStart(3)} passed / ${x.fl} failed  (${x.sec}s)${x.why.length ? '  ← ' + x.why.join(', ') : ''}`);
  for (const w of x.warn) console.log(`    警告: ${w}`);
}
if (stub) console.log('注意: グラフ検査はスタブ（オフライン）— Chart.js 本体での描画は未検証');
const ng = rows.filter(x => !x.ok).length;
console.log(`合計: ${tp} passed / ${tf} failed ／ ファイル ${rows.length - ng}/${rows.length} OK`);
process.exit(ng ? 1 : 0);
