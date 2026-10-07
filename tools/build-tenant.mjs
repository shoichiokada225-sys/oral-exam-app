#!/usr/bin/env node
/* 農場別ビルド（マルチテナント・キット方式）。
   使い方: node tools/build-tenant.mjs <テナントID> [--out <出力先>]   例: node tools/build-tenant.mjs demo-farm
   ・tenants/<id>.json（農場名・GAS の URL とフォルダ名・権利表記）から dist/<id>/ に「配る一式」を作る（コマンド1本）
   ・合言葉はファイルに書かない。環境変数 TENANT_GAS_TOKEN か、git に入れない tenants/<id>.secret.json の {"gasToken":"…"} から読む
   ・元の tenant-config.js（ヒラノ版の既定）は変えない。出力に既定の保存先（URL・合言葉）が1つも残らないことを検査し、残れば失敗する
   ・本番には何も送らない（公開は社長が dist/<id>/ を農場専用のホスティングに置く） */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 既定（ヒラノ版）の値。農場用の出力にこれらが残ってはいけない（検査用。tenant-config.js の既定と同じ）
const HIRANO = { urlId: 'AKfycbxupXbLNCzUGtwr2D2sWQfozP0u4bFitbqyiIk_efuUdpPzE-EaVdCI4nJCOYIbUzBuLA', token: 'OOIRI', pages: 'shoichiokada225-sys.github.io' };
const EXCLUDE = [/^tests\//, /^tools\//, /^tenants\//, /^docs\//, /^gas\//, /^dist\//, /^smoke\.js$/, /\.md$/, /^\./, /^C_free\.png$/];
// 他農場に出さない固有表現（画面・コードの出典表記）
const SCRUB = [['（睦沢pptx由来）', ''], ['睦沢農場「業務の目的と注意点」pptx', '作業手順資料（pptx）'], ['睦沢pptx由来', 'pptx由来']];

const escHtml = v => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');   // 題名を HTML に入れる前のエスケープ
function die(m) { console.error('NG: ' + m); process.exit(2); }

// ---- 出力先の安全確認（既存フォルダを黙って消さない）----
// 消してよいのは「前回このツールが作った印ファイル（.tenant-build）がある」フォルダだけ。
// 印が無い既存の空でないフォルダ・ファイル・シンボリックリンク・/・ホーム・リポ・リポの親・一時フォルダそのもの・リポ内（dist/ 以外）は拒否する
const MARK = '.tenant-build';
function prepareOut(out, id) {
  const real = p => { try { return fs.realpathSync(p); } catch { return p; } };
  const o = path.resolve(out);
  const ro = fs.existsSync(o) ? real(o) : path.join(real(path.dirname(o)), path.basename(o));
  const home = real(os.homedir()), root = real(ROOT), tmp = real(os.tmpdir());
  const dangerous = [path.parse(ro).root, home, root, tmp];
  if (dangerous.includes(ro)) die('出力先が危険です（/・ホーム・リポ・一時フォルダそのもの）: ' + o);
  if (root.startsWith(ro + path.sep) || home.startsWith(ro + path.sep)) die('出力先がリポまたはホームの親フォルダです: ' + o);
  if (ro.startsWith(root + path.sep) && !ro.startsWith(path.join(root, 'dist') + path.sep)) die('リポ内への出力は dist/ 配下だけ: ' + o);
  if (fs.existsSync(o)) {
    if (fs.lstatSync(o).isSymbolicLink() || !fs.statSync(o).isDirectory()) die('出力先がフォルダではありません: ' + o);
    const entries = fs.readdirSync(o);
    if (entries.length) {
      const mk = path.join(o, MARK);
      if (!fs.existsSync(mk) || !fs.readFileSync(mk, 'utf8').startsWith('tenant-build:' + id)) die('出力先は空でなく、前回このツールが作った印（' + MARK + '）もありません。消さずに中止します: ' + o);
      fs.rmSync(o, { recursive: true, force: true }); // 印のある前回の出力だけを作り直す
    }
  }
  fs.mkdirSync(o, { recursive: true });
  fs.writeFileSync(path.join(o, MARK), 'tenant-build:' + id + '\n');
  return o;
}


export function loadTenant(id) {
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(id || '')) die('テナントIDは英小文字・数字・ハイフン（2〜31字）');
  const f = path.join(ROOT, 'tenants', id + '.json');
  if (!fs.existsSync(f)) die(f + ' がありません（tenants/demo-farm.json をコピーして作る）');
  const t = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (t.id !== id) die('tenants/' + id + '.json の "id" がファイル名と違います');
  if (!t.brand || !String(t.brand.title || '').trim()) die('brand.title が必要です');
  if (/[<>"\n\r]/.test(t.brand.title)) die('brand.title に < > " 改行は使えません');
  const g = t.gas || {};
  if (g.url && !/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(g.url)) die('gas.url は https://script.google.com/macros/s/…/exec の形');
  if (String(g.url || '').includes(HIRANO.urlId)) die('gas.url にヒラノの保存先が入っています');
  let token = process.env.TENANT_GAS_TOKEN || '';
  const sf = path.join(ROOT, 'tenants', id + '.secret.json');
  if (!token && fs.existsSync(sf)) token = String(JSON.parse(fs.readFileSync(sf, 'utf8')).gasToken || '');
  if (token === HIRANO.token) die('合言葉にヒラノの値は使えません');
  if (g.url && token.length < 16) die('合言葉は16字以上（node tools/gen-tokens.mjs で24字の乱数を作れる。GAS は16字未満を全拒否する）');
  if (Object.keys(t).some(k => /pass|token|secret|合言葉/i.test(k)) || Object.keys(g).some(k => /pass|token|secret|合言葉/i.test(k))) die('合言葉は tenants/<id>.json に書かない（環境変数 TENANT_GAS_TOKEN か secret.json）');
  return { t, token };
}

export function build(id, outDir) {
  const { t, token } = loadTenant(id);
  const out0 = path.resolve(outDir || path.join(ROOT, 'dist', id));
  const out = prepareOut(out0, id);              // 公開用（配る一式）
  const setup = prepareOut(out0 + '.setup', id);  // 非公開（農場の GAS に貼る Code.gs）。公開ディレクトリには置かない
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean)
    .filter(f => !EXCLUDE.some(r => r.test(f))).filter(f => fs.existsSync(path.join(ROOT, f)));
  const cfg = {
    id,
    gas: { url: (t.gas && t.gas.url) || '', token: (t.gas && t.gas.url) ? token : '', folder: (t.gas && t.gas.folder) || '口頭試問音声' },
    examples: { setName: ((t.examples && t.examples.setName) || 'A農場') },
    brand: { title: t.brand.title },
    copyright: { mode: (t.copyright && t.copyright.mode) === 'show' ? 'show' : 'hide' } // 他農場は既定で非表示
  };
  for (const f of files) {
    const dst = path.join(out, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    let buf = fs.readFileSync(path.join(ROOT, f));
    if (/\.(js|html|webmanifest)$/.test(f)) {
      let s = buf.toString('utf8');
      if (f === 'tenant-config.js') s = '/* 農場別ビルドが生成（tools/build-tenant.mjs）。直接編集しない */\nwindow.TENANT = ' + JSON.stringify(cfg, null, 2) + ';\n';
      for (const [a, b] of SCRUB) s = s.split(a).join(b);
      if (f === 'index.html') {
        s = s.replace(/<title>[^<]*<\/title>/, () => '<title>' + escHtml(t.brand.title) + '</title>')   // 関数置換（題名の $' $& $1 を置換記法として解釈させない）
             .replace(/<meta property="og:title" content="[^"]*">/, () => '<meta property="og:title" content="' + escHtml(t.brand.title) + '">')
             .replace(/<meta property="og:(url|image)" content="https:\/\/[^"]*">\n?/g, '');
      }
      if (f === 'manifest.webmanifest') { const m = JSON.parse(s); m.name = t.brand.title; m.short_name = t.brand.title.slice(0, 12); s = JSON.stringify(m, null, 2) + '\n'; }
      if (f === 'sw.js') s = s.replace(/const VER = '([^']+)'/, (_, v) => "const VER = '" + v + '-' + id + "'"); // キャッシュ名を農場別にする
      buf = Buffer.from(s, 'utf8');
    }
    fs.writeFileSync(dst, buf);
  }
  // 農場専用の GAS（dist/<id>.setup/Code.gs＝公開しない別フォルダ）: 既定の合言葉を空にして TENANT_MODE を有効にする
  // ＝プロパティ TOKEN（16字以上）を入れ忘れると全拒否（fail-closed）。ヒラノの既定の合言葉・名称は消す
  {
    let g = fs.readFileSync(path.join(ROOT, 'gas', 'Code.gs'), 'utf8');
    const n0 = g.length;
    g = g.replace("var TOKEN = 'OOIRI';", "var TOKEN = '';").replace('var TENANT_MODE = false;', 'var TENANT_MODE = true;');
    if (!/var TENANT_MODE = true;/.test(g) || !/var TOKEN = '';/.test(g)) die('gas/Code.gs の TOKEN / TENANT_MODE の行が見つかりません');
    g = g.split('OOIRI').join('（既定値）').split('ヒラノ版').join('既存の本番').split('ヒラノ').join('既存');
    fs.writeFileSync(path.join(setup, 'Code.gs'), g);
    fs.writeFileSync(path.join(setup, 'README.txt'), '非公開フォルダ。公開（ホスティング）しないこと。Code.gs を農場の Google Apps Script に貼り、スクリプトプロパティ TOKEN（16字以上）を入れてウェブアプリとして公開する。公開するのは隣の ' + path.basename(out) + '/ だけ。\n');
  }
  // 検査: 既定（ヒラノ）の保存先・合言葉・公開URLが出力に1つも残っていない
  const bad = [];
  const walkDir = function walk(d) {
    for (const n of fs.readdirSync(d)) {
      const p = path.join(d, n);
      if (fs.statSync(p).isDirectory()) { walk(p); continue; }
      if (!/\.(js|html|webmanifest|json|css|gs)$/.test(n)) continue;
      const s = fs.readFileSync(p, 'utf8');
      for (const k of Object.values(HIRANO)) if (s.includes(k)) bad.push(path.relative(out, p) + ' に "' + k.slice(0, 12) + '…"');
      if (/睦沢|ヒラノ|棚倉/.test(s)) bad.push(path.relative(out, p) + ' に固有名');
    }
  };
  walkDir(out); walkDir(setup);
  if (bad.length) { fs.rmSync(out, { recursive: true, force: true }); fs.rmSync(setup, { recursive: true, force: true }); die('ヒラノ固有の値が残っています: ' + bad.join(' / ')); }
  return { out, files: files.length, hasToken: !!cfg.gas.token };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2);
  const id = a.find(x => !x.startsWith('--'));
  const oi = a.indexOf('--out');
  const r = build(id, oi >= 0 ? a[oi + 1] : null);
  console.log('OK ' + r.out + '（' + r.files + 'ファイル・合言葉' + (r.hasToken ? 'あり' : 'なし') + '）');
}
