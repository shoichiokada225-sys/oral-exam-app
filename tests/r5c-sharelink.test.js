/* R5 検証NGの回帰テスト（R5c）。実行: node tests/r5c-sharelink.test.js
   [1] 合言葉なしの設定（SETUP-GOOGLE-DRIVE の既定）で「この設定を他の端末へ」のリンクを作る
       → 別の端末で開くと接続テストが走り、つながれば自動保存ON（driveState='on'）・1問録音するとGASへ送られる
   [2] 受け取った端末で接続テストに失敗（合言葉が要るのに無い）→ 自動保存は未設定のまま（OFF）・理由のトーストが出る
   [3] 受け取る端末で自分で自動保存をOFFにしていた（autoSet）→ リンクを開いてもONにしない・接続テストも走らせない
   [4] ドライブ未設定の案内だけを閉じていた端末（drvhint_off=1・howto_off なし）では、初回カードの中にも案内を出し直さない
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
'use strict';
const env = require('./_env');
const T = env.counter();
const GURL = 'https://script.google.com/macros/s/r5ctest/exec';

async function mkPage(b, opt) {
  opt = opt || {};
  const ctx = await b.newContext({ viewport: { width: 375, height: 740 } });
  const { page: p, errors } = await env.newPage(ctx);
  const posts = [];
  await p.route('https://script.google.com/**', r => {
    let j = {}; try { j = JSON.parse(r.request().postData() || '{}'); } catch (e) { /* 形式外 */ }
    posts.push(j);
    const body = opt.fail ? '{"ok":false,"error":"bad-token"}' : '{"ok":true,"id":"F1","url":"https://drive/F1"}';
    return r.fulfill({ contentType: 'application/json', body });
  });
  const dialogs = []; p.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  if (opt.pre) await p.addInitScript(opt.pre);
  return { ctx, p, errors, posts, dialogs };
}
const st = p => p.evaluate(() => ({ cfg: JSON.parse(localStorage.getItem('oral_exam_google_v1') || 'null'), state: driveState(), hero: (document.getElementById('epDrv') || {}).textContent || '' }));

(async () => {
  const b = await env.launch();

  /* ---------- 送る側：合言葉なしで URL だけ保存 ---------- */
  let link;
  {
    const { ctx, p, errors } = await mkPage(b);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(150);
    await p.evaluate(() => { document.querySelectorAll('#pgCfg details.acc').forEach(d => d.open = true); });
    await p.fill('#gUrl', GURL);
    await p.click('#pgCfg button[onclick="saveGoogleCfg()"]'); await p.waitForTimeout(700);
    const s = await st(p);
    T.ok('送る側：合言葉なし・自動保存ON（前提） ' + JSON.stringify(s.cfg), s.cfg && s.cfg.url === GURL && !s.cfg.token && s.cfg.auto === true);
    link = await p.inputValue('#gShareUrl');
    const q = new URL(link).searchParams;
    T.ok('リンクは gurl と gfolder（合言葉は含めない） ' + link, q.get('gurl') === GURL && !q.has('gtoken'));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  const search = '?' + new URL(link).searchParams.toString();

  /* ---------- [1] 受け取る端末：接続テスト→自動保存ON→録音が送られる ---------- */
  console.log('[1] 合言葉なしのリンクを受け取った端末で自動保存まで入る');
  {
    const { ctx, p, errors, posts, dialogs } = await mkPage(b);
    await p.goto(env.URL + search); await p.waitForTimeout(1200);
    const s = await st(p);
    T.ok('送信先の確認が1回', dialogs.length === 1);
    T.ok('接続テスト（ping）が走る ' + JSON.stringify(posts), posts.filter(x => x.ping).length === 1);
    T.ok('自動保存が既定ONになる ' + JSON.stringify(s), s.cfg && s.cfg.url === GURL && s.cfg.auto === true && s.state === 'on');
    T.ok('トーストで自動保存ONを知らせる: ' + await p.textContent('#toast'), (await p.textContent('#toast')).includes(await p.evaluate(() => t2('gAutoOn'))));
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'テスト太郎');
    await p.click('#rb-q1'); await p.waitForTimeout(1000); await p.click('#rb-q1'); await p.waitForTimeout(2500);
    const sent = posts.filter(x => x.dataB64);
    T.ok('1問録音するとGASへ送られる（' + sent.length + '件）', sent.length >= 1 && sent[0].folder === '口頭試問音声' && sent[0].examinee === 'テスト太郎');
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- [2] 接続テスト失敗 ---------- */
  console.log('[2] 受け取った端末で接続できない（合言葉が要る）');
  {
    const { ctx, p, errors, posts } = await mkPage(b, { fail: true });
    await p.goto(env.URL + search); await p.waitForTimeout(1200);
    const s = await st(p);
    const toastTxt = await p.textContent('#toast');
    T.ok('接続テストは走る', posts.filter(x => x.ping).length === 1);
    T.ok('自動保存は未設定のまま（OFF） ' + JSON.stringify(s), s.cfg && s.cfg.url === GURL && s.cfg.auto === undefined && s.state === 'off');
    T.ok('理由（合言葉）と「つながるまでOFF」をトーストで出す: ' + toastTxt, toastTxt.includes(await p.evaluate(() => t2('drvErrToken'))) && toastTxt.includes(await p.evaluate(() => t2('gAutoPend'))));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- [3] 自分でOFFにしていた端末 ---------- */
  console.log('[3] 自分で自動保存をOFFにしていた端末');
  {
    const { ctx, p, errors, posts } = await mkPage(b, {
      pre: () => { if (!sessionStorage.getItem('r5c')) { sessionStorage.setItem('r5c', '1'); localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: 'https://script.google.com/macros/s/old/exec', token: '', folder: 'x', auto: false, autoSet: true })); } },
    });
    await p.goto(env.URL + search); await p.waitForTimeout(1000);
    const s = await st(p);
    T.ok('ONにしない・接続テストも走らせない ' + JSON.stringify(s) + JSON.stringify(posts), s.cfg.url === GURL && s.cfg.auto === false && s.state === 'off' && !posts.some(x => x.ping));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- [4] ドライブの案内だけ閉じていた端末 ---------- */
  console.log('[4] ドライブ未設定の案内だけ閉じていた端末');
  {
    const { ctx, p, errors } = await mkPage(b, { pre: () => { localStorage.setItem('oral_exam_drvhint_off', '1'); } });
    await p.goto(env.URL); await p.waitForTimeout(400);
    T.ok('使い方の初回カードは出る', await p.isVisible('#examHowto'));
    T.ok('ドライブ未設定の案内はカードの中にも出さない', !(await p.isVisible('#drvHint')));
    T.ok('閉じるボタン（カード）は1つのまま', await p.evaluate(() => [...document.querySelectorAll('#examHowto button')].filter(x => /toggleHowto\(false\)|dismissDrvHint/.test(x.getAttribute('onclick') || '')).length) === 1);
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  // 対照：何も閉じていない初回は従来どおりカードの中に出る
  {
    const { ctx, p } = await mkPage(b);
    await p.goto(env.URL); await p.waitForTimeout(400);
    T.ok('（対照）初回はカードの中に案内が出る', await p.isVisible('#drvHint') && await p.evaluate(() => document.getElementById('drvHint').parentElement.id === 'examHowto'));
    await ctx.close();
  }

  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
