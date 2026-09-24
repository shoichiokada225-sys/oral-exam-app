/* グローバル名の回帰検査（ui.js 分割の安全網）。実行: node tests/globals.test.js
   テストや onclick="..." はグローバル関数を直接呼ぶため、ファイル分割・改名で名前が消えると黙って壊れる。
   tests/fixtures/globals-before-split.json（分割前のトップレベル宣言一覧）の全名が
   関数は window 上に、let/const はグローバル字句スコープに存在することを確認する。
   さらに index.html の onclick/onchange 等で呼ばれている関数名も実在を確認する。 */
const env = require('./_env');
const fs = require('fs'), path = require('path');
const T = env.counter();
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'globals-before-split.json'), 'utf8'));
(async () => {
  const b = await env.launch();
  const { page, errors } = await env.newPage(b);
  await page.goto(env.URL);
  await page.waitForTimeout(300);
  const missF = await page.evaluate(ns => ns.filter(n => typeof window[n] !== 'function'), FX.functions);
  T.ok(`分割前の関数 ${FX.functions.length} 個がすべて window にある${missF.length ? ' 消失=' + missF.join(',') : ''}`, missF.length === 0);
  const missL = await page.evaluate(ns => ns.filter(n => { try { return (0, eval)('typeof ' + n) === 'undefined'; } catch (e) { return true; } }), FX.lexicals);
  T.ok(`分割前の let/const ${FX.lexicals.length} 個がすべて存在${missL.length ? ' 消失=' + missL.join(',') : ''}`, missL.length === 0);
  // 同名関数の二重定義（後勝ちで黙って上書き）が js/ 全体で無いこと
  const seen = {}, dup = [];
  for (const f of fs.readdirSync(path.join(env.ROOT, 'js')).filter(f => f.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(env.ROOT, 'js', f), 'utf8');
    for (const m of s.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) { if (seen[m[1]]) dup.push(`${m[1]}(${seen[m[1]]},${f})`); else seen[m[1]] = f; }
  }
  T.ok(`関数の二重定義なし${dup.length ? ' ' + dup.join(' ') : ''}`, dup.length === 0);
  // R2: media.js の分割先（録音=media.js／ドライブ送信=drive.js／合否=verdict.js）
  const want = {
    'media.js': ['toggleRec', 'stopRec', 'liveSave', 'checkLiveTakes', 'restoreLive', 'commitTake', 'aiTranscribe'],
    'drive.js': ['saveGoogleCfg', 'gasUpload', 'maybeAutoUpload', 'resendAllUnsent', 'resyncDriveName', 'syncExamineeOnSave', 'applyUrlConfig'],
    'verdict.js': ['setVerdict', 'setCloud', 'verdictTag'],
  };
  const misplaced = [];
  for (const [f, ns] of Object.entries(want)) for (const n of ns) if (seen[n] !== f) misplaced.push(`${n}(${seen[n] || '無し'}≠${f})`);
  T.ok(`録音/ドライブ/合否の置き場所${misplaced.length ? ' ' + misplaced.join(' ') : ''}`, misplaced.length === 0);
  const order = await page.evaluate(() => [...document.querySelectorAll('script[src^="js/"]')].map(s => s.getAttribute('src')));
  const oi = n => order.indexOf('js/' + n);
  T.ok(`読み込み順 media → drive → verdict → ui-core（${order.join(',')}）`, oi('media.js') >= 0 && oi('media.js') < oi('drive.js') && oi('drive.js') < oi('verdict.js') && oi('verdict.js') < oi('ui-core.js'));
  // HTML内ハンドラ（onclick等）から呼ぶ関数が実在
  const handlers = await page.evaluate(() => {
    const names = new Set();
    for (const el of document.querySelectorAll('*')) for (const a of el.attributes) if (/^on/.test(a.name))
      for (const m of a.value.matchAll(/(?:^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)) names.add(m[1]);
    return [...names].filter(n => !['if', 'return', 'function'].includes(n) && typeof window[n] !== 'function');
  });
  T.ok(`画面のハンドラが呼ぶ関数が実在${handlers.length ? ' 不在=' + handlers.join(',') : ''}`, handlers.length === 0);
  T.ok('ページエラーなし ' + errors.join('|'), errors.length === 0);
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
