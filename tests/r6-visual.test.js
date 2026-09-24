/* 辛口レビュー R6（視認性とデザイン一貫性）の回帰テスト。実行: node tests/r6-visual.test.js
   [1] 完了＝緑にしない：全問不合格の完了ヒーローは赤系・全問合格は緑・混在は中立（試問/採点の両方）。カード左帯は合否色、✓は中立
   [2] 試問の○合格ON=緑(--s5)・×不合格ON=赤(--s1)、文字は --sel-tx。ライト/ダークとも文字コントラスト4.5:1以上
   [3] 試問の合否トグルは高さ44px以上・文字15px以上
   [4] 375px幅の採点保存バー：保存ボタンは全幅1行・どのボタンも縦に折れない（ja/vi/id）
   [5] sbCnt の行は不透明の背景・合否の数は評価色
   [6] 状態バッジは12px以上・「判定済み・確定待ち」は淡青の面に濃青の文字
   Googleドライブ送信は使わない（ドライブ設定なし）。音声は hasAudio フラグのみ（IndexedDB に触れない） */
const env = require('./_env');
const T = env.counter();
const lum = c => { const m = c.match(/[\d.]+/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
const S = (id, ee, status, items) => ({ id, date: '2026-09-20', examiner: '岡田', examinee: ee, status, items, overall: '', createdAt: '2026-09-20T00:00:00Z', updatedAt: '2026-09-20T00:00:00Z' });
(async () => {
  const b = await env.launch();
  const { page: p, errors } = await env.newPage(b);
  p.on('dialog', d => d.accept());
  await p.goto(env.URL); await p.waitForTimeout(300);
  const ids = await p.evaluate(() => getItems().map(i => i.id));
  const tab = async pg => { await p.click(`.tabs button[data-pg="${pg}"]`); await p.waitForTimeout(250); };
  const bgImg = sel => p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundImage, sel);
  const isGreen = g => /rgb\(14, 84, 32\)|rgb\(13, 58, 23\)/.test(g);
  const isRed = g => /rgb\(92, 16, 16\)|rgb\(66, 11, 11\)/.test(g);

  console.log('[1] 試問ヒーロー：完了色は合否に連動');
  await p.evaluate(() => { getItems().forEach(it => { cur.items[it.id] = { hasAudio: true }; }); buildExamCards(); });
  for (const id of ids) await p.click('#vf-' + id);
  await p.waitForTimeout(500);
  const gAllFail = await bgImg('#examProg');
  T.ok('全問不合格でも完了（✓）は付く', await p.locator('#examProg.complete').count() === 1);
  T.ok('全問不合格の完了ヒーローは緑でない（赤系）: ' + gAllFail.slice(0, 60), !isGreen(gAllFail) && isRed(gAllFail));
  T.ok('全問不合格のカード左帯は赤(--s1)', await p.evaluate(id => { const c = document.getElementById('q-' + id); return c.classList.contains('v-fail') && getComputedStyle(c).borderLeftColor === getComputedStyle(document.querySelector('.verd .vfail.on')).backgroundColor; }, ids[0]));
  T.ok('カード右上の✓は緑でない', await p.evaluate(id => getComputedStyle(document.getElementById('q-' + id), '::after').color !== 'rgb(23, 128, 42)', ids[0]));
  await p.click('#vp-' + ids[0]); await p.waitForTimeout(300);
  const gMix = await bgImg('#examProg');
  T.ok('混在は中立（緑でも赤でもない）', !isGreen(gMix) && !isRed(gMix) && await p.locator('#examProg.res-a3').count() === 1);
  for (const id of ids.slice(1)) await p.click('#vp-' + id);
  await p.waitForTimeout(500);
  T.ok('全問合格は緑', isGreen(await bgImg('#examProg')));

  console.log('[2][3] 試問の合否トグル：色・コントラスト・大きさ');
  for (const theme of ['light', 'dark']) {
    await p.evaluate(t => document.documentElement.setAttribute('data-theme', t), theme);
    await p.click('#vf-' + ids[0]); await p.waitForTimeout(150); // q1=不合格・q2=合格
    const r = await p.evaluate(([a, bId]) => {
      const cs = s => getComputedStyle(document.querySelector(s));
      const sbPass = getComputedStyle(document.documentElement).getPropertyValue('--s5').trim();
      const sbFail = getComputedStyle(document.documentElement).getPropertyValue('--s1').trim();
      const probe = v => { const d = document.createElement('i'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
      return { pBg: cs('#vp-' + bId).backgroundColor, pTx: cs('#vp-' + bId).color, fBg: cs('#vf-' + a).backgroundColor, fTx: cs('#vf-' + a).color, s5: probe(sbPass), s1: probe(sbFail) };
    }, [ids[0], ids[1]]);
    T.ok(`${theme}: ○合格ON=--s5（${r.pBg}）`, r.pBg === r.s5);
    T.ok(`${theme}: ×不合格ON=--s1（${r.fBg}）`, r.fBg === r.s1);
    T.ok(`${theme}: ○合格の文字コントラスト ${ratio(r.pBg, r.pTx).toFixed(2)} ≥ 4.5`, ratio(r.pBg, r.pTx) >= 4.5);
    T.ok(`${theme}: ×不合格の文字コントラスト ${ratio(r.fBg, r.fTx).toFixed(2)} ≥ 4.5`, ratio(r.fBg, r.fTx) >= 4.5);
    await p.click('#vf-' + ids[0]); // 解除（元に戻す）
  }
  await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await p.setViewportSize({ width: 375, height: 740 }); await p.waitForTimeout(200);
  const vb = await p.evaluate(id => { const e = document.getElementById('vp-' + id), f = document.getElementById('vf-' + id); return { h: e.getBoundingClientRect().height, hf: f.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize) }; }, ids[0]);
  T.ok(`合否トグル高さ ${vb.h}/${vb.hf}px ≥ 44`, vb.h >= 44 && vb.hf >= 44);
  T.ok(`合否トグル文字 ${vb.fs}px ≥ 15`, vb.fs >= 15);
  T.ok('375px幅で横スクロールなし（試問）', await p.evaluate(() => document.documentElement.scrollWidth <= 375));

  console.log('[4][5] 採点画面（375px）');
  const it = sc => ({ hasAudio: true, score: sc });
  const allFail = {}; ids.forEach(i => { allFail[i] = it('fail'); });
  const SESS = [S('af', 'グエン', 'recorded', allFail), S('pend', 'チャウ', 'recorded', { [ids[0]]: it('pass'), [ids[1]]: it('fail') }), S('ok', 'ブディ', 'scored', { [ids[0]]: it('pass') })];
  await p.evaluate(s => localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: s })), SESS);
  await p.reload(); await p.waitForTimeout(300);
  await tab('pgScore');
  await p.evaluate(() => openScore('af')); await p.waitForTimeout(500);
  const gs = await bgImg('#scDetail .cd.meta');
  T.ok('採点詳細：全問不合格の完了ヒーローは緑でない（赤系）', await p.locator('#scDetail .cd.meta.complete').count() === 1 && !isGreen(gs) && isRed(gs));
  T.ok('採点カード：不合格の左帯は赤・✓は緑でない', await p.evaluate(id => { const c = document.getElementById('sc-' + id); const s1 = getComputedStyle(document.querySelector('.sb[data-s="fail"].sel')).backgroundColor; return c.classList.contains('v-fail') && getComputedStyle(c).borderLeftColor === s1 && getComputedStyle(c, '::after').color !== 'rgb(23, 128, 42)'; }, ids[0]));
  await p.click(`.sb[data-id="${ids[0]}"][data-s="pass"]`); await p.waitForTimeout(200);
  T.ok('採点で合格に変えると左帯は緑クラス', await p.locator(`#sc-${ids[0]}.v-pass`).count() === 1 && await p.locator(`#sc-${ids[0]}.v-fail`).count() === 0);
  T.ok('混在の採点ヒーローは中立', await p.locator('#scDetail .cd.meta.res-a3').count() === 1);
  await p.click(`.sb[data-id="${ids[0]}"][data-s="fail"]`); await p.waitForTimeout(200);

  for (const lg of ['ja', 'vi', 'id', 'en']) {
    await p.evaluate(l => { lang = l; openScore('af'); }, lg); await p.waitForTimeout(400);
    const m = await p.evaluate(() => {
      const bar = document.querySelector('.savebar'), sv = bar.querySelector('.sbsave');
      const btns = [...bar.querySelectorAll('.b')].map(x => { const r = x.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(x).lineHeight) || parseFloat(getComputedStyle(x).fontSize) * 1.5; return { h: r.height, w: r.width, sh: x.scrollHeight, lh, ws: getComputedStyle(x).whiteSpace }; });
      return { barH: bar.getBoundingClientRect().height, barW: bar.getBoundingClientRect().width, svW: sv.getBoundingClientRect().width, btns, sx: document.documentElement.scrollWidth };
    });
    T.ok(`${lg}: 採点を保存は全幅（${Math.round(m.svW)}/${Math.round(m.barW)}px）`, m.svW >= m.barW - 2);
    T.ok(`${lg}: どのボタンも1行（nowrap・高さ≤56px）`, m.btns.every(x => x.ws === 'nowrap' && x.h <= 56));
    T.ok(`${lg}: 保存バーの高さ ${Math.round(m.barH)}px ≤ 135`, m.barH <= 135);
    T.ok(`${lg}: 375px幅で横スクロールなし`, m.sx <= 375);
  }
  await p.evaluate(() => { lang = 'ja'; openScore('af'); }); await p.waitForTimeout(400);
  const sbc = await p.evaluate(() => {
    const bar = document.querySelector('.savebar'), cnt = document.getElementById('sbCnt'), r = cnt.querySelector('.sbres');
    return { bg: getComputedStyle(bar).backgroundColor, bodyBg: getComputedStyle(document.body).backgroundColor, txt: cnt.textContent, rCls: r ? r.className : '', rCol: r ? getComputedStyle(r).color : '', s1: getComputedStyle(document.querySelector('.sb[data-s="fail"].sel')).backgroundColor };
  });
  T.ok('保存バーの背景は不透明: ' + sbc.bg, !/rgba\(.*,\s*0\)$/.test(sbc.bg) && sbc.bg !== 'transparent' && !/rgba\([^)]*,\s*0?\.\d+\)/.test(sbc.bg));
  T.ok('sbCnt は「3 / 3」＋合格 0/3: ' + sbc.txt, /3 \/ 3/.test(sbc.txt) && sbc.txt.includes('合格 0/3'));
  T.ok('合否の数は評価色（全問不合格=a1=赤）: ' + sbc.rCls, /\ba1\b/.test(sbc.rCls) && sbc.rCol === sbc.s1);
  // 本文と重ならない：sbCnt の真下の要素が savebar 自身（透けて見える本文ではない）
  await p.evaluate(() => window.scrollTo(0, 200)); await p.waitForTimeout(150);
  T.ok('sbCnt の位置で最前面はバー自身', await p.evaluate(() => { const r = document.getElementById('sbCnt').getBoundingClientRect(); const e = document.elementFromPoint(r.left + 2, r.top + r.height / 2); return !!(e && e.closest('.savebar')); }));

  console.log('[6] 状態バッジ');
  await p.setViewportSize({ width: 800, height: 900 });
  await tab('pgHi');
  const bd = await p.evaluate(() => [...document.querySelectorAll('#hList .badge')].map(x => ({ c: x.className, fs: parseFloat(getComputedStyle(x).fontSize), bg: getComputedStyle(x).backgroundColor, col: getComputedStyle(x).color })));
  T.ok('バッジが表示されている: ' + bd.map(x => x.c).join(','), bd.length >= 2);
  T.ok('バッジは12px以上: ' + bd.map(x => x.fs).join(','), bd.every(x => x.fs >= 12));
  const pend = bd.find(x => /pend/.test(x.c));
  const tok = await p.evaluate(() => { const probe = v => { const d = document.createElement('i'); d.style.color = v; d.style.backgroundColor = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; }; const cs = getComputedStyle(document.documentElement); return { l: probe(cs.getPropertyValue('--pri-l').trim()), d: probe(cs.getPropertyValue('--pri-d').trim()) }; });
  T.ok('確定待ちバッジ＝--pri-l の面に --pri-d の文字', pend && pend.bg === tok.l && pend.col === tok.d);
  T.ok('確定待ちバッジの文字コントラスト ' + (pend ? ratio(pend.bg, pend.col).toFixed(2) : '-') + ' ≥ 4.5', pend && ratio(pend.bg, pend.col) >= 4.5);

  T.ok('JSエラーなし ' + errors.join(' / '), errors.length === 0);
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(1); });
