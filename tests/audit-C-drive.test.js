/* 検査 2026-10-06【C-drive】の回帰テスト。実行: node tests/audit-C-drive.test.js
   M-6  送信中に合否を変えた・2回目として保存した → 送信が終わったら正しい名前へ付け直す
   M-7  録り直し・「元に戻す」は前のファイルを replaceId で置き換える（同じ名前の別ファイルを増やさない）
   M-8  「前回の続きにまとめる」を送信中に行っても待たされず、届いた結果がまとめ先に入る（再読み込みで二重に送らない）
   M-15 空欄の「その場で出題」の問のファイル名は言語に依らず「質問n」（言語を変えて保存しても送り直さない）
   M-16 停止→○× は1回の送信にまとめる。送った後の名前の変更は名前だけの送信（旧GASなら1回の置き換え）。問題文は入力中に送らない
   M-17 端末からの送信は、まだフォルダの無い同じ受験者フォルダへ同時に送らない（1件ずつ）
   L-1  送信できていれば設定タブも「接続OK」（再読み込み後も）。未確認の保存先は「未接続」と言わない
   L-3  送信した後で日付を直して保存 → 新しい日付のフォルダへ付け直し、旧フォルダを案内する
   L-4  ドライブに無い録音がある試問の削除は件数を出して確かめる
   L-6  共有リンクで保存フォルダ・合言葉・自動保存が変わるときは確かめる／共有リンクに gauto=0 を載せない
   L-29 共有リンクを拒否・キャンセルしてもアドレスのクエリを消す
   本物の GAS へは送らない（script.google.com は代役GASが route で応答。新GAS＝名前だけの送信に応える／旧GAS＝ping として返す） */
'use strict';
const env = require('./_env');
const c = env.counter();
const GURL = 'https://script.google.com/macros/s/TESTC/exec';
const CFG = { url: GURL, token: 'T', folder: '口頭試問音声', auto: true, autoSet: true };

/* 代役GAS（gas/Code.gs と同じ約束：replaceId は同じフォルダの旧ファイルだけゴミ箱へ／op:'rename' は新GASだけが応える） */
async function mkCtx(b, o) {
  o = o || {};
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
  const S = { log: [], files: {}, n: 0, delay: o.delay || 0, mode: o.mode || 'new', offline: false, inflight: {}, maxIn: {} };
  await ctx.route(/^https:\/\/script\.google(usercontent)?\.com\//, async route => {
    const req = route.request();
    if (req.method() !== 'POST') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
    let j = {}; try { j = JSON.parse(req.postData() || '{}'); } catch (e) { /* 空 */ }
    if (S.offline) return route.abort('internetdisconnected');
    const folder = (j.examinee || '') + '_' + (j.date || '');
    const ent = { t: Date.now(), ping: !!j.ping, op: j.op || null, name: j.name, rep: j.replaceId || null, fileId: j.fileId || null, folder, full: !!j.dataB64 };
    S.log.push(ent);
    S.inflight[folder] = (S.inflight[folder] || 0) + 1; S.maxIn[folder] = Math.max(S.maxIn[folder] || 0, S.inflight[folder]);
    const d = typeof S.delay === 'function' ? S.delay(ent) : S.delay;
    if (d) await new Promise(r => setTimeout(r, d));
    S.inflight[folder]--;
    const ok = x => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) }).catch(() => {});
    if (j.ping && j.op === 'rename') {
      if (S.mode === 'old') return ok({ ok: true, ping: true });
      const f = S.files[j.fileId];
      if (!f || f.trashed || f.folder !== folder) return ok({ ok: true, renamed: false });
      f.name = j.name; return ok({ ok: true, renamed: true, id: j.fileId, url: 'https://drive/' + j.fileId });
    }
    if (j.ping) return ok({ ok: true, ping: true });
    const id = 'F' + (++S.n); S.files[id] = { name: j.name, folder, trashed: false }; ent.id = id;
    if (j.replaceId && S.files[j.replaceId] && S.files[j.replaceId].folder === folder) S.files[j.replaceId].trashed = true;
    return ok({ ok: true, id, url: 'https://drive/' + id });
  });
  if (o.cfg !== false) await ctx.addInitScript(g => { try { if (!localStorage.getItem('oral_exam_google_v1')) localStorage.setItem('oral_exam_google_v1', g); } catch (e) { /* 無し */ } }, JSON.stringify(o.cfg || CFG));
  const { page, errors } = await env.newPage(ctx);
  const dl = { log: [], ans: () => true };
  page.on('dialog', d => { dl.log.push(d.message()); if (d.type() === 'beforeunload') return d.accept(); return dl.ans(d.message()) ? d.accept() : d.dismiss(); });
  await page.goto(o.url || env.URL); await page.waitForTimeout(500);
  return { ctx, p: page, errors, S, dl };
}
const full = S => S.log.filter(x => !x.ping);
const live = S => Object.entries(S.files).filter(([, f]) => !f.trashed).map(([id, f]) => Object.assign({ id }, f));
async function rec(p, id, ms) { await p.click('#rb-' + id); await p.waitForTimeout(ms || 1000); await p.click('#rb-' + id); await p.waitForTimeout(300); }
async function idle(p, S, ms) { // 送信が全部終わるまで待つ（送信待ち・送信中が無く、最後の送信から ms 経過）
  const t0 = Date.now();
  for (let i = 0; i < 160; i++) {
    await p.waitForTimeout(250);
    const busy = await p.evaluate(() => Object.values(upBusy).some(Boolean) || (typeof vdTimers!=="undefined"&&Object.keys(vdTimers).length > 0));
    const last = S.log.length ? Math.max(S.log[S.log.length - 1].t, t0) : t0;
    if (!busy && !Object.values(S.inflight).some(Boolean) && Date.now() - last > (ms || 700)) return;
  }
}
const saved = p => p.evaluate(() => getAll());
const setName = async (p, v) => { await p.fill('#fEe', v); await p.press('#fEe', 'Tab'); };

(async () => {
  const b = await env.launch();

  /* ---------- M-16 停止→○× は1回の送信 ---------- */
  {
    const { ctx, p, S, errors } = await mkCtx(b);
    await setName(p, 'まとめ太郎');
    for (const [i, id] of ['q1', 'q4', 'q5'].entries()) { await rec(p, id); await p.click((i % 2 ? '#vf-' : '#vp-') + id); await p.waitForTimeout(300); }
    await idle(p, S);
    const f = full(S);
    c.ok('M-16 3問の録音→○× で送信は3回 ' + JSON.stringify(f.map(x => x.name)), f.length === 3 && f.every(x => x.full));
    c.ok('M-16 送った名前に合否が入っている', f.every(x => /_(合格|不合格)_/.test(x.name)));
    // 送った後で合否を変える → 新GASでは名前だけの送信（録音を送り直さない）
    const n0 = S.log.length;
    await p.click('#vf-q1'); await idle(p, S);
    const add = S.log.slice(n0);
    c.ok('M-16 送信後の合否変更は名前だけの送信1回 ' + JSON.stringify(add), add.length === 1 && add[0].op === 'rename' && !add[0].full);
    const it = (await p.evaluate(() => cur.items.q1));
    c.ok('M-16 ドライブの名前が付け直される ' + it.driveName, /_不合格_/.test(it.driveName) && S.files[it.driveFileId].name === it.driveName && live(S).length === 3);
    c.ok('M-16 JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  {
    const { ctx, p, S } = await mkCtx(b, { mode: 'old' });
    await setName(p, '旧GAS花子');
    await rec(p, 'q1'); await p.click('#vp-q1'); await idle(p, S);
    const n0 = full(S).length;
    await p.click('#vf-q1'); await idle(p, S);
    const add = full(S).slice(n0);
    c.ok('M-16 旧GAS: 名前だけの送信に応えない → 置き換えの送信1回 ' + JSON.stringify(add), n0 === 1 && add.length === 1 && add[0].full && add[0].rep === 'F1' && live(S).length === 1);
    await ctx.close();
  }
  {
    const b2 = await env.launch({ freeDefault: true });
    const { ctx, p, S, errors } = await mkCtx(b2);
    await setName(p, '問題文次郎');
    const ids = await p.evaluate(() => getItems().map(x => x.id));
    await p.fill('#qt-' + ids[0], '豚の体温');
    await rec(p, ids[0]); await p.click('#vp-' + ids[0]); await idle(p, S);
    const n0 = S.log.length;
    await p.click('#qt-' + ids[0]); await p.press('#qt-' + ids[0], 'End');
    for (const ch of 'は何度') { await p.keyboard.type(ch); await p.waitForTimeout(1700); }
    c.ok('M-16 問題文の入力中は送らない（' + (S.log.length - n0) + '件）', S.log.length === n0);
    await p.press('#qt-' + ids[0], 'Tab'); await idle(p, S);
    const add = S.log.slice(n0);
    c.ok('M-16 欄を離れたら名前だけ1回 ' + JSON.stringify(add), add.length === 1 && add[0].op === 'rename' && /豚の体温は何度/.test(add[0].name));
    c.ok('M-16 JSエラーなし（問題文） ' + errors.join('|'), !errors.length);
    await ctx.close();

    /* ---------- M-15 空欄の問のファイル名は言語に依らない ---------- */
    const k = await mkCtx(b2);
    await k.p.evaluate(() => setLang('vi')); await k.p.waitForTimeout(200);
    await setName(k.p, 'Nguyen Van A');
    const fid = await k.p.evaluate(() => getItems()[0].id);
    await rec(k.p, fid); await k.p.click('#vp-' + fid); await idle(k.p, k.S);
    const f1 = full(k.S);
    c.ok('M-15 vi で送った名前も「質問1」 ' + JSON.stringify(f1.map(x => x.name)), f1.length === 1 && /_合格_質問1\.\w+$/.test(f1[0].name));
    await k.p.evaluate(() => setLang('ja')); await k.p.waitForTimeout(200);
    const n1 = k.S.log.length;
    await k.p.evaluate(() => saveSession()); await idle(k.p, k.S);
    c.ok('M-15 言語を変えて保存しても送り直さない ' + JSON.stringify(k.S.log.slice(n1)), k.S.log.length === n1);
    // 旧版で端末の言語の名前（Câu_hỏi_1）で送ってあった録音：保存し直すと言語に依らない名前へ付け直す（読めない旧形式にしない）
    const old = await k.p.evaluate(() => { const s = getAll()[0]; return driveBaseName(s, s.items && Object.keys(s.items)[0]); });
    c.ok('M-15 ドライブ名は「質問1」 ' + old, /質問1$/.test(old));
    await k.ctx.close();
    await b2.close();
  }

  /* ---------- M-7 録り直し・元に戻すは置き換え ---------- */
  {
    const { ctx, p, S, errors } = await mkCtx(b);
    await setName(p, '録り直し三郎');
    await rec(p, 'q1'); await idle(p, S);
    await rec(p, 'q1'); await idle(p, S); // 録り直し（確認はOK）
    const f = full(S);
    c.ok('M-7 録り直しは前のファイルを置き換える ' + JSON.stringify(f.map(x => [x.id, x.rep])), f.length === 2 && f[1].rep === 'F1');
    const ub = await p.$('#undoBar button');
    if (ub) { await ub.click(); await idle(p, S); }
    const g = full(S);
    c.ok('M-7 「元に戻す」も置き換え ' + JSON.stringify(g.map(x => [x.id, x.rep])), !!ub && g.length === 3 && g[2].rep === 'F2');
    c.ok('M-7 ドライブに残るのは1本 ' + JSON.stringify(live(S)), live(S).length === 1);
    // 続きの録音（＋続き）も置き換え
    await p.click('#rc-q1'); await p.waitForTimeout(1000); await p.click('#rb-q1'); await p.waitForTimeout(300);
    await idle(p, S);
    const h = full(S);
    c.ok('M-7 続きの録音も置き換え ' + JSON.stringify(h.map(x => [x.id, x.rep, x.name])), h.length === 4 && h[3].rep === 'F3' && live(S).length === 1);
    c.ok('M-7 JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- M-6 送信中の合否変更・2回目の保存 ---------- */
  {
    const { ctx, p, S, errors } = await mkCtx(b, { delay: 6000 });
    await setName(p, '送信中四郎');
    await rec(p, 'q1'); await p.waitForTimeout(1900); // 最初の送信が始まる
    c.ok('M-6 前提: 送信中', await p.evaluate(() => !!upBusy[cur.id + '_q1']));
    await p.click('#vp-q1'); await p.waitForTimeout(1800);
    await p.evaluate(() => saveSession()); await idle(p, S);
    const s = (await saved(p))[0];
    c.ok('M-6A 送信が終わったら合否の名前へ付け直す ' + JSON.stringify(s.items.q1.driveName), /_合格_/.test(s.items.q1.driveName || '') && !s.items.q1.driveSt);
    c.ok('M-6A ドライブ上の名前も合格 ' + JSON.stringify(live(S)), live(S).length === 1 && /_合格_/.test(live(S)[0].name));
    c.ok('M-6A JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }
  {
    const { ctx, p, S, dl } = await mkCtx(b);
    dl.ans = m => !/採点も確定|前回の続きにまとめる/.test(m); // 2回目として別に保存
    await setName(p, '追試五郎');
    await rec(p, 'q1'); await idle(p, S);
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    S.delay = 4000;
    await setName(p, '追試五郎');
    await rec(p, 'q1'); await p.waitForTimeout(1900);
    await p.evaluate(() => saveSession()); await idle(p, S);
    const all = await saved(p), two = all.find(x => +x.attempt === 2);
    c.ok('M-6B 2回目の保存：送信が終わったら「_2回目」へ付け直す ' + JSON.stringify(two && two.items.q1.driveName), two && /_2回目\.\w+$/.test(two.items.q1.driveName || ''));
    const names = live(S).map(x => x.name);
    c.ok('M-6B ドライブに同じ名前の2本が無い ' + JSON.stringify(names), names.length === 2 && new Set(names).size === 2);
    await ctx.close();
  }

  /* ---------- M-8 送信中にまとめる ---------- */
  {
    const { ctx, p, S, dl, errors } = await mkCtx(b);
    dl.ans = m => !/採点も確定/.test(m); // まとめる＝OK
    await setName(p, 'まとめ六郎');
    await rec(p, 'q1'); await idle(p, S);
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    S.delay = 22000;
    await setName(p, 'まとめ六郎');
    await rec(p, 'q4'); await p.waitForTimeout(1900);
    const t0 = Date.now();
    await p.evaluate(() => saveSession());
    const dt = Date.now() - t0;
    c.ok('M-8 送信中でも保存は待たされない（' + dt + 'ms）', dt < 4000);
    c.ok('M-8 前提: まとめた', dl.log.some(m => m.includes('前回の続きにまとめる')) && (await saved(p)).length === 1);
    await idle(p, S);
    const s = (await saved(p))[0];
    c.ok('M-8 届いた結果がまとめ先に入る ' + JSON.stringify(s.items.q4), s.items.q4 && /^F\d+$/.test(s.items.q4.driveFileId || '') && !s.items.q4.driveSt);
    S.delay = 0;
    const n0 = full(S).length;
    await p.reload(); await p.waitForTimeout(5500);
    c.ok('M-8 再読み込みで二重に送らない ' + JSON.stringify(full(S).slice(n0).map(x => x.name)), full(S).length === n0);
    c.ok('M-8 JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- M-17 まだ無いフォルダへ同時に送らない ---------- */
  {
    const { ctx, p, S } = await mkCtx(b, { delay: 800 });
    S.offline = true;
    await setName(p, '圏外七子');
    await rec(p, 'q1'); await rec(p, 'q4'); await rec(p, 'q5'); await idle(p, S, 300);
    await p.waitForTimeout(2500);
    const un = await p.evaluate(() => unsentCount(cur));
    c.ok('M-17 前提: 3件が未送信 ' + un, un === 3);
    S.offline = false; S.maxIn = {};
    await p.evaluate(() => resendAllUnsent()); await idle(p, S);
    const fo = Object.keys(S.maxIn).find(k => k.startsWith('圏外七子'));
    c.ok('M-17 同じ受験者フォルダへの同時送信は1件まで ' + JSON.stringify(S.maxIn), fo && S.maxIn[fo] === 1);
    c.ok('M-17 3件とも届く', live(S).length === 3 && (await p.evaluate(() => unsentCount(cur))) === 0);
    await ctx.close();
  }

  /* ---------- L-1 設定タブの接続表示 ---------- */
  {
    const { ctx, p, S } = await mkCtx(b);
    const T = await p.evaluate(() => ({ con: TX.ja.gConnected, dis: TX.ja.gDisconnected }));
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(300);
    const st0 = await p.textContent('#gStatus');
    c.ok('L-1 保存先はあるが未確認：「未接続」と言わない ' + st0, st0 !== T.dis && st0 !== T.con);
    await p.click('.tabs button[data-pg="pgExam"]'); await p.waitForTimeout(200);
    await setName(p, '接続八郎'); await rec(p, 'q1'); await idle(p, S);
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(300);
    c.ok('L-1 送信できたら「接続OK」 ' + await p.textContent('#gStatus'), (await p.textContent('#gStatus')) === T.con);
    await p.reload(); await p.waitForTimeout(600);
    await p.click('.tabs button[data-pg="pgCfg"]'); await p.waitForTimeout(300);
    c.ok('L-1 再読み込み後も「接続OK」', (await p.textContent('#gStatus')) === T.con);
    await ctx.close();
  }

  /* ---------- L-3 日付を直して保存 ---------- */
  {
    const { ctx, p, S } = await mkCtx(b);
    await setName(p, '日付九郎');
    await p.fill('#fDate', '2026-10-06');
    await rec(p, 'q1'); await idle(p, S);
    c.ok('L-3 前提: 10-06 のフォルダへ送った', full(S).length === 1 && full(S)[0].folder === '日付九郎_2026-10-06');
    await p.fill('#fDate', '2026-10-01');
    await p.evaluate(() => saveSession()); await idle(p, S);
    const f = full(S), s = (await saved(p))[0];
    c.ok('L-3 新しい日付のフォルダへ付け直す ' + JSON.stringify(f.map(x => x.folder)), f.length === 2 && f[1].folder === '日付九郎_2026-10-01' && f[1].rep === 'F1');
    c.ok('L-3 旧フォルダを案内する ' + JSON.stringify(s.items.q1.driveOrphan), Array.isArray(s.items.q1.driveOrphan) && s.items.q1.driveOrphan.some(o => o.folder === '日付九郎_2026-10-06'));
    await ctx.close();
  }

  /* ---------- L-4 ドライブに無い録音のある試問の削除 ---------- */
  {
    const { ctx, p, S, dl } = await mkCtx(b);
    S.offline = true;
    await setName(p, '削除十子'); await rec(p, 'q1'); await p.waitForTimeout(2500);
    await p.evaluate(() => saveSession()); await p.waitForTimeout(500);
    const sid = (await saved(p))[0].id;
    dl.log.length = 0; dl.ans = m => !/1/.test(m) || !/ドライブ/.test(m);
    await p.evaluate(id => doDel(id), sid); await p.waitForTimeout(300);
    c.ok('L-4 ドライブに無い録音の件数を出して確かめる ' + JSON.stringify(dl.log), dl.log.some(m => /ドライブ/.test(m) && /1/.test(m)));
    c.ok('L-4 キャンセルなら消さない', (await saved(p)).length === 1);
    dl.ans = () => true;
    await p.evaluate(id => doDel(id), sid); await p.waitForTimeout(300);
    c.ok('L-4 OKなら消す', (await saved(p)).length === 0);
    await ctx.close();
  }

  /* ---------- L-6 / L-29 共有リンク ---------- */
  {
    const q = '?gurl=' + encodeURIComponent(GURL) + '&gfolder=' + encodeURIComponent('別フォルダ') + '&gauto=0';
    const { ctx, p, dl } = await mkCtx(b, { url: env.URL + q });
    // mkCtx の既定の dl.ans は OK だが、goto 時点の確認は既定（OK）で答える → 別のページで「キャンセル」を試す
    c.ok('L-6 保存先が同じでもフォルダ・自動保存が変わるなら確かめる ' + JSON.stringify(dl.log), dl.log.some(m => m.includes('別フォルダ')));
    c.ok('L-6 OK なら取り込む', await p.evaluate(() => getGoogleCfg().folder === '別フォルダ' && getGoogleCfg().auto === false));
    c.ok('L-29 取り込んだらクエリを消す', (await p.evaluate(() => location.search)) === '');
    await ctx.close();
  }
  {
    const ctx = await b.newContext();
    await ctx.addInitScript(g => { try { if (!localStorage.getItem('oral_exam_google_v1')) localStorage.setItem('oral_exam_google_v1', g); } catch (e) { /* 無し */ } }, JSON.stringify(CFG));
    await ctx.route(/^https:\/\/script\.google/, r => r.abort());
    const { page: p } = await env.newPage(ctx);
    const log = [];
    p.on('dialog', d => { log.push(d.message()); d.dismiss(); });
    await p.goto(env.URL + '?gurl=' + encodeURIComponent(GURL) + '&gtoken=X&gauto=0'); await p.waitForTimeout(600);
    const g = await p.evaluate(() => getGoogleCfg());
    c.ok('L-6 キャンセルなら合言葉・自動保存を変えない ' + JSON.stringify(g), log.length === 1 && g.token === 'T' && g.auto === true);
    c.ok('L-29 キャンセルでもクエリを消す ' + await p.evaluate(() => location.search), (await p.evaluate(() => location.search)) === '');
    log.length = 0;
    await p.goto(env.URL + '?gurl=' + encodeURIComponent('http://evil.example/x')); await p.waitForTimeout(600);
    c.ok('L-29 拒否した保存先でもクエリを消す ' + await p.evaluate(() => location.search), (await p.evaluate(() => location.search)) === '');
    // 共有リンクには gauto=0 を載せない（受け取った端末を黙って OFF にしない）
    await p.evaluate(() => { const g = getGoogleCfg(); g.auto = false; localStorage.setItem(GKEY, JSON.stringify(g)); gShareTokOn = true; });
    const link = await p.evaluate(() => gShareLink());
    c.ok('L-6 共有リンクに gauto=0 を載せない ' + link, !/gauto=0/.test(link) && /gtoken=T/.test(link));
    await ctx.close();
  }

  await b.close();
  c.done();
})().catch(e => { console.error(e); process.exit(2); });
