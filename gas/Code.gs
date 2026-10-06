/**
 * 口頭試問 評価システム — 録音音声をGoogleドライブに保存するウェブアプリ
 *
 * 使い方（詳細は SETUP-GOOGLE-DRIVE.md）:
 *  1. https://script.google.com/ で「新しいプロジェクト」を作成
 *  2. このコードを全て貼り付け
 *  3. （任意）下の TOKEN に合言葉を設定すると、その値をアプリの設定にも入れる必要があります。
 *       合言葉が不要なら TOKEN = '' のまま（空）でOK。
 *       ※ アプリの既定の保存先（社長のドライブ）は合言葉 'OOIRI' で運用している。その GAS を貼り直すときは TOKEN = 'OOIRI' にする
 *  4. 「デプロイ」→「新しいデプロイ」→ 種類=ウェブアプリ
 *       実行するユーザー = 自分
 *       アクセスできるユーザー = 全員
 *     → デプロイ → 表示された「ウェブアプリのURL（…/exec）」をアプリの設定に貼る
 *
 * 仕組み: アプリが音声(base64)をPOST → このスクリプトが「あなた本人」として実行され、
 * あなたのドライブの「(保存先フォルダ)/(受験者_日付)/」に音声ファイルを作成します。
 *
 * ── 2026-10-06 の変更（⚠ 要再デプロイ：本番の GAS にはまだ入っていない。貼り直して「デプロイを管理→編集→新バージョン」）──
 *  ・「受験者_日付」フォルダの検索と作成を LockService で1件ずつにした（同時に届くと同じ名前のフォルダが2つできた・M-17）
 *  ・受け付ける値を確かめる：mime は audio/* だけ・ファイル名とフォルダ名は記号を除いて長さを制限・大きすぎる音声は断る（L-30）
 *  ・保存先を FOLDER_ID で固定できる（空なら従来どおりアプリが送るフォルダ名を使う）
 *  ・op:'rename'＝ファイル名だけの付け直し（合否・問題文を変えた時に録音を送り直さない・M-16）。
 *    アプリは ping:true を付けて送るので、この版より古い GAS では ping として応える（何も作らない）→ アプリが録音ごと置き換えて送る
 *  アプリ側は新旧どちらの GAS でも動く（古い GAS のままでも保存はできる。上の改善が効くのは再デプロイ後）
 */

// ▼▼▼ 合言葉（任意）。設定するとアプリ側にも同じ値が必要。不要なら '' のまま ▼▼▼
var TOKEN = '';
// ▲▲▲ 例: var TOKEN = 'ooiri-koutou-2026'; のように設定すると保護できます ▲▲▲

// ▼ 保存先をフォルダIDで固定する（任意）。入れるとアプリが送るフォルダ名は使わない。空ならフォルダ名で探す／作る
var FOLDER_ID = '';
var DEFAULT_FOLDER = '口頭試問音声';
// base64 の文字数の上限（約 50MB の音声。口頭試問1問の録音はふつう数MB）
var MAX_B64 = 70 * 1024 * 1024;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    // TOKENを設定している場合のみ照合（空なら合言葉チェックなし）
    if (TOKEN && body.token !== TOKEN) return json({ ok: false, error: 'bad-token' });
    // 名前だけの付け直し（ping より先に見る。古い GAS は op を知らず ping として応える）
    if (body.op === 'rename') return renameFile(body);
    if (body.ping) return json({ ok: true, ping: true });

    var mime = String(body.mime || 'audio/webm');
    if (mime.length > 100 || !/^audio\/[a-z0-9.+-]+(\s*;.*)?$/i.test(mime)) return json({ ok: false, error: 'bad-mime' });
    var b64 = String(body.dataB64 || '');
    if (!b64) return json({ ok: false, error: 'no-data' });
    if (b64.length > MAX_B64) return json({ ok: false, error: 'too-large' });
    var name = cleanName(body.name);

    var bytes = Utilities.base64Decode(b64);
    var sub = withLock(function () { return examFolder(body, true); });
    var blob = Utilities.newBlob(bytes, mime, name);
    var file = sub.createFile(blob);

    // 合否の付け直し：同じ受験者フォルダ内の旧ファイルだけをゴミ箱へ（他の場所のファイルは触らない）
    if (body.replaceId) {
      try {
        var old = DriveApp.getFileById(String(body.replaceId));
        if (inFolder(old, sub) && old.getId() !== file.getId()) old.setTrashed(true);
      } catch (e2) { /* 旧ファイルが無い等は無視（新ファイルは作成済み） */ }
    }

    return json({ ok: true, id: file.getId(), url: file.getUrl() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ファイル名だけを変える。同じ受験者フォルダ（受験者_日付）にあるファイルだけ。無ければ renamed:false（アプリが録音ごと送る） */
function renameFile(body) {
  var sub = examFolder(body, false);
  if (!sub || !body.fileId) return json({ ok: true, renamed: false });
  var f;
  try { f = DriveApp.getFileById(String(body.fileId)); } catch (e) { return json({ ok: true, renamed: false }); }
  if (f.isTrashed() || !inFolder(f, sub)) return json({ ok: true, renamed: false });
  f.setName(cleanName(body.name));
  return json({ ok: true, renamed: true, id: f.getId(), url: f.getUrl() });
}

// ブラウザで開いたときの簡易確認用（TOKEN設定時は ?token= の照合を要求）
function doGet(e) {
  // TOKENを設定している場合のみ照合（空なら合言葉チェックなし＝従来通り）
  var token = (e && e.parameter && e.parameter.token) || '';
  if (TOKEN && token !== TOKEN) return json({ ok: false, error: 'bad-token' });
  return json({ ok: true, msg: 'oral-exam drive endpoint is alive' });
}

/* (保存先)/(受験者_日付) のフォルダ。create=false なら探すだけ（無ければ null） */
function examFolder(body, create) {
  var root;
  if (FOLDER_ID) root = DriveApp.getFolderById(FOLDER_ID);
  else root = findFolder(DriveApp.getRootFolder(), cleanFolder(body.folder) || DEFAULT_FOLDER, create);
  if (!root) return null;
  var subName = cleanFolder(String(body.examinee || '受験者') + '_' + String(body.date || '')) || '受験者_';
  return findFolder(root, subName, create);
}

/* 同時に届いた送信どうしで「無ければ作る」が重ならないよう、スクリプト全体の排他で囲む */
function withLock(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function findFolder(parent, name, create) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return create ? parent.createFolder(name) : null;
}

function inFolder(file, folder) {
  var ps = file.getParents();
  while (ps.hasNext()) { if (ps.next().getId() === folder.getId()) return true; }
  return false;
}

function sanitize(s) {
  return String(s || '').replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 100);
}
function cleanFolder(s) {
  return sanitize(String(s || '').trim()).replace(/^\.+/, '').trim();
}
function cleanName(s) {
  var n = String(s || '').replace(/[\\\/:*?"<>|\u0000-\u001f]+/g, '_').replace(/^\.+/, '').trim().slice(0, 150);
  return n || 'audio.webm';
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
