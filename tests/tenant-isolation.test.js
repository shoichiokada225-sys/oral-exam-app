/* マルチテナント分離テスト（第2弾 2026-10-07）。実行: node tests/tenant-isolation.test.js
   [1] 農場別ビルド: A の配布物に B の保存先・合言葉が無い／B の配布物に A のが無い／どちらにもヒラノの保存先・合言葉・固有名が無い
   [2] ヒラノ用ビルド拒否: ヒラノの合言葉・保存先を指定すると作らない
   [3] 実ブラウザ: 既定=ヒラノの保存先（今の動作のまま）／A=A の保存先だけ／B=B の保存先だけ（他テナントの値が画面の設定に出ない）
   [4] GAS: 農場ごとに別の合言葉（スクリプトプロパティ）。A の合言葉で B には書けない。40回間違えた後でも正しい合言葉は通る（全体ロックなし）・短いプロパティ合言葉は全拒否
   本物の GAS・ドライブには送らない（script.google.com は全部ブロック／代役） */
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), vm = require('vm');
const { pathToFileURL } = require('url');
const env = require('./_env');
const T = env.counter();
const HIRANO = ['AKfycbxupXbLNCzUGtwr2D2sWQfozP0u4bFitbqyiIk_efuUdpPzE-EaVdCI4nJCOYIbUzBuLA', 'OOIRI', '睦沢', 'ヒラノ', '棚倉'];

(async () => {
  const { build } = await import(pathToFileURL(path.join(env.ROOT, 'tools', 'build-tenant.mjs')).href);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oral-tenant-'));
  process.env.TENANT_GAS_TOKEN = 'tokenAAA-1234567890';
  const A = build('demo-farm', path.join(tmp, 'A')).out;
  process.env.TENANT_GAS_TOKEN = 'tokenBBB-0987654321';
  const B = build('demo-farm-b', path.join(tmp, 'B')).out;
  const readAll = d => { let s = ''; (function w(x) { for (const n of fs.readdirSync(x)) { const p = path.join(x, n); if (fs.statSync(p).isDirectory()) w(p); else if (/\.(js|html|webmanifest|json)$/.test(n)) s += fs.readFileSync(p, 'utf8'); } })(d); return s; };
  const sa = readAll(A), sb = readAll(B);

  console.log('[1] 配布物の分離');
  T.ok('A に A の保存先と合言葉', sa.includes('DEMOFARMdemofarm') && sa.includes('tokenAAA-1234567890'));
  T.ok('A に B の保存先・合言葉が無い', !sa.includes('DEMOBdemoB') && !sa.includes('tokenBBB-0987654321'));
  T.ok('B に B の保存先と合言葉', sb.includes('DEMOBdemoB') && sb.includes('tokenBBB-0987654321'));
  T.ok('B に A の保存先・合言葉が無い', !sb.includes('DEMOFARMdemofarm') && !sb.includes('tokenAAA-1234567890'));
  T.ok('A/B にヒラノの値・固有名が無い ' + HIRANO.filter(k => sa.includes(k) || sb.includes(k)).join(','), HIRANO.every(k => !sa.includes(k) && !sb.includes(k)));
  T.ok('合言葉は tenants/*.json に書かれていない', !fs.readFileSync(path.join(env.ROOT, 'tenants', 'demo-farm.json'), 'utf8').includes('tokenAAA'));
  T.ok('SW のキャッシュ名が農場別', /oral-exam-v\d+-demo-farm'/.test(fs.readFileSync(path.join(A, 'sw.js'), 'utf8')) && /-demo-farm-b'/.test(fs.readFileSync(path.join(B, 'sw.js'), 'utf8')));
  T.ok('配布物（公開用）に tests/tools/tenants/*.md/gas が入らない（農場用 Code.gs は別フォルダ <out>.setup/）', ['tests', 'tools', 'tenants', 'README.md'].every(n => !fs.existsSync(path.join(A, n))) && !fs.existsSync(path.join(A, 'gas')) && fs.readdirSync(A + '.setup').sort().join() === '.tenant-build,Code.gs,README.txt');

  const gasT = fs.readFileSync(path.join(A + '.setup', 'Code.gs'), 'utf8');
  T.ok('農場用 GAS: 既定の合言葉は空・TENANT_MODE=true・OOIRI/ヒラノの文字なし', /var TOKEN = '';/.test(gasT) && /var TENANT_MODE = true;/.test(gasT) && !/OOIRI|ヒラノ/.test(gasT));

  console.log('[2] ヒラノの値は他農場に使えない');
  const tdir = path.join(env.ROOT, 'tenants'), tmpT = path.join(tdir, 'zz-bad.json');
  try {
    fs.writeFileSync(tmpT, JSON.stringify({ id: 'zz-bad', brand: { title: 'x' }, gas: { url: 'https://script.google.com/macros/s/' + HIRANO[0] + '/exec', folder: 'x' } }));
    const real = process.exit; let code = null;
    process.exit = c => { code = c; throw new Error('exit'); };
    const err = console.error; console.error = () => {};
    try { build('zz-bad', path.join(tmp, 'X')); } catch (e) { /* exit */ }
    process.env.TENANT_GAS_TOKEN = 'OOIRI';
    let code2 = null;
    fs.writeFileSync(tmpT, JSON.stringify({ id: 'zz-bad', brand: { title: 'x' }, gas: { url: 'https://script.google.com/macros/s/AKfycbZZZ/exec' } }));
    process.exit = c => { code2 = c; throw new Error('exit'); };
    try { build('zz-bad', path.join(tmp, 'X2')); } catch (e) { /* exit */ }
    process.exit = real; console.error = err;
    T.ok('ヒラノの保存先を指定すると作らない', code === 2 && !fs.existsSync(path.join(tmp, 'X')));
    T.ok('ヒラノの合言葉を指定すると作らない', code2 === 2 && !fs.existsSync(path.join(tmp, 'X2')));
  } finally { fs.rmSync(tmpT, { force: true }); }

  console.log('[2b] 出力先の安全（既存フォルダを消さない）');
  {
    const { spawnSync } = require('child_process');
    const cli = (args, extraEnv, cwd) => spawnSync('node', [path.join(env.ROOT, 'tools', 'build-tenant.mjs'), 'demo-farm', ...args], { cwd: cwd || env.ROOT, env: Object.assign({}, process.env, { TENANT_GAS_TOKEN: 'tokenCLI-1234567890' }, extraEnv || {}), encoding: 'utf8' });
    const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'oral-safe-'));
    const mk = (name, files) => { const d = path.join(fake, name); fs.mkdirSync(d, { recursive: true }); for (const [f, c] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); fs.writeFileSync(path.join(d, f), c); } return d; };
    const victim = mk('victim', { 'important.txt': 'precious' });
    const r1 = cli(['--out', victim]);
    T.ok('印の無い既存フォルダは拒否し、中身を消さない（exit 2）', r1.status === 2 && fs.readFileSync(path.join(victim, 'important.txt'), 'utf8') === 'precious');
    const fakeHome = mk('home', { 'Desktop/keep.txt': 'x', '.hidden': 'y' });
    const r2 = cli(['--out', fakeHome], { HOME: fakeHome });
    T.ok('ホームそのものは拒否し、何も消さない', r2.status === 2 && fs.existsSync(path.join(fakeHome, 'Desktop', 'keep.txt')) && fs.existsSync(path.join(fakeHome, '.hidden')));
    const r2b = cli(['--out', path.join(fakeHome, 'Desktop')], { HOME: fakeHome });
    T.ok('ホーム直下の既存フォルダ（印なし）も拒否', r2b.status === 2 && fs.existsSync(path.join(fakeHome, 'Desktop', 'keep.txt')));
    const gitLike = mk('repo-like', { '.git/HEAD': 'ref', 'src/a.js': '1' });
    const r3 = cli(['--out', '.'], {}, gitLike);
    T.ok('--out . （カレントがリポ風フォルダ）は拒否し .git ごと残る', r3.status === 2 && fs.existsSync(path.join(gitLike, '.git', 'HEAD')) && fs.existsSync(path.join(gitLike, 'src', 'a.js')));
    const r4 = cli(['--out', env.ROOT]);
    T.ok('--out リポ自身は拒否', r4.status === 2 && fs.existsSync(path.join(env.ROOT, '.git')));
    const r5 = cli(['--out', path.join(env.ROOT, 'tests')]);
    T.ok('--out リポ内（dist 以外）は拒否', r5.status === 2 && fs.existsSync(path.join(env.ROOT, 'tests', 'tenant-isolation.test.js')));
    const r6 = cli(['--out', path.dirname(env.ROOT)]);
    T.ok('--out リポの親フォルダは拒否', r6.status === 2 && fs.existsSync(env.ROOT));
    const fileTarget = path.join(fake, 'afile'); fs.writeFileSync(fileTarget, 'f');
    T.ok('--out がファイルなら拒否', cli(['--out', fileTarget]).status === 2 && fs.readFileSync(fileTarget, 'utf8') === 'f');
    const ok1 = cli(['--out', path.join(fake, 'newout')]);
    T.ok('存在しない出力先には作れる（印ファイルが付く）', ok1.status === 0 && fs.existsSync(path.join(fake, 'newout', '.tenant-build')) && fs.existsSync(path.join(fake, 'newout.setup', 'Code.gs')));
    fs.writeFileSync(path.join(fake, 'newout', 'stale.txt'), 's');
    const ok2 = cli(['--out', path.join(fake, 'newout')]);
    T.ok('印のある前回の出力は作り直せる（古いファイルは消える）', ok2.status === 0 && !fs.existsSync(path.join(fake, 'newout', 'stale.txt')));
    const emptyDir = mk('empty', {});
    T.ok('空のフォルダには作れる', cli(['--out', emptyDir]).status === 0);
    fs.rmSync(fake, { recursive: true, force: true });
  }

  console.log('[3] 実ブラウザ');
  const b = await env.launch({ driveDefault: true });
  const cfgOf = async url => {
    const ctx = await b.newContext({ viewport: { width: 375, height: 740 } });
    const { page: p, errors } = await env.newPage(ctx);
    await p.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }));
    await p.goto(url); await p.waitForTimeout(500);
    await p.evaluate(() => document.querySelector('[data-pg="pgCfg"]') && document.querySelector('[data-pg="pgCfg"]').click());
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({ ls: JSON.parse(localStorage.getItem('oral_exam_google_v1') || 'null'), gUrl: document.getElementById('gUrl').value, title: document.title }));
    r.errors = errors; await ctx.close(); return r;
  };
  const def = await cfgOf(env.URL), ra = await cfgOf(pathToFileURL(path.join(A, 'index.html')).href), rb = await cfgOf(pathToFileURL(path.join(B, 'index.html')).href);
  T.ok('既定はヒラノの保存先のまま ' + (def.gUrl || '').slice(0, 60), /AKfycbxup/.test(def.gUrl) && def.ls.token === 'OOIRI' && def.ls.auto === true);
  T.ok('A の端末は A の保存先・合言葉だけ ' + ra.gUrl.slice(-30), ra.gUrl.includes('DEMOFARMdemofarm') && ra.ls.token === 'tokenAAA-1234567890' && ra.ls.folder === 'デモ農場_口頭試問音声' && !JSON.stringify(ra.ls).includes('AKfycbxup'));
  T.ok('B の端末は B の保存先・合言葉だけ ' + rb.gUrl.slice(-30), rb.gUrl.includes('DEMOBdemoB') && rb.ls.token === 'tokenBBB-0987654321' && !JSON.stringify(rb.ls).includes('DEMOFARM'));
  T.ok('題名が農場別 ' + ra.title + '/' + rb.title, ra.title === 'デモ農場 口頭試問' && rb.title === 'デモB農場 口頭試問' && def.title === '口頭試問 評価システム');
  T.ok('JSエラーなし ' + [def, ra, rb].map(x => x.errors.join('|')).join(''), [def, ra, rb].every(x => !x.errors.length));
  await b.close();

  console.log('[4] GAS の分離と総当たり対策');
  const SRC = fs.readFileSync(path.join(env.ROOT, 'gas', 'Code.gs'), 'utf8');
  function gas(props, cache) {
    const ctx = {
      PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) },
      CacheService: { getScriptCache: () => ({ get: k => cache[k] || null, put: (k, v) => { cache[k] = v; } }) },
      DriveApp: { getRootFolder: () => { throw new Error('drive-touched'); } },
      LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
      Utilities: { base64Decode: s => Buffer.from(s, 'base64'), newBlob: () => ({}) },
      ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
    };
    vm.createContext(ctx); vm.runInContext(SRC, ctx);
    return body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);
  }
  const gA = gas({ TOKEN: 'tokenAAA-1234567890' }, {}), cacheB = {}, gB = gas({ TOKEN: 'tokenBBB-0987654321' }, cacheB);
  T.ok('A の GAS は A の合言葉で通る', gA({ token: 'tokenAAA-1234567890', ping: true }).ok === true);
  T.ok('B の GAS に A の合言葉では書けない', gB({ token: 'tokenAAA-1234567890', ping: true }).error === 'bad-token');
  T.ok('B の GAS に ヒラノの合言葉でも書けない', gB({ token: 'OOIRI', ping: true }).error === 'bad-token');
  T.ok('A の GAS に B の合言葉では書けない', gA({ token: 'tokenBBB-0987654321', ping: true }).error === 'bad-token');
  let last; for (let i = 0; i < 40; i++) last = gB({ token: 'guess' + i, ping: true });
  T.ok('間違いは拒否のまま ' + last.error, last.error === 'bad-token');
  T.ok('40回間違えた後でも正しい合言葉は通る（全体ロックなし＝締め出し不可）', gB({ token: 'tokenBBB-0987654321', ping: true }).ok === true);
  T.ok('間違いの件数が数えられている', Object.values(cacheB).some(v => Number(v) >= 40));
  T.ok('B の間違いは A に影響しない', gA({ token: 'tokenAAA-1234567890', ping: true }).ok === true);
  const gShort = gas({ TOKEN: 'short-123' }, {});
  T.ok('プロパティ由来の短い合言葉（16字未満）は全拒否', gShort({ token: 'short-123', ping: true }).error === 'bad-token' && gShort({ ping: true }).error === 'bad-token');
  // 農場用 GAS（ビルド出力）: プロパティ TOKEN の入れ忘れは全拒否・入れれば通る
  const SRC_T = gasT;
  const gasT2 = props => { const ctx = { PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] || null }) }, CacheService: { getScriptCache: () => ({ get: () => null, put() {} }) }, DriveApp: {}, LockService: {}, Utilities: {}, ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) } }; vm.createContext(ctx); vm.runInContext(SRC_T, ctx); return body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s); };
  T.ok('農場用 GAS: プロパティ TOKEN を入れ忘れると、合言葉なしでも OOIRI でも全拒否（fail-closed）', gasT2({})({ ping: true }).error === 'bad-token' && gasT2({})({ token: 'OOIRI', ping: true }).error === 'bad-token' && gasT2({})({ token: '', ping: true }).error === 'bad-token');
  T.ok('農場用 GAS: プロパティ TOKEN（16字以上）を入れれば通る', gasT2({ TOKEN: 'tokenXYZ-1234567890' })({ token: 'tokenXYZ-1234567890', ping: true }).ok === true);
  // リポの既定 GAS（ヒラノ）: プロパティが無くても貼り直しで無防備にならない（既定 OOIRI）
  const gOld = gas({}, {});
  T.ok('既定 GAS: プロパティ無しでも合言葉 OOIRI が必要（貼り直しても無防備にならない）・OOIRI なら従来どおり通る', gOld({ ping: true }).error === 'bad-token' && gOld({ token: 'OOIRI', ping: true }).ok === true);

  fs.rmSync(tmp, { recursive: true, force: true });
  T.done();
})().catch(e => { console.error(e); process.exit(1); });
