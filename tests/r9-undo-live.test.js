/* R8検証NGの回帰テスト（R9）。実行: node tests/r9-undo-live.test.js
   [1] 「元に戻す」バー：スマホ幅（360/375/414・ja/vi/id）で縦の柱に潰れない（高さ≤72px・幅≥画面-40px）
       ／今録った問の ×不合格・録り直し・続き がバーの裏に入らない／最下部までスクロールすれば全カードの操作と『試問を保存』がバーの上に出る
       ／✕で閉じると下の余白も戻る
   [2] 中断された録音の復元：端末が落ちた（CDP Page.crash・pagehide なし）Aさんの録音を、名前の違うBさんの試問へ入れない
       ／名前のない試問に合否がある時は確認（いいえ＝入れない／はい＝まとめる）
   [3] 一時保存は書き足し（塊を1回ずつ）：見出しに blob を持たない・塊の合計＝復元される録音
   [4] 旧形式の一時保存（見出しに blob を丸ごと）もそのまま復元できる
   [5] 正式キーに書けなかった録音：一時保存は残し（取り戻し用）・起動時の案内には出さない／「保存し直す」で正式キーと同時に片付く
   [6] 正式キーへ保存した直後（試問の記録・一時保存の片付けの前）に落ちた：続きを二重につながない／最初の録音は記録だけ戻す
   Googleドライブは未設定（送信なし） */
const env = require('./_env');
const T = env.counter();
const HELP = `window.__allLive=()=>new Promise(res=>{openDB().then(db=>{const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();rq.onsuccess=()=>res((rq.result||[]).filter(k=>String(k).startsWith('live__')))})});`;

async function mkPage(ctx, lang) {
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push(String(e)));
  p.__confirm = true; p.__dlg = [];
  p.on('dialog', d => { p.__dlg.push(d.message()); (p.__confirm ? d.accept() : d.dismiss()).catch(() => {}); });
  await env.routeChart(p);
  await p.addInitScript(HELP);
  if (lang) await p.addInitScript(l => { try { localStorage.setItem('oral_exam_lang', l); } catch (e) {} }, lang);
  await p.goto(env.URL);
  // R2: 固定待ち(400ms)→試問カードの録音ボタンが描かれるまで待つ
  await p.waitForSelector('[id^="rb-"]', { state: 'attached' });
  return { p, errors };
}
const rect = (p, sel) => p.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }, sel);
const hit = (a, b) => a && b && a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;

(async () => {
  const b = await env.launch();

  console.log('[1] 「元に戻す」バーの大きさと重なり');
  for (const [w, h, lang] of [[375, 740, 'ja'], [360, 640, 'vi'], [414, 896, 'id'], [375, 740, 'vi']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
    const { p, errors } = await mkPage(ctx, lang);
    const ids = await p.evaluate(() => getItems().map(i => i.id));
    const A = ids[ids.length - 1]; // 最後の問＝バーと重なりやすい最下部
    await p.fill('#fEe', 'グエン');
    for (const [mode, sel] of [['redo', '#rb-'], ['cont', '#rc-']]) {
      if (mode === 'redo') { await p.click('#rb-' + A); await p.waitForTimeout(1300); await p.click('#rb-' + A); await p.waitForFunction(id => !active && cur && cur.items[id] && cur.items[id].hasAudio, A); }
      await p.locator(sel + A).scrollIntoViewIfNeeded();
      await p.click(sel + A); await p.waitForTimeout(1500); await p.click('#rb-' + A);
      // R2: 固定待ち(2000ms)→停止処理が終わって「元に戻す」バーが出るまで待つ（出なければ下の検査が NG を出す）
      await p.waitForFunction(() => !active && !!document.querySelector('#undoBar') && getComputedStyle(document.querySelector('#undoBar')).display !== 'none', null, { timeout: 8000 }).catch(() => {});
      await p.waitForTimeout(150);
      const bar = await rect(p, '#undoBar');
      const tag = `${w}x${h} ${lang} ${mode}`;
      T.ok(`${tag}: バーが出る`, !!bar);
      if (!bar) continue;
      T.ok(`${tag}: 縦の柱にならない（${bar.w.toFixed(0)}x${bar.h.toFixed(0)}）`, bar.h <= 72 && bar.w >= w - 40);
      T.ok(`${tag}: 画面からはみ出さない`, bar.l >= 0 && bar.r <= w);
      const own = [];
      for (const s of ['#vf-', '#vp-', '#rb-', '#rc-']) { const r = await rect(p, s + A); if (r && r.h) own.push([s, r]); }
      T.ok(`${tag}: 今録った問の操作がバーの裏に入らない ` + own.filter(x => hit(x[1], bar)).map(x => x[0]).join(','), own.length >= 3 && !own.some(x => hit(x[1], bar)));
      // 最下部までスクロール：全カードの操作と『試問を保存』がバーの上
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await p.waitForTimeout(250);
      const bar2 = await rect(p, '#undoBar');
      const under = await p.evaluate(br => {
        const out = [];
        document.querySelectorAll('[id^="vf-"],[id^="vp-"],[id^="rb-"],[id^="rc-"],button[onclick="saveSession()"]').forEach(e => {
          const r = e.getBoundingClientRect(); if (!r.height) return;
          if (r.left < br.r && br.l < r.right && r.top < br.b && br.t < r.bottom) out.push(e.id || 'save');
        });
        return out;
      }, bar2);
      T.ok(`${tag}: 最下部でバーの裏に入る操作なし ${under.join(',')}`, under.length === 0);
      const save = await rect(p, 'button[onclick="saveSession()"]');
      T.ok(`${tag}: 『試問を保存』がバーの上に見える`, save && save.b <= bar2.t);
    }
    await p.click('#undoBar .ubx'); await p.waitForTimeout(150);
    T.ok(`${w}x${h} ${lang}: ✕で閉じると余白の指定も外れる`, await p.evaluate(() => !document.getElementById('undoBar') && !document.documentElement.classList.contains('undo-on')));
    T.ok(`${w}x${h} ${lang}: 横スクロールなし`, await p.evaluate(ww => document.documentElement.scrollWidth <= ww, w));
    if (w === 375 && lang === 'ja') await p.screenshot({ path: require('path').join(require('os').tmpdir(), 'r9_undo_375_' + process.pid + '.png') }).catch(() => {});
    T.ok(`${w}x${h} ${lang}: JSエラーなし ` + errors.join('|'), !errors.length);
    await ctx.close();
  }

  console.log('[2] 端末が落ちた録音を別の受験者の試問へ入れない');
  {
    const ctx = await b.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
    let { p } = await mkPage(ctx);
    const [A, B] = await p.evaluate(() => getItems().map(i => i.id));
    await p.fill('#fEe', 'Aさん');
    await p.click('#rb-' + A); await p.waitForTimeout(3200);
    const sidA = await p.evaluate(() => cur.id);
    // [3] 書き足し形式
    const lf = await p.evaluate(async () => {
      const ks = await window.__allLive(); const head = ks.filter(isLiveHead);
      const h = await getAudio(head[0]); const full = await getLive(head[0]);
      return { heads: head.length, parts: ks.length - head.length, chunks: active.chunks.length, headBlob: !!(h && h.blob), n: h && h.n, size: full && full.blob ? full.blob.size : 0, sum: active.chunks.slice(0, h.n).reduce((s, c) => s + c.size, 0) };
    });
    console.log('[3] 一時保存は書き足し');
    T.ok('見出しは1つ・blob を持たない: ' + JSON.stringify(lf), lf.heads === 1 && !lf.headBlob);
    T.ok('塊は1つずつ別キー（見出しの n と一致）', lf.parts === lf.n && lf.n >= 2 && lf.n <= lf.chunks);
    T.ok('読み出した録音＝書いた塊の合計', lf.size > 0 && lf.size === lf.sum);
    const cdp = await ctx.newCDPSession(p);
    cdp.send('Page.crash').catch(() => {});
    await new Promise(r => setTimeout(r, 800));
    ({ p } = await mkPage(ctx));
    await p.waitForTimeout(900);
    T.ok('起動時に「中断された録音」（Aさん）', await p.locator('#liveRec #lrRestore').count() === 1 && /Aさん/.test(await p.locator('#liveRec .lrmsg').textContent()));
    // 録音済みの問がない下書きは戻らない＝起動すると新しい試問（ここへ次の受験者Bさんを入れる）
    const sidB = await p.evaluate(() => cur.id);
    T.ok('新しい試問（Aとは別ID）', sidB !== sidA);
    await p.fill('#fEe', 'Bさん');
    await p.click('#vp-' + B); await p.waitForTimeout(150);
    p.__dlg = [];
    await p.click('#lrRestore'); await p.waitForTimeout(1000);
    const st = await p.evaluate(([sB, a]) => ({ id: cur.id === sB, ee: cur.examinee, has: !!(cur.items[a] && cur.items[a].hasAudio) }), [sidB, A]);
    T.ok('Bさんの試問にAさんの録音を入れない: ' + JSON.stringify(st), st.id && st.ee === 'Bさん' && !st.has);
    T.ok('理由を知らせる（トースト）: ' + await p.locator('#toast').textContent(), /Aさん/.test(await p.locator('#toast').textContent()) && /Bさん/.test(await p.locator('#toast').textContent()));
    T.ok('一時保存は残る（あとで戻せる）・案内も残る', (await p.evaluate(() => window.__allLive())).length > 0 && await p.locator('#lrRestore').count() === 1);
    // 名前を空にした（合否はある）→ 確認。いいえ＝入れない
    await p.fill('#fEe', ''); await p.waitForTimeout(100);
    p.__confirm = false; p.__dlg = [];
    await p.click('#lrRestore'); await p.waitForTimeout(800);
    T.ok('名前のない試問に合否がある→確認を出す: ' + p.__dlg.join('|'), p.__dlg.length === 1);
    T.ok('いいえ＝入れない', await p.evaluate(sB => cur.id === sB, sidB));
    p.__confirm = true; p.__dlg = [];
    await p.click('#lrRestore'); await p.waitForTimeout(1200);
    const st2 = await p.evaluate(a => ({ id: cur.id, ee: cur.examinee, has: !!(cur.items[a] && cur.items[a].hasAudio) }), A);
    T.ok('はい＝Aの試問としてまとめる: ' + JSON.stringify(st2), st2.id === sidA && st2.ee === 'Aさん' && st2.has);
    T.ok('復元後は一時保存（見出し・塊とも）が残らない', (await p.evaluate(() => window.__allLive())).length === 0);
    await ctx.close();
  }

  console.log('[4] 旧形式の一時保存も復元できる');
  {
    const ctx = await b.newContext({ viewport: { width: 375, height: 740 } });
    let { p, errors } = await mkPage(ctx);
    const A = await p.evaluate(() => getItems()[0].id);
    await p.evaluate(async a => {
      const ac = new OfflineAudioContext(1, 16000, 16000); const buf = await ac.startRendering();
      const blob = wavBlob(buf.getChannelData(0), 16000);
      await putAudio('live__' + cur.id + '_' + a + '_1', { sid: cur.id, itemId: a, mime: 'audio/wav', t0: Date.now(), ts: Date.now(), dur: 1000, draft: '', append: false, examinee: 'レガシー', examiner: '', date: '', blob });
      checkLiveTakes();
    }, A);
    await p.waitForTimeout(600);
    T.ok('旧形式の案内が出る', await p.locator('#lrRestore').count() === 1 && /レガシー/.test(await p.locator('#liveRec .lrmsg').textContent()));
    await p.click('#lrRestore'); await p.waitForTimeout(800);
    T.ok('正式キーへ戻り・一時保存は消える', await p.evaluate(async a => { const x = await getAudio(cur.id + '_' + a); return !!(x && x.size) && cur.items[a].hasAudio && (await window.__allLive()).length === 0; }, A));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);

    console.log('[5] 正式キーに書けなかった録音');
    const Bq = await p.evaluate(() => getItems()[1].id);
    await p.fill('#fEe', 'レガシー');
    await p.evaluate(() => { window.__realPut = putAudio; window.putAudio = async () => { throw new Error('QuotaExceededError'); }; });
    await p.click('#rb-' + Bq); await p.waitForTimeout(1500); await p.click('#rb-' + Bq); await p.waitForTimeout(1200);
    const f = await p.evaluate(async q => { const k = Object.values(failedTakes).map(x => x.liveKey)[0]; return { k: !!k, head: !!(k && await getAudio(k)), listed: (await liveKeys()).length, has: !!(cur.items[q] && cur.items[q].hasAudio) }; }, Bq);
    T.ok('失敗しても一時保存は残る（取り戻しの写し）・起動時の案内には出さない: ' + JSON.stringify(f), f.k && f.head && f.listed === 0 && !f.has);
    await p.evaluate(() => { window.putAudio = window.__realPut; });
    await p.click('#rfr-' + Bq); await p.waitForTimeout(800);
    T.ok('「保存し直す」で正式キーへ・一時保存も片付く', await p.evaluate(async q => { const x = await getAudio(cur.id + '_' + q); return !!(x && x.size) && cur.items[q].hasAudio && (await window.__allLive()).length === 0; }, Bq));
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  console.log('[6] 正式キーへ保存した直後に落ちた');
  {
    const ctx = await b.newContext({ viewport: { width: 375, height: 740 } });
    let { p, errors } = await mkPage(ctx);
    const [A, B] = await p.evaluate(() => getItems().map(i => i.id));
    const dur = id => p.evaluate(async id => { const x = await getAudio(cur.id + '_' + id); if (!x) return -1; const ac = new AudioContext(); try { return (await ac.decodeAudioData(await x.arrayBuffer())).duration; } finally { ac.close(); } }, id);
    await p.fill('#fEe', 'シティ');
    await p.click('#rb-' + A); await p.waitForTimeout(1500); await p.click('#rb-' + A); await p.waitForTimeout(1000);
    const sid = await p.evaluate(() => cur.id);
    // 以後「試問の記録」と「一時保存の片付け」が走らない＝その間に落ちたのと同じ状態
    await p.evaluate(() => { window.commitTake = () => {}; window.delLive = async () => {}; });
    await p.click('#rc-' + A); await p.waitForTimeout(1500); await p.click('#rb-' + A); await p.waitForTimeout(2500);
    const dMerged = await dur(A);
    await p.click('#rb-' + B); await p.waitForTimeout(1500); await p.click('#rb-' + B); await p.waitForTimeout(1200);
    const dB = await dur(B);
    T.ok('（前提）一時保存が2つ残っている', (await p.evaluate(() => window.__allLive())).filter(k => !/~c/.test(k)).length === 2);
    await p.reload(); await p.waitForTimeout(1200);
    T.ok('同じ試問の下書きに戻る', await p.evaluate(s => cur.id === s, sid));
    T.ok(`続き（記録済み）は二重につながない（${dMerged.toFixed(2)}s のまま）`, Math.abs((await dur(A)) - dMerged) < 0.05);
    p.__dlg = [];
    T.ok('記録に載っていない最初の録音だけ案内', await p.locator('#lrRestore').count() === 1 && !/もう|ほか/.test(await p.locator('#liveRec .lrmsg').textContent()));
    await p.click('#lrRestore'); await p.waitForTimeout(800);
    T.ok('確認なしで記録だけ戻す（正式キーはそのまま）', p.__dlg.length === 0 && await p.evaluate(id => !!(cur.items[id] && cur.items[id].hasAudio), B) && Math.abs((await dur(B)) - dB) < 0.05);
    T.ok('一時保存（見出し・塊とも）が残らない', (await p.evaluate(() => window.__allLive())).length === 0 && await p.locator('#liveRec').count() === 0);
    T.ok('続きの長さも変わらない', Math.abs((await dur(A)) - dMerged) < 0.05);
    T.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  await b.close();
  T.done();
})().catch(e => { console.error(e); process.exit(2); });
