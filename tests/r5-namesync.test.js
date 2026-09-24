/* 辛口レビュー R5 検証NGの回帰テスト（受験者名・合否とドライブのファイル名）。実行: node tests/r5-namesync.test.js
   [1] 受験者名が空の間に○×を変えても送らない→名前を戻して「試問を保存」で合否つきの名前に replaceId で付け直す
   [2] 録音が無く○×だけのときは名前を変えても確認しない（保存できない「OK」を出さない）
   [3] 名前を消しただけ（空）は確認しない／A→空→B は A からの書き換えとして確認する
   [4] 間違ったURLを初めて保存→接続できないので自動保存はONにしない（接続できたらON）
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
const env = require('./_env');
const T = env.counter();
const GURL = 'https://script.google.com/macros/s/r5ns/exec';
async function rec(p, id) { await p.click('#rb-' + id); await p.waitForTimeout(900); await p.click('#rb-' + id); await p.waitForTimeout(900); }
async function setup(b, dialogAns, pingOk) {
  const { page: p, errors } = await env.newPage(b);
  const posts = []; let n = 0;
  await p.route('https://script.google.com/**', async r => {
    const j = JSON.parse(r.request().postData());
    if (j.ping) { posts.push({ ping: true }); return pingOk.v ? r.fulfill({ contentType: 'application/json', body: '{"ok":true}' }) : r.fulfill({ status: 404, body: 'not found' }); }
    n++; posts.push({ name: j.name, examinee: j.examinee, replaceId: j.replaceId || null });
    r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'F' + n, url: 'https://drive/F' + n }) });
  });
  const dialogs = [];
  p.on('dialog', async d => { dialogs.push(d.message()); if (dialogAns.v) await d.accept(); else await d.dismiss(); });
  await p.goto(env.URL); await p.waitForTimeout(300);
  return { p, errors, posts, dialogs };
}
const gcfg = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_google_v1') || 'null'));
const audioPosts = posts => posts.filter(x => !x.ping);
const sessions = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1') || '{"sessions":[]}').sessions);

(async () => {
  const b = await env.launch();
  const ans = { v: true }, ping = { v: true };

  /* ---------- [1] 名前が空の間の○→保存時に付け直す ---------- */
  {
    console.log('[1] 名前が空の間に変えた合否も、保存時にドライブの名前へ反映する');
    const { p, errors, posts, dialogs } = await setup(b, ans, ping);
    await p.evaluate(u => localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: u, auto: true, autoSet: true })), GURL);
    await p.reload(); await p.waitForTimeout(300);
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'A'); await p.press('#fEe', 'Tab');
    await rec(p, 'q1'); await p.waitForTimeout(500);
    T.ok('録音は未判定の名前で送られる ' + JSON.stringify(audioPosts(posts)), audioPosts(posts).length === 1 && audioPosts(posts)[0].name.includes('_未判定_'));
    dialogs.length = 0;
    await p.fill('#fEe', ''); await p.press('#fEe', 'Tab'); await p.waitForTimeout(200);
    T.ok('名前を消しただけでは確認しない', dialogs.length === 0);
    await p.click('#vp-q1'); await p.waitForTimeout(2400);
    T.ok('名前が空の間は付け直しを送らない（誰のものか分からない送信をしない）', audioPosts(posts).length === 1);
    T.ok('端末では合格', await p.evaluate(() => cur.items.q1.score === 'pass'));
    await p.fill('#fEe', 'A'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(200);
    T.ok('同じ名前に戻したら確認しない', dialogs.length === 0);
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(2400);
    const ap = audioPosts(posts), last = ap[ap.length - 1];
    T.ok('保存時に合格の名前で付け直し（replaceId=F1） ' + JSON.stringify(last), ap.length === 2 && last.name.includes('_合格_') && last.replaceId === 'F1' && last.examinee === 'A');
    const ss = await sessions(p);
    T.ok('保存済みのドライブ名も合格・新しいファイル', ss.length === 1 && ss[0].items.q1.driveFileId === 'F2' && ss[0].items.q1.driveName.includes('_合格_') && !ss[0].items.q1.driveSt);
    // 合否も名前も変わっていなければ保存時に送り直さない（無駄な二重送信をしない）
    await p.fill('#fEe', 'B'); await p.press('#fEe', 'Tab');
    await rec(p, 'q4'); await p.click('#vf-q4'); await p.waitForTimeout(2400);
    const before = audioPosts(posts).length;
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(2400);
    T.ok('変わっていない録音は保存時に送り直さない', audioPosts(posts).length === before && audioPosts(posts)[before - 1].name.includes('_不合格_'));
    T.ok('[1] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- [2] ○×だけ（録音なし）で名前を変える ---------- */
  {
    console.log('[2] 録音が無ければ名前の書き換えを確認しない');
    const { p, errors, dialogs } = await setup(b, ans, ping);
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'A'); await p.press('#fEe', 'Tab');
    await p.click('#vp-q1'); await p.waitForTimeout(200);
    dialogs.length = 0;
    await p.fill('#fEe', 'B'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(5800);
    T.ok('確認が出ない（保存できない「OK」を出さない）: ' + dialogs.join('|'), dialogs.length === 0);
    T.ok('名前はBのまま・○は残る', await p.inputValue('#fEe') === 'B' && await p.evaluate(() => cur.examinee === 'B' && cur.items.q1.score === 'pass'));
    T.ok('「保存できなかった」トーストが出ない', !(await p.textContent('#toast')).includes('保存できなかった'));
    T.ok('何も保存されない', (await sessions(p)).length === 0);
    T.ok('[2] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- [3] A→空→B は A からの書き換えとして確認 ---------- */
  {
    console.log('[3] 名前を消してから別の名前を入れても確認を素通りしない');
    const { p, errors, dialogs } = await setup(b, ans, ping);
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'A'); await p.press('#fEe', 'Tab');
    await rec(p, 'q1');
    dialogs.length = 0;
    await p.fill('#fEe', ''); await p.press('#fEe', 'Tab'); await p.waitForTimeout(200);
    T.ok('空にしただけでは確認しない（「—さん」を出さない）', dialogs.length === 0);
    await p.click('#fEe'); await p.fill('#fEe', 'B'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(800);
    T.ok('A→空→B で A の録音について確認: ' + (dialogs[0] || '').split('\n')[0], dialogs.length === 1 && dialogs[0].includes('Aさんの録音1問') && !dialogs[0].includes('—'));
    const ss = await sessions(p);
    T.ok('OK＝Aの試問として保存・Bで新しい試問', ss.length === 1 && ss[0].examinee === 'A' && ss[0].items.q1.hasAudio && await p.evaluate(() => cur.examinee === 'B' && !Object.keys(cur.items).length));
    T.ok('[3] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- [4] 間違ったURLでは自動保存をONにしない ---------- */
  {
    console.log('[4] 自動保存は接続を確認できてからON');
    ping.v = false;
    const { p, errors, posts } = await setup(b, ans, ping);
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(250);
    await p.click('#pgCfg summary[data-t="gTitle"]'); await p.waitForTimeout(150);
    await p.fill('#gUrl', GURL);
    await p.click('#pgCfg button[onclick="saveGoogleCfg()"]'); await p.waitForTimeout(600);
    const g = await gcfg(p);
    T.ok('接続テストが自動で走る', posts.filter(x => x.ping).length === 1);
    T.ok('つながらないので自動保存はONにしない（未設定のまま）', g.url === GURL && g.auto === undefined && !(await p.isChecked('#gAuto')));
    const tt = await p.textContent('#toast');
    T.ok('つながってからONになると知らせる: ' + tt, tt.includes('接続を確認できてからON'));
    await p.click('.tabs button[data-pg="pgExam"]'); await p.waitForTimeout(250);
    T.ok('ヒーローはOFF表示', (await p.textContent('#epDrv')).includes('OFF'));
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(250);
    ping.v = true;
    await p.click('#gTestBtn'); await p.waitForTimeout(500);
    T.ok('直して接続テストが通ればON', (await gcfg(p)).auto === true && await p.isChecked('#gAuto') && (await p.textContent('#toast')).includes('自動保存をONにしました'));
    T.ok('追加文言が ja/en/vi/id に揃う', await p.evaluate(() => ['gAutoWait', 'gAutoPend'].every(k => ['ja', 'en', 'vi', 'id'].every(L => TX2[L][k]))));
    T.ok('[4] JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
