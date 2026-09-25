/* その場で出題（空欄3問・2026-09-25〜の既定）の回帰テスト。実行: node tests/free-q.test.js
   - 新しい端末は空欄3問（問題文の入力欄）で開く／従来の3問は「変更」→「標準の3問」で出せる
   - 従来の3問のまま使っていた端末だけ一度切り替え（自分のセット・編集した構成は変えない）
   - 書いた問題文が 下書き・保存・履歴・採点・CSV・ドライブのファイル名 に入る（ドライブ送信は page.route でモック） */
'use strict';
const env = require('./_env');
const T = env.counter();
const GAS = 'https://script.google.com/macros/s/x/exec';

(async () => {
  const b = await env.launch({ freeDefault: true });
  const open = async (init, vp) => {
    const ctx = await b.newContext({ viewport: vp || { width: 375, height: 800 }, acceptDownloads: true });
    if (init) await ctx.addInitScript(init);
    const { page: p, errors } = await env.newPage(ctx);
    p.on('dialog', d => d.accept());
    const posts = []; let n = 0;
    await p.route('https://script.google.com/**', async r => {
      const j = JSON.parse(r.request().postData() || '{}');
      if (j.ping) return r.fulfill({ contentType: 'application/json', body: '{"ok":true,"ping":true}' });
      posts.push({ name: j.name, replaceId: j.replaceId || null }); n++;
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'F' + n, url: 'https://drive/F' + n }) });
    });
    await p.goto(env.URL); await p.waitForTimeout(500);
    return { ctx, p, errors, posts };
  };
  const rec = async (p, id) => { await p.click('#rb-' + id); await p.waitForTimeout(1000); await p.click('#rb-' + id); await p.waitForTimeout(900); };

  console.log('[1] 新しい端末は空欄3問');
  {
    const { ctx, p, errors } = await open();
    T.ok('カード3枚・問題文の入力欄3つ', await p.locator('#examCards .qc').count() === 3 && await p.locator('#examCards .qtx').count() === 3);
    T.ok('従来の問題文（名前・説明）は出さない', await p.locator('#examCards .enm').count() === 0 && !(await p.textContent('#examCards')).includes('母豚の健康観察'));
    T.ok('出題名＝その場で出題（空欄3問）', (await p.textContent('#examSetName')) === 'その場で出題（空欄3問）');
    T.ok('入力欄は空・案内文つき', await p.inputValue('#qt-f1') === '' && (await p.getAttribute('#qt-f1', 'placeholder')).includes('その場で'));
    T.ok('375px幅で横スクロールなし', await p.evaluate(() => document.documentElement.scrollWidth <= 375));
    for (const [l, w] of [['en', 'Type the question'], ['vi', 'Nhập câu hỏi'], ['id', 'Ketik pertanyaan']]) {
      await p.evaluate(x => setLang(x), l); await p.waitForTimeout(150);
      T.ok(l + ': 入力欄の案内が言語に追従', (await p.getAttribute('#qt-f1', 'placeholder')).includes(w));
    }
    await p.evaluate(() => setLang('ja'));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  console.log('[2] 既存端末の一度きりの切り替え');
  {
    // 従来の3問のまま（3問化の印あり・空欄化の印なし）→ 空欄3問へ
    const classic = `if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('oral_exam_cfg3_migrated','1');localStorage.setItem('oral_exam_items_v1',JSON.stringify(${JSON.stringify(require('./fixtures/classic-cfg.json'))}))}`;
    const a = await open(classic);
    T.ok('従来の3問の端末 → 空欄3問に切り替わる', await a.p.locator('#examCards .qtx').count() === 3 && await a.p.evaluate(() => localStorage.getItem('oral_exam_cfg_free_migrated')) === '1');
    await a.p.evaluate(() => localStorage.setItem('oral_exam_items_v1', JSON.stringify(defaultCfg())));
    await a.p.reload(); await a.p.waitForTimeout(400);
    T.ok('切り替えは一度きり（その後に標準の3問へ戻したら戻ったまま）', await a.p.locator('#examCards .qtx').count() === 0 && (await a.p.textContent('#examCards')).includes('母豚の健康観察'));
    await a.ctx.close();
    // 自分のセットを使用中 → 変えない
    const mine = `if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('oral_exam_cfg3_migrated','1');const c=${JSON.stringify(require('./fixtures/classic-cfg.json'))};localStorage.setItem('oral_exam_items_v1',JSON.stringify(c));localStorage.setItem('oral_exam_presets_v1',JSON.stringify({presets:[{id:'s1',name:'自分用',cfg:c}],activeId:'s1'}))}`;
    const m = await open(mine);
    T.ok('自分のセット使用中の端末は変えない', await m.p.locator('#examCards .qtx').count() === 0 && (await m.p.textContent('#examSetName')) === '自分用');
    await m.ctx.close();
    // 質問を書き換えた構成 → 変えない
    const edited = `if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('oral_exam_cfg3_migrated','1');const c=${JSON.stringify(require('./fixtures/classic-cfg.json'))};c.items[0].name='自分で直した質問';localStorage.setItem('oral_exam_items_v1',JSON.stringify(c))}`;
    const e = await open(edited);
    T.ok('質問を書き換えた端末は変えない', await e.p.locator('#examCards .qtx').count() === 0 && (await e.p.textContent('#examCards')).includes('自分で直した質問'));
    await e.ctx.close();
  }

  console.log('[3] 書いた問題文が保存・履歴・採点・CSV・ドライブ名に入る');
  {
    const { ctx, p, errors, posts } = await open(`if(!sessionStorage.getItem('x')){sessionStorage.setItem('x','1');localStorage.setItem('oral_exam_google_v1',JSON.stringify({url:'${GAS}',auto:true,autoSet:true}))}`);
    const Q = '分娩舎で最初に確認することは？';
    await p.fill('#qt-f1', Q); await p.fill('#fEe', 'グエン'); await p.press('#fEe', 'Tab');
    await p.waitForTimeout(500);
    T.ok('入力は下書きに保存', await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_draft_v1')).items.f1.qText) === Q);
    await p.reload(); await p.waitForTimeout(500);
    T.ok('読み込み直しても問題文が残る', await p.inputValue('#qt-f1') === Q);
    await rec(p, 'f1'); await p.waitForTimeout(600);
    T.ok('ドライブ名に問題文: ' + (posts[0] && posts[0].name), !!posts[0] && posts[0].name.includes('出-1_未判定_分娩舎で最初に確認することは'));
    await p.click('#vp-f1'); await p.waitForTimeout(2300);
    T.ok('合否で付け直し: ' + (posts[1] && posts[1].name), !!posts[1] && posts[1].name.includes('_合格_分娩舎') && posts[1].replaceId === 'F1');
    await p.fill('#qt-f1', '分娩舎の温度の見方は？'); await p.waitForTimeout(2300);
    const last = posts[posts.length - 1];
    T.ok('録音後に問題文を直すとドライブ名も付け直す: ' + last.name, last.name.includes('_合格_分娩舎の温度の見方は') && !!last.replaceId);
    await p.fill('#qt-f2', '<img src=x onerror="window.__x=1">'); await rec(p, 'f2');
    await p.locator('button:has-text("試問を保存")').click(); await p.waitForTimeout(900);
    const s = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions[0]);
    T.ok('保存: 問題文・出題の記録（free）', s.items.f1.qText === '分娩舎の温度の見方は？' && s.setId === 'free' && s.meta.f1.name === '分娩舎の温度の見方は？');
    T.ok('問題文を書かなかった問は「質問3」扱い（録音なし＝保存対象外）', !s.items.f3 || !s.items.f3.hasAudio);
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(300);
    await p.click('#hList .hi'); await p.waitForTimeout(400);
    const det = await p.textContent('#moBody');
    T.ok('履歴の詳細に問題文', det.includes('分娩舎の温度の見方は？'));
    T.ok('問題文のタグは実行されない', !(await p.evaluate(() => window.__x)) && det.includes('<img'));
    await p.click('.mx');
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(300);
    await p.selectOption('#scFil', 'all').catch(() => {}); await p.waitForTimeout(300);
    await p.click('#scList .hi'); await p.waitForTimeout(500);
    T.ok('採点画面に問題文', (await p.textContent('#scDetail')).includes('分娩舎の温度の見方は？'));
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(300);
    const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => doCSV())]);
    const csv = require('fs').readFileSync(await dl.path(), 'utf8');
    const head = csv.split('\n')[0];
    T.ok('CSV: 「質問1(問題文)」列と中身', head.includes('"質問1(問題文)"') && csv.includes('"分娩舎の温度の見方は？"'));
    T.ok('CSV: 合否列の見出しは「質問1(合否)」', head.includes('"質問1(合否)"'));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  console.log('[4] 「変更」から標準の3問・空欄3問を行き来');
  {
    const { ctx, p, errors } = await open();
    await p.click('#examSetBtn'); await p.waitForTimeout(300);
    const names = await p.$$eval('.setpick .sp-n', e => e.map(x => x.textContent));
    T.ok('一覧の先頭に「その場で出題」、次に「標準の3問」', names[0] === 'その場で出題（空欄3問）' && names[1] === '標準の3問（母豚の健康観察ほか）');
    await p.click('.setpick[data-kind="def"]'); await p.waitForTimeout(600);
    T.ok('標準の3問＝従来の問題文が出る', await p.locator('#examCards .qtx').count() === 0 && (await p.textContent('#examCards')).includes('母豚の健康観察') && (await p.textContent('#examSetName')) === '標準の3問（母豚の健康観察ほか）');
    await p.click('#examSetBtn'); await p.waitForTimeout(300);
    await p.click('.setpick[data-kind="free"]'); await p.waitForTimeout(600);
    T.ok('空欄3問に戻せる', await p.locator('#examCards .qtx').count() === 3 && (await p.textContent('#examSetName')) === 'その場で出題（空欄3問）');
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  await b.close();
  T.done();
})();
