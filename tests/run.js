/* 全テストの入口（npm不要）。実行: node tests/run.js [-j N] [--all] [絞り込み語...]
   tests/*.test.js を子プロセスで実行し、各本の終了コードと「結果: N passed / M failed」行を集計する。
   判定は二重: 終了コード≠0 または M>0 または 結果行なし → NG。1本でもNGなら exit 1
   -j N  : 同時に N 本まで並列に流す（既定 min(4, CPU数)。-j 1 で従来どおり直列）。
           各本の出力はバッファに貯め、終わった順ではなくファイル名順に表示する。
   --all : 書きかけ（tests/wip/*.test.js と tests/*.wip.js）も含める。既定では含めない
           → 未完成の機能のテストが置いてあるだけで全体が赤になるのを防ぐ（「全緑なら出してよい」の判定を守る）
   環境変数 TEST_TIMEOUT_SEC: 1本あたりの上限（既定 600 秒） */
'use strict';
const path = require('path'), fs = require('fs'), os = require('os'), { spawn } = require('child_process');
const dir = __dirname;

function parseArgs(argv) {
  const o = { jobs: Math.max(1, Math.min(4, (os.cpus() || []).length || 1)), all: false, filt: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') o.all = true;
    else if (a === '-j' || a === '--jobs') o.jobs = Math.max(1, parseInt(argv[++i], 10) || 1);
    else if (/^-j\d+$/.test(a)) o.jobs = Math.max(1, parseInt(a.slice(2), 10) || 1);
    else if (/^--jobs=\d+$/.test(a)) o.jobs = Math.max(1, parseInt(a.split('=')[1], 10) || 1);
    else o.filt.push(a);
  }
  return o;
}

/* 対象ファイル一覧（dir からの相対パス・名前順）。wip は --all のときだけ */
function listTests(root, all) {
  const main = fs.readdirSync(root).filter(f => f.endsWith('.test.js')).sort();
  if (!all) return main;
  const wipDir = path.join(root, 'wip');
  const wip = fs.existsSync(wipDir)
    ? fs.readdirSync(wipDir).filter(f => f.endsWith('.test.js') || f.endsWith('.wip.js')).sort().map(f => 'wip/' + f)
    : [];
  const wipTop = fs.readdirSync(root).filter(f => f.endsWith('.wip.js')).sort();
  return main.concat(wipTop, wip);
}

function runOne(f, timeoutMs) {
  return new Promise(resolve => {
    const t0 = Date.now();
    const ch = spawn(process.execPath, [path.join(dir, f)], { cwd: path.resolve(dir, '..'), env: process.env });
    const chunks = [];
    ch.stdout.on('data', d => chunks.push(d));
    ch.stderr.on('data', d => chunks.push(d));
    let timedOut = false, err = null;
    const tm = setTimeout(() => { timedOut = true; ch.kill('SIGKILL'); }, timeoutMs);
    ch.on('error', e => { err = e; });
    ch.on('close', (code, signal) => {
      clearTimeout(tm);
      resolve({ f, out: Buffer.concat(chunks).toString('utf8'), code, signal, err, timedOut, sec: ((Date.now() - t0) / 1000).toFixed(1) });
    });
  });
}

function judge(r) {
  const out = r.out;
  const m = [...out.matchAll(/結果:\s*(\d+)\s*passed\s*\/\s*(\d+)\s*failed/g)].pop();
  const p = m ? +m[1] : 0, fl = m ? +m[2] : 0;
  const warn = [...out.matchAll(/^\s*WARN (.*)$/gm)].map(x => x[1]);
  const why = [];
  if (r.err) why.push(String(r.err.message || r.err));
  if (r.timedOut) why.push('timeout');
  if (r.code !== 0) why.push('exit=' + (r.code === null ? r.signal : r.code));
  if (!m) why.push('結果行なし');
  if (fl > 0) why.push(fl + ' failed');
  return { f: r.f, p, fl, ok: !why.length, why, warn, sec: r.sec, stub: /\[env\] CHART=STUB/.test(out) };
}

async function main() {
  const opt = parseArgs(process.argv.slice(2));
  const files = listTests(dir, opt.all).filter(f => !opt.filt.length || opt.filt.some(k => f.includes(k)));
  if (!files.length) { console.error('テストが見つかりません'); process.exit(2); }
  const timeoutMs = (parseInt(process.env.TEST_TIMEOUT_SEC, 10) || 600) * 1000;
  const T0 = Date.now();
  console.log(`[run] ${files.length} 本 / 並列 ${opt.jobs}${opt.all ? ' / wip 含む' : ''}`);

  // N 本まで同時に流し、表示はファイル名順（前の本が終わるまで後の本の出力は溜めておく）
  const results = new Array(files.length);
  const done = new Array(files.length).fill(false);
  let next = 0, shown = 0;
  const flush = () => {
    while (shown < files.length && done[shown]) {
      const r = results[shown++];
      console.log(`\n===== ${r.f} =====`);
      process.stdout.write(r.out);
    }
  };
  async function worker() {
    while (next < files.length) {
      const i = next++;
      results[i] = await runOne(files[i], timeoutMs);
      done[i] = true;
      flush();
    }
  }
  await Promise.all(Array.from({ length: Math.min(opt.jobs, files.length) }, worker));
  flush();

  const rows = results.map(judge);
  console.log('\n==================== 集計 ====================');
  let tp = 0, tf = 0;
  for (const x of rows) {
    tp += x.p; tf += x.fl;
    console.log(`${x.ok ? 'OK' : 'NG'}  ${x.f.padEnd(24)} ${String(x.p).padStart(3)} passed / ${x.fl} failed  (${x.sec}s)${x.why.length ? '  ← ' + x.why.join(', ') : ''}`);
    for (const w of x.warn) console.log(`    警告: ${w}`);
  }
  if (rows.some(x => x.stub)) console.log('注意: グラフ検査はスタブ（オフライン）— Chart.js 本体での描画は未検証');
  const ng = rows.filter(x => !x.ok).length;
  console.log(`合計: ${tp} passed / ${tf} failed ／ ファイル ${rows.length - ng}/${rows.length} OK ／ ${((Date.now() - T0) / 1000).toFixed(1)}s（並列 ${opt.jobs}）`);
  process.exit(ng ? 1 : 0);
}

if (require.main === module) main();
module.exports = { parseArgs, listTests, judge };
