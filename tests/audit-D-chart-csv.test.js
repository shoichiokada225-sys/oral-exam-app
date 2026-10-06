/* 検査 2026-10-06【D-chart-csv】の回帰テスト。実行: node tests/audit-D-chart-csv.test.js
   M-10 グラフ（レーダー・分野別）は「その試問が受けた出題（setId）と問題文」で描く（今の出題を切り替えても空にならない）
   M-11 前回（破線）は同じ質問どうしだけ重ねる（その場で出題の別の問題文を今回の軸に重ねない）
   M-12 CSV：問題文のある問（その場で出題）は今の出題に関係なく「問題文」列を出し、見出しは「質問n」に固定する
   M-13 設定で「その場で出題」の問に名前・説明を書いたら、通常の問として試問画面に出す（旧データも）
   M-14 作業カタログから足した質問は日本語を原文にして各言語の訳を持つ（表示時の言語で出る・旧データも訳す）
   L-18 レーダーのラベルがスマホ幅で左右に切れない
   L-19 合格率の推移で点が1つでも左の軸に重ならない
   L-25 設定タブの削除・移動ボタンの読み上げ名は表示言語で出す
   本物の GAS へは送らない（ドライブ設定なし・script.google は遮断）。 */
'use strict';
const env = require('./_env');
const fs = require('fs');
const c = env.counter();

const mk = (id, date, setId, items, extra) => Object.assign({ id, date, examiner: '', examinee: extra && extra.ee || 'グエン', items, overall: '', status: 'scored',
  createdAt: date + 'T01:00:00Z', updatedAt: date + 'T01:00:00Z', setId, setName: '', setN: 3 }, extra || {});

async function open(b, opts) {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: { width: opts.w || 390, height: 844 } });
  await ctx.route('**/script.google*/**', r => r.abort());
  const init = [];
  if (opts.lang) init.push(`localStorage.setItem('oral_exam_lang',${JSON.stringify(opts.lang)});`);
  if (opts.sessions) init.push(`localStorage.setItem('oral_exam_sessions_v1',${JSON.stringify(JSON.stringify({ sessions: opts.sessions }))});`);
  if (opts.cfg) init.push(`localStorage.setItem('oral_exam_cfg3_migrated','1');localStorage.setItem('oral_exam_cfg_free_migrated','1');localStorage.setItem('oral_exam_items_v1',${JSON.stringify(JSON.stringify(opts.cfg))});`);
  if (init.length) await ctx.addInitScript(`try{if(!sessionStorage.getItem('__seed')){sessionStorage.setItem('__seed','1');${init.join('')}}}catch(e){}`);
  const { page, errors } = await env.newPage(ctx);
  page.on('dialog', d => d.accept());
  await page.goto(env.URL); await page.waitForTimeout(600);
  return { p: page, errors, ctx };
}
async function chartOf(p, who) {
  await p.evaluate(() => swTab(document.querySelector('.tabs [data-pg="pgCh"]'))); await p.waitForTimeout(300);
  await p.evaluate(w => { const s = document.getElementById('chSel'); s.value = w; drawCharts(); }, who); await p.waitForTimeout(700);
  return p.evaluate(() => ({
    labels: cR && cR.data.labels, ds: cR && cR.data.datasets.map(d => d.data),
    aria: document.getElementById('cvR').getAttribute('aria-label'),
    bar: cS && [cS.data.labels, cS.data.datasets[0].data],
  }));
}
const flat = l => (Array.isArray(l) ? l.join(' ') : String(l));

(async () => {
  const b = await env.launch();
  const bf = await env.launch({ freeDefault: true });

  /* ---------- M-10 ---------- */
  {
    const sess = [
      mk('s1', '2026-10-01', 'free', { f1: { hasAudio: true, score: 'pass', qText: 'Q1' }, f2: { hasAudio: true, score: 'pass', qText: 'Q2' }, f3: { hasAudio: true, score: 'fail', qText: 'Q3' } }),
      mk('s2', '2026-10-05', 'free', { f1: { hasAudio: true, score: 'fail', qText: 'Q4' }, f2: { hasAudio: true, score: 'pass', qText: 'Q5' }, f3: { hasAudio: true, score: 'pass', qText: 'Q6' } }),
    ];
    // 今の出題は標準の3問（その場で出題の試問を見る）
    const { p, errors, ctx } = await open(b, { sessions: sess });
    c.ok('M-10 前提: 今の出題は標準の3問', await p.evaluate(() => curSetInfo().id) === 'def');
    const r = await chartOf(p, 'グエン');
    c.ok('M-10 レーダーの軸はその試問の問題文 ' + JSON.stringify(r.labels), JSON.stringify(r.labels.map(flat)) === '["Q4","Q5","Q6"]');
    c.ok('M-10 レーダーの値はその試問の合否 ' + JSON.stringify(r.ds[0]), JSON.stringify(r.ds[0]) === '[0,100,100]');
    c.ok('M-10 読み上げに「未実施」が出ない ' + r.aria, !/未実施/.test(r.aria));
    c.ok('M-10 分野別の棒が空にならない ' + JSON.stringify(r.bar), r.bar[0].length === 1 && r.bar[1][0] === 67);
    c.ok('M-10 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }
  {
    // 逆向き：標準の3問で採点した試問を「その場で出題」の端末で見る
    const sess = [mk('d1', '2026-10-02', 'def', { q1: { hasAudio: true, score: 'pass' }, q4: { hasAudio: true, score: 'pass' }, q5: { hasAudio: true, score: 'fail' } },
      { meta: { q1: { name: '母豚の健康観察', sec: '飼養・健康管理' }, q4: { name: '消毒・バイオセキュリティ', sec: '衛生・防疫' }, q5: { name: '異常の早期発見と報告', sec: '衛生・防疫' } } })];
    const { p, errors, ctx } = await open(bf, { sessions: sess });
    c.ok('M-10 前提: 今の出題はその場で出題', await p.evaluate(() => curSetInfo().id) === 'free');
    const r = await chartOf(p, 'グエン');
    c.ok('M-10 逆向き: 値は [100,100,0] ' + JSON.stringify(r.ds[0]), JSON.stringify(r.ds[0]) === '[100,100,0]');
    c.ok('M-10 逆向き: 読み上げは標準の問の名前で「未実施」なし ' + r.aria, /母豚の健康観察/.test(r.aria) && !/未実施/.test(r.aria));
    c.ok('M-10 逆向き: 分野別は2分野 ' + JSON.stringify(r.bar), JSON.stringify(r.bar) === '[["飼養・健康管理","衛生・防疫"],[100,50]]');
    c.ok('M-10 逆向き JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-11 ---------- */
  {
    const sess = [
      mk('a', '2026-10-01', 'free', { f1: { hasAudio: true, score: 'pass', qText: 'AAA分娩舎' }, f2: { hasAudio: true, score: 'pass', qText: 'BBB消毒槽' }, f3: { hasAudio: true, score: 'fail', qText: 'CCC異常豚' } }, { ee: 'Nam' }),
      mk('b', '2026-10-05', 'free', { f1: { hasAudio: true, score: 'fail', qText: 'XXXワクチン' }, f2: { hasAudio: true, score: 'pass', qText: 'YYY給餌量' }, f3: { hasAudio: true, score: 'pass', qText: 'ZZZ死亡豚' } }, { ee: 'Nam' }),
      mk('c', '2026-10-01', 'free', { f1: { hasAudio: true, score: 'pass', qText: 'AAA分娩舎' }, f2: { hasAudio: true, score: 'fail', qText: 'BBB消毒槽' }, f3: { hasAudio: true, score: 'fail', qText: 'CCC異常豚' } }, { ee: 'Mai' }),
      mk('d', '2026-10-05', 'free', { f1: { hasAudio: true, score: 'fail', qText: 'XXXワクチン' }, f2: { hasAudio: true, score: 'pass', qText: 'BBB消毒槽' }, f3: { hasAudio: true, score: 'pass', qText: 'ZZZ死亡豚' } }, { ee: 'Mai' }),
    ];
    const { p, errors, ctx } = await open(bf, { sessions: sess });
    const r = await chartOf(p, 'Nam');
    c.ok('M-11 問題文が全部違えば前回を重ねない ' + JSON.stringify(r.ds), r.ds.length === 1);
    const r2 = await chartOf(p, 'Mai');
    c.ok('M-11 同じ問題文の軸だけ前回を重ねる ' + JSON.stringify(r2.ds), r2.ds.length === 2 && JSON.stringify(r2.ds[1]) === '[null,0,null]');
    c.ok('M-11 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-12 ---------- */
  {
    const sess = [
      mk('x1', '2026-10-01', 'free', { f1: { hasAudio: true, score: 'pass', qText: '分娩舎で最初に見るのは？' } }, { ee: 'A男', meta: { f1: { name: '分娩舎で最初に見るのは？', sec: '出題' } } }),
      mk('x2', '2026-10-01', 'free', { f1: { hasAudio: true, score: 'fail', qText: '消毒槽の交換頻度は？' } }, { ee: 'B子', meta: { f1: { name: '消毒槽の交換頻度は？', sec: '出題' } } }),
    ];
    const { p, errors, ctx } = await open(b, { sessions: sess });
    c.ok('M-12 前提: 今の出題は標準の3問', await p.evaluate(() => curSetInfo().id) === 'def');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => doCSV())]);
    const txt = fs.readFileSync(await dl.path(), 'utf8');
    const hd = txt.split('\n')[0];
    c.ok('M-12 問題文の列が残る ' + hd.slice(0, 160), hd.includes('"質問1(問題文)"'));
    c.ok('M-12 合否列の見出しは「質問1」 ', hd.includes('"質問1(合否)"'));
    c.ok('M-12 見出しに受験者の問題文が入らない', !/分娩舎|消毒槽/.test(hd));
    c.ok('M-12 B子の行に B子の問題文', txt.split('\n').some(l => l.includes('B子') && l.includes('消毒槽の交換頻度は？')));
    c.ok('M-12 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-13 ---------- */
  {
    const { p, errors, ctx } = await open(bf);
    await p.evaluate(() => swTab(document.querySelector('.tabs [data-pg="pgCfg"]'))); await p.waitForTimeout(300);
    const inp = p.locator('#cfgArea .cfg-item input[type=text]').first();
    await inp.fill('分娩舎で最初に見ることは？'); await inp.dispatchEvent('change');
    const ta = p.locator('#cfgArea .cfg-item textarea').first();
    await ta.fill('説明：分娩前後の母豚'); await ta.dispatchEvent('change');
    await p.evaluate(() => saveCfg()); await p.waitForTimeout(300);
    await p.evaluate(() => swTab(document.querySelector('.tabs [data-pg="pgExam"]'))); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ nm: (document.querySelector('#q-f1 .enm') || {}).textContent, ds: (document.querySelector('#q-f1 .ed') || {}).textContent, qt: !!document.getElementById('qt-f1'), qn: qName(null, cfg.items[0], 1) }));
    c.ok('M-13 名前を書いた問は試問画面に名前と説明を出す ' + JSON.stringify(r), r.nm === '分娩舎で最初に見ることは？' && r.ds === '説明：分娩前後の母豚' && !r.qt);
    c.ok('M-13 採点・CSVの名前も書いた名前', r.qn === '分娩舎で最初に見ることは？');
    c.ok('M-13 名前を書いていない問はその場で出題のまま', await p.evaluate(() => !!document.getElementById('qt-f2')));
    c.ok('M-13 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }
  {
    // 不具合のあった版で保存された設定（free のまま名前あり）も通常の問として出す
    const cfg = { sections: [{ id: 'F', name: '出題' }], items: [{ id: 'f1', secId: 'F', name: '旧で書いた名前', desc: '旧の説明', free: true }, { id: 'f2', secId: 'F', name: '', desc: '', free: true }] };
    const { p, errors, ctx } = await open(bf, { cfg });
    const r = await p.evaluate(() => ({ nm: (document.querySelector('#q-f1 .enm') || {}).textContent, qt1: !!document.getElementById('qt-f1'), qt2: !!document.getElementById('qt-f2') }));
    c.ok('M-13 旧データ: 名前のある問は通常の問 ' + JSON.stringify(r), r.nm === '旧で書いた名前' && !r.qt1 && r.qt2);
    c.ok('M-13 旧データ JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- M-14 ---------- */
  {
    const { p, errors, ctx } = await open(b);
    const r = await p.evaluate(async () => {
      setLang('vi');
      openCatalog();
      const w = WORKSQA.works.find(x => x.id === 'feeding-daily');
      const cs = document.getElementById('catSel'); cs.value = w.category; catPickCat(w.category);
      const ws = document.getElementById('workSel2'); ws.value = w.id; catPickWork(w.id);
      addFromCatalog();
      const added = cfg.items.filter(i => i.id.startsWith('qa_'));
      const vi = added.map(i => loc(i, 'name'));
      setLang('ja');
      const ja = added.map(i => loc(i, 'name')), jaDesc = added.map(i => loc(i, 'desc'));
      setLang('id');
      const id = added.map(i => loc(i, 'name'));
      setLang('ja');
      return { n: added.length, vi, ja, jaDesc, id, raw: added.map(i => i.name) };
    });
    c.ok('M-14 3問追加 ' + r.n, r.n === 3);
    c.ok('M-14 日本語画面では日本語 ' + JSON.stringify(r.ja), JSON.stringify(r.ja) === '["目的の説明","注意点の説明","よくあるミスと対策"]' && r.jaDesc.every(d => d.includes('給餌')));
    c.ok('M-14 ベトナム語画面ではベトナム語 ' + JSON.stringify(r.vi), r.vi[0] === 'Mục đích');
    c.ok('M-14 インドネシア語画面ではインドネシア語 ' + JSON.stringify(r.id), r.id[0] === 'Tujuan');
    c.ok('M-14 原文は日本語で保存 ' + JSON.stringify(r.raw), r.raw[0] === '目的の説明');
    const card = await p.evaluate(() => { const it = cfg.items.find(i => i.id.startsWith('qa_')); return document.querySelector('#q-' + it.id + ' .enm').textContent; });
    c.ok('M-14 試問画面も日本語 ' + card, card === '目的の説明');
    // 追加済みの印は言語を変えても付く
    const dup = await p.evaluate(() => { setLang('vi'); openCatalog(); const w = WORKSQA.works.find(x => x.id === 'feeding-daily'); catPickCat(w.category); document.getElementById('workSel2').value = w.id; catPickWork(w.id);
      const n = [...document.querySelectorAll('#qaChecks input')].filter(i => !i.checked).length; closeMo(); setLang('ja'); return n; });
    c.ok('M-14 別の言語でも追加済みと分かる（重複追加しない） ' + dup, dup === 3);
    c.ok('M-14 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }
  {
    // 旧データ：ベトナム語画面で足した質問（訳なし）を日本語画面で開く
    const cfg = { sections: [{ id: 'A', name: '飼養・健康管理' }, { id: 'sec_feeding-daily_1', name: '給餌', name_en: 'Feeding' }],
      items: [{ id: 'q1', secId: 'A', name: '母豚の健康観察', desc: 'x' },
        { id: 'qa_feeding-daily_purpose_1700000000000', secId: 'sec_feeding-daily_1', name: 'Mục đích', desc: 'Công việc "Feeding" nhằm mục đích gì? Hãy giải thích.', ans: '・a' },
        { id: 'qa_feeding-daily_caution_1700000000001', secId: 'sec_feeding-daily_1', name: '自分で書き換えた名前', desc: '自分の説明', ans: '・b' }] };
    const { p, errors, ctx } = await open(b, { cfg });
    const r = await p.evaluate(() => { const a = cfg.items[1], m = cfg.items[2]; const ja = [loc(a, 'name'), loc(a, 'desc'), loc(m, 'name')]; setLang('vi'); const vi = [loc(a, 'name'), loc(m, 'name')]; setLang('ja'); return { ja, vi }; });
    c.ok('M-14 旧データ: 日本語画面では日本語 ' + JSON.stringify(r.ja), r.ja[0] === '目的の説明' && r.ja[1].includes('給餌'));
    c.ok('M-14 旧データ: ベトナム語画面ではベトナム語', r.vi[0] === 'Mục đích');
    c.ok('M-14 旧データ: 書き換えた質問はそのまま ' + JSON.stringify([r.ja[2], r.vi[1]]), r.ja[2] === '自分で書き換えた名前' && r.vi[1] === '自分で書き換えた名前');
    c.ok('M-14 旧データ JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- L-25 ---------- */
  {
    const { p, errors, ctx } = await open(bf, { lang: 'vi' });
    await p.evaluate(() => swTab(document.querySelector('.tabs [data-pg="pgCfg"]'))); await p.waitForTimeout(300);
    const al = await p.$$eval('#cfgArea .cfg-sec-hdr .del', bs => bs.map(x => x.getAttribute('aria-label')));
    c.ok('L-25 セクション削除の読み上げはベトナム語 ' + JSON.stringify(al), al.length && al.every(a => !/出題/.test(a) && /Câu hỏi/.test(a)));
    c.ok('L-25 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- L-18 ---------- */
  for (const [lang, w] of [['id', 390], ['vi', 320], ['id', 320], ['ja', 320]]) {
    const sess = [mk('S1', '2026-09-01', 'free', { f1: { hasAudio: true, score: 'pass', qText: '分娩舎で最初に確認することは何ですか？理由も' }, f2: { hasAudio: true, score: 'fail', qText: '消毒の順序と濃度の確かめ方は？' }, f3: {} }, { ee: 'Nguyen Van A' })];
    const { p, errors, ctx } = await open(bf, { lang, w, sessions: sess });
    await chartOf(p, 'Nguyen Van A');
    const r = await p.evaluate(() => { const ch = Chart.getChart(document.getElementById('cvR')); const it = ch.scales.r._pointLabelItems || []; return { w: ch.width, pl: it.map(x => [Math.round(x.left), Math.round(x.right)]) }; });
    c.ok(`L-18 ${lang} ${w}px ラベルが左右に切れない ` + JSON.stringify(r), r.pl.length === 3 && r.pl.every(([l, rr]) => l >= 0 && rr <= r.w));
    c.ok(`L-18 ${lang} ${w}px JSエラーなし ` + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  /* ---------- L-19 ---------- */
  {
    const sess = [mk('o1', '2026-10-01', 'def', { q1: { score: 'pass', hasAudio: true }, q4: { score: 'pass', hasAudio: true }, q5: { score: 'fail', hasAudio: true } }, { ee: 'アン' })];
    const { p, errors, ctx } = await open(b, { sessions: sess });
    await chartOf(p, 'アン');
    const r = await p.evaluate(() => { const m = cL.getDatasetMeta(0).data[0]; return { x: m.x, r: m.options.radius, yr: cL.scales.y.right }; });
    c.ok('L-19 点が1つでも左の軸に重ならない ' + JSON.stringify(r), r.x - r.r > r.yr + 4);
    c.ok('L-19 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }

  await b.close(); await bf.close();
  c.done();
})().catch(e => { console.error(e); process.exit(1); });
