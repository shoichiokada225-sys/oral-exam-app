/* 合否（録音横の合格/不合格・ドライブ送信名・採点画面との連携）の回帰テスト。実行: node tests/verdict.test.js
   Googleドライブ送信は page.route でモック（本番GASには送らない） */
const env=require('./_env');
let pass=0,fail=0;const ok=(n,c)=>{c?pass++:fail++;console.log((c?'  OK ':'  NG ')+n)};
(async()=>{
  const b=await env.launch();
  const {page:p,errors:errs}=await env.newPage(b);
  const posts=[];let n=0;
  await p.route('https://script.google.com/**',async r=>{const j=JSON.parse(r.request().postData());posts.push({name:j.name,replaceId:j.replaceId||null});n++;await new Promise(s=>setTimeout(s,300));r.fulfill({contentType:'application/json',body:JSON.stringify({ok:true,id:'F'+n,url:'https://drive/F'+n})})});
  await p.goto(env.URL);
  await p.evaluate(()=>localStorage.setItem('oral_exam_google_v1',JSON.stringify({url:'https://script.google.com/macros/s/x/exec',auto:true})));
  await p.reload();await p.waitForTimeout(300);
  // R5: ドライブ自動保存ONでは受験者名が空だと録音を始めない（「受験者」フォルダに誰のものか分からない録音が並ぶため）→先に名前を入れる
  await p.fill('#fEr','岡田');await p.fill('#fEe','テスト太郎');
  ok('合否ボタンが各カードにある',await p.locator('#examCards .verd').count()===await p.locator('#examCards .qc').count());
  const box=await p.locator('#vp-q1').boundingBox(),rb=await p.locator('#rb-q1').boundingBox();
  ok('録音ボタンと同じ行',Math.abs((box.y+box.height/2)-(rb.y+rb.height/2))<30);
  // 録音→判定なしで送信
  await p.click('#rb-q1');await p.waitForTimeout(1000);await p.click('#rb-q1');await p.waitForTimeout(1200);
  ok('判定前の送信名=未判定: '+posts[0]?.name,posts[0]?.name.includes('_未判定_'));
  // 合格を押す→付け直し
  await p.click('#vp-q1');ok('合格が点灯',await p.locator('#vp-q1.on').count()===1);
  await p.waitForTimeout(2300);
  ok('付け直し名=合格: '+posts[1]?.name,posts[1]?.name.includes('_合格_'));
  ok('旧ファイルF1を置換指定',posts[1]?.replaceId==='F1');
  // 連打（不合格→合格→不合格）は1回だけ送信
  await p.click('#vf-q1');await p.click('#vp-q1');await p.click('#vf-q1');
  ok('不合格のみ点灯',await p.locator('#vf-q1.on').count()===1&&await p.locator('#vp-q1.on').count()===0);
  await p.waitForTimeout(2500);
  ok('連打でも送信は1回: 計'+posts.length,posts.length===3);
  ok('名前=不合格・置換F2: '+posts[2]?.name,posts[2]?.name.includes('_不合格_')&&posts[2]?.replaceId==='F2');
  // 同じボタン再押下で解除
  await p.click('#vf-q1');await p.waitForTimeout(2300);
  ok('解除で未判定に戻る',posts[3]?.name.includes('_未判定_')&&await p.locator('#q-q1 .vb.on').count()===0);
  // 録音前に判定→録音時の名前に反映
  await p.click('#vp-q4');await p.click('#rb-q4');await p.waitForTimeout(1000);await p.click('#rb-q4');await p.waitForTimeout(2600);
  const q2=posts.filter(x=>!x.replaceId).pop();
  ok('録音前に合格→送信名に合格: '+q2?.name,q2?.name.includes('_合格_'));
  ok('保存先は採点と同じscore',await p.evaluate(()=>JSON.parse(localStorage.getItem('oral_exam_draft_v1')||'null')?.items?.q4?.score)==='pass');
  ok('録音前判定で余分な送信なし',posts.length===5);
  
  // 試問を保存→採点画面に合否が引き継がれ、採点で変えるとドライブ名も付け直す
  await p.fill('#fEr','岡田');await p.fill('#fEe','テスト太郎');
  await p.click('button:has-text("試問を保存")');await p.waitForTimeout(400);
  await p.click('.tabs button[data-pg="pgScore"]');await p.waitForTimeout(300);
  await p.click('#scList .hi');await p.waitForTimeout(500);
  ok('採点画面でq4が合格選択済み',await p.locator('.sb[data-id="q4"][data-s="pass"].sel').count()===1);
  ok('採点画面でq1は未選択',await p.locator('.sb[data-id="q1"].sel').count()===0);
  const before=posts.length;
  await p.click('.sb[data-id="q4"][data-s="fail"]');await p.waitForTimeout(2600);
  const last=posts[posts.length-1];
  ok('採点で不合格→付け直し送信: '+last?.name,posts.length===before+1&&last.name.includes('_不合格_')&&!!last.replaceId);
  ok('付け直し後のファイルIDが保存',await p.evaluate(id=>JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions[0].items.q4.driveFileId===id,'F'+posts.length));
  await p.click('text=採点を保存');await p.waitForTimeout(400);
  ok('保存値=fail',await p.evaluate(()=>JSON.parse(localStorage.getItem('oral_exam_sessions_v1')).sessions[0].items.q4.score==='fail'));
  // スマホ幅ではみ出さない
  await p.setViewportSize({width:375,height:800});await p.waitForTimeout(200);
  ok('375px幅で横スクロールなし',await p.evaluate(()=>document.documentElement.scrollWidth<=375));
  await p.screenshot({path:require('os').tmpdir()+'/oral-verdict_'+process.pid+'.png',clip:{x:0,y:0,width:375,height:800}});
  ok('JSエラーなし '+errs.join('|'),errs.length===0);
  console.log(`結果: ${pass} passed / ${fail} failed`);await b.close();
  process.exit(fail?1:0);
})().catch(e=>{console.error(e);process.exit(2)});
