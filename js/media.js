/* media.js — 録音（MediaRecorder/WebSpeech）・GASドライブ保存・AI文字起こし */
/* ==============================================================
   録音（MediaRecorder + Web Speech API）
   ============================================================== */
async function toggleRec(itemId){
  if(active&&active.itemId===itemId){await stopRec();return}
  if(active){toast(t('recOther'),1);return}
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}
  catch(e){toast(t('micErr'),1);return}
  let mime='';
  if(window.MediaRecorder){
    if(MediaRecorder.isTypeSupported('audio/webm'))mime='audio/webm';
    else if(MediaRecorder.isTypeSupported('audio/mp4'))mime='audio/mp4';
  }
  const mr=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
  const chunks=[];
  // active状態を先に作り、ハンドラからクロージャ経由で参照する（onstopは非同期で発火するため）
  const a={itemId,mr,stream,chunks,rec:null,draft:'',timer:null,t0:Date.now(),_resolve:null};
  mr.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data)};
  mr.onstop=async()=>{
    try{
      const blob=new Blob(chunks,{type:mr.mimeType||'audio/webm'});
      await putAudio(cur.id+'_'+itemId,blob);
      cur.items[itemId]=cur.items[itemId]||{};
      cur.items[itemId].hasAudio=true;
      cur.items[itemId].mime=blob.type;
      if(cur.items[itemId].draft==null)cur.items[itemId].draft='';
      saveDraft();
      const au=document.getElementById('au-'+itemId);
      if(au){const u=URL.createObjectURL(blob);examUrls.push(u);au.src=u;au.style.display='block'}
      const card=document.getElementById('q-'+itemId);if(card)card.classList.add('done');
      const rs=document.getElementById('rs-'+itemId);if(rs){rs.textContent='● '+t('recDone');rs.classList.add('ok')}
      updateExamProg();
      const lv=document.getElementById('lv-'+itemId);
      if(lv){lv.querySelector('.lvtxt').textContent=cur.items[itemId].draft;lv.style.display=cur.items[itemId].draft?'block':'none'}
      maybeAutoUpload(itemId); // Googleドライブ自動保存（設定時のみ）
    }finally{if(a._resolve)a._resolve()}
  };
  // 自動文字起こし（ベストエフォート。Web Speech API対応ブラウザのみ）
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(SR){
    try{
      const rec=new SR();rec.lang=speechLang();rec.continuous=true;rec.interimResults=true;
      rec.onresult=e=>{
        let fin='';
        for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)fin+=e.results[i][0].transcript}
        if(fin){a.draft+=fin;updateLive(itemId,a.draft)}
      };
      rec.onerror=()=>{};
      rec.start();a.rec=rec;
    }catch(e){a.rec=null}
  }
  active=a;
  mr.start();
  // UI
  const btn=document.getElementById('rb-'+itemId);
  btn.classList.add('recording');btn.querySelector('.rlab').textContent=t('recStop');
  const lv=document.getElementById('lv-'+itemId);if(lv){lv.style.display='block';lv.querySelector('.lvtxt').textContent=''}
  a.timer=setInterval(()=>{
    const s=Math.floor((Date.now()-a.t0)/1000);
    const rt=document.getElementById('rt-'+itemId);if(rt)rt.textContent=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
  },250);
}
function updateLive(itemId,txt){const lv=document.getElementById('lv-'+itemId);if(lv)lv.querySelector('.lvtxt').textContent=txt}
function stopRec(){
  if(!active)return Promise.resolve();
  const a=active;const itemId=a.itemId;
  clearInterval(a.timer);
  // 自動文字起こしの下書きを確定（onstopが発火する前にactiveがnullになるため、ここで保存）
  cur.items[itemId]=cur.items[itemId]||{};
  cur.items[itemId].draft=(a.draft||'').trim();
  const p=new Promise(res=>{a._resolve=res});
  try{a.mr.stop()}catch(e){if(a._resolve)a._resolve()}
  try{if(a.rec)a.rec.stop()}catch(e){}
  a.stream.getTracks().forEach(tr=>tr.stop());
  const btn=document.getElementById('rb-'+itemId);
  if(btn){btn.classList.remove('recording');btn.querySelector('.rlab').textContent=t('recRedo')}
  const rt=document.getElementById('rt-'+itemId);if(rt)rt.textContent='';
  active=null;
  return p;
}

/* ==============================================================
   Googleドライブ自動保存（GAS ウェブアプリ方式）
   秘密情報は持たない。GASのURLと合言葉(token)は端末内localStorageのみ。
   音声はbase64でGASにPOSTし、GAS側(ユーザー本人として実行)が
   ユーザーのドライブの「(保存先)/(受験者_日付)/」へ保存する。
   ============================================================== */
let gConnected=false;

function saveGoogleCfg(){
  const g={url:document.getElementById('gUrl').value.trim(),token:document.getElementById('gToken').value.trim(),folder:document.getElementById('gFolder').value.trim()||'口頭試問音声',auto:document.getElementById('gAuto').checked};
  localStorage.setItem(GKEY,JSON.stringify(g));
  toast(t('gCfgSaved'));
}
function toggleAuto(){
  const g=getGoogleCfg();
  if(document.getElementById('gAuto').checked&&!g.url){toast(t('gAutoNoCfg'),1);document.getElementById('gAuto').checked=false;return}
  g.auto=document.getElementById('gAuto').checked;localStorage.setItem(GKEY,JSON.stringify(g));
}
function updateGoogleStatus(){
  const el=document.getElementById('gStatus');if(!el)return;
  el.textContent=gConnected?t('gConnected'):t('gDisconnected');
  el.style.color=gConnected?'var(--pri)':'var(--sub)';
}

// GASにPOST（プリフライト回避のためtext/plainで送る。bodyはJSON文字列）
async function gasPost(payload){
  const g=getGoogleCfg();
  const res=await fetch(g.url,{method:'POST',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(payload)});
  if(!res.ok)throw new Error('HTTP '+res.status);
  const j=await res.json();
  if(!j.ok)throw new Error(j.error||'gas-error');
  return j;
}
async function gasTest(){
  const g=getGoogleCfg();
  if(!g.url){toast(t('gNeedCfg'),1);return}
  const btn=document.getElementById('gTestBtn');const old=btn.textContent;btn.disabled=true;
  try{
    await gasPost({token:g.token,ping:true});
    gConnected=true;updateGoogleStatus();toast(t('gTestOk'));
  }catch(e){gConnected=false;updateGoogleStatus();toast(t('gTestFail')+'（'+e.message+'）',1)}
  finally{btn.disabled=false;btn.textContent=old}
}
async function gasUpload(session,itemId){
  const g=getGoogleCfg();
  const blob=await getAudio(session.id+'_'+itemId);if(!blob)return null;
  const b64=await blobToB64(blob);
  const it=getItems().find(x=>x.id===itemId);
  const sec=getSections().find(s=>s.id===(it&&it.secId));
  const ii=sec?getItems().filter(x=>x.secId===sec.id).findIndex(x=>x.id===itemId):0;
  const tag=sec?sec.name.charAt(0)+'-'+(ii+1):itemId;
  const ext=(blob.type.indexOf('mp4')>=0)?'mp4':'webm';
  const name=safeName(tag+'_'+(it?it.name:itemId))+'.'+ext;
  const j=await gasPost({token:g.token,folder:g.folder||'口頭試問音声',examinee:session.examinee||'受験者',date:session.date||'',name,mime:blob.type||'audio/webm',dataB64:b64});
  return{id:j.id,link:j.url};
}

// 録音停止後に呼ばれる：自動アップロード
async function maybeAutoUpload(itemId){
  const g=getGoogleCfg();
  if(!g.auto||!g.url)return;
  const sess=cur; // 対象セッションを固定（アップロード中にcurが切り替わっても取り違えない）
  if(!sess)return;
  setCloud(itemId,'up');
  try{
    const res=await gasUpload(sess,itemId);
    sess.items[itemId]=sess.items[itemId]||{};
    sess.items[itemId].driveFileId=res&&res.id;sess.items[itemId].driveLink=res&&res.link;
    if(cur===sess){saveDraft();setCloud(itemId,'done')} // 表示更新は同じセッションを開いている時だけ
  }catch(e){if(cur===sess)setCloud(itemId,'fail')}
}
function setCloud(itemId,state){
  const el=document.getElementById('cl-'+itemId);if(!el)return;
  if(state==='up'){el.textContent=t('clUp');el.style.color='var(--sub)';el.onclick=null;el.style.cursor='default'}
  else if(state==='done'){el.textContent=t('clDone');el.style.color='var(--pri)';el.onclick=null;el.style.cursor='default'}
  else if(state==='fail'){el.textContent=t('clFail');el.style.color='var(--s1)';el.style.cursor='pointer';el.onclick=()=>maybeAutoUpload(itemId)}
  else{el.textContent='';el.onclick=null}
  el.style.display=state?'block':'none';
}

/* ==============================================================
   設定：AI文字起こしAPI
   ============================================================== */
function saveStt(){
  const s={endpoint:document.getElementById('sttEndpoint').value.trim()||'https://api.openai.com/v1/audio/transcriptions',
    model:document.getElementById('sttModel').value.trim()||'whisper-1',
    key:document.getElementById('sttKey').value.trim()};
  localStorage.setItem(STTKEY,JSON.stringify(s));
  toast(t('sttSaved'));
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

async function aiTranscribe(itemId){
  const s=getStt();
  if(!s.key||!s.endpoint){toast(t('aiNoCfg'),1);return}
  const blob=await getAudio(curScore.id+'_'+itemId);
  if(!blob){toast(t('aiNoAudio'),1);return}
  const btn=document.getElementById('ai-'+itemId);
  const old=btn.textContent;btn.disabled=true;btn.textContent=t('aiRun');
  try{
    const fd=new FormData();
    const ext=(blob.type.indexOf('mp4')>=0)?'mp4':'webm';
    fd.append('file',blob,'audio.'+ext);
    fd.append('model',s.model||'whisper-1');
    const langCode={ja:'ja',en:'en',vi:'vi',id:'id'}[lang];if(langCode)fd.append('language',langCode);
    const res=await fetch(s.endpoint,{method:'POST',headers:{'Authorization':'Bearer '+s.key},body:fd});
    if(!res.ok)throw new Error('HTTP '+res.status);
    const j=await res.json();
    const txt=j.text||j.transcript||'';
    document.getElementById('tr-'+itemId).value=txt;
    toast(t('aiDone'));
  }catch(e){toast(t('aiFail')+'（'+e.message+'）',1)}
  finally{btn.disabled=false;btn.textContent=old}
}
