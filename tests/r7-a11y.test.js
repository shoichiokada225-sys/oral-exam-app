/* 辛口レビュー R7（アクセシビリティ）の回帰テスト。実行: node tests/r7-a11y.test.js
   [1] 採点画面を Tab で移動した先が、保存バー・タブ・ヘッダーに隠れない（上端と下端の elementFromPoint が自分自身）
   [2] 採点詳細を開くと受験者名の見出しへフォーカス／一覧へ戻る・保存で戻ると直前の行へフォーカス
   [3] モーダル（履歴詳細・作業カタログ）は見出しで名前が付き、背後（header/main/nav）は inert。閉じると外れる
   [4] 試問ヒーローのドライブ状態ボタン・「次の未判定へ」は当たり判定44px以上で、ヒーローの外（カード）やチップに被らない
   [5] 「質問しなかった」の行は44px以上・チェック本体22px
   [6] 採点のテキスト欄・設定画面の欄やボタンに、どの問のものかが分かる名前（4言語）
   Googleドライブ送信は page.route でモック（本番GASには送らない）。音声は hasAudio フラグのみ（IndexedDB に触れない） */
const env = require('./_env');
const T = env.counter();
const S = (id, ee, items) => ({ id, date: '2026-09-2' + id.slice(-1), examiner: '岡田', examinee: ee, status: 'rec', items, overall: '', createdAt: '2026-09-20T00:00:0' + id.slice(-1) + 'Z', updatedAt: '2026-09-20T00:00:00Z' });
(async () => {
  const b = await env.launch();
  const { page: p, errors } = await env.newPage(b);
  p.on('dialog', d => d.accept());
  await p.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'F1', url: 'https://drive/F1' }) }));
  await p.setViewportSize({ width: 375, height: 740 });
  await p.goto(env.URL); await p.waitForTimeout(300);
  const ids = await p.evaluate(() => getItems().map(i => i.id));
  await p.evaluate(ids => {
    const it = {}; ids.forEach(id => { it[id] = { hasAudio: true, transcript: '' }; });
    saveAll([
      { id: 'sessA1', date: '2026-09-21', examiner: '岡田', examinee: 'グエン', status: 'rec', items: JSON.parse(JSON.stringify(it)), overall: '', createdAt: '2026-09-21T00:00:00Z' },
      { id: 'sessB2', date: '2026-09-22', examiner: '岡田', examinee: 'ブディ', status: 'rec', items: JSON.parse(JSON.stringify(it)), overall: '', createdAt: '2026-09-22T00:00:00Z' },
    ]);
  }, ids);
  const tab = async pg => { await p.click(`.tabs button[data-pg="${pg}"]`); await p.waitForTimeout(250); };
  const act = () => p.evaluate(() => { const a = document.activeElement; return { tag: a.tagName, id: a.id, sid: a.dataset ? a.dataset.sid || '' : '' }; });

  console.log('[2] 採点詳細を開く・戻るときのフォーカス');
  await tab('pgScore');
  await p.focus('#scList .hi[data-sid="sessA1"]');
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  let a = await act();
  T.ok('開いた直後は受験者名の見出し（#scHead）: ' + a.tag + '#' + a.id, a.id === 'scHead');
  T.ok('見出しは role=heading・受験者名', await p.evaluate(() => { const h = document.getElementById('scHead'); return h.getAttribute('role') === 'heading' && h.textContent === 'グエン'; }));
  await p.keyboard.press('Tab'); a = await act();
  T.ok('次の Tab は見出しの直後（再生速度ボタン）: ' + a.id, a.id === 'spdBtn');

  console.log('[1] Tab で移動した先が固定表示に隠れない（375x740）');
  let checked = 0, hidden = [];
  for (let i = 0; i < 60; i++) {
    await p.keyboard.press('Tab'); await p.waitForTimeout(60);
    const r = await p.evaluate(() => {
      const el = document.activeElement;
      if (!el || !document.getElementById('scDetail').contains(el)) return { out: true };
      if (el.closest('.savebar')) return { bar: true };
      const b = el.getBoundingClientRect(), x = b.left + Math.min(b.width / 2, 20);
      const hit = y => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); };
      return { name: el.id || el.className || el.tagName, ok: hit(b.top + 2) && hit(b.bottom - 2), y: Math.round(b.top) };
    });
    if (r.out || r.bar) break;
    checked++; if (!r.ok) hidden.push(r.name + '@' + r.y);
  }
  T.ok(`Tab で巡回した ${checked} 要素がすべて見える（隠れ: ${hidden.join(',') || 'なし'}）`, checked >= 8 && !hidden.length);
  T.ok('採点を開いている間は html.scoring（scroll-padding-bottom あり）', await p.evaluate(() => document.documentElement.classList.contains('scoring') && parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) > 150));
  // Shift+Tab で戻っても隠れない
  hidden = []; let back = 0;
  for (let i = 0; i < 6; i++) {
    await p.keyboard.press('Shift+Tab'); await p.waitForTimeout(60);
    const r = await p.evaluate(() => { const el = document.activeElement; if (el.closest('.savebar') || !document.getElementById('scDetail').contains(el)) return null; const b = el.getBoundingClientRect(), x = b.left + Math.min(b.width / 2, 20); const hit = y => { const h = document.elementFromPoint(x, y); return !!h && (h === el || el.contains(h)); }; return { n: el.id || el.className, ok: hit(b.top + 2) && hit(b.bottom - 2) }; });
    if (!r) continue; back++; if (!r.ok) hidden.push(r.n);
  }
  T.ok(`Shift+Tab で戻った ${back} 要素も見える（隠れ: ${hidden.join(',') || 'なし'}）`, back >= 3 && !hidden.length);

  console.log('[5] 「質問しなかった」の当たり判定');
  const na = await p.evaluate(id => { const c = document.querySelector('.nachk[data-id="' + id + '"]'), l = c.closest('label'), r = document.querySelector('.sb[data-id="' + id + '"]'); const cb = c.getBoundingClientRect(), lb = l.getBoundingClientRect(), rb = r.getBoundingClientRect(); return { cw: cb.width, ch: cb.height, lh: lb.height, gap: lb.top - rb.bottom }; }, ids[1]);
  T.ok(`行の高さ ${na.lh}px ≥ 44`, na.lh >= 44);
  T.ok(`チェック本体 ${na.cw}x${na.ch} ≥ 22`, na.cw >= 22 && na.ch >= 22);
  T.ok(`○×の行との間隔 ${Math.round(na.gap)}px（20px以上離す）`, na.gap >= 20);

  console.log('[6] 採点のテキスト欄の名前');
  const lbls = await p.evaluate(ids => ids.map(id => [document.getElementById('tr-' + id).getAttribute('aria-label'), document.getElementById('cm-' + id).getAttribute('aria-label')]), ids);
  const names = await p.evaluate(() => getItems().map(it => loc(it, 'name')));
  T.ok('文字起こし欄の名前に問題名＋「文字起こし」', lbls.every((l, i) => l[0] === names[i] + ' 文字起こし'));
  T.ok('コメント欄の名前に問題名', lbls.every((l, i) => l[1].startsWith(names[i] + ' ')));
  T.ok('各問の文字起こし欄の名前が全部ちがう', new Set(lbls.map(l => l[0])).size === ids.length);

  console.log('[2] 一覧へ戻る／保存で戻る');
  await p.focus('#scDetail .savebar .sbsub:last-child'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  a = await act();
  T.ok('一覧へ戻ると直前の行（sessA1）へフォーカス: ' + a.tag + ' ' + a.sid, a.sid === 'sessA1');
  T.ok('一覧へ戻ると html.scoring が外れる', await p.evaluate(() => !document.documentElement.classList.contains('scoring')));
  await p.click('#scList .hi[data-sid="sessB2"]'); await p.waitForTimeout(400);
  for (const id of ids) await p.click(`.sb[data-id="${id}"][data-s="pass"]`, { force: true });
  await p.waitForTimeout(100);
  await p.click('#scDetail .sbsave'); await p.waitForTimeout(400);
  a = await act();
  T.ok('採点を保存して戻ると採点した行（sessB2）へフォーカス: ' + a.sid, a.sid === 'sessB2');
  T.ok('保存値はそのまま pass', await p.evaluate(ids => ids.every(id => getAll().find(s => s.id === 'sessB2').items[id].score === 'pass'), ids));

  console.log('[3] モーダルの名前と背後の inert');
  await tab('pgHi');
  await p.locator('#hList .hi').first().click(); await p.waitForTimeout(300);
  const m = await p.evaluate(() => { const mb = document.getElementById('moBody'), lb = mb.getAttribute('aria-labelledby'); const bg = ['body>header', 'body>main', 'body>nav.tabs'].map(s => document.querySelector(s)); return { lb, title: lb && document.getElementById(lb) ? document.getElementById(lb).textContent : '', inert: bg.every(e => e.inert === true || e.getAttribute('aria-hidden') === 'true') }; });
  T.ok('履歴詳細は aria-labelledby=moTitle で名前あり: ' + m.title, m.lb === 'moTitle' && m.title.includes('2026-09-2'));
  T.ok('履歴詳細の表示中は header/main/nav が inert', m.inert);
  const snap = await p.locator('#moBody').ariaSnapshot();
  T.ok('dialog に名前が付く（ariaSnapshot）', /dialog "[^"]+"/.test(snap));
  const opener = await p.evaluate(() => moOpener && moOpener.className);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  T.ok('閉じると inert/aria-hidden が外れる', await p.evaluate(() => ['body>header', 'body>main', 'body>nav.tabs'].every(s => { const e = document.querySelector(s); return !e.inert && !e.hasAttribute('aria-hidden'); })));
  T.ok('閉じると開いた行へフォーカスが戻る', await p.evaluate(c => document.activeElement.className === c, opener));
  await tab('pgCfg');
  await p.evaluate(() => openCatalog()); await p.waitForTimeout(200);
  T.ok('作業カタログも見出しで名前が付く', await p.evaluate(() => { const lb = document.getElementById('moBody').getAttribute('aria-labelledby'); return lb === 'moTitle' && document.getElementById('moTitle').textContent === t('catAddTitle') && document.querySelector('body>main').inert; }));
  await p.evaluate(() => closeMo());

  console.log('[6] 設定画面の欄・ボタンの名前');
  const cf = await p.evaluate(() => {
    const it = cfg.items.find(i => i.ans != null) || cfg.items[0];
    const box = [...document.querySelectorAll('#cfgArea .cfg-item')].find(el => el.querySelector('.ci-row input').value === it.name);
    const tas = [...box.querySelectorAll('textarea')].map(x => x.getAttribute('aria-label') || '');
    const dels = [...document.querySelectorAll('#cfgArea button.del')].map(x => x.getAttribute('aria-label'));
    return { name: it.name, hasAns: it.ans != null, tas, del: box.querySelector('button.del').getAttribute('aria-label'), uniq: new Set(dels).size === dels.length, secDel: document.querySelector('#cfgArea .cfg-sec-hdr button.del').getAttribute('aria-label') };
  });
  T.ok('質問文・模範解答の欄に質問名: ' + cf.tas.join(' / '), cf.tas.length >= 1 && cf.tas.every(x => x.startsWith(cf.name + ' ')) && (!cf.hasAns || cf.tas.some(x => x.endsWith(' 模範解答（参考）'))));
  T.ok('削除ボタンに質問名: ' + cf.del, cf.del === '削除: ' + cf.name);
  T.ok('セクションの削除ボタンにセクション名: ' + cf.secDel, /^削除: .+/.test(cf.secDel));
  T.ok('削除ボタンの名前が全部ちがう', cf.uniq);

  console.log('[6] 4言語で名前が付く');
  for (const lg of ['en', 'vi', 'id', 'ja']) {
    await p.evaluate(l => setLang(l), lg); await p.waitForTimeout(150);
    await tab('pgScore'); await p.click('#scList .hi[data-sid="sessA1"]'); await p.waitForTimeout(300);
    const r = await p.evaluate(id => ({ a: document.getElementById('tr-' + id).getAttribute('aria-label'), w: t('trLbl'), c: document.getElementById('cm-' + id).getAttribute('aria-label'), cw: t('cmtLbl') }), ids[0]);
    T.ok(`${lg}: ${r.a}`, r.a.endsWith(' ' + r.w) && r.c.endsWith(' ' + r.cw) && r.a.length > r.w.length + 1);
    await p.evaluate(() => backToScoreList());
  }

  console.log('[4] 試問ヒーローの当たり判定');
  await p.evaluate(() => localStorage.setItem('oral_exam_google_v1', JSON.stringify({ url: 'https://script.google.com/macros/s/x/exec', auto: false })));
  await tab('pgExam');
  await p.setViewportSize({ width: 375, height: 1000 }); // ヒーロー全体がタブより上に見える高さ（スクロールすると小型化して epDrv は隠れる）
  await p.evaluate(() => { const it = getItems()[0]; cur.items[it.id] = { hasAudio: true }; buildExamCards(); updateDriveUi(); window.scrollTo(0, 0); });
  await p.waitForTimeout(300);
  const h = await p.evaluate(() => {
    const d = document.getElementById('epDrv').getBoundingClientRect(), n = document.getElementById('epNextUnj'), pr = document.getElementById('examProg').getBoundingClientRect();
    const chips = [...document.querySelectorAll('#epChips .chip')].map(c => { const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return e === c || c.contains(e); });
    const dc = document.elementFromPoint(d.left + 5, d.top + d.height / 2);
    return { dh: d.height, dTop: d.top, dBot: d.bottom, prTop: pr.top, prBot: pr.bottom, nh: n ? n.getBoundingClientRect().height : 0, chipsOk: chips.every(Boolean), dHit: dc && dc.id === 'epDrv' };
  });
  T.ok(`ドライブ状態ボタンの高さ ${h.dh}px ≥ 44`, h.dh >= 44);
  T.ok(`ドライブ状態ボタンはヒーローの内側（${Math.round(h.dTop)}〜${Math.round(h.dBot)} ⊂ ${Math.round(h.prTop)}〜${Math.round(h.prBot)}）`, h.dTop >= h.prTop && h.dBot <= h.prBot + 0.5);
  T.ok('ドライブ状態ボタンの左端を押すと自分に当たる', h.dHit);
  T.ok('チップの中央は押せる（ドライブボタンが被らない）', h.chipsOk);
  T.ok(`「次の未判定へ」の高さ ${h.nh}px ≥ 44`, h.nh >= 44);
  await p.setViewportSize({ width: 375, height: 740 });
  T.ok('375px幅で横スクロールなし', await p.evaluate(() => document.documentElement.scrollWidth <= 375));

  T.ok('JSエラーなし ' + errors.join('|'), errors.length === 0);
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
