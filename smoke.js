/* 口頭試問アプリ スモークテスト（playwright は farm-shift-app から借用）
   実行: node smoke.js  */
const { chromium } = require('C:/Users/so/farm-shift-app/node_modules/playwright');

const URL = 'file:///C:/Users/so/oral-exam-app/index.html';
let pass = 0, fail = 0;
function ok(name, cond) {
  if (cond) { pass++; console.log('  OK ' + name); }
  else { fail++; console.log('  NG ' + name); }
}

(async () => {
  const browser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => d.accept());

  console.log('[1] 初期表示');
  await page.goto(URL);
  await page.waitForTimeout(300);
  ok('試問カード9枚', await page.locator('#examCards .qc').count() === 9);
  ok('進捗 0/9', (await page.locator('#epCnt').textContent()).trim() === '0 / 9');
  ok('セクションチップ4個', await page.locator('#epChips .chip').count() === 4);

  console.log('[2] 録音（フェイクマイク）');
  await page.click('#rb-q1');
  await page.waitForTimeout(1200);
  ok('録音中表示', await page.locator('#rb-q1.recording').count() === 1);
  await page.click('#rb-q1');
  await page.waitForTimeout(800);
  ok('録音完了マーク', await page.locator('#q-q1.done').count() === 1);
  ok('進捗 1/9', (await page.locator('#epCnt').textContent()).trim() === '1 / 9');
  ok('音声プレーヤー表示', await page.locator('#au-q1').isVisible());

  console.log('[3] 試問の保存 → 採点');
  await page.fill('#fEr', '岡田');
  await page.fill('#fEe', 'テスト太郎');
  await page.click('text=試問を保存');
  await page.waitForTimeout(400);
  await page.click('.tabs button[data-pg="pgScore"]');
  await page.waitForTimeout(300);
  ok('採点待ち1件', await page.locator('#scList .hi').count() === 1);
  await page.click('#scList .hi');
  await page.waitForTimeout(500);
  ok('採点詳細が開く', await page.locator('#scDetail').isVisible());
  ok('録音済み項目に音声', await page.locator('#sa-q1').count() === 1);
  await page.click('.sb[data-id="q1"][data-s="4"]');
  await page.waitForTimeout(200);
  await page.fill('#tr-q1', '模範的な回答内容');
  await page.fill('#scOv', '全体所感テスト');
  await page.click('text=採点を保存');
  await page.waitForTimeout(400);

  console.log('[4] 履歴・詳細・グラフ');
  await page.click('.tabs button[data-pg="pgHi"]');
  await page.waitForTimeout(300);
  ok('履歴1件（採点済み）', await page.locator('#hList .badge.scored').count() === 1);
  ok('平均4.0', (await page.locator('#hList .hia').textContent()).trim() === '4.0');
  await page.click('#hList .hi');
  await page.waitForTimeout(400);
  ok('詳細モーダル', await page.locator('#modal.show').count() === 1);
  ok('文字起こし表示', (await page.locator('#moBody').textContent()).includes('模範的な回答内容'));
  await page.click('.mx');
  await page.click('.tabs button[data-pg="pgCh"]');
  await page.selectOption('#chSel', 'テスト太郎');
  await page.waitForTimeout(500);
  const charts = await page.evaluate(() => ({
    l: !!Chart.getChart(document.getElementById('cvL')),
    s: !!Chart.getChart(document.getElementById('cvS')),
    r: !!Chart.getChart(document.getElementById('cvR')),
  }));
  ok('グラフ3種描画', charts.l && charts.s && charts.r);

  console.log('[5] 作業カタログから試問項目を追加');
  await page.click('.tabs button[data-pg="pgCfg"]');
  await page.waitForTimeout(300);
  await page.click('#btnCatAdd');
  await page.waitForTimeout(200);
  ok('カタログモーダル', await page.locator('#modal.show').count() === 1);
  await page.selectOption('#catSel', 'hygiene');
  await page.waitForTimeout(150);
  await page.selectOption('#workSel2', 'dung-removal');
  await page.waitForTimeout(200);
  ok('質問3種のチェックボックス', await page.locator('#qaChecks input[type="checkbox"]').count() === 3);
  ok('模範解答プレビューに出典内容', (await page.locator('#qaChecks').textContent()).includes('病気や有害ガス'));
  await page.click('#btnCatConfirm');
  await page.waitForTimeout(300);
  ok('セクション「除フン」が追加', await page.evaluate(() => cfg.sections.some(s => s.name === '除フン')));
  ok('質問3問が追加', await page.evaluate(() => cfg.items.filter(i => i.ans).length === 3));
  // 試問タブに反映（12カード）＋模範解答は折りたたみ
  await page.click('.tabs button[data-pg="pgExam"]');
  await page.waitForTimeout(300);
  ok('試問カード12枚', await page.locator('#examCards .qc').count() === 12);
  ok('模範解答details 3個', await page.locator('#examCards details.ans').count() === 3);
  ok('模範解答は閉じている', await page.evaluate(() => [...document.querySelectorAll('#examCards details.ans')].every(d => !d.open)));

  console.log('[6] 採点画面に模範解答が出る');
  const addedId = await page.evaluate(() => cfg.items.find(i => i.ans).id);
  await page.evaluate(() => { // 追加項目に録音があるセッションを模擬
    const all = JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions;
    const it = cfg.items.find(i => i.ans);
    all[0].items[it.id] = { hasAudio: false, transcript: 'テスト', score: null };
    localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: all }));
  });
  await page.click('.tabs button[data-pg="pgScore"]');
  await page.selectOption('#scFil', 'all');
  await page.waitForTimeout(200);
  await page.click('#scList .hi');
  await page.waitForTimeout(400);
  ok('採点画面にも模範解答', await page.locator(`#sc-${addedId} details.ans`).count() === 1);
  await page.click('text=一覧へ戻る');

  console.log('[7] バックアップに項目（模範解答つき）が入る');
  await page.click('.tabs button[data-pg="pgCfg"]');
  await page.waitForTimeout(200);
  await page.click('details.acc:nth-of-type(2) summary');
  const [dl] = await Promise.all([
    page.waitForEvent('download'),
    page.click('#bkExportBtn'),
  ]);
  const path = require('path').join(require('os').tmpdir(), 'oral_backup_test.json');
  await dl.saveAs(path);
  const bk = JSON.parse(require('fs').readFileSync(path, 'utf8'));
  ok('バックアップ形式', bk.app === 'oral-exam-app' && bk.sessions.length === 1);
  ok('cfgに模範解答が含まれる', bk.cfg.items.filter(i => i.ans).length === 3);
  ok('音声が同梱される', Object.keys(bk.audio).length >= 1);
  // 全消去→復元
  await page.evaluate(async () => {
    localStorage.clear();
    await new Promise(res => { const r = indexedDB.deleteDatabase('oralExamDB'); r.onsuccess = res; r.onerror = res; r.onblocked = res; });
  });
  await page.reload();
  await page.waitForTimeout(300);
  await page.click('.tabs button[data-pg="pgCfg"]');
  await page.click('details.acc:nth-of-type(2) summary');
  const [fc] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('text=バックアップを読み込む'),
  ]);
  await fc.setFiles(path);
  await page.waitForTimeout(600);
  ok('復元後セッション1件', await page.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions.length === 1));
  ok('復元後cfgに模範解答', await page.evaluate(() => cfg.items.filter(i => i.ans).length === 3));

  console.log('[8] 言語切替の回帰');
  await page.click('.tabs button[data-pg="pgExam"]');
  await page.click('.lsw button:nth-child(2)'); // EN
  await page.waitForTimeout(300);
  ok('英語UI', (await page.locator('.tabs button[data-pg="pgExam"] span').textContent()) !== '試問');
  await page.click('.lsw button:nth-child(1)'); // JP
  await page.waitForTimeout(200);

  console.log('[9] esc() の属性値エスケープ（格納型XSS回帰）');
  ok('esc が5文字を全てエスケープ', await page.evaluate(() => esc('&<>"\'') === '&amp;&lt;&gt;&quot;&#39;'));
  ok('esc 出力で属性値から脱出不能', await page.evaluate(() => !/["'<>]/.test(esc('" onfocus="alert(1)" x=\''))));

  ok('ページエラーなし', errors.length === 0);
  if (errors.length) console.log(errors.join('\n'));

  await browser.close();
  console.log(`\n結果: ${pass} passed / ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
