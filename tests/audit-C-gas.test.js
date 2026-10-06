/* 検査 2026-10-06【C-drive】GAS（gas/Code.gs）の回帰テスト。実行: node tests/audit-C-gas.test.js
   本物の GAS・ドライブには送らない。Code.gs を node の vm で読み、DriveApp / LockService / Utilities / ContentService を代役で動かす。
   M-17 「受験者_日付」フォルダの検索と作成を LockService の中で行う
   L-30 mime は audio/* だけ・ファイル名とフォルダ名の記号を除く・長さ制限・大きすぎる音声を断る・FOLDER_ID で保存先を固定できる
   M-16 op:'rename'＝同じ受験者フォルダのファイルの名前だけ変える（他のフォルダのファイルは触らない）。ping は従来どおり */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const env = require('./_env');
const c = env.counter();
const SRC = fs.readFileSync(path.join(env.ROOT, 'gas', 'Code.gs'), 'utf8');

function world(over) {
  let n = 0;
  const W = { lockHeld: false, lockCalls: 0, createdOutsideLock: 0, folders: [], files: [] };
  const iter = a => { let i = 0; return { hasNext: () => i < a.length, next: () => a[i++] }; };
  function mkFolder(name, parent) {
    const f = { id: 'D' + (++n), name, parent,
      getId() { return this.id; }, getName() { return this.name; },
      getFoldersByName(nm) { return iter(W.folders.filter(x => x.parent === this && x.name === nm)); },
      createFolder(nm) { if (!W.lockHeld) W.createdOutsideLock++; return mkFolder(nm, this); },
      createFile(blob) { return mkFile(blob, this); } };
    W.folders.push(f); return f;
  }
  function mkFile(blob, folder) {
    const f = { id: 'F' + (++n), name: blob.name, mime: blob.mime, folder, trashed: false,
      getId() { return this.id; }, getUrl() { return 'https://drive/' + this.id; }, getParents() { return iter([this.folder]); },
      setTrashed(v) { this.trashed = v; }, isTrashed() { return this.trashed; }, setName(v) { this.name = v; } };
    W.files.push(f); return f;
  }
  const root = mkFolder('(root)', null);
  W.root = root;
  const ctx = {
    DriveApp: {
      getRootFolder: () => root,
      getFileById: id => { const f = W.files.find(x => x.id === id); if (!f) throw new Error('no file'); return f; },
      getFolderById: id => { const f = W.folders.find(x => x.id === id); if (!f) throw new Error('no folder'); return f; },
    },
    LockService: { getScriptLock: () => ({ waitLock() { W.lockCalls++; W.lockHeld = true; }, releaseLock() { W.lockHeld = false; } }) },
    Utilities: { base64Decode: s => Buffer.from(String(s), 'base64'), newBlob: (bytes, mime, name) => ({ bytes, mime, name }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: s => ({ s, setMimeType() { return this; } }) },
  };
  vm.createContext(ctx);
  vm.runInContext(SRC + '\n' + (over || ''), ctx);
  W.post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).s);
  W.sub = (folder, sub) => W.folders.filter(x => x.name === sub && x.parent && x.parent.name === folder);
  return W;
}
const B64 = Buffer.from('audio').toString('base64');
const up = o => Object.assign({ folder: '口頭試問音声', examinee: 'グエン', date: '2026-10-06', name: '飼-1_合格_q.webm', mime: 'audio/webm;codecs=opus', dataB64: B64 }, o || {});

/* M-17 */
{
  const W = world();
  const r = W.post(up());
  c.ok('M-17 送信できる ' + JSON.stringify(r), r.ok && /^F/.test(r.id));
  c.ok('M-17 フォルダの作成は排他（LockService）の中 ' + W.lockCalls + '/' + W.createdOutsideLock, W.lockCalls >= 1 && W.createdOutsideLock === 0 && !W.lockHeld);
  W.post(up({ name: 'b.webm' }));
  c.ok('M-17 同じ受験者フォルダは1つ', W.sub('口頭試問音声', 'グエン_2026-10-06').length === 1 && W.folders.filter(x => x.name === '口頭試問音声').length === 1);
}

/* L-30 */
{
  const W = world();
  const bad = W.post(up({ mime: 'text/html' }));
  c.ok('L-30 audio 以外の mime は断る ' + JSON.stringify(bad), !bad.ok && bad.error === 'bad-mime' && W.files.length === 0);
  const bad2 = W.post(up({ mime: 'audio/webm\n<script>' }));
  c.ok('L-30 mime の改行・余計な文字も断る', !bad2.ok && W.files.length === 0);
  c.ok('L-30 audio/mp4・audio/wav は受け付ける', W.post(up({ mime: 'audio/mp4' })).ok && W.post(up({ mime: 'audio/wav' })).ok);
  W.post(up({ name: '../../x<y>.webm' }));
  const nm = W.files[W.files.length - 1].name;
  c.ok('L-30 ファイル名の / や記号を除く ' + nm, !/[\/<>]/.test(nm) && !/^\./.test(nm));
  W.post(up({ name: 'x'.repeat(400) + '.webm' }));
  c.ok('L-30 ファイル名の長さを制限', W.files[W.files.length - 1].name.length <= 150);
  W.post(up({ folder: 'a/b' + 'z'.repeat(300) }));
  const tops = W.folders.filter(x => x.parent === W.root).map(x => x.name);
  c.ok('L-30 フォルダ名の / を除き長さを制限 ' + JSON.stringify(tops.map(x => x.slice(0, 12))), tops.every(x => !/\//.test(x) && x.length <= 100));
  const big = W.post(up({ dataB64: 'A'.repeat(70 * 1024 * 1024 + 4) }));
  c.ok('L-30 大きすぎる音声は断る', !big.ok && big.error === 'too-large');
  const none = W.post(up({ dataB64: '' }));
  c.ok('L-30 音声が無ければ作らない', !none.ok);
}
{
  const W = world("FOLDER_ID='D1';TOKEN='OOIRI';");
  c.ok('L-30 合言葉が違えば断る', W.post(up({ token: 'x' })).error === 'bad-token');
  W.post(up({ token: 'OOIRI', folder: '別の場所' }));
  c.ok('L-30 FOLDER_ID を入れると送られたフォルダ名は使わない', !W.folders.some(x => x.name === '別の場所') && W.files[0].folder.parent.id === 'D1');
}

/* M-16 rename / replace */
{
  const W = world();
  const a = W.post(up({ name: '飼-1_未判定_q.webm' }));
  const r = W.post({ ping: true, op: 'rename', fileId: a.id, folder: '口頭試問音声', examinee: 'グエン', date: '2026-10-06', name: '飼-1_合格_q.webm' });
  c.ok('M-16 名前だけ付け直す（ファイルは増えない） ' + JSON.stringify(r), r.ok && r.renamed === true && r.id === a.id && W.files.length === 1 && W.files[0].name === '飼-1_合格_q.webm');
  const r2 = W.post({ ping: true, op: 'rename', fileId: a.id, folder: '口頭試問音声', examinee: '別人', date: '2026-10-06', name: 'z.webm' });
  c.ok('M-16 別の受験者フォルダからは付け直さない ' + JSON.stringify(r2), r2.ok && r2.renamed === false && W.files[0].name === '飼-1_合格_q.webm');
  const p = W.post({ ping: true });
  c.ok('M-16 ping は従来どおり（ファイルもフォルダも作らない）', p.ok && p.ping && !p.renamed && W.files.length === 1);
  const b = W.post(up({ name: '飼-1_不合格_q.webm', replaceId: a.id }));
  c.ok('M-16 replaceId は同じフォルダの旧ファイルをゴミ箱へ', b.ok && W.files.find(x => x.id === a.id).trashed);
  const other = W.post(up({ examinee: '別人' }));
  W.post(up({ name: 'n.webm', replaceId: other.id }));
  c.ok('M-16 別フォルダのファイルは replaceId でも触らない', !W.files.find(x => x.id === other.id).trashed);
}

c.done();
