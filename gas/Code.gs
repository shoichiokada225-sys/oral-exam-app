/**
 * 口頭試問 評価システム — 録音音声をGoogleドライブに保存するウェブアプリ
 *
 * 使い方（詳細は SETUP-GOOGLE-DRIVE.md）:
 *  1. https://script.google.com/ で「新しいプロジェクト」を作成
 *  2. このコードを全て貼り付け
 *  3. （任意）下の TOKEN に合言葉を設定すると、その値をアプリの設定にも入れる必要があります。
 *       合言葉が不要なら TOKEN = '' のまま（空）でOK。
 *  4. 「デプロイ」→「新しいデプロイ」→ 種類=ウェブアプリ
 *       実行するユーザー = 自分
 *       アクセスできるユーザー = 全員
 *     → デプロイ → 表示された「ウェブアプリのURL（…/exec）」をアプリの設定に貼る
 *
 * 仕組み: アプリが音声(base64)をPOST → このスクリプトが「あなた本人」として実行され、
 * あなたのドライブの「(保存先フォルダ)/(受験者_日付)/」に音声ファイルを作成します。
 */

// ▼▼▼ 合言葉（任意）。設定するとアプリ側にも同じ値が必要。不要なら '' のまま ▼▼▼
var TOKEN = '';
// ▲▲▲ 例: var TOKEN = 'ooiri-koutou-2026'; のように設定すると保護できます ▲▲▲

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    // TOKENを設定している場合のみ照合（空なら合言葉チェックなし）
    if (TOKEN && body.token !== TOKEN) return json({ ok: false, error: 'bad-token' });
    if (body.ping) return json({ ok: true, ping: true });

    var rootName = body.folder || '口頭試問音声';
    var root = findOrCreateFolder(DriveApp.getRootFolder(), rootName);
    var subName = sanitize((body.examinee || '受験者') + '_' + (body.date || ''));
    var sub = findOrCreateFolder(root, subName);

    var bytes = Utilities.base64Decode(body.dataB64);
    var blob = Utilities.newBlob(bytes, body.mime || 'audio/webm', body.name || 'audio.webm');
    var file = sub.createFile(blob);

    return json({ ok: true, id: file.getId(), url: file.getUrl() });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

// ブラウザで開いたときの簡易確認用（TOKEN設定時は ?token= の照合を要求）
function doGet(e) {
  // TOKENを設定している場合のみ照合（空なら合言葉チェックなし＝従来通り）
  var token = (e && e.parameter && e.parameter.token) || '';
  if (TOKEN && token !== TOKEN) return json({ ok: false, error: 'bad-token' });
  return json({ ok: true, msg: 'oral-exam drive endpoint is alive' });
}

function findOrCreateFolder(parent, name) {
  var it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function sanitize(s) {
  return String(s || '').replace(/[\\\/:*?"<>|]+/g, '_').slice(0, 100);
}

function json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
