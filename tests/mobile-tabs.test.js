/* 375px幅（スマホ縦）で全タブが横スクロールしないことの回帰テスト。実行: node tests/mobile-tabs.test.js
   既存の r8-mobile / verdict は試問・採点タブしか見ていなかったため、設定タブの見出し行（.cfg-sec-hdr）で
   ▲▼✕が 20px はみ出していた（scrollWidth=379）のを見逃していた。
   [1] 4言語 × 5タブ（試問/採点/履歴/グラフ/設定）で documentElement.scrollWidth <= 375
   [2] 設定タブ：セクション見出し行・質問行の ▲▼✕ が親の右端をはみ出さない（4言語）
   [3] 履歴の詳細（モーダル）も 375px で横にはみ出さない
   データ：合格/不合格の試問・旧5段階の数値の試問・長い名前の受験者を localStorage に置く（ドライブ送信なし） */
const env = require('./_env');
const T = env.counter();
const LONG = 'グエン・ティ・ホン・ニュン・チャン・ヴァン・タイン';
const it = o => Object.assign({ hasAudio: true }, o);
const S = (id, ee, date, status, items) => ({ id, date, examiner: '岡田', examinee: ee, status, items, overall: '', createdAt: date + 'T00:00:00Z', updatedAt: date + 'T00:00:00Z' });
(async () => {
  const b = await env.launch();
  const ctx = await b.newContext({ viewport: { width: 375, height: 740 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const { page: p, errors } = await env.newPage(ctx);
  p.on('dialog', d => d.accept());
  await p.goto(env.URL); await p.waitForTimeout(300);
  const ids = await p.evaluate(() => getItems().map(i => i.id));
  const SESS = [
    S('m1', LONG, '2026-09-22', 'done', { [ids[0]]: it({ score: 'pass' }), [ids[1]]: it({ score: 'fail' }), [ids[2]]: it({ score: 'pass' }) }),
    S('m2', LONG, '2026-09-20', 'done', { [ids[0]]: it({ score: 4 }), [ids[1]]: it({ score: 2 }) }),
    S('m3', 'ブディ', '2026-09-21', 'rec', { [ids[0]]: it({ score: 'pass' }), [ids[1]]: it({ score: null }) }),
  ];
  await p.evaluate(s => localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: s })), SESS);
  await p.reload(); await p.waitForTimeout(300);
  // クリックではなく swTab を直接呼ぶ：はみ出しでタブが押せなくなっても止まらず、全タブ・全言語のNGを並べて出す
  const tab = async pg => { await p.evaluate(pg => swTab(document.querySelector(`.tabs button[data-pg="${pg}"]`)), pg); await p.waitForTimeout(250); };
  const sw = () => p.evaluate(() => document.documentElement.scrollWidth);

  for (const l of ['ja', 'en', 'vi', 'id']) {
    console.log('[' + l + ']');
    await p.evaluate(l => setLang(l), l); await p.waitForTimeout(150);
    for (const pg of ['pgExam', 'pgScore', 'pgHi', 'pgCh', 'pgCfg']) {
      await tab(pg);
      if (pg === 'pgCh') { await p.evaluate(n => { const s = document.getElementById('chSel'); if (s && [...s.options].some(o => o.value === n)) { s.value = n; s.dispatchEvent(new Event('change')); } }, LONG); await p.waitForTimeout(250); }
      const w = await sw();
      T.ok(`${l} ${pg}: 375px幅で横スクロールなし（scrollWidth=${w}）`, w <= 375);
    }
    // 設定タブの行ごとの検査（はみ出しの場所を特定できるように）
    const over = await p.evaluate(() => [...document.querySelectorAll('#pgCfg .cfg-sec-hdr, #pgCfg .ci-row')].map(r => {
      const pr = r.getBoundingClientRect(), bt = r.querySelector('.ci-btns').getBoundingClientRect(), inp = r.querySelector('input').getBoundingClientRect();
      return { cls: r.className, over: Math.round(bt.right - pr.right), inpW: Math.round(inp.width) };
    }).filter(x => x.over > 0 || x.inpW < 60));
    T.ok(`${l} 設定: ▲▼✕が行からはみ出さず入力欄も潰れない ${JSON.stringify(over)}`, over.length === 0);
  }
  await p.evaluate(() => setLang('ja'));
  await tab('pgHi');
  await p.evaluate(() => showDet('m1')); await p.waitForTimeout(250);
  T.ok('履歴詳細（長い名前）も横スクロールなし: ' + await sw(), await sw() <= 375);
  const mo = await p.evaluate(() => { const m = document.querySelector('#moBody'); return m ? m.scrollWidth - m.clientWidth : 0; });
  T.ok('履歴詳細の本文が横にはみ出さない: ' + mo, mo <= 0);
  await p.evaluate(() => closeMo());
  T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
  await ctx.close(); await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
