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
function updateGoogleStatus(){
  const el=document.getElementById('gStatus');
  if(el){
    const auto=!!getGoogleCfg().auto;
    // 接続OKでも自動保存OFFなら「送られない」ことを中立色で明示（「自動保存できます」と言わない）
    el.textContent=gConnected?(auto?t('gConnected'):t2('drvConnNoAuto')):t('gDisconnected');
    el.style.color=gConnected&&auto?'var(--pri)':'var(--sub)';
  }
  if(typeof updateDriveUi==='function')updateDriveUi();
  if(typeof renderDrvOrphans==='function')renderDrvOrphans(); // ドライブに残った旧名のファイルの案内
}

// GASにPOST（プリフライト回避のためtext/plainで送る。bodyはJSON文字列）
// 送信は XMLHttpRequest（アップロードの進み具合が分かる）。応答が無いまま止まる（農場の弱い電波で途中で切れる）と
// upBusy が残って再送できなくなるので、次の3つで打ち切る:
//  ・進み具合が届かない環境の上限: 60秒＋1MBあたり10分（≒実効14kbps。遅いが進んでいる送信を切らない）
//  ・送信中に進み具合が届く環境: 上限の代わりに「90秒間まったく進まない」で打ち切り（遅くても進んでいれば待つ）
//  ・送り終えた後の応答待ち: GASの実行上限(6分)＋α。ここで切れた時は「届いた可能性あり」(maybe)＝
//    ドライブに保存済みかもしれないので自動再送はせず、確認してから手で再送してもらう（同名ファイルの二重保存を防ぐ）
// 失敗は種類(kind)を付けて投げる。通信自体が失敗した時は、端末が圏外(navigator.onLine=false)なら offline、
// 電波はある（onLine）のに届かない時は reach＝GASの公開範囲が「全員」でない（ログイン画面へ302・CORSなし）
// またはURL違い・削除済み。実際のブラウザではどちらも HTML ではなく通信失敗(TypeError)になるため区別する
var GAS_TO_BASE=60000,GAS_TO_PER_MB=600000,GAS_STALL=90000,GAS_RESP_MAX=390000;
function gasErr(kind,detail){const e=new Error(detail||kind);e.kind=kind;return e}
function gasNetKind(){return (typeof navigator!=='undefined'&&navigator.onLine===false)?'offline':'reach'}
function gasPost(payload){
  const g=getGoogleCfg();
  const body=JSON.stringify(payload);
  const cap=GAS_TO_BASE+Math.ceil(body.length/1048576*GAS_TO_PER_MB);
  return new Promise((resolve,reject)=>{
    const x=new XMLHttpRequest();
    let fin=false,sent=false,tCap=null,tStall=null,tResp=null;
    const clear=()=>{clearTimeout(tCap);clearTimeout(tStall);clearTimeout(tResp)};
    const fail=(kind,detail)=>{if(fin)return;fin=true;clear();reject(gasErr(kind,detail))};
    const cut=(kind,detail)=>{fail(kind,detail);try{x.abort()}catch(e){}};
    const arm=()=>{clearTimeout(tStall);tStall=setTimeout(()=>cut('timeout','stalled'),GAS_STALL)};
    try{x.open('POST',g.url,true);x.setRequestHeader('Content-Type','text/plain;charset=utf-8')}
    catch(e){fail('http',e&&e.message);return} // URLの形が不正
    if(x.upload){
      // 進み具合が届く＝遅くても進んでいる間は上限で切らない（止まったら打ち切り）
      x.upload.onprogress=()=>{if(fin||sent)return;clearTimeout(tCap);arm()};
      // 送り終えた→ここからはGASの処理と応答を待つ（GASは届いた時点で保存を始めている）
      x.upload.onload=()=>{if(fin)return;sent=true;clearTimeout(tCap);clearTimeout(tStall);tResp=setTimeout(()=>cut('maybe','no-response'),GAS_RESP_MAX)};
    }
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
      fin=true;clear();resolve(j);
    };
    tCap=setTimeout(()=>cut(sent?'maybe':'timeout',sent?'no-response':'timeout'),cap);
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
    gConnected=true;
    // 接続テストに成功し、自動保存を一度も選んでいない（未設定）なら既定ONにする
    let turnedOn=false;
    if(g.auto===undefined&&!g.autoSet){const g2=getGoogleCfg();g2.auto=true;localStorage.setItem(GKEY,JSON.stringify(g2));const cb=document.getElementById('gAuto');if(cb)cb.checked=true;turnedOn=true}
    updateGoogleStatus();toast(t('gTestOk')+(turnedOn?' · '+t2('gAutoOn'):''));
  }catch(e){
    gConnected=false;updateGoogleStatus();
    // 自動保存の既定ONを待っている（未設定）：つながるまでONにしないことを添える
    const pend=getGoogleCfg().auto===undefined&&!getGoogleCfg().autoSet;
    // 理由を利用者の言葉で（公開範囲／合言葉／圏外／URL）。技術情報は末尾の括弧に短く残す
    const kind=e&&e.kind||'offline',code=String(e&&e.message||'').slice(0,60);
    toast(t('gTestFail')+'：'+gasErrMsg(kind,code)+(kind!=='http'&&code?' ('+code+')':'')+(pend?' · '+t2('gAutoPend'):''),1);
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
  return safeName(tag+'_'+verdictTag(rec.score)+'_'+(it?(it.free?qName(session,it,ii+1):it.name):itemId)+nth);
}
/* 送った時の合否ラベルが今の合否と違うか（driveName が無い旧データは判定しない） */
function driveNameStale(session,itemId){
  const r=session.items[itemId];if(!r||!r.driveName)return false;
  return String(r.driveName).replace(/\.[^.]+$/,'')!==driveBaseName(session,itemId);
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
  const j=await gasPost(body);
  return{id:j.id,link:j.url,name,ee};
}

// 録音停止後に呼ばれる：自動アップロード
// opt.replace=true は合否変更による「付け直し」（前回アップロード分を置き換える）
const upBusy={},upPend={};
// sessArg: 採点画面(curScore)から合否を変えた時など、試問中(cur)以外のセッションを指定する
async function maybeAutoUpload(itemId,opt,sessArg){
  const g=getGoogleCfg();
  if(!g.url||(!g.auto&&!(opt&&opt.manual)))return; // 手動の再送は自動保存OFFでも送る
  const sess=sessArg||cur; // 対象セッションを固定（アップロード中にcurが切り替わっても取り違えない）
  if(!sess)return;
  // 試問中で受験者名が空のまま送ると、ドライブの「受験者」フォルダに誰のものか分からない録音が並ぶ→送らない
  //（名前を入れて「試問を保存」したときに syncExamineeOnSave が送る）
  if(sess===cur&&!String(cur.examinee||'').trim()){if(opt&&opt.manual&&!opt.quiet)needExamineeUi();return}
  // 受験者名を入力している途中（欄を離れていない）：途中の名前のフォルダを作らないよう、確定してから送る
  if(sess===cur&&!(opt&&opt.manual)&&typeof eeEditing==='function'&&eeEditing()){eeWaitSend(itemId,opt);return}
  const key=sess.id+'_'+itemId;
  // 送信中に合否が変わった等：終わってから最新の状態でもう一度送る（多重送信・順序逆転を防ぐ）
  if(upBusy[key]){upPend[key]=upPend[key]||opt||{};return}
  upBusy[key]=true;
  sess.items[itemId]=sess.items[itemId]||{};
  const isRep=!!(opt&&opt.replace&&sess.items[itemId].driveFileId);
  // 送信状態を記録（'up'=送信中/中断、'upR'=付け直し中、'fail'/'failR'=失敗。成功で消す）＝未送信の録音を後から特定・再送できる
  sess.items[itemId].driveSt=isRep?'upR':'up';
  persistDriveState(sess,itemId);
  showCloud(sess,itemId,'up');
  try{
    const prev=sess.items[itemId];
    const oldEe=prev.driveEe,oldName=prev.driveName; // 送り直す前の受験者名・ファイル名（フォルダが変わると旧ファイルは消えない）
    const res=await gasUpload(sess,itemId,isRep?prev.driveFileId:null);
    if(!res)throw gasErr('noaudio','no-audio'); // 端末に録音の実体が無い（再送しても直らない→案内を分ける）
    // GAS は replaceId の旧ファイルを「新しいフォルダの中にある時だけ」ゴミ箱へ入れる（gas/Code.gs）。
    // 受験者名が変わった＝別フォルダ（受験者名_日付）なので旧ファイルが残る→案内用に記録（項目を足すだけ）
    if(isRep&&oldEe!==undefined&&oldEe!==res.ee){
      const o=Array.isArray(sess.items[itemId].driveOrphan)?sess.items[itemId].driveOrphan:[];
      const folder=oldEe+'_'+(sess.date||'');
      if(!o.some(x=>x.folder===folder&&x.name===(oldName||'')))o.push({folder,name:oldName||''});
      sess.items[itemId].driveOrphan=o;
    }
    sess.items[itemId].driveFileId=res.id;sess.items[itemId].driveLink=res.link;sess.items[itemId].driveName=res.name;sess.items[itemId].driveEe=res.ee; // 送った受験者名（保存時に名前が変わっていたら付け直す）
    delete sess.items[itemId].driveSt;delete sess.items[itemId].driveErr;
    persistDriveState(sess,itemId);
    showCloud(sess,itemId,'done');
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
    const p=upPend[key];delete upPend[key];
    if(p&&(cur===sess||sessArg))maybeAutoUpload(itemId,p,sessArg);
  }
}

// 保存済みセッション（採点画面から付け直した時）のドライブ情報を保存（採点中の他の入力は触らない）
function persistDriveInfo(sess,itemId){
  const all=getAll();const x=all.find(s=>s.id===sess.id);if(!x)return;
  const src=sess.items[itemId]||{};
  const dst=x.items[itemId]=Object.assign(x.items[itemId]||{},{driveFileId:src.driveFileId,driveLink:src.driveLink,driveName:src.driveName});
  if(src.driveEe!==undefined)dst.driveEe=src.driveEe;
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
    const src=sess.items[itemId]||{},dst=o.items[itemId]=o.items[itemId]||{};
    ['driveFileId','driveLink','driveName','driveEe','driveOrphan'].forEach(f=>{if(src[f]!==undefined||(f!=='driveEe'&&f!=='driveOrphan'))dst[f]=src[f]});
    if(src.driveSt)dst.driveSt=src.driveSt;else delete dst.driveSt;
    if(src.driveSt&&src.driveErr)dst.driveErr=src.driveErr;else delete dst.driveErr;
  });
  if(cur===sess)saveDraft();else persistDriveInfo(sess,itemId);
}
/* 未送信（送信失敗・送信中に終了）か。送信中のものは除く */
function isUnsent(sess,itemId){
  const r=sess&&sess.items&&sess.items[itemId];
  return !!(r&&r.hasAudio&&r.driveSt&&!upBusy[sess.id+'_'+itemId]);
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
  maybeAutoUpload(itemId,opt,sess===cur?undefined:sess);
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

// 合否が変わった録音のドライブ上の名前を付け直す（連打で何本も送らないよう少し待ってから1回だけ）
const vdTimers={};
function resyncDriveName(sess,itemId){
  const k=sess.id+'_'+itemId;
  clearTimeout(vdTimers[k]);
  vdTimers[k]=setTimeout(()=>{
    const r=sess.items[itemId];if(!r||!r.hasAudio)return;
    const arg=(sess===cur)?undefined:sess;
    if(upBusy[k]){maybeAutoUpload(itemId,{replace:true},arg);return} // 送信中→完了後に置き換え送信
    if(r.driveFileId)maybeAutoUpload(itemId,{replace:true},arg);
    else if(r.driveSt)maybeAutoUpload(itemId,undefined,arg); // 最初の送信が届いていない録音：合否を変えた機会に新しい名前で送り直す
  },1500);
}

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
    if(r.driveFileId&&((r.driveEe!==undefined&&r.driveEe!==ee)||driveNameStale(saved,k))){n++;maybeAutoUpload(k,{replace:true},saved);return}
    if(upBusy[key])return;
    if(opt&&opt.onlySent)return;
    if(!r.driveFileId&&g.auto&&!r.driveSt){n++;maybeAutoUpload(k,undefined,saved)} // 名前待ちで送っていなかった録音
  });
  return n;
}
// URLパラメータ（?gurl=&gtoken=&gfolder=&gauto=1）からGoogle設定を取り込む（他端末のワンタップ設定用）
// セキュリティ: 保存先はGASのhttpsのみ許可し、保存先変更時はユーザーの明示確認を必須化
//（悪意あるリンクで録音の送信先を攻撃者サーバに差し替える情報流出を防ぐ）
function isAllowedDriveUrl(u){
  try{const pu=new URL(u);return pu.protocol==='https:'&&(pu.hostname==='script.google.com'||pu.hostname==='script.googleusercontent.com')}catch(e){return false}
}
function applyUrlConfig(){
  try{
    const p=new URLSearchParams(location.search);
    if(!p.has('gurl')&&!p.has('gtoken')&&!p.has('gfolder')&&!p.has('gauto'))return false;
    const g=getGoogleCfg();
    let url=g.url;
    if(p.has('gurl')){
      const u=(p.get('gurl')||'').trim();
      if(!isAllowedDriveUrl(u)){toast(t('gBadUrl'),1);return false} // Google以外/非httpsは拒否
      url=u;
    }
    // 保存先（送信先）が変わる場合は必ずユーザー確認（リンクを開くだけのサイレント設定を防ぐ）
    if(url&&url!==g.url){
      if(!confirm(t('gConfirmCfg')+'\n\n'+url))return false;
    }
    g.url=url;
    if(p.has('gtoken'))g.token=(p.get('gtoken')||'').trim();
    if(p.has('gfolder'))g.folder=(p.get('gfolder')||'').trim();
    if(p.has('gauto'))g.auto=(p.get('gauto')==='1'||p.get('gauto')==='true');
    localStorage.setItem(GKEY,JSON.stringify(g));
    try{history.replaceState(null,'',location.pathname)}catch(e){} // 合言葉をアドレスバーから消す
    return true;
  }catch(e){return false}
}
