/* 辛口レビュー R3「エラー・空状態」の回帰テスト。実行: node tests/r3-errempty.test.js
   A ドライブ送信が応答なしで止まっても時間切れで「未送信」に戻り、電波復帰で再送される
   B 接続・送信の失敗理由を利用者の言葉で出す（公開範囲／合言葉／4言語）
   C Chart.js（CDN）が遅い・取れないときも画面は開き、グラフタブに理由を出す
   D 端末ストレージの永続化・残り容量の警告
   E 録音の実体が無い／IndexedDB が開けないときの再生欄と未送信表示
   F 採点・履歴・グラフが空のときの導線、空の間は CSV を押せない
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
'use strict';
const env = require('./_env');
const c = env.counter();
const GURL = 'https://script.google.com/macros/s/x/exec';
const GCFG = JSON.stringify({ url: GURL, token: 'tk', auto: true, autoSet: true });
const toastTxt = p => p.evaluate(() => document.getElementById('toast').textContent);
async function rec(p, id) { await p.click('#rb-' + id); await p.waitForTimeout(900); await p.click('#rb-' + id); await p.waitForTimeout(900); }
async function saveExam(p) { await p.click('button:has-text("試問を保存")'); await p.waitForTimeout(500); }

(async () => {
  const b = await env.launch();

  /* ---------- A: 応答なしで止まる送信 ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    let mode = 'hang', posts = 0; const hung = [];
    await p.route('https://script.google.com/**', r => {
      posts++;
      if (mode === 'hang') { hung.push(r); return; } // 応答を返さないまま止める
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'F' + posts, url: 'https://drive/F' + posts }) });
    });
    await p.goto(env.URL);
    await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), GCFG);
    await p.reload(); await p.waitForTimeout(300);
    await p.evaluate(() => { GAS_TO_BASE = 1500; GAS_TO_PER_MB = 0; }); // テスト用に打ち切りを短く
    await p.fill('#fEe', 'グエン');
    await rec(p, 'q1');
    c.ok('A 送信中の表示', (await p.textContent('#cl-q1')).includes('保存中'));
    // 送信中に名前の確定などで予約された送り直しが1回続くことがある→時間切れの表示になるまで最大8秒待つ
    await p.waitForFunction(() => /応答がありません/.test(document.getElementById('cl-q1').textContent), null, { timeout: 8000 }).catch(() => {});
    const t1 = await p.textContent('#cl-q1');
    c.ok('A 時間切れで「未送信」に戻る: ' + t1, t1.includes('⚠') && t1.includes('応答がありません'));
    c.ok('A 送信中の印(upBusy)が解放される', await p.evaluate(() => isUnsent(cur, 'q1')));
    c.ok('A 下書きに失敗理由が残る', await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_draft_v1')).items.q1.driveErr === 'timeout'));
    mode = 'ok';
    const n0 = posts;
    await p.context().setOffline(true); await p.waitForTimeout(200); await p.context().setOffline(false);
    await p.waitForTimeout(2500);
    c.ok('A 電波復帰で自動再送される: 送信 ' + n0 + '→' + posts, posts === n0 + 1);
    c.ok('A 再送後は保存済み', (await p.textContent('#cl-q1')).includes('保存済み'));
    c.ok('A 成功で失敗理由を消す', await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('oral_exam_draft_v1')).items.q1; return !r.driveErr && !r.driveSt; }));
    // タップでの再送も効く（止まる→時間切れ→タップ→届く）
    mode = 'hang';
    await rec(p, 'q4');
    await p.waitForFunction(() => /応答がありません/.test(document.getElementById('cl-q4').textContent), null, { timeout: 8000 }).catch(() => {});
    mode = 'ok'; const n1 = posts;
    await p.click('#cl-q4'); await p.waitForTimeout(800);
    c.ok('A 時間切れの後にタップで再送できる', posts === n1 + 1 && (await p.textContent('#cl-q4')).includes('保存済み'));
    c.ok('A JSエラーなし ' + errors.join('|'), errors.length === 0);
    hung.forEach(r => r.abort().catch(() => {}));
    await p.close();
  }

  /* ---------- B: 失敗理由の言い分け ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    let mode = 'html';
    await p.route('https://script.google.com/**', r => {
      if (mode === 'html') return r.fulfill({ contentType: 'text/html', body: '<!DOCTYPE html><html><body>Sign in</body></html>' });
      if (mode === 'token') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'bad-token' }) });
      if (mode === 'http') return r.fulfill({ status: 404, body: 'nf' });
      return r.abort('internetdisconnected');
    });
    await p.goto(env.URL);
    await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), GCFG);
    await p.reload(); await p.waitForTimeout(300);
    await p.evaluate(() => gasTest()); await p.waitForTimeout(400);
    let tt = await toastTxt(p);
    c.ok('B 公開範囲の設定ミスを案内: ' + tt, tt.includes('公開範囲') && tt.includes('全員'));
    mode = 'token'; await p.evaluate(() => gasTest()); await p.waitForTimeout(400); tt = await toastTxt(p);
    c.ok('B 合言葉違いを案内: ' + tt, tt.includes('合言葉が一致しません'));
    mode = 'http'; await p.evaluate(() => gasTest()); await p.waitForTimeout(400); tt = await toastTxt(p);
    c.ok('B HTTPエラーはURL確認: ' + tt, tt.includes('URL') && tt.includes('404'));
    // 電波はある（navigator.onLine=true）のに通信が失敗＝URL違い・公開範囲の設定ミス → 「圏外」とは言わない
    mode = 'off'; await p.evaluate(() => gasTest()); await p.waitForTimeout(400); tt = await toastTxt(p);
    c.ok('B 電波があるのに届かない＝URL・公開範囲を確認: ' + tt, tt.includes('GASに届きません') && tt.includes('全員') && !tt.includes('圏外'));
    // 端末が本当に圏外（navigator.onLine=false）の時だけ「圏外・自動で再送」
    await p.context().setOffline(true); await p.waitForTimeout(200);
    await p.evaluate(() => gasTest()); await p.waitForTimeout(400); tt = await toastTxt(p);
    c.ok('B 圏外の時は圏外・通信不良: ' + tt, tt.includes('圏外'));
    await p.context().setOffline(false); await p.waitForTimeout(300);
    // ベトナム語でも理由は訳文（英語コードだけにしない）
    await p.click('.lsw button:has-text("VI")'); await p.waitForTimeout(200);
    mode = 'token'; await p.evaluate(() => gasTest()); await p.waitForTimeout(400); tt = await toastTxt(p);
    c.ok('B vi でも理由が訳される: ' + tt, tt.includes('Mật khẩu chung không khớp'));
    await p.click('.lsw button:has-text("JP")'); await p.waitForTimeout(200);
    // 録音ごとの送信失敗：カードに理由が残る
    await p.fill('#fEe', 'グエン');
    mode = 'token'; await rec(p, 'q1'); await p.waitForTimeout(500);
    const cl = await p.textContent('#cl-q1');
    c.ok('B カードに理由（合言葉）が出る: ' + cl, cl.includes('⚠') && cl.includes('合言葉'));
    c.ok('B 理由は title にも入る', (await p.getAttribute('#cl-q1', 'title') || '').includes('合言葉'));
    c.ok('B JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- C: Chart.js が遅い／取れない ---------- */
  {
    // C1: CDN が応答しないまま（15秒待たずに画面が出るか）
    const p = await b.newPage(); const errors = []; p.on('pageerror', e => errors.push(String(e)));
    await p.route(env.CHART_URL, () => { /* 応答しない */ });
    await p.goto(env.URL, { waitUntil: 'commit' });
    let shown = false; try { await p.waitForSelector('#rb-q1', { timeout: 5000 }); shown = true; } catch (e) { /* 出ない */ }
    c.ok('C CDN が止まっても試問画面は5秒以内に開く', shown);
    await p.click('.tabs button[data-pg="pgCh"]'); await p.waitForTimeout(200);
    c.ok('C 読み込み待ちでも白紙にしない', await p.isVisible('#chNone') && !(await p.isVisible('#chArea')));
    c.ok('C1 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }
  {
    // C2: CDN を遮断＋採点済みデータあり
    const p = await b.newPage(); const errors = []; p.on('pageerror', e => errors.push(String(e)));
    await p.route(env.CHART_URL, r => r.abort());
    await p.goto(env.URL); await p.waitForTimeout(300);
    await p.evaluate(() => {
      const s = { id: 'S1', date: '2026-09-01', examiner: '岡田', examinee: 'グエン', status: 'scored', createdAt: '2026-09-01T00:00:00Z', items: { q1: { score: 'pass' }, q2: { score: 'fail' } } };
      localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: [s] }));
    });
    await p.reload(); await p.waitForTimeout(400);
    await p.click('.tabs button[data-pg="pgCh"]'); await p.waitForTimeout(200);
    await p.selectOption('#chSel', 'グエン'); await p.waitForTimeout(300);
    const msg = await p.textContent('#chNone');
    c.ok('C CDN 遮断：理由と再読み込みを出す: ' + msg, await p.isVisible('#chLibErr') && msg.includes('グラフの部品を読み込めません') && await p.locator('#chNone button').count() === 1);
    c.ok('C 白紙のグラフカードを出さない', !(await p.isVisible('#chArea')));
    c.ok('C2 JSエラーなし（Chart is not defined が出ない） ' + errors.join('|'), errors.length === 0);
    await p.close();
  }
  {
    // C3: 通常（Chart.js あり・async でも描ける）
    const { page: p, errors } = await env.newPage(b);
    await p.goto(env.URL); await p.waitForTimeout(300);
    await p.evaluate(() => localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: [{ id: 'S1', date: '2026-09-01', examiner: '岡田', examinee: 'グエン', status: 'scored', createdAt: '2026-09-01T00:00:00Z', items: { q1: { score: 'pass' } } }] })));
    await p.reload(); await p.waitForTimeout(500);
    await p.click('.tabs button[data-pg="pgCh"]'); await p.selectOption('#chSel', 'グエン'); await p.waitForTimeout(400);
    c.ok('C 通常時はグラフを描く', await p.isVisible('#chArea') && await p.evaluate(() => !!Chart.getChart(document.getElementById('cvL'))));
    c.ok('C3 JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  /* ---------- D: ストレージ ---------- */
  {
    const ctx = await b.newContext();
    await ctx.addInitScript(() => {
      const st = navigator.storage; window.__persistCalls = 0;
      st.estimate = async () => ({ quota: 200 * 1048576, usage: 190 * 1048576 });
      st.persisted = async () => false;
      st.persist = async () => { window.__persistCalls++; return false; };
    });
    const { page: p, errors } = await env.newPage(ctx);
    await p.goto(env.URL); await p.waitForTimeout(500);
    c.ok('D 空き容量が少ないと試問画面の上に常設警告', await p.isVisible('#stoWarn') && (await p.textContent('#stoWarn')).includes('空き容量'));
    c.ok('D 警告からバックアップへ行ける', await p.locator('#stoBk').count() === 1);
    await rec(p, 'q1');
    c.ok('D 録音時に永続化を1回頼む', await p.evaluate(() => window.__persistCalls) === 1);
    await rec(p, 'q4');
    c.ok('D 2回目の録音では頼まない', await p.evaluate(() => window.__persistCalls) === 1);
    c.ok('D 拒否されたらバックアップ欄に案内', (await p.textContent('#bkPersist')).includes('バックアップ') && await p.evaluate(() => document.getElementById('bkPersist').style.display === 'block'));
    await p.click('.lsw button:has-text("ID")'); await p.waitForTimeout(200);
    c.ok('D 警告も言語に追従（id）', (await p.textContent('#stoWarn')).includes('Penyimpanan'));
    await p.click('.lsw button:has-text("JP")'); await p.waitForTimeout(200);
    await p.click('#stoBk'); await p.waitForTimeout(300);
    c.ok('D 警告のボタンで設定のバックアップ欄が開く', await p.evaluate(() => document.getElementById('bkExportBtn').closest('details').open && document.getElementById('pgCfg').classList.contains('on')));
    c.ok('D 録音データは消していない', await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_draft_v1')).items.q1.hasAudio === true));
    c.ok('D JSエラーなし ' + errors.join('|'), errors.length === 0);
    await ctx.close();
  }
  {
    const ctx = await b.newContext();
    await ctx.addInitScript(() => { navigator.storage.estimate = async () => ({ quota: 4000 * 1048576, usage: 10 * 1048576 }); });
    const { page: p } = await env.newPage(ctx);
    await p.goto(env.URL); await p.waitForTimeout(400);
    c.ok('D 空きが十分なら警告を出さない', !(await p.isVisible('#stoWarn')));
    await ctx.close();
  }

  /* ---------- E: 録音の実体が無い／IndexedDB が開けない ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    const posts = [];
    await p.route('https://script.google.com/**', r => { posts.push(1); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, id: 'X', url: 'u' }) }); });
    p.on('dialog', d => d.accept());
    await p.goto(env.URL); await p.waitForTimeout(300);
    await p.fill('#fEe', 'チャン');
    await rec(p, 'q1'); await rec(p, 'q4');
    await saveExam(p);
    const sid = await p.evaluate(() => JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions[0].id);
    await p.evaluate(async id => { await delAudio(id + '_q1'); }, sid);
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(200);
    await p.click('#scList .hi'); await p.waitForTimeout(600);
    c.ok('E 実体が無い録音は再生欄を隠す', !(await p.isVisible('#sa-q1')));
    c.ok('E 「この端末に録音が見つかりません」を出す', (await p.textContent('#sa-q1-miss')).includes('録音が見つかりません'));
    c.ok('E 実体のある q4 は再生できる', await p.isVisible('#sa-q4') && !!(await p.getAttribute('#sa-q4', 'src')));
    // 自動送信（ドライブ設定あり）：no-audio は再送ボタンにしない
    await p.evaluate(g => localStorage.setItem('oral_exam_google_v1', g), GCFG);
    await p.evaluate(id => resendDrive(id, 'q1'), sid); await p.waitForTimeout(600);
    const scl = await p.textContent('#scl-q1');
    c.ok('E no-audio は再送ではなく案内: ' + scl, scl.includes('録音が見つかりません') && !scl.includes('タップで再送'));
    c.ok('E no-audio の表示はタップ不可', await p.evaluate(() => document.getElementById('scl-q1').onclick === null));
    c.ok('E ネットワークへは送っていない', posts.length === 0);
    await p.click('text=戻る').catch(() => {}); await p.waitForTimeout(200);
    // IndexedDB が開けない：履歴詳細を開いても未処理の例外にならない
    await p.evaluate(() => { _db = null; indexedDB.open = () => { throw new DOMException('broken', 'UnknownError'); }; });
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(200);
    await p.click('#hList .hi'); await p.waitForTimeout(600);
    c.ok('E IndexedDB 不可でも例外にならない ' + errors.join('|'), errors.length === 0);
    c.ok('E 履歴詳細に「見つかりません」を出す', await p.locator('#da-q4-miss').count() === 1 && !(await p.isVisible('#da-q4')));
    await p.close();
  }

  /* ---------- F: 空の画面の導線 ---------- */
  {
    const { page: p, errors } = await env.newPage(b);
    await p.setViewportSize({ width: 390, height: 800 });
    await p.goto(env.URL); await p.waitForTimeout(300);
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(200);
    c.ok('F 履歴が空：試問タブへ／復元の2ボタン', await p.locator('#hList .egExam').count() === 1 && await p.locator('#hList .egRestore').count() === 1);
    c.ok('F 履歴が空の間は CSV を押せない', await p.isDisabled('#hCsv'));
    await p.click('#hList .egRestore'); await p.waitForTimeout(300);
    c.ok('F 復元ボタンで設定のバックアップ欄が開く', await p.evaluate(() => document.getElementById('pgCfg').classList.contains('on') && document.getElementById('bkImportBtn').closest('details').open));
    await p.click('.tabs button[data-pg="pgCh"]'); await p.waitForTimeout(200);
    c.ok('F グラフが空：2ボタン', await p.locator('#chNone .egExam').count() === 1 && await p.locator('#chNone .egRestore').count() === 1);
    await p.click('#chNone .egExam'); await p.waitForTimeout(200);
    c.ok('F 試問タブへ移動', await p.evaluate(() => document.getElementById('pgExam').classList.contains('on')));
    await p.click('.tabs button[data-pg="pgScore"]'); await p.waitForTimeout(200);
    c.ok('F 採点（採点待ち）が空：試問タブへのボタン', await p.locator('#scList .egExam').count() === 1);
    await p.selectOption('#scFil', 'all'); await p.waitForTimeout(200);
    c.ok('F 採点（すべて）が空：試問タブへのボタン', await p.locator('#scList .egExam').count() === 1);
    await p.click('.lsw button:has-text("VI")'); await p.waitForTimeout(200);
    await p.click('.tabs button[data-pg="pgHi"]'); await p.waitForTimeout(200);
    c.ok('F 空の案内も訳す（vi）', (await p.textContent('#hList')).includes('Đến tab Thi'));
    c.ok('F 390px幅で横スクロールなし', await p.evaluate(() => document.documentElement.scrollWidth <= 390));
    // データが入ったら CSV が押せる
    await p.evaluate(() => localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: [{ id: 'S1', date: '2026-09-01', examiner: 'a', examinee: 'b', status: 'scored', createdAt: '2026-09-01', items: {} }] })));
    await p.evaluate(() => drawHist()); await p.waitForTimeout(100);
    c.ok('F データがあれば CSV を押せる', !(await p.isDisabled('#hCsv')));
    c.ok('F JSエラーなし ' + errors.join('|'), errors.length === 0);
    await p.close();
  }

  await b.close();
  c.done();
})().catch(e => { console.error(e); process.exit(1); });
