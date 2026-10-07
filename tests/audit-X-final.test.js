/* 通し検査 2026-10-07【X/V】の回帰テスト。実行: node tests/audit-X-final.test.js
   X-1 読み込みの途中（app.js より前）で画面の幅が変わっても JS エラーにならない（media.js の resize が active を参照）。
       モバイル表示で読み込み直後のエラー0（繰り返し）
   X-2 この端末で書き出したバックアップを同じ端末へ戻したあと保存しても「別のタブ」と言わず、取り込み後に下書きで変えた所
       （○の取り消し・×・録り直し）が消えない。取り込みで下書きの録音を古い録音で上書きしない。再読み込みしても下書きが残る
   X-3 公開直後の1回だけ起きる「新しい index.html × 古い JS/CSS」でも、画面にキー名（appTitleS 等）が出ない
       （古い版＝OLD_REF の js/*・styles.css を git show で一時フォルダへ書き出して組み合わせる）
   V-1 最初の録音のあと、スクロールの途中で固定の進捗パネル（元の大きさ）が1問目の上端を覆わない（390/360/1280・3px刻み）。
       カードは跳ばない（M-22 と同じ確かめ方）
   V-2 狭い画面の録音中、録音ピルが録音中の問の文字起こし欄の文字に重ならない（停止したら元の余白）
   V-3 その場で出題の問題文欄は中身の行数に合わせて伸びる（中でスクロールしない）
   V-5 推移グラフの点は上端で欠けない（clip:false・上の余白）
   VIS-1 録音中の文字起こし欄の点線の枠も録音ピルの下に入らない（V-2 の空きを枠の外に取る）
   P-3 ページのアイコンを明示し /favicon.ico の 404 を出さない
   V-7 score が空文字の問に「旧5段階評価:」の空の表示を出さない（採点画面・履歴の詳細）
   本物の GAS へは送らない（script.google は遮断）。 */
'use strict';
const env = require('./_env');
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { pathToFileURL } = require('url');
const c = env.counter();
const SK = 'oral_exam_sessions_v1';
// 公開中の旧版（sw oral-exam-v42 の main）。X-3 の「古い JS」に使う
const OLD_REF = process.env.OLD_REF || 'b5bdd6b'; // 監査前の本番(sw v42)。main は修正後に進むので固定のコミットで比べる

const sessions = p => p.evaluate(k => (JSON.parse(localStorage.getItem(k) || 'null') || { sessions: [] }).sessions, SK);
const toastTxt = p => p.evaluate(() => document.getElementById('toast').textContent);
const audioSize = (p, k) => p.evaluate(async key => { const b = await getAudio(key); return b ? b.size : 0; }, k);
async function rec(p, id, ms) {
  await p.evaluate(i => toggleRec(i), id);
  await p.waitForFunction(() => !!active, null, { timeout: 15000 }).catch(() => { });
  await p.waitForTimeout(ms || 900);
  await p.evaluate(() => stopRec());
  await p.waitForFunction(i => !active && cur && cur.items[i] && cur.items[i].hasAudio, id, { timeout: 15000 }).catch(() => { });
  await p.waitForTimeout(400);
}
async function exportFiles(p) {
  const dls = []; const on = d => dls.push(d); p.on('download', on);
  await p.evaluate(() => exportBackup());
  await p.waitForTimeout(1500);
  p.off('download', on);
  const out = [];
  for (const d of dls) out.push(await d.path());
  return out;
}
async function ctxOf(b, vp, extra) {
  const ctx = await b.newContext(Object.assign({ viewport: vp || { width: 390, height: 844 }, permissions: ['microphone'] }, extra || {}));
  await ctx.route('**/script.google*/**', r => r.abort());
  return ctx;
}

(async () => {
  const b = await env.launch();
  const bf = await env.launch({ freeDefault: true });

  /* ---------- X-1 ---------- */
  {
    console.log('[X-1]');
    // app.js より前の drive.js を遅らせ、その間に幅を変える（media.js の resize だけが読み込まれた状態）
    const ctx = await ctxOf(b, { width: 375, height: 740 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const { page: p, errors } = await env.newPage(ctx);
    await p.route('**/js/drive.js', async r => { await new Promise(res => setTimeout(res, 1200)); await r.continue(); });
    const nav = p.goto(env.URL, { waitUntil: 'load' });
    await p.waitForFunction(() => typeof revealRecRow === 'function', null, { timeout: 10000 }).catch(() => { });
    const midway = await p.evaluate(() => typeof revealRecRow === 'function' && typeof saveSession !== 'function');
    c.ok('前提：media.js は読み込み済み・app.js はまだ', midway);
    await p.setViewportSize({ width: 740, height: 375 }); await p.waitForTimeout(150);
    await p.setViewportSize({ width: 375, height: 740 }); await p.waitForTimeout(150);
    await p.evaluate(() => { dispatchEvent(new Event('resize')); document.dispatchEvent(new Event('visibilitychange')); });
    await nav; await p.waitForTimeout(400);
    c.ok('読み込みの途中で幅が変わっても JS エラーなし ' + errors.join('|'), !errors.length);
    c.ok('読み込み後に録音中の状態を参照できる', await p.evaluate(() => active === null));
    await ctx.close();
    // モバイル表示で読み込み直後のエラー0（繰り返し）
    const ctx2 = await ctxOf(b, { width: 375, height: 740 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    let errs = [];
    for (let i = 0; i < 12; i++) {
      const { page: q, errors: e } = await env.newPage(ctx2);
      await q.goto(env.URL); await q.waitForTimeout(150);
      errs = errs.concat(e); await q.close();
    }
    c.ok('モバイル表示で12回読み込んでエラー0 ' + errs.join('|'), !errs.length);
    await ctx2.close();
  }

  /* ---------- X-2 ---------- */
  {
    console.log('[X-2]');
    const ctx = await ctxOf(bf);
    const { page: p, errors } = await env.newPage(ctx);
    const dlg = [];
    p.on('dialog', d => { dlg.push(d.message()); d.message().includes('採点も確定') ? d.dismiss() : d.accept(); });
    await p.goto(env.URL); await p.waitForTimeout(500);
    await p.fill('#fEe', 'グエン'); await p.locator('#fEe').blur(); await p.waitForTimeout(300);
    const [i1, i2] = await p.evaluate(() => getItems().map(i => i.id));
    await rec(p, i1, 900); await rec(p, i2, 900);
    await p.evaluate(i => setVerdict(i, 'pass'), i1); await p.waitForTimeout(200);
    const cid = await p.evaluate(() => cur.id);
    const files = await exportFiles(p);
    c.ok('前提：書き出し1件', files.length === 1);
    // 書き出しのあと1問目を録り直す（端末の録音のほうが新しい）
    await rec(p, i1, 2600);
    const sNew = await audioSize(p, cid + '_' + i1);
    // 同じファイルを同じ端末へ戻す
    await p.setInputFiles('#bkFile', files); await p.waitForTimeout(1500);
    c.ok('取り込みで下書きの録り直しを古い録音で上書きしない ' + sNew + ' / ' + await audioSize(p, cid + '_' + i1), sNew > 0 && await audioSize(p, cid + '_' + i1) === sNew);
    c.ok('取り込み後も同じ試問を開いたまま', await p.evaluate(id => cur && cur.id === id, cid));
    // 再読み込みしても下書き（録り直し・○）が残る
    await p.reload(); await p.waitForTimeout(800);
    const r1 = await p.evaluate(() => cur && { id: cur.id, items: cur.items });
    c.ok('再読み込みしても下書きが残る', !!r1 && r1.id === cid && r1.items[i1] && r1.items[i1].hasAudio && r1.items[i2] && r1.items[i2].hasAudio);
    // ○を取り消し、2問目は×にして保存
    const on1 = await p.evaluate(i => document.getElementById('vp-' + i).classList.contains('on'), i1);
    c.ok('前提：1問目は○のまま', on1);
    await p.evaluate(i => setVerdict(i, 'pass'), i1); await p.waitForTimeout(200);
    await p.evaluate(i => setVerdict(i, 'fail'), i2); await p.waitForTimeout(200);
    await p.evaluate(() => saveSession()); await p.waitForTimeout(800);
    const t = await toastTxt(p);
    c.ok('保存のトーストに「別のタブ」が出ない: ' + t, !t.includes('別のタブ'));
    const all = await sessions(p);
    const sv = all.filter(s => s.id === cid);
    c.ok('保存済みは1件', sv.length === 1);
    const it = (sv[0] && sv[0].items) || {};
    c.ok('取り消した○は戻らない ' + JSON.stringify(it[i1] && it[i1].score), it[i1] && it[i1].score !== 'pass');
    c.ok('2問目の×が残る', it[i2] && it[i2].score === 'fail');
    c.ok('2問とも録音あり', it[i1] && it[i1].hasAudio && it[i2] && it[i2].hasAudio);
    c.ok('録り直した録音が保存済みの録音', await audioSize(p, cid + '_' + i1) === sNew);
    c.ok('下書きの印（_resume/_base）は保存済みに残らない', !('_resume' in (sv[0] || {})) && !('_base' in (sv[0] || {})));
    c.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- X-3 ---------- */
  {
    console.log('[X-3]');
    const root = env.ROOT;
    const mix = process.env.MIX_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'oral-mix-'));
    let ok = true;
    try {
      fs.mkdirSync(path.join(mix, 'js'), { recursive: true });
      const list = execFileSync('git', ['ls-tree', '--name-only', OLD_REF, 'js/'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
      for (const f of list.concat(['styles.css'])) fs.writeFileSync(path.join(mix, f), execFileSync('git', ['show', OLD_REF + ':' + f], { cwd: root }));
      fs.copyFileSync(path.join(root, 'index.html'), path.join(mix, 'index.html'));
    } catch (e) { ok = false; console.log('  (git show ' + OLD_REF + ' に失敗: ' + e.message + ')'); }
    c.ok('前提：旧版の JS を書き出せた（' + OLD_REF + '）', ok);
    if (ok) {
      const oldVer = execFileSync('git', ['show', OLD_REF + ':sw.js'], { cwd: root, encoding: 'utf8' }).match(/VER\s*=\s*'([^']+)'/);
      console.log('  旧版 sw VER=' + (oldVer && oldVer[1]));
      // 新しい版の訳語のキーのうち、旧版に無いもの（旧版の t() はキー名をそのまま返す）
      const keysOf = async u => {
        const ctx = await ctxOf(b); const { page: p } = await env.newPage(ctx);
        await p.goto(u); await p.waitForTimeout(400);
        const k = await p.evaluate(() => Object.keys(TX.ja).concat(typeof TX2 !== 'undefined' ? Object.keys(TX2.ja) : []));
        await ctx.close(); return k;
      };
      const mixUrl = pathToFileURL(path.join(mix, 'index.html')).href;
      const newK = await keysOf(env.URL), oldK = new Set(await keysOf(mixUrl));
      const fresh = newK.filter(k => !oldK.has(k) && k.length >= 5);
      console.log('  新しいキー ' + fresh.length + ' 件');
      for (const vp of [{ width: 390, height: 844 }, { width: 1280, height: 800 }]) {
        const ctx = await ctxOf(b, vp);
        const { page: p, errors } = await env.newPage(ctx);
        p.on('dialog', d => d.accept());
        await p.goto(mixUrl); await p.waitForTimeout(500);
        const js = await p.evaluate(() => typeof qTextDone === 'function' ? 'NEW' : 'OLD');
        c.ok(vp.width + ' 前提：古い JS で動いている', js === 'OLD');
        const h1 = await p.evaluate(() => document.querySelector('.hdr h1').innerText.trim());
        const want = vp.width < 520 ? '口頭試問' : '口頭試問 評価システム';
        c.ok(vp.width + ' 見出しは素の日本語（キー名なし・二重にならない）: ' + h1, h1 === want);
        const raw = await p.evaluate(() => [...document.querySelectorAll('[data-t]')].filter(e => e.textContent === e.dataset.t).map(e => e.dataset.t));
        c.ok(vp.width + ' data-t の要素にキー名がそのまま出ない ' + raw.join(','), !raw.length);
        let hit = [];
        for (const pg of ['pgExam', 'pgScore', 'pgHi', 'pgCh', 'pgCfg']) {
          await p.evaluate(pg => { const bt = document.querySelector(`.tabs button[data-pg="${pg}"]`); if (bt) swTab(bt); }, pg); await p.waitForTimeout(200);
          const txt = await p.evaluate(() => document.body.innerText);
          hit = hit.concat(fresh.filter(k => new RegExp('(^|[^A-Za-z0-9_])' + k + '($|[^A-Za-z0-9_])').test(txt)).map(k => pg + ':' + k));
        }
        c.ok(vp.width + ' どのタブにも新しいキー名が出ない ' + hit.join(','), !hit.length);
        c.ok(vp.width + ' JSエラーなし ' + errors.join('|'), !errors.length);
        await ctx.close();
      }
      // 新しい JS では短い題名も言語に追従する
      const ctx = await ctxOf(b, { width: 390, height: 844 });
      const { page: p } = await env.newPage(ctx);
      await p.goto(env.URL); await p.waitForTimeout(400);
      for (const l of ['ja', 'en', 'vi', 'id']) {
        await p.evaluate(l => setLang(l), l); await p.waitForTimeout(100);
        const r = await p.evaluate(() => ({ h: document.querySelector('.hdr h1').innerText.trim(), want: t('appTitleS') }));
        c.ok('新しい JS ' + l + ' の短い題名 ' + r.h, r.h === r.want && r.h !== 'appTitleS');
      }
      await ctx.close();
    }
    if (!process.env.MIX_DIR) try { fs.rmSync(mix, { recursive: true, force: true }); } catch (e) { /* 一時フォルダ */ }
  }

  /* ---------- V-1 ---------- */
  for (const v of [{ vp: { width: 390, height: 780 } }, { vp: { width: 360, height: 780 }, lang: 'vi' }, { vp: { width: 1280, height: 800 } }, { vp: { width: 390, height: 780 }, howtoOff: true }]) {
    const tag = 'V-1 ' + v.vp.width + (v.lang ? ' ' + v.lang : '') + (v.howtoOff ? ' 使い方なし' : '');
    const ctx = await ctxOf(bf, v.vp);
    const init = [];
    if (v.lang) init.push(`localStorage.setItem('oral_exam_lang',${JSON.stringify(v.lang)});`);
    if (v.howtoOff) init.push(`localStorage.setItem('oral_exam_howto_off','1');localStorage.setItem('oral_exam_drvhint_off','1');`);
    if (init.length) await ctx.addInitScript(`try{if(!sessionStorage.getItem('__seedX')){sessionStorage.setItem('__seedX','1');${init.join('')}}}catch(e){}`);
    const { page: p, errors } = await env.newPage(ctx);
    p.on('dialog', d => d.accept());
    await p.goto(env.URL); await p.waitForTimeout(500);
    await p.fill('#fEe', 'グエン'); await p.locator('#fEe').blur(); await p.waitForTimeout(500);
    const i1 = await p.evaluate(() => getItems()[0].id);
    await p.fill('#qt-' + i1, '豚の体温は何度ですか'); await p.waitForTimeout(100);
    await rec(p, i1, 1000);
    await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(150);
    const shown = await p.evaluate(() => getComputedStyle(document.getElementById('examProg')).display !== 'none');
    c.ok(tag + ' 前提：最初の録音のあと進捗パネルが出ている', shown);
    const max = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const end = Math.min(900, max);
    const probe = () => p.evaluate(i => {
      const g = document.getElementById('examProg').getBoundingClientRect(), q = document.getElementById('q-' + i), qr = q.getBoundingClientRect(), en = q.querySelector('.en').getBoundingClientRect();
      return { y: scrollY, ht: g.top, hb: g.bottom, mini: document.getElementById('examProg').classList.contains('mini'), ct: qr.top, en: en.top };
    }, i1);
    let prev = await probe(), covered = [], jumps = [], sawMini = false;
    const step = async y => {
      await p.evaluate(y => window.scrollTo(0, y), y); await p.waitForTimeout(20);
      const cur = await probe(); if (cur.mini) sawMini = true;
      // 元の大きさのパネルの下にカードの上端（出-1 のラベル）が入る＝隠れている
      if (!cur.mini && cur.ct < cur.hb - 1 && cur.ct > cur.ht - 40) covered.push(`${cur.y}:${Math.round(cur.ct)}<${Math.round(cur.hb)}`);
      // 小型へ切り替えた直後も、カードの上端はパネルの下端より下
      if (cur.mini && !prev.mini && cur.ct < cur.hb - 1) covered.push(`${cur.y}:mini ${Math.round(cur.ct)}<${Math.round(cur.hb)}`);
      const exp = prev.ct - (cur.y - prev.y);
      if (Math.abs(cur.ct - exp) > 1.5) jumps.push(`${prev.y}→${cur.y}:${Math.round(cur.ct - exp)}`);
      prev = cur;
    };
    for (let y = 3; y <= end; y += 3) await step(y);
    for (let y = end - 3; y >= 0; y -= 3) await step(y);
    c.ok(tag + ' スクロールの途中で小型になる', sawMini);
    c.ok(tag + ' 先頭へ戻ると元の大きさ', !prev.mini);
    c.ok(tag + ' 元の大きさのパネルが1問目の上端を覆わない ' + covered.slice(0, 8).join(' '), !covered.length);
    c.ok(tag + ' カードが跳ばない（3pxずつ） ' + jumps.slice(0, 8).join(' '), !jumps.length);
    c.ok(tag + ' JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- V-3 ---------- */
  {
    console.log('[V-3]');
    const ctx = await ctxOf(bf, { width: 390, height: 844 });
    const { page: p, errors } = await env.newPage(ctx);
    await p.goto(env.URL); await p.waitForTimeout(500);
    const i1 = await p.evaluate(() => getItems()[0].id);
    await p.fill('#qt-' + i1, 'Nhiệt độ cơ thể của lợn bình thường là bao nhiêu độ?\n豚の平熱は何度ですか。測り方も説明してください。\nThân nhiệt bình thường của heo nái sau khi đẻ?'); await p.waitForTimeout(100);
    const r = await p.evaluate(i => { const e = document.getElementById('qt-' + i); return { sh: e.scrollHeight, ch: e.clientHeight, st: e.scrollTop }; }, i1);
    c.ok('3行入れても欄の中でスクロールしない ' + JSON.stringify(r), r.sh <= r.ch + 1 && r.st === 0);
    await p.waitForTimeout(700); // 下書きへの保存（0.4秒後）を待つ
    await p.reload(); await p.waitForTimeout(600);
    const r2 = await p.evaluate(i => { const e = document.getElementById('qt-' + i); return { sh: e.scrollHeight, ch: e.clientHeight, v: e.value.split('\n').length }; }, i1);
    c.ok('再読み込み後も行数に合わせた高さ ' + JSON.stringify(r2), r2.v === 3 && r2.sh <= r2.ch + 1 && Math.abs(r2.ch - r.ch) <= 2);
    c.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- V-2 ---------- */
  for (const v of [{ w: 360, lang: 'vi' }, { w: 390 }]) {
    const tag = 'V-2 ' + v.w + (v.lang ? ' ' + v.lang : '');
    const ctx = await ctxOf(bf, { width: v.w, height: 780 });
    if (v.lang) await ctx.addInitScript(`try{if(!sessionStorage.getItem('__seedV2')){sessionStorage.setItem('__seedV2','1');localStorage.setItem('oral_exam_lang',${JSON.stringify(v.lang)})}}catch(e){}`);
    const { page: p, errors } = await env.newPage(ctx);
    p.on('dialog', d => d.accept());
    await p.goto(env.URL); await p.waitForTimeout(500);
    await p.fill('#fEe', 'グエン'); await p.locator('#fEe').blur(); await p.waitForTimeout(400);
    const i1 = await p.evaluate(() => getItems()[0].id);
    await p.evaluate(i => toggleRec(i), i1);
    await p.waitForFunction(() => !!active, null, { timeout: 15000 }).catch(() => { });
    await p.waitForTimeout(800);
    // 文字起こし欄の文字が置ける右端（枠の右端−右の余白）が録音ピルの左端より左＝ピルが文字に重ならない
    const r = await p.evaluate(i => {
      const lv = document.getElementById('lv-' + i), pl = document.getElementById('recPill');
      const a = lv.getBoundingClientRect(), b = pl.getBoundingClientRect(), pr = parseFloat(getComputedStyle(lv).paddingRight) || 0;
      return { textRight: Math.round(a.right - pr), boxRight: Math.round(a.right), pillLeft: Math.round(b.left) };
    }, i1);
    c.ok(tag + ' 録音中の文字起こし欄の文字が録音ピルの下に入らない ' + JSON.stringify(r), r.textRight <= r.pillLeft);
    // VIS-1 点線の枠の右端もピルの左端より左（枠の線がピルの下に入らない）
    c.ok('VIS-1 ' + tag + ' 録音中の文字起こし欄の枠が録音ピルの下に入らない ' + JSON.stringify(r), r.boxRight <= r.pillLeft);
    await p.evaluate(() => stopRec()); await p.waitForTimeout(500);
    const pad = await p.evaluate(i => { const cs = getComputedStyle(document.getElementById('lv-' + i)); return parseFloat(cs.paddingRight) + parseFloat(cs.marginRight); }, i1);
    c.ok(tag + ' 停止したら右の空きを戻す ' + pad, pad <= 14);
    c.ok(tag + ' JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  /* ---------- P-3 ---------- */
  {
    console.log('[P-3]');
    // ページのアイコンを明示（無いとブラウザが /favicon.ico を取りに行き毎回 404・オフラインでは失敗が出る）。
    // 指すファイルは sw の ASSETS（オフラインでも出る）
    const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
    const m = html.match(/<link[^>]*rel="icon"[^>]*href="([^"]+)"/);
    c.ok('P-3 index.html に rel="icon" がある ' + (m && m[1]), !!m);
    const sw = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    c.ok('P-3 アイコンは sw の ASSETS に入っている', !!m && sw.includes("'./" + m[1] + "'") && fs.existsSync(path.join(__dirname, '..', m[1])));
    const ctx = await ctxOf(b, { width: 390, height: 844 });
    const { page: p } = await env.newPage(ctx);
    const fav = []; p.on('request', r => { if (/favicon\.ico/.test(r.url())) fav.push(r.url()); });
    await p.goto(env.URL); await p.waitForTimeout(800);
    c.ok('P-3 /favicon.ico を取りに行かない ' + fav.join('|'), !fav.length);
    await ctx.close();
  }

  /* ---------- V-5 / V-7 ---------- */
  {
    console.log('[V-5/V-7]');
    const ctx = await ctxOf(b, { width: 390, height: 844 });
    const { page: p, errors } = await env.newPage(ctx);
    p.on('dialog', d => d.accept());
    await p.goto(env.URL); await p.waitForTimeout(400);
    const ids = await p.evaluate(() => getItems().map(i => i.id));
    const S = (id, date, items) => ({ id, date, examiner: '', examinee: 'アン', status: 'scored', items, overall: '', createdAt: date + 'T00:00:00Z', updatedAt: date + 'T00:00:00Z' });
    const SESS = [
      S('v1', '2026-09-20', { [ids[0]]: { hasAudio: true, score: 'pass' }, [ids[1]]: { hasAudio: true, score: 'pass' } }),
      S('v2', '2026-09-22', { [ids[0]]: { hasAudio: true, score: 'pass' }, [ids[1]]: { hasAudio: true, score: 'fail' }, [ids[2]]: { hasAudio: true, score: '' } }),
    ];
    await p.evaluate(s => localStorage.setItem('oral_exam_sessions_v1', JSON.stringify({ sessions: s })), SESS);
    await p.reload(); await p.waitForTimeout(400);
    // V-7 採点画面
    await p.evaluate(() => swTab(document.querySelector('.tabs button[data-pg="pgScore"]'))); await p.waitForTimeout(200);
    await p.evaluate(() => openScore('v2')); await p.waitForTimeout(400);
    const sp = await p.evaluate(i => { const e = document.getElementById('sp-' + i); return e ? e.textContent : null; }, ids[2]);
    c.ok('V-7 採点画面：空の score に「旧5段階評価:」を出さない ' + JSON.stringify(sp), sp === null || !/:\s*$/.test(sp.trim()) && !sp.includes(await p.evaluate(() => t2('oldScore'))));
    // V-7 履歴の詳細
    await p.evaluate(() => swTab(document.querySelector('.tabs button[data-pg="pgHi"]'))); await p.waitForTimeout(200);
    await p.evaluate(() => showDet('v2')); await p.waitForTimeout(250);
    const empt = await p.evaluate(() => [...document.querySelectorAll('#moBody .dis')].filter(e => !e.textContent.trim()).length);
    c.ok('V-7 履歴の詳細：空の採点ラベルを出さない ' + empt, empt === 0);
    await p.evaluate(() => closeMo());
    // V-5 推移グラフ
    await p.evaluate(() => swTab(document.querySelector('.tabs button[data-pg="pgCh"]'))); await p.waitForTimeout(200);
    await p.evaluate(() => { const s = document.getElementById('chSel'); s.value = 'アン'; s.dispatchEvent(new Event('change')); }); await p.waitForTimeout(500);
    const ch = await p.evaluate(() => {
      const cv = document.getElementById('cvL'), ch = window.Chart && Chart.getChart && Chart.getChart(cv);
      if (!ch || Chart.__stub) return { stub: true };
      const ds = ch.config.data.datasets[0], top = ch.chartArea && ch.chartArea.top;
      return { clip: ds.clip, top, pad: ch.config.options.layout && ch.config.options.layout.padding };
    });
    c.ok('V-5 推移グラフの点は上端で欠けない ' + JSON.stringify(ch), ch.stub || (ch.clip === false && ch.top >= 8));
    c.ok('JSエラーなし ' + errors.join('|'), !errors.length);
    await ctx.close();
  }

  await b.close(); await bf.close();
  c.done();
})().catch(e => { console.error(e); process.exit(2); });
