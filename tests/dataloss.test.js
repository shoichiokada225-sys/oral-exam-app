/* データを黙って失わないことの回帰テスト（R3 検証 NG の是正）。実行: node tests/dataloss.test.js
   F: 端末保存(IndexedDB)に失敗した録音（failedTakes＝メモリ上だけの唯一の写し）が
      「試問を保存」「リセット」「閉じる・再読み込み」で確認なしに消えない
   G: 孤児録音GCは下書きセッションの録音を、項目キーが下書きに無くても消さない（本物の孤児は消す）
   H: 履歴の削除は、一覧の保存に失敗したら録音も消さない
   I: バックアップ取り込みで一覧の保存に失敗したら、質問設定を差し替えず「取り込みました」とも言わない
   J: 試問保存失敗の常設案内 #saveErr が言語切替に追従する
   K: 試問日の既定値は端末の現地日付（UTC基準で前日にならない）
   Googleドライブには送らない（設定なし）。 */
'use strict';
const env = require('./_env');
const c = env.counter();
const SK = 'oral_exam_sessions_v1';
const toastTxt = p => p.evaluate(() => document.getElementById('toast').textContent);
const draft = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_draft_v1') || 'null'));
const sessions = p => p.evaluate(k => (JSON.parse(localStorage.getItem(k) || 'null') || { sessions: [] }).sessions, SK);
async function rec(p, id) { await p.click('#rb-' + id); await p.waitForTimeout(900); await p.click('#rb-' + id); await p.waitForTimeout(900); }
/* setItem(SK) を失敗させる／戻す */
const breakSave = p => p.evaluate(k => { const o = window.__origSet || Storage.prototype.setItem; window.__origSet = o; Storage.prototype.setItem = function (kk, v) { if (kk === k) { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return o.call(this, kk, v); }; }, SK);
const fixSave = p => p.evaluate(() => { if (window.__origSet) Storage.prototype.setItem = window.__origSet; });
/* ダイアログを記録し、応答は ans(message) で決める */
function dialogs(p) {
  const log = []; const h = { log, ans: () => false };
  p.on('dialog', d => { log.push(d.type() + ':' + d.message()); if (d.type() === 'beforeunload') return d.accept(); return h.ans(d.message()) ? d.accept() : d.dismiss(); });
  return h;
}
const hasIdb = (p, key) => p.evaluate(async k => !!(await getAudio(k)), key);

(async () => {
  const b = await env.launch();

  /* ---------- F: 端末保存に失敗した録音を黙って捨てない ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    const dg = dialogs(p);
    await p.goto(env.URL); await p.waitForTimeout(300);
    const q2 = await p.evaluate(() => getItems()[1].id);
    await p.evaluate(() => { window.__putAudio = putAudio; window.putAudio = () => { const e = new Error('full'); e.name = 'QuotaExceededError'; return Promise.reject(e); }; });
    await rec(p, 'q1');
    await p.evaluate(() => { window.putAudio = window.__putAudio; });
    await rec(p, q2);
    c.ok('F 前提: q1 は⚠保存失敗・取り戻し導線あり', await p.locator('#rf-q1').count() === 1 && (await p.textContent('#rs-q1')).includes('⚠'));
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン');
    // 閉じる・再読み込みを止める（録音中でなくても）
    const bu = await p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
    c.ok('F 未保存の録音があれば beforeunload で離脱を止める', bu === true);
    // 試問を保存 → 確認が出る。キャンセルなら保存しない
    dg.log.length = 0; dg.ans = () => false;
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(400);
    const m1 = dg.log.find(x => x.includes('端末に保存できていない録音が1件'));
    c.ok('F 試問を保存で確認が出る（件数つき） ' + JSON.stringify(dg.log), !!m1);
    c.ok('F キャンセルなら保存しない・「保存しました」と出さない', (await sessions(p)).length === 0 && !(await toastTxt(p)).includes('試問を保存しました'));
    c.ok('F キャンセル後も q1 の保存し直す／ダウンロードが残る', await p.locator('#rfr-q1').count() === 1 && await p.locator('#rfd-q1[download]').count() === 1);
    c.ok('F キャンセル後も受験者欄・下書きが残る', await p.inputValue('#fEe') === 'グエン' && !!(await draft(p)));
    // リセット：件数に未保存の録音を含めて知らせる。キャンセルなら消えない
    dg.log.length = 0;
    await p.click('button:has-text("リセット")'); await p.waitForTimeout(300);
    c.ok('F リセットの確認に未保存の録音件数 ' + JSON.stringify(dg.log), dg.log.some(x => x.includes('端末に保存できていない録音1件も失われます') && x.includes('録音1件を削除')));
    c.ok('F リセットをキャンセルすれば q1 の導線が残る', await p.locator('#rf-q1').count() === 1);
    // 保存し直してから保存すれば確認なしで q1 も録音込みで保存される
    await p.click('#rfr-q1'); await p.waitForTimeout(400);
    c.ok('F 保存し直し後は beforeunload で止めない', await p.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return !e.defaultPrevented; }));
    dg.log.length = 0;
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(400);
    const s = await sessions(p);
    c.ok('F 保存し直し後は確認なしで保存・q1 も録音あり ' + JSON.stringify(dg.log), !dg.log.some(x => x.includes('端末に保存できていない')) && s.length === 1 && s[0].items.q1 && s[0].items.q1.hasAudio);
    c.ok('F JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }
  /* F2: 分かったうえで「それでも保存」を選べば保存でき、次の試問に失敗表示を持ち越さない */
  {
    const { page: p, errors } = await env.newPage(b);
    const dg = dialogs(p);
    await p.goto(env.URL); await p.waitForTimeout(300);
    const q2 = await p.evaluate(() => getItems()[1].id);
    await p.evaluate(() => { window.__putAudio = putAudio; window.putAudio = () => Promise.reject(new Error('full')); });
    await rec(p, 'q1');
    await p.evaluate(() => { window.putAudio = window.__putAudio; });
    await rec(p, q2);
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'ブディ');
    dg.ans = m => m.includes('端末に保存できていない');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(400);
    const s = await sessions(p);
    c.ok('F2 承諾すれば保存される', s.length === 1 && s[0].examinee === 'ブディ' && (await toastTxt(p)).includes('試問を保存しました'));
    c.ok('F2 新しい試問に失敗表示を持ち越さない・離脱も止めない', await p.locator('#rf-q1').count() === 0 && await p.evaluate(() => pendingTakes().length === 0 && Object.keys(failedTakes).length === 0));
    // リセットでも承諾すれば手放す
    await p.evaluate(() => { window.putAudio = () => Promise.reject(new Error('full')); });
    await rec(p, 'q1');
    await p.evaluate(() => { window.putAudio = window.__putAudio; });
    dg.ans = () => true; dg.log.length = 0;
    await p.click('button:has-text("リセット")'); await p.waitForTimeout(300);
    c.ok('F2 録音0件でも未保存の録音はリセット確認に出る ' + JSON.stringify(dg.log), dg.log.some(x => x.includes('端末に保存できていない録音1件')));
    c.ok('F2 リセット承諾で手放す', await p.locator('#rf-q1').count() === 0 && await p.evaluate(() => Object.keys(failedTakes).length === 0));
    c.ok('F2 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- G: 孤児GCは下書きセッションの録音を消さない ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    const dg = dialogs(p);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await rec(p, 'q1');
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン');
    await p.waitForTimeout(2500); // 初回起動のGCを済ませる
    const sid = await p.evaluate(() => cur.id);
    // 下書きの項目に無いキー（書込途中の終了・保存失敗でずれた録音）と、どこにも属さない本物の孤児
    await p.evaluate(async sid => { const bl = new Blob(['x'], { type: 'audio/webm' }); await putAudio(sid + '_zz', bl); await putAudio('deadbeef-0000_q1', bl); }, sid);
    c.ok('G 前提: 下書きの items に zz は無い', !((await draft(p)).items.zz));
    dg.log.length = 0; dg.ans = m => /どのセッションにも属さない/.test(m);
    await p.reload(); await p.waitForTimeout(3300);
    const gc = dg.log.filter(x => /どのセッションにも属さない/.test(x));
    c.ok('G 本物の孤児1件だけを削除確認する ' + JSON.stringify(gc), gc.length === 1 && /1/.test(gc[0]) && !/2/.test(gc[0]));
    c.ok('G 下書きセッションの録音(zz)は残る', await hasIdb(p, sid + '_zz'));
    c.ok('G 下書きの録音(q1)は残る', await hasIdb(p, sid + '_q1'));
    c.ok('G 本物の孤児は消える', !(await hasIdb(p, 'deadbeef-0000_q1')));
    c.ok('G JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- H: 履歴の削除は一覧の保存が成功してから録音を消す ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    const dg = dialogs(p);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await rec(p, 'q1');
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン');
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(400);
    const sid = (await sessions(p))[0].id;
    c.ok('H 前提: 保存済みの録音がある', await hasIdb(p, sid + '_q1'));
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(300);
    await p.click('#hList .hi'); await p.waitForTimeout(500);
    await breakSave(p);
    dg.ans = () => true;
    await p.click('#moBody button:has-text("削除")'); await p.waitForTimeout(600);
    c.ok('H 保存失敗なら録音を消さない', await hasIdb(p, sid + '_q1'));
    c.ok('H 保存失敗なら一覧にも残る・「削除しました」と出さない', (await sessions(p)).length === 1 && !(await toastTxt(p)).includes('削除しました'));
    await fixSave(p);
    await p.click('#moBody button:has-text("削除")'); await p.waitForTimeout(600);
    c.ok('H 保存できれば一覧から消え録音も消える', (await sessions(p)).length === 0 && !(await hasIdb(p, sid + '_q1')));
    c.ok('H JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- I: 取り込みの保存失敗で設定を差し替えない ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    const dg = dialogs(p);
    await p.goto(env.URL); await p.waitForTimeout(300);
    const before = await p.evaluate(() => localStorage.getItem('oral_exam_items_v1') || JSON.stringify(cfg));
    const bk = {
      app: 'oral-exam-app', version: 1, exportedAt: new Date().toISOString(),
      cfg: { sections: [{ id: 'sx', name: '取り込み節' }], items: [{ id: 'zq', secId: 'sx', name: '取り込み質問', desc: '' }] },
      sessions: [{ id: 'bk1', date: '2026-09-01', examiner: 'A', examinee: 'B', items: { zq: { draft: '' } }, status: 'rec', updatedAt: '2026-09-01T00:00:00Z' }],
      audio: {}
    };
    await breakSave(p);
    dg.ans = () => true;
    await p.setInputFiles('#bkFile', { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) });
    await p.waitForTimeout(600);
    const after = await p.evaluate(() => localStorage.getItem('oral_exam_items_v1') || JSON.stringify(cfg));
    c.ok('I 保存失敗なら質問設定を差し替えない', after === before && await p.evaluate(() => !getItems().some(it => it.id === 'zq')) && await p.locator('#q-zq').count() === 0);
    const tt = await toastTxt(p);
    c.ok('I 「取り込みました」と出さず保存失敗を出す: ' + tt, !tt.includes('件を取り込みました') && tt.includes('保存に失敗'));
    await fixSave(p);
    await p.setInputFiles('#bkFile', { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) });
    await p.waitForTimeout(600);
    c.ok('I 保存できれば取り込まれる', (await sessions(p)).some(s => s.id === 'bk1') && (await toastTxt(p)).includes('件を取り込みました'));
    c.ok('I JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- J: #saveErr が言語切替に追従 ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    const dg = dialogs(p);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await rec(p, 'q1');
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン');
    await breakSave(p);
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(400);
    c.ok('J 前提: 日本語の案内', (await p.textContent('#saveErr')).includes('試問を保存できませんでした'));
    const want = await p.evaluate(() => ({ en: TX2.en.saveErrMsg, vi: TX2.vi.saveErrMsg, id: TX2.id.saveErrMsg, enB: TX2.en.retrySave }));
    await p.click('.lsw button:has-text("EN")'); await p.waitForTimeout(200);
    const en = await p.textContent('#saveErr');
    c.ok('J EN に切り替えると英語', en.includes(want.en) && en.includes(want.enB) && !en.includes('試問を保存できませんでした'));
    await p.click('.lsw button:has-text("VI")'); await p.waitForTimeout(200);
    c.ok('J VI', (await p.textContent('#saveErr')).includes(want.vi));
    await p.click('.lsw button:has-text("ID")'); await p.waitForTimeout(200);
    c.ok('J ID', (await p.textContent('#saveErr')).includes(want.id));
    c.ok('J 案内は1つだけ・ボタン2つ', await p.locator('#saveErr').count() === 1 && await p.locator('#saveErr button').count() === 2);
    await fixSave(p);
    await p.click('.lsw button:has-text("JP")'); await p.waitForTimeout(200);
    c.ok('J 未保存録音の文言が4言語に揃う', await p.evaluate(() => ['pendTakeSave', 'pendTakeReset'].every(k => ['ja', 'en', 'vi', 'id'].every(L => TX2[L][k] && TX2[L][k].includes('{n}')))));
    c.ok('J JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- K: 試問日の既定値は現地日付（JST 朝7時＝UTC前日22時） ---------- */
  {
    const ctx = await b.newContext({ timezoneId: 'Asia/Tokyo' });
    const { page: p, errors } = await env.newPage(ctx);
    await p.addInitScript(() => {
      const R = Date, fixed = R.UTC(2026, 8, 23, 22, 0, 0); // = 2026-09-24 07:00 JST
      class D extends R { constructor(...a) { if (a.length) super(...a); else super(fixed); } static now() { return fixed; } }
      window.Date = D;
    });
    await p.goto(env.URL); await p.waitForTimeout(300);
    c.ok('K JST 07:00 の試問日は 2026-09-24 ' + await p.inputValue('#fDate'), await p.inputValue('#fDate') === '2026-09-24');
    c.ok('K JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  await b.close();
  c.done();
})().catch(e => { console.error(e); process.exit(2); });
