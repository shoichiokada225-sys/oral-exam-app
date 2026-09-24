/* 辛口レビュー R4「情報設計」の回帰テスト。実行: node tests/r4-ia.test.js
   [1] 試問の途中で出題（試問セット）を切り替えると録音が見えなくなる → 先に保存を聞く・保存できなければ切り替えない
   [2] 試問タブに「出題：〇〇（N問）［変更］」が常に出る・テンプレートと自分のセットを1つのリストから選べる・テンプレート名を覚える
   [3] 試問の記録に出題を残す（setId/setName/setN）・履歴/CSV/グラフで出題を区別（旧データは「セット不明」）
   [4] 採点画面の見出しは「判定した問」・確定前は「確定待ち」・ボタンは「採点を保存して確定する」
   [5] 未実施の問がある時の確定の確認・履歴カードは「○1 ×1（2問中）」
   [6] スマホ幅の最初の画面：使い方は閉じたら「？」に畳む・1問目の録音ボタンが最初の画面に見える
   [7] 設定タブは試問項目（試問セット）が先・接続とデータが後
   Googleドライブ送信は使わない（未設定のまま）。 */
'use strict';
const env = require('./_env');
const fs = require('fs');
const T = env.counter();

(async () => {
  const b = await env.launch();
  const dlg = { log: [], plan: [] };
  const setup = async (vp) => {
    const ctx = await b.newContext(vp ? { viewport: vp } : {});
    const { page: p, errors } = await env.newPage(ctx);
    p.on('dialog', d => { dlg.log.push(d.message()); const a = dlg.plan.shift() || 'accept'; (a === 'accept' ? d.accept() : d.dismiss()).catch(() => {}); });
    await p.goto(env.URL); await p.waitForTimeout(300);
    return { p, errors, ctx };
  };
  const tab = async (p, pg) => { await p.click(`.tabs button[data-pg="${pg}"]`); await p.waitForTimeout(250); };
  const rec = async (p, id) => { await p.click('#rb-' + id); await p.waitForTimeout(900); await p.click('#rb-' + id); await p.waitForTimeout(700); };
  const sess = p => p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1') || '{"sessions":[]}').sessions);

  /* ---------- [1] 出題の切り替えで試問が見えなくならない ---------- */
  {
    console.log('[1] 試問の途中の出題切り替え');
    const { p, errors, ctx } = await setup();
    await rec(p, 'q1'); await p.click('#vp-q1');
    // 受験者名が空のまま切り替え → 保存できない → 切り替えない（録音は画面に残る）
    await tab(p, 'pgCfg');
    await p.selectOption('#qbSel', 'pig-breeding-farrowing');
    dlg.log.length = 0; dlg.plan = ['accept'];
    await p.click('#qsetArea button:has-text("このテンプレートに切り替える")'); await p.waitForTimeout(500);
    T.ok('先に保存するかを聞く（録音1問・合否1問）: ' + (dlg.log[0] || '').split('\n')[0], /まだ保存されていません/.test(dlg.log[0] || '') && /録音1問・合否1問/.test(dlg.log[0] || ''));
    T.ok('名前が空で保存できない→切り替えない', await p.evaluate(() => getItems().length) === 3 && await p.evaluate(() => getItems()[0].id) === 'q1');
    T.ok('試問タブへ戻り受験者名の欄を示す', await p.evaluate(() => document.getElementById('pgExam').classList.contains('on') && document.getElementById('fEe').getAttribute('aria-invalid') === 'true'));
    T.ok('q1 の録音カードは見えたまま', await p.isVisible('#au-q1'));
    // キャンセル＝切り替えない
    await p.fill('#fEe', 'グエン');
    await tab(p, 'pgCfg'); await p.selectOption('#qbSel', 'pig-breeding-farrowing');
    dlg.log.length = 0; dlg.plan = ['dismiss'];
    await p.click('#qsetArea button:has-text("このテンプレートに切り替える")'); await p.waitForTimeout(300);
    T.ok('キャンセル＝切り替えない・名前入りの確認文: ' + (dlg.log[0] || '').split('\n')[0], /グエンさんの試問/.test(dlg.log[0] || '') && await p.evaluate(() => getItems().length) === 3);
    T.ok('キャンセル後も試問は残る（下書き）', await p.evaluate(() => !!(cur.items.q1 && cur.items.q1.hasAudio && cur.items.q1.score === 'pass')));
    // OK＝保存してから切り替える（確認: 保存→採点の確定→テンプレートの置き換え）
    dlg.log.length = 0; dlg.plan = ['accept', 'dismiss', 'accept'];
    await p.click('#qsetArea button:has-text("このテンプレートに切り替える")'); await p.waitForTimeout(700);
    const s1 = await sess(p);
    T.ok('保存してから切り替えた: 履歴 ' + s1.length + '件', s1.length === 1 && s1[0].examinee === 'グエン' && s1[0].items.q1.hasAudio);
    T.ok('置き換えの確認文は「保存済みの試問は消えません」: ' + (dlg.log[2] || ''), /保存済みの試問は消えません/.test(dlg.log[2] || '') && !/過去の試問データ/.test(dlg.log[2] || ''));
    T.ok('出題は繁殖・分娩16問に', await p.evaluate(() => getItems().length) === 16);
    T.ok('保存した試問の出題は初期設定（3問）として記録', s1[0].setId === 'def' && s1[0].setN === 3);
    // 録音のない○×だけ：保存はできない→見えなくなることを確認してから切り替える
    await tab(p, 'pgExam');
    const firstId = await p.evaluate(() => sanitizeId(getItems()[0].id));
    await p.click('#vp-' + firstId);
    dlg.log.length = 0; dlg.plan = ['dismiss'];
    await p.evaluate(() => pickSetFromList('def', 'def')); await p.waitForTimeout(300);
    T.ok('○×だけの時は見えなくなる旨を確認・キャンセルで切り替えない', /録音なし/.test(dlg.log[0] || '') && await p.evaluate(() => getItems().length) === 16);
    // 画面に出ていない問の録音も「録音がありません」と言わない（別経路で質問が消えた場合の保険）
    await p.fill('#fEe', 'ブディ');
    await rec(p, firstId);
    await p.evaluate(() => { cfg.items = cfg.items.slice(1); buildExamCards(); });
    dlg.plan = ['dismiss'];
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(500);
    T.ok('画面外の問の録音でも試問を保存できる', (await sess(p)).some(s => s.examinee === 'ブディ'));
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- [2] 試問タブの出題の行・選択モーダル ---------- */
  {
    console.log('[2] 出題の行と選択');
    const { p, errors, ctx } = await setup();
    T.ok('初期表示: 出題＝初期設定の質問（3問）', await p.isVisible('#examSetBox') && (await p.textContent('#examSetName')) === '初期設定の質問' && (await p.textContent('#examSetCnt')).includes('3'));
    const ord = await p.evaluate(() => { const m = document.querySelector('#pgExam .cd.meta'), s = document.getElementById('examSetBox'), g = document.getElementById('examProg'); return !!(m.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(s.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING); });
    T.ok('出題の行は受験者名の下・進捗の上', ord);
    await p.click('#examSetBtn'); await p.waitForTimeout(200);
    const rows = await p.evaluate(() => [...document.querySelectorAll('#moBody .setpick')].map(x => x.dataset.kind));
    T.ok('モーダルにテンプレート5＋英語版＋初期設定（自分のセットなし）: ' + rows.join(','), rows.filter(k => k === 'tpl').length >= 5 && rows.includes('def') && (await p.textContent('#moBody')).includes('自分のセットはまだありません'));
    T.ok('使用中の印', (await p.textContent('#moBody .setpick[aria-current="true"]')).includes('初期設定'));
    dlg.plan = ['accept'];
    await p.click('#moBody .setpick[data-id="pig-biosecurity"]'); await p.waitForTimeout(400);
    T.ok('テンプレートを選ぶと出題名が出る', (await p.textContent('#examSetName')) === '防疫・バイオセキュリティ' && (await p.textContent('#examSetCnt')).includes('15'));
    const pres = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_presets_v1')));
    T.ok('テンプレート名を覚える（activeTpl）・presets の形式は不変', pres.activeTpl && pres.activeTpl.id === 'pig-biosecurity' && pres.activeId === null && Array.isArray(pres.presets));
    await tab(p, 'pgCfg');
    T.ok('設定タブの「現在のセット」もテンプレート名', (await p.textContent('#qsCurLine')).includes('防疫・バイオセキュリティ'));
    // 質問を追加したら「変更あり」
    await p.evaluate(() => { const w = WORKSQA.works[0]; openCatalog(); catPickCat(w.category); document.getElementById('workSel2').value = w.id; catPickWork(w.id); addFromCatalog(); });
    await p.waitForTimeout(200);
    T.ok('質問を足すと「（変更あり）」', (await p.textContent('#qsCurLine')).includes('防疫・バイオセキュリティ（変更あり）'));
    // 自分のセットを保存 → 試問タブから切り替え
    dlg.plan = ['accept'];
    await p.evaluate(() => { window.prompt = () => '棚倉農場'; qsSaveNew(); });
    await tab(p, 'pgExam');
    T.ok('自分のセットに保存すると出題名が変わる', (await p.textContent('#examSetName')) === '棚倉農場');
    await p.click('#examSetBtn'); await p.waitForTimeout(200);
    T.ok('モーダルに自分のセット', await p.locator('#moBody .setpick[data-kind="set"]').count() === 1);
    dlg.plan = ['accept'];
    await p.click('#moBody .setpick[data-kind="def"]'); await p.waitForTimeout(300);
    T.ok('初期設定に戻せる', (await p.textContent('#examSetName')) === '初期設定の質問' && await p.evaluate(() => getItems().length) === 3);
    for (const [L, w] of [['EN', 'Questions'], ['VI', 'Đề'], ['ID', 'Soal']]) {
      await p.click(`.lsw button:has-text("${L}")`); await p.waitForTimeout(150);
      T.ok(`${L}: 出題の行も言語に追従`, (await p.textContent('#examSetBox')).includes(w));
    }
    await p.click('.lsw button:has-text("JP")');
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- [3][4][5] 記録・履歴・CSV・グラフ・採点画面 ---------- */
  {
    console.log('[3] 出題の記録と比較');
    const { p, errors, ctx } = await setup();
    // 旧データ（出題の記録なし）＋ 別セットの採点済み試問を用意
    await p.evaluate(() => {
      const mk = (id, date, setId, setName, items) => Object.assign({ id, date, examiner: '岡田', examinee: 'グエン', items, overall: '', status: 'scored', createdAt: date + 'T09:00:00Z', updatedAt: date + 'T09:00:00Z' }, setId === undefined ? {} : { setId, setName, setN: Object.keys(items).length });
      const all = [
        mk('old1', '2026-09-01', undefined, undefined, { q1: { hasAudio: true, score: 'pass' } }),
        mk('n1', '2026-09-10', 'tpl:pig-newbie-basic', '新人基礎（豚の基礎と毎日の仕事）', { a: { hasAudio: true, score: 'pass' }, b: { hasAudio: true, score: 'pass' }, c: { hasAudio: true, score: 'pass' } }),
      ];
      localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: all }));
    });
    await p.reload(); await p.waitForTimeout(300);
    // 今回：初期設定3問のうち2問だけ録音・判定（1問未実施）
    await p.fill('#fEe', 'グエン');
    await rec(p, 'q1'); await p.click('#vp-q1');
    await rec(p, 'q4'); await p.click('#vf-q4');
    dlg.log.length = 0; dlg.plan = ['accept', 'accept'];
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(600);
    const conf = dlg.log.find(x => /採点も確定/.test(x)) || '';
    T.ok('確定の確認に未実施の数: ' + conf.split('\n')[0], /3問中2問/.test(conf) && /1問は未実施/.test(conf) && !/録音した全問に合否/.test(conf));
    const s = (await sess(p)).find(x => x.id !== 'old1' && x.id !== 'n1');
    T.ok('試問に出題を記録（setId=def・setN=3）', s && s.setId === 'def' && s.setN === 3 && s.status === 'scored');
    T.ok('既存の保存形式は不変（items/status/examinee…）', s && s.items.q1.score === 'pass' && s.items.q4.score === 'fail' && typeof s.createdAt === 'string');
    await tab(p, 'pgHi');
    const rowsTxt = await p.evaluate(() => [...document.querySelectorAll('#hList .hi')].map(x => x.querySelector('.hid').textContent));
    T.ok('履歴の行に出題名: ' + rowsTxt.join(' / '), rowsTxt.some(x => x.includes('初期設定の質問')) && rowsTxt.some(x => x.includes('新人基礎')) && rowsTxt.some(x => x.includes('（セット不明）')));
    const card = await p.textContent('#hList .eelast');
    T.ok('受験者カードは「○1 ×1（2問中）」＋未実施・「合格 1/2」と出さない: ' + card, card.includes('○1 ×1（2問中）') && card.includes('1問未実施') && !card.includes('合格 1/2'));
    T.ok('前回比は同じ出題どうしだけ（別セットの100%と比べて▼にしない）', !card.includes('▼'));
    const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => doCSV())]);
    const csv = fs.readFileSync(await dl.path(), 'utf8');
    T.ok('CSVに試問セット列', csv.split('\n')[0].includes('"試問セット"') && csv.includes('"初期設定の質問"') && csv.includes('"（セット不明）"'));
    await p.click('#hList .hi'); await p.waitForTimeout(300);
    T.ok('詳細にも出題と未実施', (await p.textContent('#moBody')).includes('出題: ') && (await p.textContent('#moBody')).includes('1問未実施'));
    await p.click('.mx');
    // グラフ：出題で絞る（既定＝直近の試問のセット）
    await tab(p, 'pgCh'); await p.selectOption('#chSel', 'グエン'); await p.waitForTimeout(400);
    T.ok('グラフに試問セットの選択が出る', await p.isVisible('#chSet'));
    const selTxt = await p.evaluate(() => { const s = document.getElementById('chSet'); return s.options[s.selectedIndex].textContent; });
    T.ok('既定は直近の試問のセット: ' + selTxt, selTxt.includes('初期設定の質問'));
    const pts = await p.evaluate(() => Chart.getChart(document.getElementById('cvL')).config.data.datasets[0].data.length);
    T.ok('合格率の線は同じセットの試問だけ（1点）', pts === 1);
    T.ok('セットが混ざる注記', (await p.textContent('#chNote')).includes('違う試問セット'));
    await p.selectOption('#chSet', '*'); await p.waitForTimeout(300);
    T.ok('「すべてのセット」を選ぶと3点＋比べられない注記', await p.evaluate(() => Chart.getChart(document.getElementById('cvL')).config.data.datasets[0].data.length) === 3 && (await p.textContent('#chNote')).includes('混ざっています'));

    console.log('[4] 採点画面の見出しとボタン');
    // 確定待ちの試問を作る（試問で○×を付け、確定はキャンセル）
    await tab(p, 'pgExam');
    await p.fill('#fEe', 'シティ');
    await rec(p, 'q1'); await p.click('#vp-q1');
    await rec(p, 'q4'); await p.click('#vf-q4');
    dlg.plan = ['dismiss'];
    await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(500);
    await tab(p, 'pgScore');
    await p.click('#scList .hi:has-text("シティ")'); await p.waitForTimeout(500);
    const head = await p.textContent('#scDetail .cd.meta');
    T.ok('見出しは「判定した問」で「採点済み」と言わない: ' + head.replace(/\s+/g, ' ').slice(0, 80), head.includes('判定した問') && !head.includes('採点済み'));
    T.ok('確定前は「確定待ち」バッジ', (await p.textContent('#scStBadge')) === '確定待ち');
    T.ok('ボタンは「採点を保存して確定する」', (await p.textContent('#scDetail .sbsave')).trim() === '採点を保存して確定する');
    await p.click('#scDetail .sbsave'); await p.waitForTimeout(400);
    T.ok('押すと確定（scored）', (await sess(p)).find(x => x.examinee === 'シティ').status === 'scored');
    await p.click('#scList .hi:has-text("シティ")'); await p.waitForTimeout(500);
    T.ok('確定済みは「採点済」バッジと「採点を保存（確定済み）」', (await p.textContent('#scStBadge')) === '採点済' && (await p.textContent('#scDetail .sbsave')).trim() === '採点を保存（確定済み）');
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- [6] スマホ幅の最初の画面 ---------- */
  {
    console.log('[6] 375×740 の最初の画面');
    const { p, errors, ctx } = await setup({ width: 375, height: 740 });
    T.ok('初回は使い方が開いている', await p.isVisible('#examHowto') && !(await p.isVisible('#howtoBtn')));
    await p.click('#howtoX'); await p.waitForTimeout(100);
    if (await p.isVisible('#drvHintX')) { await p.click('#drvHintX'); await p.waitForTimeout(100); }
    T.ok('閉じると「？」に畳む', !(await p.isVisible('#examHowto')) && await p.isVisible('#howtoBtn'));
    await p.reload(); await p.waitForTimeout(300);
    T.ok('再読み込み後も畳んだまま', !(await p.isVisible('#examHowto')) && await p.isVisible('#howtoBtn'));
    const vis = await p.evaluate(() => {
      window.scrollTo(0, 0);
      const tb = document.querySelector('.tabs').getBoundingClientRect().top;
      const r = document.getElementById('rb-q1').getBoundingClientRect();
      const s = document.getElementById('examSetBox').getBoundingClientRect(), e = document.getElementById('fEe').getBoundingClientRect();
      return { rb: r.bottom, tb, set: s.bottom, ee: e.bottom, y: scrollY, sw: document.documentElement.scrollWidth };
    });
    T.ok('1問目の録音ボタンが最初の画面に見える: ' + JSON.stringify(vis), vis.y === 0 && vis.rb <= vis.tb && vis.set <= vis.tb && vis.ee <= vis.tb);
    T.ok('横スクロールなし', vis.sw <= 375);
    const row = await p.evaluate(() => { const a = document.getElementById('fDate').getBoundingClientRect(), b = document.getElementById('fEe').getBoundingClientRect(); return Math.abs(a.top - b.top) < 2; });
    T.ok('試問日と受験者名は1行に並ぶ', row);
    T.ok('試問者名の欄は表示しない', !(await p.isVisible('#fEr')) && !(await p.isVisible('label[for="fEr"]')));
    await p.click('#howtoBtn'); await p.waitForTimeout(150);
    T.ok('「？」で使い方を再表示', await p.isVisible('#examHowto'));

    console.log('[7] 設定タブの並び');
    await tab(p, 'pgCfg');
    const order = await p.evaluate(() => {
      const q = document.getElementById('qsetArea'), c = document.getElementById('cfgConnTitle'), d = document.querySelector('#pgCfg details.acc'), r = document.getElementById('recOptBox');
      const f = (x, y) => !!(x.compareDocumentPosition(y) & Node.DOCUMENT_POSITION_FOLLOWING);
      return f(q, c) && f(c, r) && f(r, d);
    });
    T.ok('試問セット→（接続とデータ）録音の音→ドライブ…の順', order);
    T.ok('用語：「プリセット試問セット」「質問セット」を出さない', !/プリセット試問セット|質問セット/.test(await p.textContent('#pgCfg')));
    T.ok('「項目を保存」の意味を添える', (await p.textContent('#cfgSaveHint')).includes('その場で保存'));
    T.ok('設定タブも横スクロールなし', await p.evaluate(() => document.documentElement.scrollWidth <= 375));
    T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
