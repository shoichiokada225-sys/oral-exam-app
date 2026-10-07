/* 既定の保存先（drive.js applyDefaultDrive・2026-09-29）。実行: node tests/drive-default.test.js
   [1] 何も設定していない端末 → 開いただけで保存先（社長のドライブ）・合言葉・自動保存ONが入る
   [2] 自分の保存先をすでに入れている端末 → 触らない
   [3] 既定が入った後に自分で保存先を消した端末 → 開き直しても入れ直さない
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
'use strict';
const env = require('./_env');
const T = env.counter();
const MINE = 'https://script.google.com/macros/s/mine/exec';

async function mkPage(b, pre) {
  const ctx = await b.newContext({ viewport: { width: 375, height: 740 } });
  const { page: p, errors } = await env.newPage(ctx);
  await p.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: '{"ok":true,"msg":"mock"}' }));
  if (pre) await p.addInitScript(pre);
  return { ctx, p, errors };
}
const st = p => p.evaluate(() => ({ cfg: JSON.parse(localStorage.getItem('oral_exam_google_v1') || 'null'), state: driveState() }));

(async () => {
  const b = await env.launch({ driveDefault: true });

  console.log('[1] 何も設定していない端末');
  {
    const { ctx, p, errors } = await mkPage(b);
    await p.goto(env.URL); await p.waitForTimeout(400);
    const s = await st(p);
    T.ok('保存先が入る ' + JSON.stringify(s.cfg), s.cfg && /^https:\/\/script\.google\.com\/macros\/s\/AKfycbxup.+\/exec$/.test(s.cfg.url));
    T.ok('合言葉なし（2026-10-07〜）・フォルダが入る', s.cfg && !s.cfg.token && s.cfg.folder === '口頭試問音声');
    T.ok('合言葉の欄は出さない（display:none）', await p.evaluate(() => document.getElementById('gToken').style.display === 'none' && document.querySelector('label[for="gToken"]').style.display === 'none'));
    // 古い合言葉 OOIRI が残る端末：外れる／別の GAS を設定した端末：欄を出し合言葉も残す
    const r = await p.evaluate(() => { const K = 'oral_exam_google_v1'; const g0 = JSON.parse(localStorage.getItem(K)); localStorage.setItem(K, JSON.stringify(Object.assign({}, g0, { token: 'OOIRI' }))); syncTokenField(); const a = JSON.parse(localStorage.getItem(K)).token; localStorage.setItem(K, JSON.stringify(Object.assign({}, g0, { url: 'https://script.google.com/macros/s/OTHER/exec', token: 'x' }))); syncTokenField(); const b = document.getElementById('gToken').style.display, c = JSON.parse(localStorage.getItem(K)).token; localStorage.setItem(K, JSON.stringify(g0)); syncTokenField(); return { a, b, c }; });
    T.ok('古い合言葉は外れる・別の GAS なら欄を出して合言葉も残す ' + JSON.stringify(r), r.a === '' && r.b === '' && r.c === 'x');
    T.ok('自動保存ON（driveState=on） ' + s.state, s.cfg && s.cfg.auto === true && s.state === 'on');
    T.ok('ドライブ未設定の案内は出ない', !(await p.isVisible('#drvHint')));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  console.log('[2] 自分の保存先をすでに入れている端末');
  {
    const { ctx, p } = await mkPage(b, `(()=>{if(!localStorage.getItem('oral_exam_google_v1'))localStorage.setItem('oral_exam_google_v1',JSON.stringify({url:'${MINE}',auto:false,autoSet:true}))})()`);
    await p.goto(env.URL); await p.waitForTimeout(400);
    const s = await st(p);
    T.ok('保存先は自分のまま・自動保存OFFのまま ' + JSON.stringify(s.cfg), s.cfg.url === MINE && s.cfg.auto === false && !s.cfg.token);
    await ctx.close();
  }

  console.log('[3] 既定が入った後に自分で保存先を消した端末');
  {
    const { ctx, p } = await mkPage(b);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await p.evaluate(() => localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: '', auto: false, autoSet: true })));
    await p.reload(); await p.waitForTimeout(400);
    const s = await st(p);
    T.ok('入れ直さない ' + JSON.stringify(s.cfg), s.cfg.url === '' && s.cfg.auto === false);
    await ctx.close();
  }

  console.log('[4] 送信がCORSの事前確認を起こさない（09-24〜09-29 全送信失敗の再発防止）');
  {
    const src = require('fs').readFileSync(require('path').join(env.ROOT, 'js', 'drive.js'), 'utf8').replace(/\/\/.*$/gm, '');
    T.ok('XMLHttpRequest の upload に監視を付けていない', !/\.upload\s*\.\s*(on\w+|addEventListener)/.test(src) && !/x\.upload\s*\)/.test(src));
    T.ok('Content-Type は text/plain（事前確認の要らない形）', /setRequestHeader\('Content-Type','text\/plain/.test(src));
  }

  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
