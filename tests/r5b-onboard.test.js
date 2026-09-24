/* 辛口レビュー R5「初回利用の導線」（2回目・R5b）の回帰テスト。実行: node tests/r5b-onboard.test.js
   [1] 初回（localStorage 空）でも 375×740・390×844・768×1024 で1問目の「録音」が最初の画面に入る
       （使い方＋ドライブ未設定を1枚のカードに・閉じるは1つ・録音するまで進捗ヒーローは出さない）
   [2] カードを閉じる／1件録音するとヒーローが出る・「詳しく」で使い方の全文・？で再表示
   [3] 名前を入れ終えた時に1問目の録音が画面外なら見える位置へ送る（見えていれば動かさない）
   [4] 設定の「この設定を他の端末へ」：?gurl=&gfolder=(&gtoken=&gauto=) のリンク→別の端末（新しいコンテキスト）で開くと取り込める
       合言葉は既定で含めない・コピー・未設定なら出さない・設定手順へのリンク
   [5] 追加文言が ja/en/vi/id に揃う・既存キー名は不変
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
const env = require('./_env');
const T = env.counter();
const GURL = 'https://script.google.com/macros/s/r5btest/exec';

async function open(b, vp, pre) {
  const ctx = await b.newContext({ viewport: vp || { width: 375, height: 740 } });
  const { page: p, errors } = await env.newPage(ctx);
  await p.route('https://script.google.com/**', r => r.fulfill({ contentType: 'application/json', body: '{"ok":true,"id":"F1","url":"https://drive/F1"}' }));
  if (pre) await p.addInitScript(pre);
  await p.goto(env.URL); await p.waitForTimeout(400);
  return { ctx, p, errors };
}
const firstScreen = p => p.evaluate(() => {
  window.scrollTo(0, 0);
  const tb = document.querySelector('.tabs').getBoundingClientRect().top;
  const r = document.getElementById('rb-q1').getBoundingClientRect();
  return { rbTop: Math.round(r.top), rbBot: Math.round(r.bottom), lim: Math.round(Math.min(tb, innerHeight)), sw: document.documentElement.scrollWidth, w: innerWidth };
});

(async () => {
  const b = await env.launch();

  /* ---------- [1] 初回の最初の画面 ---------- */
  console.log('[1] 初回でも1問目の録音が最初の画面に入る');
  for (const vp of [{ width: 375, height: 740 }, { width: 390, height: 844 }, { width: 768, height: 1024 }]) {
    const { ctx, p, errors } = await open(b, vp);
    const tag = vp.width + '×' + vp.height;
    T.ok(tag + ' 初回カードが出ている（使い方＋ドライブ未設定が1枚）', await p.isVisible('#examHowto') && await p.isVisible('#drvHint') &&
      await p.evaluate(() => document.getElementById('drvHint').parentElement.id === 'examHowto'));
    T.ok(tag + ' 閉じるボタンは1つ', await p.evaluate(() => [...document.querySelectorAll('#examHowto button')].filter(x => /toggleHowto\(false\)|dismissDrvHint/.test(x.getAttribute('onclick') || '')).length) === 1);
    T.ok(tag + ' 録音するまで進捗ヒーローは出さない', !(await p.isVisible('#examProg')));
    const v = await firstScreen(p);
    T.ok(tag + ' 1問目の録音ボタンが画面内: ' + JSON.stringify(v), v.rbTop >= 0 && v.rbBot <= v.lim);
    T.ok(tag + ' 横スクロールなし', v.sw <= v.w);
    T.ok(tag + ' JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  // タブレットは4言語すべてで入る（スマホ幅の vi/id は質問文が長いので [3] の自動スクロールで補う）
  {
    const { ctx, p } = await open(b, { width: 768, height: 1024 });
    for (const L of ['EN', 'VI', 'ID']) {
      await p.click(`.lsw button:has-text("${L}")`); await p.waitForTimeout(150);
      const v = await firstScreen(p);
      T.ok('768×1024 ' + L + ' でも録音ボタンが画面内: ' + JSON.stringify(v), v.rbBot <= v.lim);
    }
    await ctx.close();
  }
  {
    const { ctx, p } = await open(b, { width: 375, height: 740 });
    await p.click('.lsw button:has-text("EN")'); await p.waitForTimeout(150);
    const v = await firstScreen(p);
    T.ok('375×740 EN でも録音ボタンが画面内: ' + JSON.stringify(v), v.rbBot <= v.lim);
    await ctx.close();
  }

  /* ---------- [2] 閉じる・詳しく・録音でヒーロー ---------- */
  console.log('[2] 閉じる／詳しく／録音');
  {
    const { ctx, p, errors } = await open(b);
    T.ok('カードに短い手順', (await p.textContent('#howtoS')).includes('「録音」'));
    T.ok('全文は畳んである', !(await p.isVisible('#howtoLong')) && await p.getAttribute('#howtoMore', 'aria-expanded') === 'false');
    await p.click('#howtoMore'); await p.waitForTimeout(100);
    T.ok('「詳しく」で全文（1人終わるたびに…）', await p.isVisible('#howtoLong') && (await p.textContent('#howtoLong')).includes('1人終わるたびに') && await p.getAttribute('#howtoMore', 'aria-expanded') === 'true');
    await p.click('#howtoMore');
    T.ok('ドライブの1行から設定のURL欄へ', await (async () => { await p.click('#drvHintGo'); await p.waitForTimeout(400); const ok = await p.isVisible('#gUrl'); await p.click('.tabs button[data-pg="pgExam"]'); await p.waitForTimeout(200); return ok; })());
    T.ok('閉じるボタンに名前（×だけにしない）', (await p.getAttribute('#howtoX', 'aria-label')) === '使い方を閉じる');
    await p.click('#howtoX'); await p.waitForTimeout(150);
    T.ok('閉じる1回でカードもドライブの1行も消える', !(await p.isVisible('#examHowto')) && !(await p.isVisible('#drvHint')));
    T.ok('閉じるとヒーローが出る（ドライブ：未設定）', await p.isVisible('#examProg') && (await p.textContent('#epDrv')).includes('未設定'));
    T.ok('使い方・ドライブ案内の両方のキーに記録', await p.evaluate(() => localStorage.getItem('oral_exam_howto_off') === '1' && localStorage.getItem('oral_exam_drvhint_off') === '1'));
    await p.reload(); await p.waitForTimeout(300);
    T.ok('再読み込み後も出さない（？に畳む）', !(await p.isVisible('#examHowto')) && !(await p.isVisible('#drvHint')) && await p.isVisible('#howtoBtn'));
    await p.click('#howtoBtn'); await p.waitForTimeout(150);
    T.ok('？で再表示すると未設定の1行も戻る', await p.isVisible('#examHowto') && await p.isVisible('#drvHint'));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  {
    const { ctx, p, errors } = await open(b);
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン'); await p.press('#fEe', 'Tab');
    await p.click('#rb-q1'); await p.waitForTimeout(900); await p.click('#rb-q1'); await p.waitForTimeout(900);
    T.ok('1件録音するとヒーローが出る（カードは開いたままでも）', await p.isVisible('#examProg') && await p.isVisible('#examHowto'));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- [3] 名前を入れたら1問目へ ---------- */
  console.log('[3] 名前の入力後に1問目の録音へ送る');
  {
    const { ctx, p, errors } = await open(b, { width: 375, height: 600 }); // 低い画面：初回は録音ボタンが画面外
    const before = await firstScreen(p);
    T.ok('前提：低い画面では画面外 ' + JSON.stringify(before), before.rbTop >= before.lim);
    await p.fill('#fEr', '岡田'); await p.fill('#fEe', 'グエン'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(900);
    const af = await p.evaluate(() => { const tb = document.querySelector('.tabs').getBoundingClientRect().top, r = document.getElementById('rb-q1').getBoundingClientRect(); return { top: r.top, bot: r.bottom, tb, y: scrollY }; });
    T.ok('名前を入れ終えると録音ボタンが見える位置へ ' + JSON.stringify(af), af.y > 0 && af.top >= 0 && af.bot <= af.tb);
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  {
    const { ctx, p } = await open(b, { width: 375, height: 740 });
    await p.fill('#fEe', 'グエン'); await p.press('#fEe', 'Tab'); await p.waitForTimeout(700);
    T.ok('見えていれば動かさない', await p.evaluate(() => scrollY) === 0);
    await ctx.close();
  }

  /* ---------- [4] 他の端末へ設定を渡す ---------- */
  console.log('[4] この設定を他の端末へ');
  {
    const { ctx, p, errors } = await open(b);
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(200);
    await p.evaluate(() => { document.querySelectorAll('#pgCfg details.acc').forEach(d => d.open = true); });
    T.ok('設定手順へのリンク（相対・新しいタブ）', /^SETUP-GOOGLE-DRIVE\.(md|html)$/.test(await p.getAttribute('#gSetupLink', 'href')) && await p.getAttribute('#gSetupLink', 'target') === '_blank' && (await p.textContent('#gSetupLink')).includes('設定手順'));
    T.ok('未設定の端末には共有欄を出さない', !(await p.isVisible('#gShare')));
    await p.fill('#gUrl', GURL); await p.fill('#gToken', 'aikotoba-1'); await p.fill('#gFolder', '口頭試問<テスト>');
    await p.click('#pgCfg button[onclick="saveGoogleCfg()"]'); await p.waitForTimeout(600);
    T.ok('設定後は共有欄が出る', await p.isVisible('#gShare') && (await p.textContent('#gShare')).includes('この設定を他の端末へ'));
    let link = await p.inputValue('#gShareUrl');
    let q = new URL(link).searchParams;
    T.ok('リンクにURL・フォルダ（合言葉は既定で含めない） ' + link, q.get('gurl') === GURL && q.get('gfolder') === '口頭試問<テスト>' && !q.has('gtoken') && !q.has('gauto'));
    T.ok('合言葉なしのときは受け取り側の手順を添える', (await p.textContent('#gShare')).includes('合言葉を入れて'));
    T.ok('フォルダ名の <> はHTMLとして解釈されない', await p.evaluate(() => !document.getElementById('gShare').innerHTML.includes('<テスト>') && document.getElementById('gShareUrl').value.includes('%3C')));
    await p.check('#gShareTok'); await p.waitForTimeout(100);
    link = await p.inputValue('#gShareUrl'); q = new URL(link).searchParams;
    T.ok('選ぶと合言葉と自動保存も含める', q.get('gtoken') === 'aikotoba-1' && q.get('gauto') === '1');
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
    await p.click('#gShareCopy'); await p.waitForTimeout(200);
    T.ok('コピーのトースト: ' + await p.textContent('#toast'), /コピー/.test(await p.textContent('#toast')));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();

    // 受け取る端末（別コンテキスト＝localStorage 空）でリンクを開く
    const ctx2 = await b.newContext({ viewport: { width: 375, height: 740 } });
    const { page: p2, errors: e2 } = await env.newPage(ctx2);
    const dialogs = []; p2.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await p2.goto(env.URL + '?' + new URL(link).searchParams.toString()); await p2.waitForTimeout(500);
    const g2 = await p2.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_google_v1') || 'null'));
    T.ok('受け取った端末に取り込まれる（送信先の確認あり） ' + JSON.stringify(g2), dialogs.length === 1 && g2 && g2.url === GURL && g2.token === 'aikotoba-1' && g2.folder === '口頭試問<テスト>' && g2.auto === true);
    T.ok('合言葉はアドレスバーから消える', !(await p2.evaluate(() => location.search)).includes('gtoken'));
    T.ok('受け取った端末ではヒーロー／未設定の案内が消える', !(await p2.isVisible('#drvHint')));
    T.ok('JSエラーなし ' + e2.join('|'), !e2.length);
    await ctx2.close();
  }

  /* ---------- [5] 文言・キー ---------- */
  console.log('[5] 4言語・キー名');
  {
    const { ctx, p } = await open(b);
    T.ok('追加文言が ja/en/vi/id に揃う', await p.evaluate(() => ['howtoS', 'howtoMore', 'howtoLess', 'drvHintS', 'gShareT', 'gShareNote', 'gShareTok', 'gShareNoTok', 'gShareCopy', 'gShareSend', 'gShareCopied', 'gShareCopyFail', 'gSetupLink'].every(k => ['ja', 'en', 'vi', 'id'].every(L => TX2[L][k] && (L === 'ja' || TX2[L][k] !== TX2.ja[k])))));
    for (const [L, w] of [['VI', 'Đọc'], ['ID', 'Bacakan'], ['EN', 'Read']]) {
      await p.click(`.lsw button:has-text("${L}")`); await p.waitForTimeout(120);
      T.ok(`初回カードが${L}に追従`, (await p.textContent('#howtoS')).includes(w) && (await p.getAttribute('#howtoX', 'aria-label')) === (await p.evaluate(() => t2('howtoHide'))));
    }
    T.ok('既存のlocalStorageキー名は不変', await p.evaluate(() => GKEY === 'oral_exam_google_v1' && DRVHINTKEY === 'oral_exam_drvhint_off' && HOWTOKEY === 'oral_exam_howto_off'));
    await ctx.close();
  }

  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
