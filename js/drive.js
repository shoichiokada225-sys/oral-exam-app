/* drive.js — Googleドライブ自動保存（GAS送信・付け直し・再送・URLからの設定取り込み）
   media.js から分割（R2・挙動は不変）。読み込み順: media.js の後、verdict.js・ui-core.js の前 */
/* ==============================================================
   Googleドライブ自動保存（GAS ウェブアプリ方式）
   秘密情報は持たない。GASのURLと合言葉(token)は端末内localStorageのみ。
   音声はbase64でGASにPOSTし、GAS側(ユーザー本人として実行)が
   ユーザーのドライブの「(保存先)/(受験者_日付)/」へ保存する。
   ============================================================== */
let gConnected=false;

function saveGoogleCfg(){
  const prev=getGoogleCfg();
  const g=Object.assign({},prev,{url:document.getElementById('gUrl').value.trim(),token:document.getElementById('gToken').value.trim(),folder:document.getElementById('gFolder').value.trim()||'口頭試問音声',auto:document.getElementById('gAuto').checked});
  // 初めてURLを保存するとき（チェックを自分で触っていない・自動保存が未設定）は、続けて接続テストを行い、
  // つながったら自動保存を既定ONにする（gasTest）。URLを入れて接続OKなのに1件も送られない事故を防ぎつつ、
  // 間違ったURLのまま全録音が送信失敗になるのも避ける。自分でOFFにした人＝autoSet・既存の auto:false は変えない
  const pendOn=!!(g.url&&!prev.autoSet&&prev.auto===undefined&&!g.auto);
  if(pendOn)delete g.auto; // 未設定のまま（接続テスト成功でONになる）
  localStorage.setItem(GKEY,JSON.stringify(g));
  toast(t('gCfgSaved')+(pendOn?' · '+t2('gAutoWait'):''));
  updateGoogleStatus();
  if(pendOn)gasTest(true);
}
function toggleAuto(){
  const g=getGoogleCfg();
  if(document.getElementById('gAuto').checked&&!g.url){toast(t('gAutoNoCfg'),1);document.getElementById('gAuto').checked=false;return}
  g.auto=document.getElementById('gAuto').checked;g.autoSet=true; // 利用者が自分で選んだ（以後、既定ONで上書きしない）
  localStorage.setItem(GKEY,JSON.stringify(g));
  updateGoogleStatus();
}
/* 接続できているか：この画面で接続テストか送信に成功した／前回までにこの保存先へ送信できた（okUrl・L-1）。
   接続テストに失敗したら gFailed＝「未接続」。保存先はあるがまだ確かめていなければ中立の「設定済み（未確認）」 */
let gFailed=false;
function gIsConnected(){const g=getGoogleCfg();return !!g.url&&!gFailed&&(gConnected||g.okUrl===g.url)}
function markGasOk(){
  gConnected=true;gFailed=false;
  try{const g=getGoogleCfg();if(g.url&&g.okUrl!==g.url){g.okUrl=g.url;localStorage.setItem(GKEY,JSON.stringify(g));updateGoogleStatus()}}catch(e){}
}
function updateGoogleStatus(){
  const el=document.getElementById('gStatus');
  if(el){
    const g=getGoogleCfg(),auto=!!g.auto,con=gIsConnected();
    // 接続OKでも自動保存OFFなら「送られない」ことを中立色で明示（「自動保存できます」と言わない）
    el.textContent=con?(auto?t('gConnected'):t2('drvConnNoAuto')):(g.url&&!gFailed?t('gUntested'):t('gDisconnected'));
    el.style.color=con&&auto?'var(--pri)':'var(--sub)';
  }
  if(typeof updateDriveUi==='function')updateDriveUi();
  if(typeof renderDrvOrphans==='function')renderDrvOrphans(); // ドライブに残った旧名のファイルの案内
}

// GASにPOST（プリフライト回避のためtext/plainで送る。bodyはJSON文字列）
// ⚠️ x.upload に onprogress/onload を付けてはいけない：アップロードの監視があるとブラウザが送信前にCORSの事前確認（OPTIONS）を出し、
// GASはそれに応答しないため、本物のブラウザでは全送信が「届かない」で失敗する（09-24〜09-29 実害。テストの代役GASが事前確認に応えていて見えなかった）。
// そのため進み具合は取れない。応答が無いまま止まる（農場の弱い電波で途中で切れる）と upBusy が残って再送できなくなるので、
// 上限時間（60秒＋1MBあたり10分≒実効14kbps。遅い送信も切らない）で打ち切り「応答なし」(timeout)＝未送信に戻して電波復帰で自動再送。
// （上限はGASの保存時間より十分長いので、届いたのに打ち切る＝二重保存はまず起きない。maybe は旧版で保存された失敗理由の表示用に残す）
// 失敗は種類(kind)を付けて投げる。通信自体が失敗した時は、端末が圏外(navigator.onLine=false)なら offline、
// 電波はある（onLine）のに届かない時は reach＝GASの公開範囲が「全員」でない（ログイン画面へ302・CORSなし）
// またはURL違い・削除済み。実際のブラウザではどちらも HTML ではなく通信失敗(TypeError)になるため区別する
var GAS_TO_BASE=60000,GAS_TO_PER_MB=600000;
function gasErr(kind,detail){const e=new Error(detail||kind);e.kind=kind;return e}
function gasNetKind(){return (typeof navigator!=='undefined'&&navigator.onLine===false)?'offline':'reach'}
function gasPost(payload){
  const g=getGoogleCfg();
  const body=JSON.stringify(payload);
  const cap=GAS_TO_BASE+Math.ceil(body.length/1048576*GAS_TO_PER_MB);
  return new Promise((resolve,reject)=>{
    const x=new XMLHttpRequest();
    let fin=false,tCap=null;
    const fail=(kind,detail)=>{if(fin)return;fin=true;clearTimeout(tCap);reject(gasErr(kind,detail))};
    const cut=(kind,detail)=>{fail(kind,detail);try{x.abort()}catch(e){}};
    try{x.open('POST',g.url,true);x.setRequestHeader('Content-Type','text/plain;charset=utf-8')}
    catch(e){fail('http',e&&e.message);return} // URLの形が不正
    x.onerror=()=>fail(gasNetKind(),'network-error');
    x.onabort=()=>fail('timeout','aborted');
    x.onload=()=>{
      if(fin)return;
      if(x.status<200||x.status>=300)return fail(x.status?'http':gasNetKind(),x.status?'HTTP '+x.status:'network-error');
      const ct=x.getResponseHeader('content-type')||'',txt=String(x.responseText||'');
      let j;
      try{j=JSON.parse(txt)}
      catch(e){return fail(/html/i.test(ct)||/^\s*</.test(txt)?'html':'gas',e&&e.message)}
      if(!j||!j.ok){const er=(j&&j.error)||'gas-error';return fail(er==='bad-token'?'token':'gas',er)}
      fin=true;clearTimeout(tCap);resolve(j);
    };
    tCap=setTimeout(()=>cut('timeout','timeout'),cap);
    try{x.send(body)}catch(e){fail(gasNetKind(),e&&e.message)}
  });
}
/* 失敗の種類→画面に出す理由（4言語）。技術情報は呼び出し側で括弧内に小さく添える */
function gasErrMsg(kind,detail){
  const k={timeout:'drvErrTimeout',offline:'drvErrOffline',reach:'drvErrReach',maybe:'drvErrMaybe',html:'drvErrHtml',token:'drvErrToken',http:'drvErrHttp',noaudio:'drvErrNoAudio'}[kind]||'drvErrGas';
  const m=t2(k);
  // 詳細が無い（保存しておいた失敗理由から出す時）は「（）」を残さず括弧ごと外す
  return detail?m.replace('{s}',detail):m.replace(/\s*[（(]\{s\}[)）]/,'').replace('{s}','');
}
async function gasTest(fromSave){
  const g=getGoogleCfg();
  if(!g.url){toast(t('gNeedCfg'),1);return}
  const btn=document.getElementById('gTestBtn');const old=btn.textContent;btn.disabled=true;
  try{
    await gasPost({token:g.token,ping:true});
    gConnected=true;gFailed=false;
    try{const g1=getGoogleCfg();if(g1.url){g1.okUrl=g1.url;localStorage.setItem(GKEY,JSON.stringify(g1))}}catch(e){}
    // 接続テストに成功し、自動保存を一度も選んでいない（未設定）なら既定ONにする
    let turnedOn=false;
    if(g.auto===undefined&&!g.autoSet){const g2=getGoogleCfg();g2.auto=true;localStorage.setItem(GKEY,JSON.stringify(g2));const cb=document.getElementById('gAuto');if(cb)cb.checked=true;turnedOn=true}
    updateGoogleStatus();toast(t('gTestOk')+(turnedOn?' · '+t2('gAutoOn'):''));
  }catch(e){
    gConnected=false;gFailed=true;
    try{const g1=getGoogleCfg();if(g1.okUrl){delete g1.okUrl;localStorage.setItem(GKEY,JSON.stringify(g1))}}catch(e){}
    updateGoogleStatus();
    // 自動保存の既定ONを待っている（未設定）：つながるまでONにしないことを添える
    const pend=getGoogleCfg().auto===undefined&&!getGoogleCfg().autoSet;
    // 理由を利用者の言葉で（公開範囲／合言葉／圏外／URL）。技術情報は末尾の括弧に短く残す
    const kind=e&&e.kind||'offline',code=String(e&&e.message||'').slice(0,60);
    toast(t('gTestFail')+pColon()+gasErrMsg(kind,code)+(kind!=='http'&&code?' ('+code+')':'')+(pend?' · '+t2('gAutoPend'):''),1);
  }
  finally{btn.disabled=false;btn.textContent=old}
}
/* ドライブのファイル名（拡張子なし）：飼-1_合格_質問名 */
function driveBaseName(session,itemId){
  const it=getItems().find(x=>x.id===itemId);
  const sec=getSections().find(s=>s.id===(it&&it.secId));
  const ii=sec?getItems().filter(x=>x.secId===sec.id).findIndex(x=>x.id===itemId):0;
  const tag=sec?sec.name.charAt(0)+'-'+(ii+1):itemId;
  const rec=session.items[itemId]||{};
  // 同じ日の追試（2回目以降として別に保存した試問）は末尾に「_2回目」。1回目と旧データは今までと同じ名前
  const nth=+session.attempt>1?'_'+(+session.attempt)+'回目':'';
  // その場で出題の空欄の問は「質問n」で固定（画面の言語に依らない。言語を変えるたびに名前が変わって送り直すのを防ぐ・M-15）
  const qn=it&&it.free?(String(rec.qText||'').trim()||'質問'+(ii+1)):null;
  return safeName(tag+'_'+verdictTag(rec.score)+'_'+(it?(it.free?qn:it.name):itemId)+nth);
}
/* 送った時の合否ラベルが今の合否と違うか（driveName が無い旧データは判定しない） */
function driveNameStale(session,itemId){
  const r=session.items[itemId];if(!r||!r.driveName)return false;
  return String(r.driveName).replace(/\.[^.]+$/,'')!==driveBaseName(session,itemId);
}
/* 送った受験者名・日付（＝ドライブのフォルダ）が今の試問と違うか（記録の無い旧データは判定しない・L-3） */
function driveFolderStale(session,itemId){
  const r=session.items[itemId];if(!r||!r.driveFileId)return false;
  const ee=String(session.examinee||'').trim()||'受験者';
  return (r.driveEe!==undefined&&r.driveEe!==ee)||(r.driveDate!==undefined&&r.driveDate!==(session.date||''));
}
async function gasUpload(session,itemId,replaceId){
  const g=getGoogleCfg();
  let blob=null;try{blob=await getAudio(session.id+'_'+itemId)}catch(e){throw gasErr('noaudio',e&&e.message)} // 端末の保存領域が開けない
  if(!blob)return null;
  const b64=await blobToB64(blob);
  const ext=audioExt(blob.type);
  const name=driveBaseName(session,itemId)+'.'+ext;
  const ee=String(session.examinee||'').trim()||'受験者';
  const body={token:g.token,folder:g.folder||'口頭試問音声',examinee:ee,date:session.date||'',name,mime:blob.type||'audio/webm',dataB64:b64};
  if(replaceId)body.replaceId=replaceId; // 合否変更時：旧名のファイルをGAS側でゴミ箱へ（旧GASは無視＝新旧2本残るだけ）
  // まだ届いたことのない受験者フォルダへは1件ずつ送る（GASの「無ければ作る」が同時に走ると同じ名前のフォルダが2つできる・M-17）
  const fk=body.folder+'/'+ee+'_'+body.date;
  let j;
  if(gFolderOk[fk])j=await gasPost(body);
  else{
    const run=(gFolderQ[fk]||Promise.resolve()).then(()=>gasPost(body));
    gFolderQ[fk]=run.catch(()=>{});
    j=await run;
  }
  gFolderOk[fk]=true;
  return{id:j.id,link:j.url,name,ee,date:body.date};
}
const gFolderQ={},gFolderOk={};
/* ドライブのファイル名だけを付け直す（合否・問題文の変更。録音は送り直さない・M-16）。
   新しい GAS（gas/Code.gs の op:'rename'）は同じ受験者フォルダにあるファイルの名前を変えて renamed:true を返す。
   旧 GAS は op を知らず ping として ok を返すだけ（何も作らない）→ null を返し、呼び出し側が録音ごと置き換えて送る */
async function gasRename(session,itemId,prev){
  const g=getGoogleCfg();
  const ext=(String(prev.driveName||'').match(/\.([^.]+)$/)||[])[1]||audioExt(prev.mime||'');
  const name=driveBaseName(session,itemId)+'.'+ext;
  const ee=String(session.examinee||'').trim()||'受験者';
  const j=await gasPost({token:g.token,ping:true,op:'rename',fileId:prev.driveFileId,folder:g.folder||'口頭試問音声',examinee:ee,date:session.date||'',name});
  if(!j||j.renamed!==true)return null;
  return{id:j.id||prev.driveFileId,link:j.url||prev.driveLink,name,ee,date:session.date||''};
}

// 録音停止後に呼ばれる：自動アップロード
// ドライブにファイルがある録音は常に置き換え（replaceId）で送る＝録り直し・続き・元に戻す・合否の付け直しで同じ名前の別ファイルを増やさない（M-7）
// opt.nameOnly＝名前（合否・問題文・追試の番号）だけが変わった：フォルダが同じなら名前だけの送信（gasRename）、変わっていなければ送らない
const upBusy={},upPend={};
// 「前回の続きにまとめる」で試問が移った先（元のid→まとめ先のid）。送信中に移っても、届いた結果をまとめ先へ写す（M-8）
const driveMoved={};
function mergeDriveOpt(a,b){
  if(!a)return Object.assign({},b||{});if(!b)return Object.assign({},a);
  return{replace:!!(a.replace||b.replace),nameOnly:!!(a.nameOnly&&b.nameOnly),manual:!!(a.manual||b.manual),quiet:!!(a.quiet&&b.quiet)};
}
function liveSess(sess){
  let s=sess;
  for(let i=0;i<5&&s&&driveMoved[s.id];i++){const x=sessById(driveMoved[s.id]);if(!x)break;s=x}
  return s;
}
function noteDriveMoved(src,tgt,keys){
  if(!src||!tgt||src.id===tgt.id)return;
  driveMoved[src.id]=tgt.id;
  // まとめ先へ写した後に届いていた送信結果を写す（写した時点では「送信中」のまま）
  (keys||[]).forEach(k=>{const a=src.items[k],b=tgt.items[k];if(a&&b&&a.driveFileId&&!a.driveSt&&(b.driveFileId!==a.driveFileId||b.driveSt)){copyDriveFields(a,b);persistDriveInfo(tgt,k)}});
}
/* まとめ元で送信中か（まとめ先の「送信中」を未送信と数えて二重に送らないため） */
function movedBusy(sess,itemId){return Object.keys(driveMoved).some(s=>driveMoved[s]===sess.id&&upBusy[s+'_'+itemId])}
// sessArg: 採点画面(curScore)から合否を変えた時など、試問中(cur)以外のセッションを指定する
async function maybeAutoUpload(itemId,opt,sessArg){
  const g=getGoogleCfg();
  if(!g.url||(!g.auto&&!(opt&&opt.manual)))return; // 手動の再送は自動保存OFFでも送る
  let sess=sessArg||cur; // 対象セッションを固定（アップロード中にcurが切り替わっても取り違えない）
  if(!sess)return;
  sess=liveSess(sess); // まとめ先へ移った試問はまとめ先で送る（元のキーの録音は片付け済み）
  // 試問中で受験者名が空のまま送ると、ドライブの「受験者」フォルダに誰のものか分からない録音が並ぶ→送らない
  //（名前を入れて「試問を保存」したときに syncExamineeOnSave が送る）
  if(sess===cur&&!String(cur.examinee||'').trim()){if(opt&&opt.manual&&!opt.quiet)needExamineeUi();return}
  // 受験者名を入力している途中（欄を離れていない）：途中の名前のフォルダを作らないよう、確定してから送る
  if(sess===cur&&!(opt&&opt.manual)&&typeof eeEditing==='function'&&eeEditing()){eeWaitSend(itemId,opt);return}
  const key=sess.id+'_'+itemId;
  // 送信中に合否が変わった等：終わってから最新の状態でもう一度送る（多重送信・順序逆転を防ぐ）
  if(upBusy[key]||movedBusy(sess,itemId)){upPend[key]=mergeDriveOpt(upPend[key],opt||{});return}
  sess.items[itemId]=sess.items[itemId]||{};
  const prev=sess.items[itemId];
  const isRep=!!prev.driveFileId;
  // 名前だけの付け直しで、名前もフォルダも送った時のまま（未送信でもない）：送らない
  if(opt&&opt.nameOnly&&isRep&&!prev.driveSt&&!driveNameStale(sess,itemId)&&!driveFolderStale(sess,itemId))return;
  upBusy[key]=true;
  const wasSt=prev.driveSt; // 前の送信が届いていない（録音ごとの送信が残っている）なら名前だけでは済ませない
  // 送信状態を記録（'up'=送信中/中断、'upR'=付け直し中、'fail'/'failR'=失敗。成功で消す）＝未送信の録音を後から特定・再送できる
  prev.driveSt=isRep?'upR':'up';
  persistDriveState(sess,itemId);
  showCloud(sess,itemId,'up');
  let okDone=false;
  try{
    const oldEe=prev.driveEe,oldDate=prev.driveDate,oldName=prev.driveName; // 送り直す前の受験者名・日付・ファイル名（フォルダが変わると旧ファイルは消えない）
    let res=null;
    if(opt&&opt.nameOnly&&isRep&&!wasSt&&!driveFolderStale(sess,itemId)){
      // 名前だけの送信が圏外・応答なし以外で失敗した（GASの版や設定の違い）：録音ごとの置き換えで送る
      try{res=await gasRename(sess,itemId,prev)}catch(e){if(e&&(e.kind==='offline'||e.kind==='timeout'))throw e;res=null}
    }
    if(!res)res=await gasUpload(sess,itemId,isRep?prev.driveFileId:null);
    if(!res)throw gasErr('noaudio','no-audio'); // 端末に録音の実体が無い（再送しても直らない→案内を分ける）
    // GAS は replaceId の旧ファイルを「新しいフォルダの中にある時だけ」ゴミ箱へ入れる（gas/Code.gs）。
    // 受験者名・日付が変わった＝別フォルダ（受験者名_日付）なので旧ファイルが残る→案内用に記録（項目を足すだけ）
    if(isRep&&((oldEe!==undefined&&oldEe!==res.ee)||(oldDate!==undefined&&oldDate!==res.date))){
      const o=Array.isArray(sess.items[itemId].driveOrphan)?sess.items[itemId].driveOrphan:[];
      const folder=(oldEe!==undefined?oldEe:res.ee)+'_'+(oldDate!==undefined?oldDate:(sess.date||''));
      if(!o.some(x=>x.folder===folder&&x.name===(oldName||'')))o.push({folder,name:oldName||''});
      sess.items[itemId].driveOrphan=o;
    }
    const it=sess.items[itemId];
    it.driveFileId=res.id;it.driveLink=res.link;it.driveName=res.name;it.driveEe=res.ee;it.driveDate=res.date; // 送った受験者名・日付（保存時に変わっていたら付け直す）
    delete it.driveSt;delete it.driveErr;
    persistDriveState(sess,itemId);
    showCloud(sess,itemId,'done');
    markGasOk();
    okDone=true;
  }catch(e){
    sess.items[itemId].driveSt=isRep?'failR':'fail';
    sess.items[itemId].driveErr=(e&&e.kind)||'gas'; // 失敗の理由（未送信表示に出す。成功で消す）
    persistDriveState(sess,itemId);
    showCloud(sess,itemId,'fail');
    // 試問カード以外（採点画面・保存後）での失敗はカードが見えないのでトーストでも知らせる
    if(cur!==sess&&!(opt&&opt.quiet))toast(e&&e.kind==='noaudio'?t2('drvErrNoAudio'):t2('drvFailToast')+' — '+gasErrMsg(e&&e.kind),1);
  }
  finally{
    upBusy[key]=false;
    // 送信中に試問を保存した・まとめた・合否を変えた：cur が切り替わっていても、いまの実体で最新の名前へ送り直す（M-6）
    const s2=liveSess(sess)||sess,k2=s2.id+'_'+itemId;
    const p=upPend[key];delete upPend[key];
    const p2=k2!==key?upPend[k2]:null;if(p2)delete upPend[k2];
    const arg=s2===cur?undefined:s2;
    if(p||p2)maybeAutoUpload(itemId,mergeDriveOpt(p,p2),arg);
    else if(okDone&&s2.items[itemId]&&s2.items[itemId].driveFileId&&!drivePending(s2,itemId)&&
      (driveNameStale(s2,itemId)||(s2!==cur&&driveFolderStale(s2,itemId))))maybeAutoUpload(itemId,{nameOnly:true},arg);
  }
}
function copyDriveFields(src,dst){
  ['driveFileId','driveLink','driveName','driveEe','driveDate','driveOrphan'].forEach(f=>{if(src[f]!==undefined||(f!=='driveEe'&&f!=='driveDate'&&f!=='driveOrphan'))dst[f]=src[f]});
  if(src.driveSt)dst.driveSt=src.driveSt;else delete dst.driveSt;
  if(src.driveSt&&src.driveErr)dst.driveErr=src.driveErr;else delete dst.driveErr;
}

// 保存済みセッション（採点画面から付け直した時）のドライブ情報を保存（採点中の他の入力は触らない）
function persistDriveInfo(sess,itemId){
  const all=getAll();const x=all.find(s=>s.id===sess.id);if(!x)return;
  const src=sess.items[itemId]||{};
  const dst=x.items[itemId]=Object.assign(x.items[itemId]||{},{driveFileId:src.driveFileId,driveLink:src.driveLink,driveName:src.driveName});
  if(src.driveEe!==undefined)dst.driveEe=src.driveEe;
  if(src.driveDate!==undefined)dst.driveDate=src.driveDate;
  if(src.driveOrphan!==undefined)dst.driveOrphan=src.driveOrphan;
  if(src.driveSt)dst.driveSt=src.driveSt;else delete dst.driveSt;
  if(src.driveSt&&src.driveErr)dst.driveErr=src.driveErr;else delete dst.driveErr;
  saveAll(all);
}
// 送信状態の保存先：試問中(cur)は下書き、それ以外は保存済みセッション
function persistDriveState(sess,itemId){
  // 同じセッションを別の実体（試問中cur／採点中curScore）が持っていれば送信結果を写す
  //（古い「未送信」を後から保存し直して、届いた録音を二重送信しないため）
  [typeof cur!=='undefined'?cur:null,typeof curScore!=='undefined'?curScore:null].forEach(o=>{
    if(!o||o===sess||o.id!==sess.id)return;
    copyDriveFields(sess.items[itemId]||{},o.items[itemId]=o.items[itemId]||{});
  });
  if(cur===sess)saveDraft();else persistDriveInfo(sess,itemId);
  // まとめ先へ移った試問：送信結果をまとめ先にも書く（元の試問はもう保存されていない・M-8）
  const mv=driveMoved[sess.id];
  if(mv&&mv!==sess.id){
    const t0=sessById(mv);
    if(t0&&t0!==sess&&t0.items&&t0.items[itemId]){copyDriveFields(sess.items[itemId]||{},t0.items[itemId]);if(t0===cur)saveDraft();else persistDriveInfo(t0,itemId)}
  }
}
/* 未送信（送信失敗・送信中に終了）か。送信中のものは除く */
function isUnsent(sess,itemId){
  const r=sess&&sess.items&&sess.items[itemId];
  return !!(r&&r.hasAudio&&r.driveSt&&!upBusy[sess.id+'_'+itemId]&&!movedBusy(sess,itemId)&&!drivePending(sess,itemId));
}
/* 送り直せば届く見込みのある未送信か（録音の実体が無い noaudio は何度送っても失敗するので除く） */
function isResendable(sess,itemId){return isUnsent(sess,itemId)&&!driveNoAudio(sess.items[itemId])}
/* 未送信バッジの件数＝送り直しの対象（録音の実体が無いものは各問の案内だけ出し、件数に入れない） */
function unsentCount(sess){return Object.keys((sess&&sess.items)||{}).filter(k=>isResendable(sess,k)).length}
/* 表示中の画面（試問カード・採点カード・履歴詳細）の送信状態を更新 */
function showCloud(sess,itemId,state){
  if(cur===sess)setCloud(itemId,state);
  if(typeof curScore!=='undefined'&&curScore&&curScore.id===sess.id)setScoreCloud(sess,itemId,state);
  const dor=document.getElementById('dor-'+sanitizeId(itemId));
  if(dor&&dor.dataset.sid===sess.id&&state==='done'&&typeof orphanHtml==='function')dor.innerHTML=orphanHtml(sess.items[itemId]); // 旧名ファイルの案内
  if(state==='done'&&typeof renderDrvOrphans==='function')renderDrvOrphans();
  const d=document.getElementById('dcl-'+sanitizeId(itemId));
  if(d&&d.dataset.sid===sess.id){
    const na=state==='fail'&&driveNoAudio(sess.items[itemId]);
    d.innerHTML=state==='up'?esc(t('clUp')):state==='done'?esc(t('clDone')):unsentHtml(sess.items[itemId],t2('drvUnsent'));
    d.style.color=state==='fail'&&!na?'var(--s1)':state==='done'?'var(--pri)':'var(--sub)';d.disabled=state!=='fail'||na;d.style.cursor=state==='fail'&&!na?'pointer':'default'}
}
/* 採点画面の各問の送信表示（未送信なら「タップで再送」） */
function setScoreCloud(sess,itemId,state){
  const el=document.getElementById('scl-'+sanitizeId(itemId));if(!el)return;
  if(state==='up'){el.textContent=t('clUp');el.style.color='var(--sub)';el.onclick=null;el.style.cursor='default'}
  else if(state==='done'){el.textContent=t('clDone');el.style.color='var(--pri)';el.onclick=null;el.style.cursor='default'}
  else if(state==='fail'){
    const na=driveNoAudio(sess.items[itemId]);
    el.innerHTML=unsentHtml(sess.items[itemId],t2('drvUnsent'));el.title=driveErrText(sess.items[itemId]);
    el.style.color=na?'var(--sub)':'var(--s1)';el.style.cursor=na?'default':'pointer';el.onclick=na?null:()=>resendDrive(sess.id,itemId)}
  else{el.textContent='';el.onclick=null}
  el.style.display=state?'block':'none';
}
/* 未送信の理由表示（試問カード・採点・履歴で共通）。録音の実体が無いものは再送ボタンにせず案内だけ出す */
function driveNoAudio(r){return !!(r&&r.driveErr==='noaudio')}
function driveErrText(r){return r&&r.driveErr?gasErrMsg(r.driveErr):''}
function unsentHtml(r,label){
  if(driveNoAudio(r))return esc('⚠ '+t2('drvErrNoAudio'));
  const why=driveErrText(r);
  return esc(label)+(why?`<span class="drverr" style="display:block;font-weight:500;font-size:.74rem;color:var(--sub);margin-top:2px">${esc(why)}</span>`:'');
}
/* セッションidから「いま画面が持っている実体」を引く（採点中の curScore と保存値を二重に持って上書きし合わないため） */
function sessById(sid){
  if(cur&&cur.id===sid)return cur;
  if(typeof curScore!=='undefined'&&curScore&&curScore.id===sid)return curScore;
  return getAll().find(s=>s.id===sid)||null;
}
/* 未送信の録音を1件再送。失敗したのが付け直し（合否変更）なら replaceId 付きで送る＝旧名ファイルを二重に残さない */
function resendDrive(sid,itemId,quiet){
  const sess=sessById(sid);if(!sess||!sess.items[itemId])return;
  const g=getGoogleCfg();if(!g.url){if(!quiet)toast(t('gNeedCfg'),1);return}
  const r=sess.items[itemId];
  const rep=/R$/.test(r.driveSt||'')&&r.driveFileId;
  const opt=Object.assign({manual:true},rep?{replace:true}:{},quiet?{quiet:true}:{});
  return maybeAutoUpload(itemId,opt,sess===cur?undefined:sess);
}
/* 未送信の録音をまとめて再送（電波復帰・起動時）。試問中・保存済みの全セッションが対象 */
function resendAllUnsent(){
  const g=getGoogleCfg();if(!g.url||!g.auto)return 0;
  const seen=new Set();let n=0;
  const list=[];if(cur)list.push(cur);getAll().forEach(s=>list.push(s));
  list.forEach(s0=>{
    if(seen.has(s0.id))return;seen.add(s0.id);
    const s=sessById(s0.id)||s0;
    // 録音の実体が無いもの（noaudio）と、届いた可能性があるもの（maybe＝自動で送ると同名の二重保存になりうる）は自動では送らない
    Object.keys(s.items||{}).forEach(k=>{if(safeKey(k)&&isResendable(s,k)&&s.items[k].driveErr!=='maybe'){n++;resendDrive(s.id,k,true)}});
  });
  return n;
}

// ドライブへの送信をまとめる（1.5秒待ってから1回だけ）。録音の停止直後に○×を押す・連打する・録り直してすぐ元に戻す、
// を1回の送信にする（M-16）。録音そのものが変わった（audio）なら録音ごと、名前だけなら名前だけ送る
const vdTimers={},vdOpt={},VD_WAIT=1500;
function scheduleDrive(sess,itemId,flags){
  const k=sess.id+'_'+itemId;
  clearTimeout(vdTimers[k]);
  const f=vdOpt[k]=vdOpt[k]||{sess,itemId,audio:false};
  f.sess=sess;if(flags&&flags.audio)f.audio=true;
  vdTimers[k]=setTimeout(()=>fireDrive(k),VD_WAIT);
}
// まとめ元（driveMoved）で待っている送信もまとめ先の送信待ちに数える＝停止直後にまとめても、待ち終えた時の1回だけにする（M-8×M-16）
function drivePending(sess,itemId){
  if(!sess)return false;
  const seen={},q=[sess.id];seen[sess.id]=1;
  while(q.length){
    const id=q.shift();if(vdTimers[id+'_'+itemId])return true;
    Object.keys(driveMoved).forEach(s=>{if(driveMoved[s]===id&&!seen[s]){seen[s]=1;q.push(s)}});
  }
  return false;
}
function fireDrive(k){
  clearTimeout(vdTimers[k]);delete vdTimers[k];
  const f=vdOpt[k];delete vdOpt[k];if(!f)return;
  const sess=liveSess(f.sess)||f.sess,itemId=f.itemId;
  const r=sess.items[itemId];if(!r||!r.hasAudio)return;
  const arg=(sess===cur)?undefined:sess;
  if(f.audio){maybeAutoUpload(itemId,undefined,arg);return} // 録音が変わった：録音ごと（ドライブにあれば置き換え）
  if(r.driveFileId||upBusy[sess.id+'_'+itemId])maybeAutoUpload(itemId,{nameOnly:true},arg);
  else if(r.driveSt)maybeAutoUpload(itemId,undefined,arg); // 最初の送信が届いていない録音：合否を変えた機会に新しい名前で送り直す
}
/* 待たせている送信をすぐ送る（画面を離れる・閉じる時。待っている間に閉じても送り損ねない） */
function flushDrive(){Object.keys(vdTimers).forEach(fireDrive)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushDrive()});
addEventListener('pagehide',flushDrive);
/* 録音を端末へ書けた（停止・録り直し・続き・元に戻す）：少し待ってから送る（自動保存ONのときだけ） */
function queueDriveTake(sess,itemId){
  const g=getGoogleCfg();if(!g.url||!g.auto||!sess)return;
  scheduleDrive(sess,itemId,{audio:true});
}
// 合否・問題文が変わった録音のドライブ上の名前を付け直す（連打で何本も送らないよう少し待ってから1回だけ）
function resyncDriveName(sess,itemId){scheduleDrive(sess,itemId)}

/* 「試問を保存」の直後：確定した受験者名とドライブへ送った名前が違う録音を付け直す（replaceId で旧ファイルを置き換え）。
   名前が空で送れずに待っていた録音もここで送る。saved は保存したセッション（保存後は cur ではない） */
/* opt.onlySent＝送ったことのある録音だけ付け直す（履歴から名前を直した時。未送信の古い録音をまとめて送り出さない） */
function syncExamineeOnSave(saved,opt){
  const g=getGoogleCfg();if(!g.url||!saved||!saved.items)return 0;
  const ee=String(saved.examinee||'').trim();if(!ee)return 0;
  let n=0;
  Object.keys(saved.items).forEach(k=>{
    const r=saved.items[k];if(!r||!r.hasAudio||!safeKey(k))return;
    const key=saved.id+'_'+k;
    // 受験者名が違う・または合否などで今の名前がドライブのファイル名と違う
    //（名前が空の間に○×を変えると付け直し送信が見送られるため、ここで拾う）→ replaceId で付け直す
    if(drivePending(saved,k))return; // 停止直後の送信待ち：待ち終えた時に今の名前で送る
    if(r.driveFileId&&((r.driveEe!==undefined&&r.driveEe!==ee)||driveFolderStale(saved,k)||driveNameStale(saved,k))){n++;maybeAutoUpload(k,{nameOnly:true},saved);return}
    if(upBusy[key])return;
    if(opt&&opt.onlySent)return;
    if(!r.driveFileId&&g.auto&&!r.driveSt){n++;maybeAutoUpload(k,undefined,saved)} // 名前待ちで送っていなかった録音
  });
  return n;
}
// 既定の保存先（社長のドライブ）。端末ごとの設定をしなくても、開いた時点で録音がドライブへ自動保存されるようにする（09-29 社長指示）。
// 一度だけ入れる（GDEFKEY）＝後から自分で保存先を変えた・消した端末には入れ直さない。すでにURLがある端末は触らない
const GDEF={url:'https://script.google.com/macros/s/AKfycbxupXbLNCzUGtwr2D2sWQfozP0u4bFitbqyiIk_efuUdpPzE-EaVdCI4nJCOYIbUzBuLA/exec',token:'OOIRI',folder:'口頭試問音声'};
const GDEFKEY='oral_exam_gdefault_v1';
function applyDefaultDrive(){
  try{
    if(localStorage.getItem(GDEFKEY))return false;
    localStorage.setItem(GDEFKEY,'1');
    const g=getGoogleCfg();
    if(g.url)return false;
    localStorage.setItem(GKEY,JSON.stringify(Object.assign({},g,GDEF,{auto:true})));
    return true;
  }catch(e){return false}
}
// URLパラメータ（?gurl=&gtoken=&gfolder=&gauto=1）からGoogle設定を取り込む（他端末のワンタップ設定用）
// セキュリティ: 保存先はGASのhttpsのみ許可し、保存先変更時はユーザーの明示確認を必須化
//（悪意あるリンクで録音の送信先を攻撃者サーバに差し替える情報流出を防ぐ）
function isAllowedDriveUrl(u){
  try{const pu=new URL(u);return pu.protocol==='https:'&&(pu.hostname==='script.google.com'||pu.hostname==='script.googleusercontent.com')}catch(e){return false}
}
function applyUrlConfig(){
  let p;try{p=new URLSearchParams(location.search)}catch(e){return false}
  if(!p.has('gurl')&&!p.has('gtoken')&&!p.has('gfolder')&&!p.has('gauto'))return false;
  // 取り込んだ時も、拒否・キャンセルした時もアドレスからクエリを消す（合言葉を残さない・開くたびに確認やエラーを出さない・L-29）
  const clean=()=>{try{history.replaceState(null,'',location.pathname)}catch(e){}};
  try{
    const g=getGoogleCfg();
    let url=g.url;
    if(p.has('gurl')){
      const u=(p.get('gurl')||'').trim();
      if(!isAllowedDriveUrl(u)){clean();toast(t('gBadUrl'),1);return false} // Google以外/非httpsは拒否
      url=u;
    }
    const n=Object.assign({},g,{url});
    if(p.has('gtoken'))n.token=(p.get('gtoken')||'').trim();
    if(p.has('gfolder'))n.folder=(p.get('gfolder')||'').trim();
    if(p.has('gauto'))n.auto=(p.get('gauto')==='1'||p.get('gauto')==='true');
    // 変わる設定を並べて確かめる（保存フォルダ・合言葉・自動保存も黙って上書きしない・L-6）
    const chg=[];
    if(p.has('gfolder')&&n.folder!==(g.folder||''))chg.push('・'+t('gFolder')+': '+(n.folder||'—'));
    if(p.has('gtoken')&&n.token!==(g.token||''))chg.push('・'+t('gToken'));
    if(p.has('gauto')&&n.auto!==g.auto)chg.push('・'+t('gAuto')+': '+(n.auto?'ON':'OFF'));
    // 保存先（送信先）が変わる場合は必ずユーザー確認（リンクを開くだけのサイレント設定を防ぐ）
    if(url&&url!==g.url){
      if(!confirm(t('gConfirmCfg')+'\n\n'+url+(chg.length?'\n'+chg.join('\n'):''))){clean();return false}
    }else if(chg.length){
      if(!confirm(t('gConfirmChg')+'\n\n'+chg.join('\n'))){clean();return false}
    }
    localStorage.setItem(GKEY,JSON.stringify(n));
    clean();
    return true;
  }catch(e){clean();return false}
}
