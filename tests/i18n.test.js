/* 4言語（ja/en/vi/id）の文言キーが揃っているかの検査。実行: node tests/i18n.test.js
   TX（i18n.js）と TX2（ui-core.js）の双方で、各言語のキー集合が一致すること。
   許可する欠落は ALLOW のみ（sumTimes1 = 英語の単数形専用） */
const env = require('./_env');
const T = env.counter();
const ALLOW = { TX2: { sumTimes1: ['ja', 'vi', 'id'] } };
const LANGS = ['ja', 'en', 'vi', 'id'];
(async () => {
  const b = await env.launch();
  const { page, errors } = await env.newPage(b);
  await page.goto(env.URL);
  await page.waitForTimeout(200);
  for (const name of ['TX', 'TX2']) {
    const d = await page.evaluate(n => { const o = eval(n); const r = {}; for (const k in o) r[k] = Object.keys(o[k]); return r; }, name);
    T.ok(`${name}: 4言語が定義されている`, LANGS.every(l => Array.isArray(d[l])));
    const all = new Set(LANGS.flatMap(l => d[l] || []));
    for (const l of LANGS) {
      const have = new Set(d[l] || []);
      const miss = [...all].filter(k => !have.has(k) && !((ALLOW[name] || {})[k] || []).includes(l));
      T.ok(`${name}.${l}: 欠けキーなし（${have.size}キー）${miss.length ? ' 欠け=' + miss.join(',') : ''}`, miss.length === 0);
    }
    // 空文字の訳が無いこと（キーだけあって中身が空＝事実上の欠落）
    const empty = await page.evaluate(n => { const o = eval(n); const r = []; for (const l in o) for (const k in o[l]) if (o[l][k] === '') r.push(l + '.' + k); return r; }, name);
    T.ok(`${name}: 空の訳なし${empty.length ? ' ' + empty.join(',') : ''}`, empty.length === 0);
  }
  // 実画面: vi でデータ消失系の文言・グラフの aria-label が英語フォールバックにならない
  const vi = await page.evaluate(() => { lang = 'vi'; return { storeFail: t2('storeFail'), dirtyLeave: t2('dirtyLeave'), chRate: t2('chRate') }; });
  const en = await page.evaluate(() => ({ storeFail: TX2.en.storeFail, dirtyLeave: TX2.en.dirtyLeave, chRate: TX2.en.chRate }));
  T.ok('vi: storeFail/dirtyLeave/chRate が英語でない', Object.keys(vi).every(k => vi[k] !== en[k]));
  T.ok('ページエラーなし ' + errors.join('|'), errors.length === 0);
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
