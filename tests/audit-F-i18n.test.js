/* 検査 2026-10-06【F-i18n】の回帰テスト。実行: node tests/audit-F-i18n.test.js
   L-8  履歴・グラフ・設定を表示したまま言語を切り替えたら、その画面も新しい言語で描き直す（タブを移り直したときと同じ表示になる）
   L-21 名前訂正の注記と履歴の検索欄に、廃止した「試問者名」を出さない（検索も受験者名だけで探す）
   L-23 取り込み件数のトーストで、en/vi/id は数字と語の間に空白を入れる（ja は詰める）
   L-24 en/vi/id のトーストに全角の「：」「（）」を混ぜない（ja は全角のまま）
   本物の GAS へは送らない（script.google は遮断）。 */
'use strict';
const env = require('./_env');
const c = env.counter();

const mk = (id, date, ee, er, items) => ({ id, date, examiner: er, examinee: ee, items, overall: '', status: 'scored',
  createdAt: date + 'T01:00:00Z', updatedAt: date + 'T01:00:00Z' });
const SESS = [
  mk('s1', '2026-10-01', 'グエン', '山田', { q1: { hasAudio: false, score: 'pass' }, q4: { hasAudio: false, score: 'fail' }, q5: { hasAudio: false, score: 'pass' } }),
  mk('s2', '2026-10-02', 'Siti', '佐藤', { q1: { hasAudio: false, score: 'pass' }, q4: { hasAudio: false, score: 'pass' }, q5: { hasAudio: false, score: 'na' } }),
];

async function open(b, opts) {
  opts = opts || {};
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  let gas = 0;
  await ctx.route('**/script.google*/**', r => { gas++; r.abort(); });
  const init = [];
  if (opts.lang) init.push(`localStorage.setItem('oral_exam_lang',${JSON.stringify(opts.lang)});`);
  if (opts.sessions) init.push(`localStorage.setItem('oral_exam_sessions_v1',${JSON.stringify(JSON.stringify({ sessions: opts.sessions }))});`);
  if (init.length) await ctx.addInitScript(`try{if(!sessionStorage.getItem('__seed')){sessionStorage.setItem('__seed','1');${init.join('')}}}catch(e){}`);
  const { page, errors } = await env.newPage(ctx);
  page.on('dialog', d => d.accept());
  await page.goto(env.URL); await page.waitForTimeout(600);
  return { p: page, errors, ctx, gas: () => gas };
}
const tab = (p, pg) => p.evaluate(pg => swTab(document.querySelector('.tabs [data-pg="' + pg + '"]')), pg).then(() => p.waitForTimeout(400));
const lang = (p, l) => p.click('.lsw button[lang="' + l + '"]').then(() => p.waitForTimeout(500));
const txt = (p, sel) => p.$eval(sel, e => e.innerText);
const toastTxt = p => p.$eval('#toast', e => e.textContent);

(async () => {
  const b = await env.launch();

  /* ---------- L-8 ---------- */
  {
    const { p, errors } = await open(b, { sessions: SESS });
    const TX = await p.evaluate(() => ({ ja: TX.ja.stScored, vi: TX.vi.stScored }));
    // 履歴
    await tab(p, 'pgHi');
    const hJa = await txt(p, '#hList');
    await lang(p, 'vi');
    const hVi = await txt(p, '#hList');
    await tab(p, 'pgExam'); await tab(p, 'pgHi');
    const hRe = await txt(p, '#hList');
    c.ok('L-8 前提: 履歴は ja で「' + TX.ja + '」を出す', hJa.includes(TX.ja));
    c.ok('L-8 履歴を表示したまま VI に切り替えると一覧も VI になる', hVi.includes(TX.vi) && !hVi.includes(TX.ja));
    c.ok('L-8 履歴: 切替直後の表示＝タブを移り直した表示', hVi === hRe);
    // 履歴の絞り込み（受験者の選択肢）の「すべて」も言語に追従
    const fil = await p.$eval('#hFil', e => e.options[0].textContent);
    const filRe = await p.evaluate(() => { refreshSel(); return document.getElementById('hFil').options[0].textContent; });
    c.ok('L-8 履歴の絞り込みの先頭の選択肢も VI ' + JSON.stringify([fil, filRe]), fil === filRe);
    // グラフ
    await lang(p, 'ja');
    await tab(p, 'pgCh');
    await p.evaluate(() => { const s = document.getElementById('chSel'); s.value = 'グエン'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(600);
    const cJa = await p.evaluate(() => ({ t: document.getElementById('pgCh').innerText, aria: document.getElementById('cvR').getAttribute('aria-label') }));
    await lang(p, 'vi');
    const cVi = await p.evaluate(() => ({ t: document.getElementById('pgCh').innerText, aria: document.getElementById('cvR').getAttribute('aria-label'), sel: document.getElementById('chSel').value }));
    await p.evaluate(() => drawCharts()); await p.waitForTimeout(500);
    const cRe = await p.evaluate(() => ({ t: document.getElementById('pgCh').innerText, aria: document.getElementById('cvR').getAttribute('aria-label'), sel: document.getElementById('chSel').value }));
    c.ok('L-8 グラフ: 選んだ受験者はそのまま ' + cVi.sel, cVi.sel === 'グエン');
    c.ok('L-8 グラフ: 切替直後の表示＝描き直した表示（VI）', cVi.t === cRe.t && cVi.aria === cRe.aria);
    c.ok('L-8 グラフ: 表示が ja から変わった', cVi.aria !== cJa.aria || cVi.t !== cJa.t);
    // 設定（ドライブの状態表示）
    await lang(p, 'ja');
    await p.evaluate(() => localStorage.setItem(GKEY, JSON.stringify({ url: 'https://script.google.com/macros/s/AKfyTEST/exec', token: 'x', auto: false })));
    await tab(p, 'pgCfg');
    const gJa = await p.$eval('#gStatus', e => e.textContent);
    await lang(p, 'vi');
    const gVi = await p.$eval('#gStatus', e => e.textContent);
    await p.evaluate(() => updateGoogleStatus());
    const gRe = await p.$eval('#gStatus', e => e.textContent);
    c.ok('L-8 設定: ドライブの状態表示も VI ' + JSON.stringify([gJa, gVi]), gVi === gRe && gVi !== gJa);
    // 試問タブへ戻っても壊れない
    await tab(p, 'pgExam');
    c.ok('L-8 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.context().close();
  }

  /* ---------- L-21 ---------- */
  {
    const { p, errors } = await open(b, { sessions: SESS });
    const ph = await p.$eval('#hQ', e => e.placeholder);
    c.ok('L-21 履歴の検索欄に「試問者名」が無い ' + ph, !ph.includes('試問者'));
    const notes = await p.evaluate(() => ['ja', 'en', 'vi', 'id'].map(l => { const o = lang; lang = l; const v = t2('rnNote'); lang = o; return v; }));
    c.ok('L-21 名前訂正の注記に試問者名の文が無い（4言語）', !/試問者|examiner|người hỏi|penguji/i.test(notes.join('|')));
    c.ok('L-21 注記の残り（ドライブの送り直し）は4言語ともある', notes.every(n => n.length > 20));
    await tab(p, 'pgHi');
    await p.evaluate(id => renameForm(id), 's1'); await p.waitForTimeout(300);
    const mo = await txt(p, '#moBody');
    c.ok('L-21 名前訂正の画面に「試問者名」が出ない', !mo.includes('試問者'));
    await p.evaluate(() => closeMo()); await p.waitForTimeout(200);
    await p.fill('#hQ', '山田'); await p.evaluate(() => drawHist()); await p.waitForTimeout(200);
    const byEr = await p.$$eval('#hList .hi', e => e.length);
    await p.fill('#hQ', 'グエン'); await p.evaluate(() => drawHist()); await p.waitForTimeout(200);
    const byEe = await p.$$eval('#hList .hi', e => e.length);
    c.ok('L-21 検索は受験者名だけ（旧データの試問者名では当たらない）' + byEr + '/' + byEe, byEr === 0 && byEe === 1);
    c.ok('L-21 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.context().close();
  }

  /* ---------- L-23 ---------- */
  for (const l of ['ja', 'en', 'vi', 'id']) {
    const { p, errors } = await open(b, { lang: l });
    const bk = { app: 'oral-exam-app', version: 1, sessions: SESS, audio: {} };
    await p.setInputFiles('#bkFile', { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(bk)) });
    await p.waitForTimeout(1200);
    const m = await toastTxt(p);
    const ok = l === 'ja' ? /^2件/.test(m) : /^2 \S/.test(m);
    c.ok('L-23 ' + l + ' 取り込み件数のトースト「' + m + '」', ok);
    c.ok('L-23 ' + l + ' JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.context().close();
  }

  /* ---------- L-24 ---------- */
  for (const l of ['ja', 'en', 'vi', 'id']) {
    const o = await open(b, { lang: l });
    const p = o.p;
    // 取り込みの途中で失敗 → 読み込み失敗のトースト（括弧つきの理由）。失敗は描き直しの関数を一時的に差し替えて起こす
    await p.evaluate(() => { window.__bec = window.buildExamCards; window.buildExamCards = () => { throw new Error('boom'); }; });
    await p.setInputFiles('#bkFile', { name: 'bk.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'oral-exam-app', version: 1, sessions: [], audio: {} })) });
    await p.waitForTimeout(800);
    const m1 = await toastTxt(p);
    await p.evaluate(() => { window.buildExamCards = window.__bec; });
    // 接続テストの失敗（コロン）。送り先は遮断済み＝本物の GAS へは届かない
    await tab(p, 'pgCfg');
    await p.evaluate(() => { localStorage.setItem(GKEY, JSON.stringify({ url: 'https://script.google.com/macros/s/AKfyTEST/exec', token: 'x' })); });
    await p.evaluate(() => gasTest()); await p.waitForTimeout(800);
    const m2 = await toastTxt(p);
    const fw = /[：（）]/;
    if (l === 'ja') {
      c.ok('L-24 ja は全角のまま「' + m1 + '」「' + m2 + '」', m1.includes('（boom）') && m2.includes('：'));
    } else {
      c.ok('L-24 ' + l + ' 読み込み失敗のトーストに全角なし「' + m1 + '」', !fw.test(m1) && m1.includes(' (boom)'));
      c.ok('L-24 ' + l + ' 接続テスト失敗のトーストに全角なし「' + m2 + '」', !fw.test(m2) && m2.includes(': '));
    }
    const h = await p.evaluate(() => { const o = lang; lang = 'en'; const a = pParen(3); lang = 'ja'; const bb = pParen(3); lang = o; return [a, bb]; });
    c.ok('L-24 ' + l + ' 区切りの部品 ' + JSON.stringify(h), h[0] === ' (3)' && h[1] === '（3）');
    c.ok('L-24 ' + l + ' JSエラーなし ' + o.errors.join('|'), o.errors.length === 0);
    await p.context().close();
  }

  await b.close();
  c.done();
})().catch(e => { console.error(e); process.exit(1); });
