/**
 * 口頭試問 評価システム — 録音音声をGoogleドライブに保存するウェブアプリ
 *
 * 使い方（詳細は SETUP-GOOGLE-DRIVE.md）:
 *  1. https://script.google.com/ で「新しいプロジェクト」を作成
 *  2. このコードを全て貼り付け
 *  3. （任意）下の TOKEN に合言葉を設定すると、その値をアプリの設定にも入れる必要があります。
 *       既定は TOKEN = ''（ヒラノ版は 2026-10-07 から合言葉なし運用＝みなで改善案を出し合うため入力の手間を省く）。
 *       ※ 農場ごとに別の GAS を作る（docs/MULTI-TENANT.md）。合言葉はコードに書かず、スクリプトプロパティ TOKEN に入れる方法を推奨
 *  4. 「デプロイ」→「新しいデプロイ」→ 種類=ウェブアプリ
 *       実行するユーザー = 自分
 *       アクセスできるユーザー = 全員
 *     → デプロイ → 表示された「ウェブアプリのURL（…/exec）」をアプリの設定に貼る
 *
 * 仕組み: アプリが音声(base64)をPOST → このスクリプトが「あなた本人」として実行され、
 * あなたのドライブの「(保存先フォルダ)/(受験者_日付)/」に音声ファイルを作成します。
 *
 * ── 2026-10-06 の変更（✅ 2026-10-07 本番 GAS にバージョン7として反映済み・TOKEN='OOIRI' で運用中の2デプロイを v7 に。合言葉が別の「ooiri-koutou-2026」(v1) は未変更。同日 TOKEN='' にして v8＝合言葉なし運用へ）──
 *  ・「受験者_日付」フォルダの検索と作成を LockService で1件ずつにした（同時に届くと同じ名前のフォルダが2つできた・M-17）
 *  ・受け付ける値を確かめる：mime は audio/* だけ・ファイル名とフォルダ名は記号を除いて長さを制限・大きすぎる音声は断る（L-30）
 *  ・保存先を FOLDER_ID で固定できる（空なら従来どおりアプリが送るフォルダ名を使う）
 *  ・op:'rename'＝ファイル名だけの付け直し（合否・問題文を変えた時に録音を送り直さない・M-16）。
 *    アプリは ping:true を付けて送るので、この版より古い GAS では ping として応える（何も作らない）→ アプリが録音ごと置き換えて送る
 *  アプリ側は新旧どちらの GAS でも動く（古い GAS のままでも保存はできる。上の改善が効くのは再デプロイ後）
 */

// ▼▼▼ 合言葉（任意）。設定するとアプリ側にも同じ値が必要。不要なら '' のまま ▼▼▼
var TOKEN = '';
// ↑ 既定値（ヒラノ版の現行の合言葉）。スクリプトプロパティ TOKEN が無くても、貼り直しで無防備（合言葉なし）にならない。
//   アプリの既定の保存先（tenant-config.js）も同じ値。他農場の GAS には使わない（下の TENANT_MODE と tools/build-tenant.mjs の gas 出力を使う）
// ▼ 他農場向け配布物（dist/<id>/gas/Code.gs）では tools/build-tenant.mjs が true にし、TOKEN を空にする。
//   true の間は「プロパティ TOKEN が無い・16文字未満」ならすべて拒否する（入れ忘れても開かない）
var TENANT_MODE = false;
// スクリプトプロパティ TOKEN があればそちらが優先（コードに合言葉を書かずに済む。2026-10-07 マルチテナント化）。
// 既存の GAS（上の TOKEN に直書き）はそのまま動く＝プロパティを作らなければ従来と同じ
var PROP_TOKEN = (function () {
  try { return String(PropertiesService.getScriptProperties().getProperty('TOKEN') || ''); } catch (e) { return ''; }
})();
function activeToken() { return PROP_TOKEN || TOKEN; }
// ▲▲▲ 例: var TOKEN = 'farm-secret-123'; のように設定すると保護できます ▲▲▲

// ▼ 保存先をフォルダIDで固定する（任意）。入れるとアプリが送るフォルダ名は使わない。空ならフォルダ名で探す／作る
var FOLDER_ID = '';
// （スクリプトプロパティ FOLDER_ID があればそちらが優先）
var DEFAULT_FOLDER = '口頭試問音声';
// base64 の文字数の上限（約 50MB の音声。口頭試問1問の録音はふつう数MB）
var MAX_B64 = 70 * 1024 * 1024;

/* 合言葉の間違いは数えるだけ（2026-10-07）。GAS は接続元 IP を見られないため「間違いが多いから全員拒否」にすると、
   誰でも利用者全員を締め出せる（DoS）。守りは合言葉の強さに置く: スクリプトプロパティ由来の TOKEN は 16 文字未満だと全拒否
   （他農場向けは tools/gen-tokens.mjs が 24 文字の乱数を作る）。コード直書きの TOKEN（既存のヒラノの GAS）は従来どおり長さを問わない。
   件数は doGet?token=…&stat=1 の authFails（直近10分）で見られる */
var MIN_PROP_TOKEN = 16, FAIL_WINDOW_SEC = 600;
function failKey() { return 'authfail_' + Math.floor(Date.now() / (FAIL_WINDOW_SEC * 1000)); }
function noteFail() {
  try {
    var c = CacheService.getScriptCache(), k = failKey();
    c.put(k, String(Number(c.get(k) || 0) + 1), FAIL_WINDOW_SEC * 2);
  } catch (e) { /* 数えられなくても判定は変わらない */ }
}
function failCount() {
  try { return Number(CacheService.getScriptCache().get(failKey()) || 0); } catch (e) { return 0; }
}
/* 合言葉の照合。戻り値: null=通す / ContentService=拒否の応答 */
function authCheck(token) {
  if (PROP_TOKEN && PROP_TOKEN.length < MIN_PROP_TOKEN) return json({ ok: false, error: 'bad-token' }); // 短すぎるプロパティ合言葉は全拒否
  var want = activeToken();
  if (TENANT_MODE && !want) return json({ ok: false, error: 'bad-token' }); // 他農場: プロパティ未設定は全拒否（fail-closed）
  if (!want) return null; // 合言葉なし運用（TOKEN を空にした GAS のみ）
  if (String(token || '') !== want) { noteFail(); return json({ ok: false, error: 'bad-token' }); }
  return null;
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    // 合言葉を設定している場合のみ照合（空なら合言葉チェックなし）
    var denied = authCheck(body.token);
    if (denied) return denied;
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
  var denied = authCheck(token);
  if (denied) return denied;
  if (e && e.parameter && e.parameter.stat) return json({ ok: true, authFails: failCount() });
  return json({ ok: true, msg: 'oral-exam drive endpoint is alive' });
}

/* (保存先)/(受験者_日付) のフォルダ。create=false なら探すだけ（無ければ null） */
function examFolder(body, create) {
  var root;
  var fid = FOLDER_ID;
  try { fid = PropertiesService.getScriptProperties().getProperty('FOLDER_ID') || FOLDER_ID; } catch (e) { /* 既定のまま */ }
  if (fid) root = DriveApp.getFolderById(fid);
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
