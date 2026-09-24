/* 辛口レビュー R4 検証NGの修正（R5）の回帰テスト。実行: node tests/r5fix.test.js
   [1] バックアップ取り込み後の「項目を保存」で保存済みセットが黙って上書きされない（activeIdを外す）
   [2] 録音していない問の○を合格数に混ぜない（採点途中ラベル・確定待ちラベル・保存時の確定案内）
   [3] カードの✓(.qc.done)は録音と○×の両方がそろったときだけ
   [4] 録音0件のうちは「合否 0 / 録音 0」を出さない・上書き保存の残骸(qsOverwriteSel/qsOver)が無い
   Googleドライブ送信は使わない（ドライブ設定なし） */
const env = require('./_env');
const fs = require('fs'), path = require('path');
const T = env.counter();
(async () => {
  const b = await env.launch();
  const { page: p, errors } = await env.newPage(b);
  const dialogs = [];
  p.on('dialog', async d => { dialogs.push(d.message()); await d.accept(); });
  await p.goto(env.URL); await p.waitForTimeout(300);
  const tab = async pg => { await p.click(`.tabs button[data-pg="${pg}"]`); await p.waitForTimeout(250); };

  console.log('[1] 取り込み後の項目を保存でセットA農場を上書きしない');
  await p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('oral_exam_items_v1') || 'null') || defaultCfg();
    localStorage.setItem('oral_exam_presets_v1', JSON.stringify({ presets: [{ id: 'set_A', name: 'A農場', cfg: c }], activeId: 'set_A' }));
  });
  await p.reload(); await p.waitForTimeout(300);
  const origA = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_presets_v1')).presets[0].cfg.items.map(i => i.name));
  const bk = { app: 'oral-exam-app', sessions: [], cfg: { sections: [{ id: 's1', name: '輸入' }], items: [{ id: 'imp1', secId: 's1', name: '輸入項目', desc: '' }] } };
  const tmp = path.join(require('os').tmpdir(), 'oral_r5_bk_' + process.pid + '.json');
  fs.writeFileSync(tmp, JSON.stringify(bk));
  await tab('pgCfg');
  await p.setInputFiles('#bkFile', tmp); await p.waitForTimeout(600);
  fs.unlinkSync(tmp);
  T.ok('取り込み後の項目は輸入項目', await p.evaluate(() => getItems().map(i => i.name).join()) === '輸入項目');
  T.ok('取り込み後は activeId=null', await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_presets_v1')).activeId) === null);
  T.ok('設定画面に「現在のセット: A農場」を出さない', !(await p.textContent('#qsetArea')).includes('現在のセット: A農場'));
  const inp = p.locator('#cfgArea .cfg-item input[type="text"]').first();
  await inp.fill('輸入項目改'); await inp.dispatchEvent('change');
  await p.click('#pgCfg button[onclick="saveCfg()"]'); await p.waitForTimeout(200);
  const tt = await p.textContent('#toast');
  T.ok('トーストにA農場が出ない: ' + tt, !tt.includes('A農場'));
  const afterA = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_presets_v1')).presets[0]);
  T.ok('セットA農場の中身は元のまま', JSON.stringify(afterA.cfg.items.map(i => i.name)) === JSON.stringify(origA) && afterA.name === 'A農場');

  console.log('[2] 未録音の○を合格数に混ぜない');
  const r = await p.evaluate(() => {
    const it = (a, s) => Object.assign({ hasAudio: a }, s ? { score: s } : {});
    const base = { id: 'x1', date: '2026-09-24', examiner: '岡田', examinee: 'A', status: 'recorded', createdAt: '', updatedAt: '' };
    const part = Object.assign({}, base, { items: { q1: it(true, 'pass'), q4: it(true), q5: it(false, 'pass') } });
    const full = Object.assign({}, base, { items: { q1: it(true, 'pass'), q5: it(false, 'pass'), q6: it(false, 'fail') } });
    const only = Object.assign({}, base, { items: { q1: it(true), q5: it(false, 'pass') } });
    return { part: pendLbl(part), full: pendLbl(full), fullCls: rowRes(full).cls, only: pendLbl(only), onlyBadge: rowRes(only).badge };
  });
  T.ok('採点途中は「合格1・判定1/録音2」: ' + r.part, r.part === '合格1・判定1/録音2');
  T.ok('確定待ちは録音した問だけ「1/1（未確定）」: ' + r.full, r.full === '1/1（未確定）');
  T.ok('確定待ちの色は録音した問の合否（全問合格=a5）', /\ba5\b/.test(r.fullCls));
  T.ok('録音した問に○×が無ければ合否ラベルなし', r.only === '' && !/採点途中/.test(r.onlyBadge));

  console.log('[3] カードの✓は録音と○×の両方');
  await p.evaluate(() => { localStorage.setItem('oral_exam_cfg3_migrated', '1'); });
  await p.evaluate(() => { resetCfg(); }); await p.waitForTimeout(100);
  await tab('pgExam');
  const ids = await p.evaluate(() => getItems().map(i => sanitizeId(i.id)));
  const [a1, a2, a3] = ids;
  T.ok('録音0件では「合否 0 / 録音 0」を出さない', !(await p.textContent('#epPf')).includes('合否') && !(await p.isVisible('#epPf')));
  await p.click('#rb-' + a1); await p.waitForTimeout(1000); await p.click('#rb-' + a1); await p.waitForTimeout(1200);
  T.ok('録音しただけでは✓なし', !(await p.getAttribute('#q-' + a1, 'class')).includes('done'));
  T.ok('録音1件で合否の進捗が出る', (await p.textContent('#epPf')).includes('合否 0 / 録音 1'));
  await p.click('#vp-' + a1); await p.waitForTimeout(150);
  T.ok('○を付けると✓', (await p.getAttribute('#q-' + a1, 'class')).split(/\s+/).includes('done'));
  await p.waitForTimeout(450); // R8: 同じボタンの500ms以内の再押下は二度押しとして無視するため、間を空けて押す
  await p.click('#vp-' + a1); await p.waitForTimeout(150);
  T.ok('○を外すと✓も外れる', !(await p.getAttribute('#q-' + a1, 'class')).split(/\s+/).includes('done'));
  await p.click('#vp-' + a3); await p.waitForTimeout(150);
  T.ok('未録音で○だけでは✓なし', !(await p.getAttribute('#q-' + a3, 'class')).split(/\s+/).includes('done'));
  await p.waitForTimeout(250); // R8: 同じボタンの500ms以内の再押下は無視（上の解除から間を空ける）
  await p.click('#vp-' + a1); await p.waitForTimeout(150);

  console.log('[2b] 未録音に○があるときは保存時に採点確定を勧めない');
  await p.fill('#fEr', '岡田'); await p.fill('#fEe', '受験者R5');
  dialogs.length = 0;
  await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(500);
  T.ok('確定の確認を出さない: ' + dialogs.join('|'), !dialogs.some(m => m.includes('採点も確定')));
  const saved = await p.evaluate(() => getAll().find(s => s.examinee === '受験者R5'));
  T.ok('録音のみで保存（未確定のまま）', saved && saved.status !== 'scored');
  const savedLbl = saved ? await p.evaluate(s => pendLbl(s), saved) : '';
  T.ok('一覧ラベルは録音した問だけ「1/1（未確定）」: ' + savedLbl, savedLbl === '1/1（未確定）');
  const csvRow = await p.evaluate(s => rowRes(s).lbl, saved);
  T.ok('行の結果ラベルも同じ', csvRow === '1/1（未確定）');

  console.log('[4] 上書き保存の残骸');
  const src = ['js/ui-cfg.js', 'js/ui-core.js'].map(f => fs.readFileSync(path.join(env.ROOT, f), 'utf8')).join('\n');
  T.ok('qsOverwriteSel が無い', !/qsOverwriteSel/.test(src));
  T.ok('qsOver キーが無い', !/\bqsOver:/.test(src));
  T.ok('ページエラーなし ' + errors.join('|'), errors.length === 0);
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
