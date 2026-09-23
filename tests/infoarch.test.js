/* 辛口レビュー R4（情報設計）の回帰テスト。実行: node tests/infoarch.test.js
   [1] 設定「項目を保存」が使用中の試問セットにも残る（切り替えて戻っても消えない）・上書き保存ボタンなし・確認文
   [2] 保存時に採点まで確定した試問は「履歴」へ案内（採点タブを点滅させない）
   [3] ○×が途中までの試問は「採点途中」＋「合格1・判定1/録音2」（全問判定済みに見せない）
   [4] 試問画面の進捗：録音だけでは完了にしない・「合否 j / 録音 n」・次の未判定へ
   [5] 使い方の案内（howto）に○×の手順と「1人ずつ保存」が4言語で入っている
   Googleドライブ送信は使わない（ドライブ設定なし） */
const env = require('./_env');
const T = env.counter();
const it = o => Object.assign({ hasAudio: true }, o);
const S = (id, ee, date, status, items) => ({ id, date, examiner: '岡田', examinee: ee, status, items, overall: '', createdAt: date + 'T00:00:00Z', updatedAt: date + 'T00:00:00Z' });
(async () => {
  const b = await env.launch();
  const { page: p, errors } = await env.newPage(b);
  const dialogs = []; let promptAns = null;
  p.on('dialog', async d => { dialogs.push(d.message()); if (d.type() === 'prompt') await d.accept(promptAns || ''); else await d.accept(); });
  await p.goto(env.URL); await p.waitForTimeout(300);
  const ids = await p.evaluate(() => getItems().map(i => i.id));
  const tab = async pg => { await p.click(`.tabs button[data-pg="${pg}"]`); await p.waitForTimeout(250); };
  const toastTxt = () => p.textContent('#toast');

  console.log('[1] 項目を保存 → 使用中のセットにも反映');
  await p.evaluate(() => {
    const c = JSON.parse(localStorage.getItem('oral_exam_items_v1') || 'null') || defaultCfg();
    localStorage.setItem('oral_exam_presets_v1', JSON.stringify({ presets: [{ id: 'set_A', name: 'A農場', cfg: c }, { id: 'set_B', name: 'B農場', cfg: JSON.parse(JSON.stringify(c)) }], activeId: 'set_A' }));
  });
  await p.reload(); await p.waitForTimeout(300);
  await tab('pgCfg');
  T.ok('「上書き保存」ボタンがない', await p.locator('#qsetArea button', { hasText: '上書き保存' }).count() === 0);
  T.ok('「名前を付けて別のセットに保存」がある', await p.locator('#qsetArea button', { hasText: '名前を付けて別のセットに保存' }).count() === 1);
  const inp = p.locator('#cfgArea .cfg-item input[type="text"]').first();
  await inp.fill('A農場専用の質問'); await inp.dispatchEvent('change');
  await p.click('#pgCfg button[onclick="saveCfg()"]'); await p.waitForTimeout(200);
  T.ok('トーストにセット名: ' + await toastTxt(), (await toastTxt()).includes('A農場'));
  const pres = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_presets_v1')));
  T.ok('保存直後に presets のA農場も更新', pres.presets.find(x => x.id === 'set_A').cfg.items[0].name === 'A農場専用の質問');
  T.ok('B農場は変わらない', pres.presets.find(x => x.id === 'set_B').cfg.items[0].name !== 'A農場専用の質問');
  T.ok('presets の保存形式は不変（{presets:[{id,name,cfg}],activeId}）', pres.activeId === 'set_A' && pres.presets.every(x => Object.keys(x).sort().join() === 'cfg,id,name'));
  await tab('pgExam');
  dialogs.length = 0;
  await p.evaluate(() => examSetChange('set_B')); await p.waitForTimeout(150);
  T.ok('切替の確認文「保存済みの内容に切り替えます」: ' + dialogs[0], /保存済みの内容に切り替えます/.test(dialogs[0] || ''));
  await p.evaluate(() => examSetChange('set_A')); await p.waitForTimeout(150);
  T.ok('B→Aに戻しても編集が残る', await p.evaluate(() => getItems()[0].name) === 'A農場専用の質問');
  // カタログ追加（即時保存される操作）も使用中セットに残る
  const addOk = await p.evaluate(() => {
    const w = WORKSQA.works[0]; openCatalog();
    catPickCat(w.category); document.getElementById('workSel2').value = w.id; catPickWork(w.id); addFromCatalog();
    const a = JSON.parse(localStorage.getItem('oral_exam_presets_v1')).presets.find(x => x.id === 'set_A');
    return a.cfg.items.length === cfg.items.length && cfg.items.length > 3;
  });
  T.ok('カタログから追加した質問も使用中セットに残る', addOk);
  // 初期設定に戻す：使用中セットの中身は書き換えない
  await tab('pgCfg');
  await p.evaluate(() => resetCfg()); await p.waitForTimeout(100);
  const pres2 = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_presets_v1')));
  T.ok('初期設定に戻してもセットA農場の中身は残る', pres2.presets.find(x => x.id === 'set_A').cfg.items[0].name === 'A農場専用の質問' && pres2.activeId === null);
  // セットに入っていない構成なら従来どおり（セットは増えない・変わらない）
  await p.evaluate(() => { cfg.items[0].name = '未所属の編集'; saveCfg(); });
  const pres3 = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_presets_v1')));
  T.ok('未所属の構成の保存はセットに触れない', pres3.presets.length === 2 && pres3.presets.every(x => x.cfg.items[0].name !== '未所属の編集'));
  T.ok('CKEYには保存される', await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_items_v1')).items[0].name) === '未所属の編集');
  // 4言語の確認文
  const sw = await p.evaluate(() => ['ja', 'en', 'vi', 'id'].map(l => TX2[l].qsSwConfirm));
  T.ok('qsSwConfirm 4言語が「保存済みの内容」の意味に', /保存済みの内容/.test(sw[0]) && /saved contents/.test(sw[1]) && /nội dung đã lưu/.test(sw[2]) && /isi tersimpan/.test(sw[3]));
  // 元の3問に戻して以降の検査へ
  await p.evaluate(() => { localStorage.removeItem('oral_exam_presets_v1'); localStorage.removeItem('oral_exam_items_v1'); });
  await p.reload(); await p.waitForTimeout(300);

  console.log('[2] 保存で採点を確定 → 履歴へ案内');
  const fillAll = async (ee, scores) => {
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', ee);
    await p.evaluate(sc => { getItems().forEach((it, i) => { if (sc[i] === undefined) return; cur.items[it.id] = { hasAudio: true, score: sc[i] }; }); saveDraft(); buildExamCards(); }, scores);
  };
  await fillAll('グエン', ['pass', 'pass', 'fail']);
  dialogs.length = 0;
  await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(250);
  T.ok('確定の確認ダイアログが出た', dialogs.some(d => d.includes('採点も確定')));
  T.ok('トースト=試問と採点を保存・履歴で確認: ' + await toastTxt(), (await toastTxt()).includes('履歴'));
  T.ok('履歴タブが点滅', await p.locator('.tabs button[data-pg="pgHi"].attn').count() === 1);
  T.ok('採点タブは点滅しない', await p.locator('.tabs button[data-pg="pgScore"].attn').count() === 0);
  await p.evaluate(() => document.querySelectorAll('.tabs .attn').forEach(x => x.classList.remove('attn')));
  await fillAll('アン', ['pass', null, null]);
  await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(250);
  T.ok('未確定の保存は従来の案内（採点タブ）: ' + await toastTxt(), (await toastTxt()).includes('採点'));
  T.ok('未確定なら採点タブが点滅', await p.locator('.tabs button[data-pg="pgScore"].attn').count() === 1);

  console.log('[3] ○×が途中まで＝採点途中');
  const SESS = [
    S('part', 'ブディ', '2026-09-22', 'rec', { [ids[0]]: it({ score: 'pass' }), [ids[1]]: it({ score: null }) }),
    S('full', 'チャウ', '2026-09-21', 'rec', { [ids[0]]: it({ score: 'pass' }), [ids[1]]: it({ score: 'fail' }) }),
    S('fullna', 'デウィ', '2026-09-20', 'rec', { [ids[0]]: it({ score: 'pass' }), [ids[1]]: it({ score: null, na: true }) }),
  ];
  await p.evaluate(s => localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: s })), SESS);
  await p.reload(); await p.waitForTimeout(300);
  await tab('pgScore');
  const row = name => p.evaluate(n => { const x = [...document.querySelectorAll('#scList .hi')].find(e => e.textContent.includes(n)); return x ? { lbl: x.querySelector('.hia').textContent, badge: x.querySelector('.badge').className + '|' + x.querySelector('.badge').textContent, cls: x.querySelector('.hia').className } : null; }, name);
  const rp = await row('ブディ');
  T.ok('途中まで: バッジ=採点途中 ' + rp?.badge, /part/.test(rp?.badge) && rp.badge.includes('採点途中'));
  T.ok('途中まで: ラベル=合格1・判定1/録音2 ' + rp?.lbl, rp?.lbl === '合格1・判定1/録音2');
  T.ok('途中まで: 合格の緑色にしない ' + rp?.cls, !/a5/.test(rp?.cls));
  const rf = await row('チャウ');
  T.ok('全問判定: 判定済み・確定待ち＋1/2（未確定） ' + rf?.badge + ' ' + rf?.lbl, /pend/.test(rf?.badge) && rf.lbl === '1/2（未確定）');
  const rn = await row('デウィ');
  T.ok('「質問しなかった」も判定済みに数える ' + rn?.badge, /pend/.test(rn?.badge));
  await tab('pgHi');
  await p.evaluate(() => showDet('part')); await p.waitForTimeout(200);
  T.ok('履歴詳細も採点途中の表記', (await p.textContent('#moBody')).includes('合格1・判定1/録音2'));
  await p.evaluate(() => closeMo());
  await tab('pgCh'); await p.selectOption('#chSel', 'ブディ'); await p.waitForTimeout(300);
  const chn = await p.textContent('#chNone');
  T.ok('グラフの案内は「採点途中」（確定待ちと言わない）: ' + chn, chn.includes('採点途中') && !chn.includes('判定済み・確定待ち'));
  const vi = await p.evaluate(() => { lang = 'vi'; const r = rowRes(getAll().find(s => s.id === 'part')); lang = 'ja'; return r.badge + r.lbl; });
  T.ok('vi でも採点途中の表記: ' + vi, vi.includes('Đang chấm dở') && vi.includes('Đạt 1'));

  console.log('[4] 試問画面の進捗');
  await p.evaluate(() => { localStorage.removeItem('oral_exam_sessions_v1'); });
  await p.reload(); await p.waitForTimeout(300);
  await p.evaluate(() => { getItems().forEach(it => { cur.items[it.id] = { hasAudio: true }; }); buildExamCards(); });
  T.ok('全問録音・○×なし → 完了色にしない', !(await p.locator('#examProg.complete').count()));
  T.ok('進捗に「合否 0 / 録音 3」: ' + await p.textContent('#epPf'), (await p.textContent('#epPf')).includes('合否 0 / 録音 3'));
  T.ok('○×未入力の件数を表示', (await p.textContent('#epPf')).includes('○×未入力 3問'));
  T.ok('チップも未完了', await p.locator('#epChips .chip.done').count() === 0);
  T.ok('「次の未判定へ」ボタンあり', await p.locator('#epNextUnj').count() === 1);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.click('#epNextUnj'); await p.waitForTimeout(700);
  T.ok('次の未判定（1問目）へ移動し○×を強調', await p.evaluate(id => { const c = document.getElementById('q-' + id); const r = c.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && !!c.querySelector('.verd.attn'); }, ids[0]));
  await p.click('#vp-' + ids[0]); await p.click('#vf-' + ids[1]);
  T.ok('○×2問で「合否 2 / 録音 3」', (await p.textContent('#epPf')).includes('合否 2 / 録音 3'));
  T.ok('まだ完了色でない', !(await p.locator('#examProg.complete').count()));
  await p.click('#vp-' + ids[2]); await p.waitForTimeout(100);
  T.ok('全問の録音と○×がそろって完了色', await p.locator('#examProg.complete').count() === 1);
  T.ok('全チップ完了', await p.locator('#epChips .chip.done').count() === await p.locator('#epChips .chip').count());
  T.ok('未判定がなければボタンは消える', await p.locator('#epNextUnj').count() === 0);
  await p.click('#vp-' + ids[2]); // 解除
  T.ok('○を外すと完了色が戻る', !(await p.locator('#examProg.complete').count()));
  await p.setViewportSize({ width: 375, height: 800 }); await p.waitForTimeout(150);
  T.ok('375px幅で横スクロールなし', await p.evaluate(() => document.documentElement.scrollWidth <= 375));

  console.log('[5] 使い方の案内');
  const how = await p.evaluate(() => ['ja', 'en', 'vi', 'id'].map(l => TX[l].howto));
  T.ok('ja: ○×の手順と1人ずつ保存', /○合格/.test(how[0]) && /1人終わるたびに/.test(how[0]) && !/全員分終えたら/.test(how[0]));
  T.ok('en: ○/× と each person', /○ Pass/.test(how[1]) && /After each person/.test(how[1]) && !/everyone is done/.test(how[1]));
  T.ok('vi: ○/× と mỗi người', /○ Đạt/.test(how[2]) && /mỗi người/.test(how[2]));
  T.ok('id: ○/× と satu orang', /○ Lulus/.test(how[3]) && /satu orang/.test(how[3]));
  T.ok('画面の案内にも反映', (await p.textContent('#examHowto')).includes('1人終わるたびに'));

  T.ok('ページエラーなし ' + errors.join('|'), errors.length === 0);
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
