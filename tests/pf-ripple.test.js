/* 合否2択化の波及（辛口レビュー R1）の回帰テスト。実行: node tests/pf-ripple.test.js
   旧5段階データ・合否混在・試問中の○×のみ（未確定）・質問しなかった の表示/保存/送信名を検査する。
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
const path=require('path'),fs=require('fs');
const env=require('./_env');
let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log((c?'  OK ':'  NG ')+n)};
const URL0=env.URL;
const it=(o)=>Object.assign({hasAudio:true},o);
const S=(id,ee,date,status,items)=>({id,date,examiner:'岡田',examinee:ee,status,items,overall:'',createdAt:date+'T00:00:00Z',updatedAt:date+'T00:00:00Z'});
const SESS=[
  S('old1','アン','2026-08-01','scored',{q1:it({score:4}),q4:it({score:5}),q5:it({score:3})}),
  S('low1','ビン','2026-08-02','scored',{q1:it({score:1}),q4:it({score:1}),q5:it({score:2})}),
  S('mix1','チャウ','2026-09-10','scored',{q1:it({score:'pass'}),q4:it({score:1}),q5:it({score:2})}),
  S('rec1','ブディ','2026-09-20','rec',{q1:it({score:'pass'}),q4:it({score:'fail'}),q5:it({score:'pass'})}),
  S('new0','グエン','2026-09-01','scored',{q1:it({score:'pass'}),q4:it({score:'pass'}),q5:it({score:'fail'})}),
  S('new1','グエン','2026-09-20','scored',{q1:it({score:'pass'}),q4:it({score:null,na:true}),q5:it({score:'pass'})}),
  S('siti','シティ','2026-08-05','scored',{q1:it({score:5}),q4:it({score:4})}),
  S('na1','デウィ','2026-09-21','rec',{q1:it({score:'pass',driveFileId:'D1',driveLink:'https://drive/D1',driveName:'x'})}),
];
(async()=>{
  const b=await env.launch();
  const ctx=await b.newContext({acceptDownloads:true});
  const {page:p,errors:errs}=await env.newPage(ctx);
  const dialogs=[];let dialogAns=false;
  p.on('dialog',async d=>{dialogs.push(d.message());dialogAns?await d.accept():await d.dismiss()});
  const posts=[];let n=0;
  await p.route('https://script.google.com/**',async r=>{const j=JSON.parse(r.request().postData());posts.push({name:j.name,replaceId:j.replaceId||null});n++;r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,id:'G'+n,url:'https://drive/G'+n})})});
  await p.goto(URL0);
  await p.evaluate(s=>{localStorage.setItem('oral_exam_sessions_v1',JSON.stringify({sessions:s}));localStorage.setItem('oral_exam_google_v1',JSON.stringify({url:'https://script.google.com/macros/s/x/exec',auto:true}))},SESS);
  await p.reload();await p.waitForTimeout(400);
  await p.evaluate(async()=>{await putAudio('na1_q1',new Blob([new Uint8Array(200)],{type:'audio/webm'}))});
  const sess=()=>p.evaluate(()=>JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions);
  const get=async id=>(await sess()).find(s=>s.id===id);
  const tab=async pg=>{await p.click(`.tabs button[data-pg="${pg}"]`);await p.waitForTimeout(250)};

  console.log('[1] 旧5段階の試問を採点画面で開いて保存できる（critical）');
  await tab('pgScore');await p.selectOption('#scFil','all');await p.evaluate(()=>drawScoreList());
  await p.evaluate(()=>openScore('old1'));await p.waitForTimeout(400);
  ok('進捗が 3 / 3（旧評価を採点済みに数える）: '+await p.textContent('#spCnt'),(await p.textContent('#spCnt')).trim()==='3 / 3');
  ok('次の未採点なし',await p.evaluate(()=>findUnscoredId())===null);
  await p.fill('#scOv','全体所感だけ修正');
  await p.evaluate(()=>saveScore());await p.waitForTimeout(300);
  const o1=await get('old1');
  ok('保存できた（所感が反映）',o1.overall==='全体所感だけ修正');
  ok('旧点数4/5/3は不変',o1.items.q1.score===4&&o1.items.q4.score===5&&o1.items.q5.score===3);

  console.log('[1b] 旧点数を○×で上書きする時は確認・キャンセルで消えない');
  await p.evaluate(()=>openScore('low1'));await p.waitForTimeout(400);
  dialogs.length=0;dialogAns=false;
  await p.click('.sb[data-id="q1"][data-s="pass"]');await p.waitForTimeout(200);
  ok('確認ダイアログが出る: '+dialogs[0],dialogs.length===1&&/旧5段階評価/.test(dialogs[0])&&/1 — 不合格/.test(dialogs[0]));
  ok('キャンセルで未選択のまま',await p.locator('.sb[data-id="q1"].sel').count()===0);
  await p.evaluate(()=>backToScoreList());await p.waitForTimeout(300);
  ok('一覧へ戻っても旧値1が残る',(await get('low1')).items.q1.score===1);
  ok('一覧の結果は旧評価の平均・緑にならない',await p.evaluate(()=>{const h=[...document.querySelectorAll('#scList .hi')].find(x=>x.textContent.includes('ビン')).querySelector('.hia');return h.textContent.includes('1.3')&&h.textContent.includes('旧評価')&&!h.classList.contains('a5')}));
  await p.evaluate(()=>openScore('low1'));await p.waitForTimeout(400);
  dialogAns=true;
  await p.click('.sb[data-id="q1"][data-s="pass"]');await p.waitForTimeout(200);
  await p.evaluate(()=>backToScoreList());await p.waitForTimeout(300);
  ok('承諾すると合格に置換',(await get('low1')).items.q1.score==='pass');
  const lowRow=await p.evaluate(()=>{const h=[...document.querySelectorAll('#scList .hi')].find(x=>x.textContent.includes('ビン')).querySelector('.hia');return{t:h.textContent,c:h.className}});
  ok('混在は「1/1＋旧評価2問」・中立色: '+lowRow.t+' '+lowRow.c,lowRow.t==='1/1＋旧評価2問'&&/\bold\b/.test(lowRow.c)&&!/a5/.test(lowRow.c));
  dialogAns=false;

  console.log('[2] 合否と旧評価の混在（mix1）');
  await tab('pgHi');
  const mixRow=await p.evaluate(()=>{const h=[...document.querySelectorAll('#hList .hi')].find(x=>x.textContent.includes('チャウ')).querySelector('.hia');return{t:h.textContent,c:h.className}});
  ok('履歴「1/1＋旧評価2問」: '+mixRow.t,mixRow.t==='1/1＋旧評価2問'&&!/a5/.test(mixRow.c));
  await p.evaluate(()=>showDet('mix1'));await p.waitForTimeout(300);
  const mo=await p.textContent('#moBody');
  ok('詳細「合格: 1/1＋旧評価2問」',mo.includes('合格: 1/1＋旧評価2問'));
  ok('詳細の各問に「旧 1 — 不合格」',mo.includes('旧 1 — 不合格')&&mo.includes('旧 2 — 要再確認'));
  // 旧点数チップが読めること（文字色≠背景色）をライト/ダーク両方で実測
  const chipCol=()=>p.evaluate(()=>[...document.querySelectorAll('#moBody .dis.old')].map(e=>{const c=getComputedStyle(e);return{t:e.textContent,c:c.color,b:c.backgroundColor}}));
  for(const cs of ['light','dark']){
    await p.emulateMedia({colorScheme:cs});await p.waitForTimeout(100);
    const cc=await chipCol();
    ok(`旧点数チップの文字色≠背景色（${cs}）: `+JSON.stringify(cc[0]||null),cc.length>=2&&cc.every(x=>x.c!==x.b&&x.b!=='rgba(0, 0, 0, 0)'));
  }
  await p.emulateMedia({colorScheme:'light'});
  await p.evaluate(()=>closeMo());
  ok('サマリに混在の注記',await p.evaluate(()=>{const c=[...document.querySelectorAll('#hList button.cd')].find(x=>x.textContent.includes('チャウ'));return !!c&&c.textContent.includes('旧5段階評価が混ざる')}));
  // CSV
  const [dl]=await Promise.all([p.waitForEvent('download'),p.evaluate(()=>doCSV())]);
  const csv=fs.readFileSync(await dl.path(),'utf8');
  const line=csv.split('\n').find(l=>l.includes('チャウ'));
  ok('CSV集計列に旧件数併記',line.includes('"1/1＋旧評価2問"'));
  ok('CSV各問に旧評価と分かる値',line.includes('"旧 1 — 不合格"'));
  const siti=csv.split('\n').find(l=>l.includes('シティ'));
  ok('CSV旧のみは「旧評価 平均4.5」',siti.includes('"旧評価 平均4.5"'));

  console.log('[3] 試問中の○×のみ（未確定）');
  const recRow=await p.evaluate(()=>{const x=[...document.querySelectorAll('#hList .hi')].find(x=>x.textContent.includes('ブディ'));return{t:x.querySelector('.hia').textContent,b:x.querySelector('.badge').className}});
  ok('履歴「2/3（未確定）」・確定待ちバッジ: '+recRow.t,recRow.t==='2/3（未確定）'&&/pend/.test(recRow.b));
  await p.evaluate(()=>showDet('rec1'));await p.waitForTimeout(300);
  ok('詳細「合格: 2/3（未確定）」',(await p.textContent('#moBody')).includes('合格: 2/3（未確定）'));
  await p.evaluate(()=>closeMo());
  await tab('pgCh');await p.selectOption('#chSel','ブディ');await p.waitForTimeout(300);
  ok('グラフで確定待ちを案内',(await p.textContent('#chNone')).includes('確定待ち'));

  console.log('[4] レーダー：質問しなかった設問は0点と区別');
  await p.selectOption('#chSel','グエン');await p.waitForTimeout(400);
  const rd=await p.evaluate(()=>({d:cR.data.datasets.map(x=>x.data),l:cR.data.labels}));
  ok('直近 [100,null,100]: '+JSON.stringify(rd.d[0]),JSON.stringify(rd.d[0])==='[100,null,100]');
  ok('前回 [100,100,0]（不合格は0のまま）',JSON.stringify(rd.d[1])==='[100,100,0]');
  ok('ラベルに（未実施）',rd.l[1].includes('（未実施）')&&!rd.l[0].includes('未実施'));

  console.log('[5] 旧5段階のみの受験者');
  await p.selectOption('#chSel','シティ');await p.waitForTimeout(300);
  ok('グラフ「旧5段階評価の記録のみ」',(await p.textContent('#chNone')).includes('旧5段階評価の記録のみ'));
  await tab('pgHi');
  const sc=await p.evaluate(()=>{const c=[...document.querySelectorAll('#hList button.cd')].find(x=>x.textContent.includes('シティ'));return c?{t:c.textContent,g:!!c.querySelector('.a5')}:null});
  ok('サマリにカードが出る・旧評価と明示・緑でない',!!sc&&sc.t.includes('旧評価 平均4.5')&&sc.t.includes('合格率の対象外')&&!sc.g);
  await p.evaluate(()=>showDet('old1'));await p.waitForTimeout(300);
  ok('旧のみの詳細ラベル「旧5段階評価: 旧評価 平均4.0」',(await p.textContent('#moBody')).includes('旧5段階評価: 旧評価 平均4.0'));
  await p.evaluate(()=>closeMo());

  console.log('[6] 採点画面で「質問しなかった」→ドライブ名を未判定へ付け直し');
  await tab('pgScore');
  await p.evaluate(()=>openScore('na1'));await p.waitForTimeout(400);
  const before=posts.length;
  await p.check('.nachk[data-id="q1"]');await p.waitForTimeout(2400);
  const last=posts[posts.length-1];
  ok('付け直し送信1回・名前=未判定・置換D1: '+(last&&last.name),posts.length===before+1&&last.name.includes('_未判定_')&&last.replaceId==='D1');
  await p.evaluate(()=>backToScoreList());await p.waitForTimeout(300);

  console.log('[3b] 試問保存時、録音全問に○×があれば採点確定を選べる');
  await tab('pgExam');
  // R5: ドライブ自動保存ONでは受験者名を先に入れないと録音を始めない
  await p.fill('#fEe','確定テスト');
  await p.click('#rb-q1');await p.waitForTimeout(900);await p.click('#rb-q1');await p.waitForTimeout(800);
  await p.click('#vp-q1');
  dialogs.length=0;dialogAns=true;
  await p.click('button:has-text("試問を保存")');await p.waitForTimeout(500);
  const ct=(await sess()).find(s=>s.examinee==='確定テスト');
  ok('確認が出て status=scored: '+dialogs[0],dialogs.some(d=>d.includes('採点も確定'))&&ct&&ct.status==='scored'&&ct.items.q1.score==='pass');
  dialogAns=false;

  ok('既存セッション数は減らない',(await sess()).length===SESS.length+1);
  ok('JSエラーなし '+errs.join('|'),errs.length===0);
  console.log(`結果: ${pass} passed / ${fail} failed`);await b.close();
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
