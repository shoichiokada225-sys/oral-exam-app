/* 合否2択化の波及（辛口レビュー R1 追補）：「続ける」で開いた旧5段階の試問を試問画面で扱う回帰テスト。
   実行: node tests/pf-resume-old.test.js
   - 試問カードの○×で旧点数を黙って上書きしない（確認・キャンセルで保持）
   - 旧点数はカードに「旧 4 — 良好」と併記
   - 旧点数の残る試問に続きを録って保存しても、採点済みが「確定待ち」に落ちない（確定を選べる）
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
const env=require('./_env');
let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log((c?'  OK ':'  NG ')+n)};
const it=o=>Object.assign({hasAudio:true},o);
const SESS=[{id:'oldR',date:'2026-08-01',examiner:'岡田',examinee:'アン',status:'scored',overall:'旧所感',
  items:{q1:it({score:4}),q4:it({score:5})},createdAt:'2026-08-01T00:00:00Z',updatedAt:'2026-08-01T00:00:00Z'}];
(async()=>{
  const b=await env.launch();
  const ctx=await b.newContext();
  const {page:p,errors:errs}=await env.newPage(ctx);
  const dialogs=[];let answer=()=>false;
  p.on('dialog',async d=>{dialogs.push(d.message());answer(d.message())?await d.accept():await d.dismiss()});
  await p.route('https://script.google.com/**',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,id:'G1',url:'https://drive/G1'})}));
  await p.goto(env.URL);
  await p.evaluate(s=>{localStorage.setItem('oral_exam_sessions_v1',JSON.stringify({sessions:s}))},SESS);
  await p.reload();await p.waitForTimeout(400);
  await p.evaluate(async()=>{for(const k of ['oldR_q1','oldR_q4'])await putAudio(k,new Blob([new Uint8Array(300)],{type:'audio/webm'}))});
  const get=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions.find(s=>s.id==='oldR'));

  console.log('[A] 「続ける」で開いた旧5段階の試問');
  await p.evaluate(()=>resumeExam('oldR'));await p.waitForTimeout(500);
  const hint=await p.evaluate(()=>{const e=document.getElementById('vo-q1');return e?e.textContent:null});
  ok('カードに旧点数を併記: '+hint,hint==='旧 4 — 良好');
  ok('○×はどちらも未選択（旧点数を合否と見せない）',await p.locator('#vp-q1.on, #vf-q1.on').count()===0);

  dialogs.length=0;answer=()=>false;
  await p.click('#vp-q1');await p.waitForTimeout(200);
  ok('○で確認が出る: '+dialogs[0],dialogs.length===1&&/旧5段階評価/.test(dialogs[0])&&/4 — 良好/.test(dialogs[0]));
  ok('キャンセルで旧点数4を保持（下書き）',await p.evaluate(()=>cur.items.q1.score===4));
  ok('キャンセル後も○は未選択・旧点数の表示は残る',await p.locator('#vp-q1.on').count()===0&&await p.locator('#vo-q1').count()===1);

  dialogs.length=0;answer=m=>/旧5段階評価/.test(m);
  await p.click('#vf-q4');await p.waitForTimeout(200);
  ok('承諾すると q4 は不合格に置換・旧表示は消える',await p.evaluate(()=>cur.items.q4.score==='fail')&&await p.locator('#vo-q4').count()===0&&await p.locator('#vf-q4.on').count()===1);

  console.log('[B] 続きを録って保存しても、旧点数の残る試問は「確定待ち」に落ちない');
  await p.click('#rb-q5');await p.waitForTimeout(900);await p.click('#rb-q5');await p.waitForTimeout(800);
  dialogs.length=0;answer=()=>false;
  await p.click('#vp-q5');await p.waitForTimeout(150);
  ok('旧点数の無い問は確認なしで判定',dialogs.length===0&&await p.evaluate(()=>cur.items.q5.score==='pass'));
  answer=m=>/採点も確定/.test(m);
  await p.click('button:has-text("試問を保存")');await p.waitForTimeout(700);
  const s=await get();
  ok('採点確定の確認が出た: '+dialogs.join(' / '),dialogs.some(d=>d.includes('採点も確定')));
  ok('status=scored（確定待ちに落ちない）: '+s.status,s.status==='scored');
  ok('旧点数 q1=4 は保持・q4=fail・q5=pass',s.items.q1.score===4&&s.items.q4.score==='fail'&&s.items.q5.score==='pass');
  ok('全体所感は不変',s.overall==='旧所感');
  ok('JSエラーなし '+errs.join('|'),errs.length===0);
  await b.close();
  console.log(`結果: ${pass} passed / ${fail} failed`);
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(1)});
