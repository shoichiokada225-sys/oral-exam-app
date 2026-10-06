/* 検査 2026-10-06【A-data】の回帰テスト。実行: node tests/audit-A-data.test.js
   H-1 古いバックアップの取り込みで、端末の新しい録音を古い録音で上書きしない（新規の試問の録音は入る）
   M-3 同じ端末の2タブで同じ試問：後から保存した側が丸ごと上書きしない／採点画面どうしも上書きしない／
       ほかのタブが開いている間は孤児録音の整理をしない／同じ試問を開いたら知らせる
   M-18 採点画面で合否・コメントを入れて0.3秒で閉じても残る
   M-19 録音が多いと試問単位で複数ファイルに分けて書き出す（全部まとめて読み込める）・失敗文言は「書き出し」
   L-5 出題の置き換えは別に確認する・自分の質問セットも書き出し/取り込みする・旧形式も読める
   L-7 date が数値の壊れたバックアップでも履歴が空にならない
   L-28 CSV・バックアップのファイル名の日付は端末の現地日付
   本物の GAS へは送らない（ドライブ設定なし・script.google は遮断）。 */
'use strict';
const env = require('./_env');
const fs = require('fs');
const c = env.counter();
const SK = 'oral_exam_sessions_v1';
const sessions = p => p.evaluate(k => (JSON.parse(localStorage.getItem(k) || 'null') || { sessions: [] }).sessions, SK);
const toastTxt = p => p.evaluate(() => document.getElementById('toast').textContent);
async function rec(p, id, ms) { await p.evaluate(i => toggleRec(i), id); await p.waitForTimeout(ms || 900); await p.evaluate(() => stopRec()); await p.waitForTimeout(600); }
function dialogs(p) {
  const h = { log: [], ans: () => true };
  p.on('dialog', d => { h.log.push(d.message()); if (d.type() === 'beforeunload') return d.accept(); return h.ans(d.message()) ? d.accept() : d.dismiss(); });
  return h;
}
const isScoredQ = m => m.includes('採点も確定');
async function open(ctx) {
  const { page, errors } = await env.newPage(ctx);
  await page.route('**/script.google*/**', r => r.abort());
  await page.goto(env.URL); await page.waitForTimeout(500);
  return { p: page, errors };
}
async function exportFiles(p) {
  const dls = []; const on = d => dls.push(d); p.on('download', on);
  await p.evaluate(() => exportBackup());
  await p.waitForTimeout(1500);
  p.off('download', on);
  const out = [];
  for (const d of dls) { const f = await d.path(); out.push({ name: d.suggestedFilename(), path: f, json: JSON.parse(fs.readFileSync(f, 'utf8')) }); }
  return out;
}
const audioSize = (p, k) => p.evaluate(async key => { const b = await getAudio(key); return b ? b.size : 0; }, k);

(async () => {
  const b = await env.launch();

  /* ---------- H-1 / L-5（書き出しに質問セット）---------- */
  {
    const ctx = await b.newContext();
    const { p, errors } = await open(ctx);
    const dg = dialogs(p); dg.ans = m => !isScoredQ(m);
    await p.fill('#fEe', 'Budi');
    await rec(p, 'q1', 700);
    await p.evaluate(() => saveSession()); await p.waitForTimeout(400);
    const sid = (await sessions(p))[0].id;
    await p.evaluate(() => { const q = getQuestionSets(); q.presets.push({ id: 'p1', name: '私のセット', cfg: JSON.parse(JSON.stringify(cfg)) }); saveQuestionSets(q); });
    const [bk] = await exportFiles(p);
    c.ok('L-5 書き出しに自分の質問セットが入る', !!bk && Array.isArray(bk.json.presets) && bk.json.presets.some(x => x.name === '私のセット'));
    const sizeOld = await audioSize(p, sid + '_q1');
    // 「続ける」で録り直して保存＝新しい版
    await p.evaluate(id => resumeExam(id), sid); await p.waitForTimeout(400);
    await rec(p, 'q1', 2500);
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    const sizeNew = await audioSize(p, sid + '_q1');
    c.ok('H-1 前提: 録り直しで録音が変わった ' + sizeOld + '→' + sizeNew, sizeNew !== sizeOld && sizeNew > 0);
    // 別の端末で作った試問をバックアップに足す（新規の試問の録音は取り込まれること）
    const bj = JSON.parse(JSON.stringify(bk.json));
    bj.sessions.push({ id: 'other-1', date: '2026-10-01', examinee: 'Siti', examiner: '', status: 'rec', createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', items: { q1: { hasAudio: true, score: null } } });
    bj.audio['other-1_q1'] = { mime: 'audio/webm', data: Buffer.from('hello-audio').toString('base64') };
    dg.log.length = 0;
    await p.setInputFiles('#bkFile', { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bj)) });
    await p.waitForTimeout(1200);
    c.ok('H-1 古いバックアップで端末の新しい録音を上書きしない ' + (await audioSize(p, sid + '_q1')), await audioSize(p, sid + '_q1') === sizeNew);
    c.ok('H-1 新規の試問の録音は取り込まれる', await audioSize(p, 'other-1_q1') === 11 && (await sessions(p)).some(s => s.id === 'other-1'));
    c.ok('L-5 出題が同じなら置き換えの確認は出ない ' + JSON.stringify(dg.log), !dg.log.some(m => m.includes('出題（試問項目）も')));
    c.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);

    /* L-5: 別の端末（出題が違う・セットなし）へ取り込む */
    const ctx2 = await b.newContext({ });
    const q = await open(ctx2); const d2 = dialogs(q.p);
    await q.p.evaluate(() => { cfg = freeCfg(); localStorage.setItem(CKEY, JSON.stringify(cfg)); buildExamCards(); });
    d2.ans = m => !m.includes('出題（試問項目）も'); // 置き換えはキャンセル
    await q.p.setInputFiles('#bkFile', { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk.json)) });
    await q.p.waitForTimeout(1000);
    c.ok('L-5 出題の置き換えを別に確認する ' + JSON.stringify(d2.log), d2.log.some(m => m.includes('出題（試問項目）も')));
    c.ok('L-5 キャンセルなら今の出題のまま', (await q.p.evaluate(() => cfg.items.map(i => i.id).join(','))) === 'f1,f2,f3');
    c.ok('L-5 自分の質問セットが取り込まれる', await q.p.evaluate(() => getQuestionSets().presets.some(x => x.name === '私のセット')));
    c.ok('L-5 試問は取り込まれる', (await sessions(q.p)).length === 1);
    // もう一度（同じセットを重ねない）・今度は置き換えを OK
    d2.ans = () => true; d2.log.length = 0;
    await q.p.setInputFiles('#bkFile', { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk.json)) });
    await q.p.waitForTimeout(1000);
    c.ok('L-5 同じ質問セットを重ねない', await q.p.evaluate(() => getQuestionSets().presets.filter(x => x.name === '私のセット').length) === 1);
    c.ok('L-5 OK なら出題を置き換える', (await q.p.evaluate(() => cfg.items.map(i => i.id).join(','))) === 'q1,q4,q5');
    // 旧形式（presets なし）も読める
    const old = JSON.parse(JSON.stringify(bk.json)); delete old.presets; old.sessions[0].id = 'old-format-1';
    old.audio = {}; old.sessions[0].items = { q1: { hasAudio: false, score: 'pass' } };
    await q.p.setInputFiles('#bkFile', { name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(old)) });
    await q.p.waitForTimeout(800);
    c.ok('L-5 旧形式のバックアップも読める', (await sessions(q.p)).some(s => s.id === 'old-format-1'));
    c.ok('JSエラーなし(2) ' + q.errors.join('|'), q.errors.length === 0);
    await ctx2.close(); await ctx.close();
  }

  /* ---------- L-7: date が数値の壊れたバックアップ ---------- */
  {
    const ctx = await b.newContext();
    const { p, errors } = await open(ctx); dialogs(p);
    const bad = { app: 'oral-exam-app', version: 1, sessions: [
      { id: 'bad-1', date: 20261005, examinee: 'Nam', status: 'scored', createdAt: 5, updatedAt: '2026-10-05T00:00:00Z', items: { q1: { hasAudio: 1, score: 'pass', comment: 7 } } },
      { id: 'good-1', date: '2026-10-04', examinee: 'Ari', status: 'rec', createdAt: '2026-10-04T00:00:00Z', updatedAt: '2026-10-04T00:00:00Z', items: { q1: { hasAudio: true, score: null } } }], audio: {} };
    await p.setInputFiles('#bkFile', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bad)) });
    await p.waitForTimeout(800);
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(400);
    const rows = await p.locator('#hList .hi').count();
    c.ok('L-7 壊れた型のバックアップでも履歴に2件出る（' + rows + '）', rows === 2);
    const s = (await sessions(p)).find(x => x.id === 'bad-1');
    c.ok('L-7 取り込み時に型をそろえる', s && s.date === '20261005' && s.items.q1.hasAudio === true && s.items.q1.comment === '7');
    c.ok('L-7 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- L-28: ファイル名の日付は現地日付 ---------- */
  {
    const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo' });
    const { p, errors } = await open(ctx); dialogs(p);
    await p.clock.setFixedTime(new Date('2026-10-05T23:30:00Z')); // 日本時間 10/6 08:30
    await p.evaluate(() => saveAll([{ id: 's-l28', date: '2026-10-06', examinee: 'Ari', status: 'rec', createdAt: '2026-10-05T23:30:00Z', updatedAt: '2026-10-05T23:30:00Z', items: { q1: { hasAudio: false, score: 'pass' } } }]));
    const [bk] = await exportFiles(p);
    c.ok('L-28 バックアップのファイル名が現地日付 ' + (bk && bk.name), bk && bk.name === 'oral_exam_backup_20261006.json');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => doCSV())]);
    c.ok('L-28 CSV のファイル名が現地日付 ' + dl.suggestedFilename(), dl.suggestedFilename() === 'oral_exam_20261006.csv');
    c.ok('L-28 録音ファイル名の時刻も現地 ' + await p.evaluate(() => localStamp()), (await p.evaluate(() => localStamp())).startsWith('2026100608'));
    c.ok('L-28 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-19: 分けて書き出す・まとめて読み込む・失敗文言 ---------- */
  {
    const ctx = await b.newContext();
    const { p, errors } = await open(ctx); dialogs(p);
    await p.evaluate(async () => {
      const ss = [];
      for (let i = 0; i < 3; i++) {
        const id = 'big-' + i; ss.push({ id, date: '2026-10-0' + (i + 1), examinee: 'P' + i, status: 'rec', createdAt: 'x', updatedAt: '2026-10-0' + (i + 1) + 'T00:00:00Z', items: { q1: { hasAudio: true, score: null }, q4: { hasAudio: true, score: null } } });
        await putAudio(id + '_q1', new Blob([new Uint8Array(30000).fill(i + 1)], { type: 'audio/webm' }));
        await putAudio(id + '_q4', new Blob([new Uint8Array(20000).fill(i + 7)], { type: 'audio/webm' }));
      }
      saveAll(ss); BK_PART_BYTES = 60000;
    });
    const files = await exportFiles(p);
    c.ok('M-19 録音が多いと分けて書き出す ' + files.map(f => f.name).join(','), files.length === 3 && files.every((f, i) => f.name.endsWith('_' + (i + 1) + 'of3.json')));
    c.ok('M-19 各ファイルに試問と録音がそろう', files.every(f => f.json.sessions.length === 1 && Object.keys(f.json.audio).length === 2));
    c.ok('M-19 分けた旨を知らせる', (await toastTxt(p)).includes('3個のファイル'));
    // 新しい端末でまとめて読み込む
    const ctx2 = await b.newContext();
    const q = await open(ctx2); dialogs(q.p);
    await q.p.setInputFiles('#bkFile', files.map(f => f.path));
    await q.p.waitForTimeout(1500);
    const sizes = await q.p.evaluate(async () => { const o = []; for (let i = 0; i < 3; i++) { o.push((await getAudio('big-' + i + '_q1') || {}).size, (await getAudio('big-' + i + '_q4') || {}).size); } return o; });
    c.ok('M-19 全部まとめて読み込める ' + sizes.join(','), (await sessions(q.p)).length === 3 && sizes.join(',') === '30000,20000,30000,20000,30000,20000');
    const same = await q.p.evaluate(async () => { const b = await getAudio('big-2_q1'); const a = new Uint8Array(await b.arrayBuffer()); return a[0] === 3 && a[29999] === 3; });
    c.ok('M-19 録音の中身が元どおり', same);
    // 失敗文言は「書き出し」
    await p.evaluate(() => { window.blobToB64 = () => Promise.reject(new RangeError('Invalid string length')); });
    await p.evaluate(() => exportBackup()); await p.waitForTimeout(300);
    const tt = await toastTxt(p);
    c.ok('M-19 書き出しの失敗は「書き出しに失敗」と出す ' + tt, tt.includes('書き出しに失敗') && !tt.includes('読み込み'));
    c.ok('M-19 JSエラーなし ' + errors.join('|') + q.errors.join('|'), errors.length === 0 && q.errors.length === 0);
    await ctx2.close(); await ctx.close();
  }

  /* ---------- M-18: 採点の最後の入力を閉じる直前に保存 ---------- */
  {
    const ctx = await b.newContext();
    const { p, errors } = await open(ctx); const dg = dialogs(p); dg.ans = m => !isScoredQ(m);
    await p.fill('#fEe', 'Siti');
    await rec(p, 'q1', 700); await rec(p, 'q4', 700);
    await p.evaluate(() => saveSession()); await p.waitForTimeout(400);
    const sid = (await sessions(p))[0].id;
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(300);
    await p.evaluate(id => openScore(id), sid); await p.waitForTimeout(800);
    await p.locator('.sb[data-id="q4"]').last().click(); // 不合格
    await p.fill('#cm-q4', '声が小さい');
    await p.waitForTimeout(200);
    await p.reload(); await p.waitForTimeout(600);
    const it = (await sessions(p)).find(s => s.id === sid).items.q4;
    c.ok('M-18 0.2秒後に閉じても合否・コメントが残る ' + JSON.stringify({ s: it.score, c: it.comment }), it.score === 'fail' && it.comment === '声が小さい');
    c.ok('M-18 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-3: 2つのタブ ---------- */
  {
    const ctx = await b.newContext();
    const A = await open(ctx); const da = dialogs(A.p); da.ans = m => !isScoredQ(m);
    await A.p.fill('#fEe', 'グエン'); await A.p.dispatchEvent('#fEe', 'change');
    await rec(A.p, 'q1', 700);
    const B = await open(ctx); const db = dialogs(B.p); db.ans = m => !isScoredQ(m);
    await B.p.waitForTimeout(500);
    c.ok('M-3 前提: タブBは同じ試問を開いている', await B.p.evaluate(() => cur.id) === await A.p.evaluate(() => cur.id));
    c.ok('M-3 同じ試問を開いたことを知らせる', (await toastTxt(B.p)).includes('別のタブでも開いて'));
    await rec(B.p, 'q4', 700);
    await B.p.evaluate(() => { cur.items.q4.score = 'pass'; cur.items.q1.score = 'pass'; saveDraft(); });
    await B.p.evaluate(() => saveSession()); await B.p.waitForTimeout(500);
    await rec(A.p, 'q5', 700);
    await A.p.evaluate(() => saveSession()); await A.p.waitForTimeout(500);
    const s = (await sessions(A.p))[0];
    const view = Object.fromEntries(Object.entries(s.items).map(([k, v]) => [k, (v.hasAudio ? 'a' : '-') + (v.score || '')]));
    c.ok('M-3 後から保存したタブが先の録音・合否を消さない ' + JSON.stringify(view), (await sessions(A.p)).length === 1 && view.q1 === 'apass' && view.q4 === 'apass' && view.q5 === 'a');
    c.ok('M-3 統合したことを知らせる', (await toastTxt(A.p)).includes('別のタブで保存された内容と統合'));
    const sid = s.id;

    // 採点画面どうし：Bで q1 を不合格、Aで q5 を合格 → 両方残る
    for (const T of [A, B]) { await T.p.click('.tabs button[data-pg="pgScore"]'); await T.p.waitForTimeout(200); await T.p.evaluate(id => openScore(id), sid); await T.p.waitForTimeout(600); }
    await B.p.locator('.sb[data-id="q1"]').last().click(); await B.p.waitForTimeout(300);
    await A.p.locator('.sb[data-id="q5"]').first().click(); await A.p.waitForTimeout(300);
    const s2 = (await sessions(A.p))[0].items;
    c.ok('M-3 採点画面どうしで相手の合否を上書きしない ' + JSON.stringify([s2.q1.score, s2.q5.score]), s2.q1.score === 'fail' && s2.q5.score === 'pass');
    c.ok('M-3 画面も統合した内容に描き直す', await A.p.locator('.sb[data-id="q1"].sel').getAttribute('data-s') === 'fail');

    // 孤児録音の整理：ほかのタブ（A・B）が開いている間はしない
    await A.p.evaluate(() => putAudio('zz-orphan_q1', new Blob(['x'])));
    const C = await open(ctx); const dc = dialogs(C.p); dc.ans = () => false;
    await C.p.waitForTimeout(3500);
    c.ok('M-3 ほかのタブが開いている間は不要録音の整理を勧めない ' + JSON.stringify(dc.log), !dc.log.some(m => m.includes('どのセッションにも属さない')));
    c.ok('M-3 録音は残る', await audioSize(C.p, sid + '_q4') > 0 && await audioSize(C.p, 'zz-orphan_q1') === 1);
    await A.p.close(); await B.p.close(); await C.p.close();
    const D = await open(ctx); const dd = dialogs(D.p); dd.ans = () => false;
    await D.p.waitForTimeout(3500);
    c.ok('M-3 ほかのタブが無ければ従来どおり整理を勧める ' + JSON.stringify(dd.log), dd.log.some(m => m.includes('どのセッションにも属さない')));
    c.ok('M-3 JSエラーなし ' + [A, B, C, D].map(x => x.errors.join('|')).join(''), [A, B, C, D].every(x => x.errors.length === 0));
    await ctx.close();
  }

  await b.close();
  c.done();
})().catch(e => { console.error(e); process.exit(2); });
