/* media.js — 録音（MediaRecorder/WebSpeech）・GASドライブ保存・AI文字起こし */
/* ==============================================================
   録音（MediaRecorder + Web Speech API）
   ============================================================== */
async function toggleRec(itemId){
  if(active&&active.itemId===itemId){await stopRec();return}
  if(active){toast(t('recOther'),1);jumpToActiveRec(true);return} // 誤タップでも録音中カードへ自動で連れて行く
  // 録り直しは開始前に必ず確認（停止した瞬間に前のテイクが上書きされるため。誤タップの唯一の出口が破壊にならないように）
  if(cur&&cur.items[itemId]&&cur.items[itemId].hasAudio&&!confirm(t('reRecConfirm')))return;
  hideUndoBar(); // 新しい録音が始まったら旧テイクの「元に戻す」窓は閉じる（別項目の復元でカード再描画がUIを壊すのを防ぐ）
  let stream;
  try{
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){const x=new Error('insecure');x.name='NoMediaDevices';throw x}
    stream=await navigator.mediaDevices.getUserMedia({audio:true});
  }
  catch(e){
    const m=micErrMsg(e);
    toast(m.long,1);
    // トースト(5秒)が消えても手掛かりが残るよう、カードのステータスに永続表示（次回の録音開始で自然に上書き）
    const rs=document.getElementById('rs-'+itemId);
    if(rs&&!(cur&&cur.items[itemId]&&cur.items[itemId].hasAudio)){rs.textContent='⚠ '+m.short;rs.classList.remove('ok')}
    return;
  }
  let mime='';
  if(window.MediaRecorder){
    if(MediaRecorder.isTypeSupported('audio/webm'))mime='audio/webm';
    else if(MediaRecorder.isTypeSupported('audio/mp4'))mime='audio/mp4';
  }
  const mr=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
  const chunks=[];
  // active状態を先に作り、ハンドラからクロージャ経由で参照する（onstopは非同期で発火するため）
  const a={itemId,mr,stream,chunks,rec:null,draft:'',timer:null,t0:Date.now(),_resolve:null,_old:null};
  // 録り直しの場合は旧テイクをメモリ退避（上書き後10秒だけ「元に戻す」を出すため。保存形式は不変）
  if(cur&&cur.items[itemId]&&cur.items[itemId].hasAudio){
    try{const ob=await getAudio(cur.id+'_'+itemId);if(ob)a._old={blob:ob,draft:cur.items[itemId].draft||''}}catch(e){}
  }
  mr.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data)};
  // MediaRecorderがエラーで死んだらタイマーとピルを止めて失敗を明示（「録音できているつもり」で試問を続けさせない）
  mr.onerror=()=>{if(active&&active.mr===mr){toast(t('recFail'),1);stopRec()}};
  mr.onstop=async()=>{
    try{
      const blob=new Blob(chunks,{type:mr.mimeType||'audio/webm'});
      // 0バイト録音（マイク経路死亡等）は保存しない＝hasAudioを立てず失敗を明示（旧テイクは無傷のまま）
      if(!blob.size){
        toast(t('recFail'),1);
        if(cur&&cur.items[itemId]){
          if(a._old)cur.items[itemId].draft=a._old.draft; // 下書きも旧テイクのものへ戻す
          saveDraft();
        }
        const rs=document.getElementById('rs-'+itemId);
        if(rs&&!(cur&&cur.items[itemId]&&cur.items[itemId].hasAudio)){rs.textContent='⚠ '+t('recFailStat');rs.classList.remove('ok')}
        return;
      }
      const sess=cur,newDraft=(cur.items[itemId]&&cur.items[itemId].draft)||'';
      try{await putAudio(sess.id+'_'+itemId,blob)}
      catch(err){recStoreFailed(sess,itemId,blob,newDraft,a._old);return}
      commitTake(sess,itemId,blob,a._old);
    }catch(e){toast(t2('storeFail'),1)} // 想定外の失敗でも「未録音」に黙って戻さない
    finally{if(a._resolve)a._resolve()}
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
  // 簡易VUメーター（音を拾えているかの可視化。WebAudioが使えなくても録音は継続）
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC){
      const ac=new AC();const an=ac.createAnalyser();an.fftSize=512;
      ac.createMediaStreamSource(stream).connect(an);
      a.ac=ac;a.an=an;a.buf=new Uint8Array(an.fftSize);a.lastSound=Date.now();
    }
  }catch(e){a.ac=null;a.an=null}
  active=a;
  mr.start();
  // UI
  const btn=document.getElementById('rb-'+itemId);
  btn.classList.add('recording');btn.querySelector('.rlab').textContent=t('recStop');
  // VUバー（録音中だけ表示。ミュート/故障マイクと正常録音の画面が同一になるのを防ぐ）
  if(btn.parentElement&&!document.getElementById('vu-'+itemId)){
    const vu=document.createElement('i');vu.className='vu';vu.id='vu-'+itemId;
    btn.parentElement.insertBefore(vu,document.getElementById('rs-'+itemId)||null);
  }
  // ステータスも「録音中」に（タイマーの横に「未録音」が残る矛盾表示を防ぐ）
  const rs0=document.getElementById('rs-'+itemId);
  if(rs0){rs0.textContent='● '+t('recNow');rs0.classList.remove('ok')}
  const lv=document.getElementById('lv-'+itemId);if(lv){lv.style.display='block';lv.querySelector('.lvtxt').textContent=''}
  // 固定ピル：どこへスクロールしても録音中であることが見え、タップで録音中カードへ戻る／停止できる
  let pill=document.getElementById('recPill');
  if(!pill){pill=document.createElement('button');pill.type='button';pill.id='recPill';pill.onclick=()=>jumpToActiveRec();document.body.appendChild(pill)}
  pill.textContent='● 00:00 '+t('recStop');
  a.timer=setInterval(()=>{
    const s=Math.floor((Date.now()-a.t0)/1000);
    const mm=String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0');
    const rt=document.getElementById('rt-'+itemId);if(rt)rt.textContent=mm;
    // VU: 入力音量をバー幅に反映。無音が10秒続いたら警告表示（ミュート/BTヘッドセット横取り対策）
    let silent=false;
    if(a.an){
      try{
        a.an.getByteTimeDomainData(a.buf);
        let sum=0;for(let i=0;i<a.buf.length;i++){const d=(a.buf[i]-128)/128;sum+=d*d}
        const rms=Math.sqrt(sum/a.buf.length);
        const vu=document.getElementById('vu-'+itemId);if(vu)vu.style.width=Math.min(48,Math.round(rms*300))+'px';
        if(rms>=0.01)a.lastSound=Date.now();
        silent=(Date.now()-a.lastSound)>10000;
      }catch(e){}
    }
    const rs=document.getElementById('rs-'+itemId);
    if(rs){rs.textContent=silent?('⚠ '+t('noSignal')):('● '+t('recNow'));rs.classList.remove('ok')}
    // ピルのラベルは実際の動作に一致させる：停止ボタンが見えていれば「停止」、見えていなければ「録音中の項目へ▲」
    const p=document.getElementById('recPill');
    if(p){
      const rb=document.getElementById('rb-'+itemId),r=rb&&rb.getBoundingClientRect();
      const inV=r&&r.top>=0&&r.bottom<=(window.innerHeight||document.documentElement.clientHeight);
      p.textContent=(silent?'⚠ ':'● ')+mm+' '+(inV?t('recStop'):t('recJump'));
    }
  },250);
}

/* 録音を端末(IndexedDB)へ書けた後の確定処理（通常の停止・「保存し直す」の両方から呼ぶ） */
function commitTake(sess,itemId,blob,old){
  sess.items[itemId]=sess.items[itemId]||{};
  sess.items[itemId].hasAudio=true;
  sess.items[itemId].mime=blob.type;
  if(sess.items[itemId].draft==null)sess.items[itemId].draft='';
  if(cur!==sess)return; // 保存し直す前に試問が切り替わった（通常は起きない）
  saveDraft();
  clearRecFail(itemId);
  const au=document.getElementById('au-'+itemId);
  if(au){const u=URL.createObjectURL(blob);examUrls.push(u);au.src=u;au.style.display='block'}
  const card=document.getElementById('q-'+itemId);if(card)card.classList.add('done');
  const rs=document.getElementById('rs-'+itemId);if(rs){rs.textContent='● '+t('recDone');rs.classList.add('ok')}
  const rb=document.getElementById('rb-'+itemId);if(rb){const l=rb.querySelector('.rlab');if(l)l.textContent=t('recRedo')}
  updateExamProg();
  const lv=document.getElementById('lv-'+itemId);
  if(lv){lv.querySelector('.lvtxt').textContent=sess.items[itemId].draft;lv.style.display=sess.items[itemId].draft?'block':'none'}
  maybeAutoUpload(itemId); // Googleドライブ自動保存（設定時のみ）
  if(old)showUndoBar(sess.id,itemId,old); // 録り直しの上書き完了：10秒だけ「元に戻す」を提示
}
/* 録音を端末に書き込めなかった（容量不足等）：黙って「未録音」に戻さず、失敗を常設表示し、
   その録音を「保存し直す／ダウンロード」で取り戻せるようにする（録り直しなら前のテイクが残っていると明示） */
const failedTakes={};
function recStoreFailed(sess,itemId,blob,newDraft,old){
  toast(t2('storeFail'),1);
  const rec=sess.items[itemId];
  if(rec){rec.draft=old?old.draft:(rec.hasAudio?rec.draft:newDraft)} // 下書きは実際に残っている録音に合わせる
  if(cur===sess)saveDraft();
  failedTakes[sess.id+'_'+itemId]={sess,blob,draft:newDraft,old};
  renderRecFail(itemId);
}
/* 保存失敗の常設表示（カード再描画＝buildExamCardsの後にも呼ばれる） */
function renderRecFail(itemId){
  const f=cur&&failedTakes[cur.id+'_'+itemId];if(!f)return;
  const sess=f.sess,blob=f.blob,rec=sess.items[itemId];
  const rs=document.getElementById('rs-'+itemId);
  const has=!!(rec&&rec.hasAudio);
  if(rs){rs.textContent='⚠ '+t2('recSaveFail')+(has?' '+t2('recKeptOld'):'');rs.classList.remove('ok')}
  const rb=document.getElementById('rb-'+itemId);if(rb){const l=rb.querySelector('.rlab');if(l)l.textContent=has?t('recRedo'):t('recStart')}
  // 取り戻し用の操作（保存し直す／ダウンロード）をカードに出す
  const card=document.getElementById('q-'+itemId);if(!card)return;
  let box=document.getElementById('rf-'+itemId);
  if(!box){box=document.createElement('div');box.id='rf-'+itemId;box.className='recfail';box.setAttribute('role','alert');
    box.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:6px';
    const row=card.querySelector('.recrow');if(row&&row.nextSibling)card.insertBefore(box,row.nextSibling);else card.appendChild(box)}
  const u=URL.createObjectURL(blob);examUrls.push(u);
  const ext=(blob.type.indexOf('mp4')>=0)?'mp4':'webm';
  const fn=safeName((sess.examinee||'rec')+'_'+itemId+'_'+new Date().toISOString().slice(0,19).replace(/[-:T]/g,''))+'.'+ext;
  box.innerHTML=`<button type="button" class="b b1" id="rfr-${itemId}" style="flex:0 0 auto;padding:6px 10px;font-size:.78rem">${esc(t2('recRetryStore'))}</button><a class="b b3" id="rfd-${itemId}" style="flex:0 0 auto;padding:6px 10px;font-size:.78rem;text-decoration:none" download="${esc(fn)}" href="${u}">⬇ ${esc(t2('recDl'))}</a>`;
  document.getElementById('rfr-'+itemId).onclick=()=>retryStoreTake(sess.id,itemId);
}
async function retryStoreTake(sid,itemId){
  const f=failedTakes[sid+'_'+itemId];if(!f)return;
  if(active){toast(t2('recBusy'),1);return}
  try{await putAudio(sid+'_'+itemId,f.blob)}catch(e){toast(t2('storeFail'),1);return}
  delete failedTakes[sid+'_'+itemId];
  if(f.sess.items[itemId])f.sess.items[itemId].draft=f.draft;else f.sess.items[itemId]={draft:f.draft};
  commitTake(f.sess,itemId,f.blob,f.old);
}
function clearRecFail(itemId){
  const b=document.getElementById('rf-'+itemId);if(b)b.remove();
  if(cur)delete failedTakes[cur.id+'_'+itemId];
}
/* マイク取得失敗の理由別メッセージ（権限／マイク無し／他アプリ使用中／httpsでない） */
function micErrMsg(e){
  const n=e&&e.name||'';
  if(n==='NoMediaDevices')return{long:t2('micInsecure'),short:t2('micInsecureS')};
  if(n==='NotFoundError'||n==='DevicesNotFoundError'||n==='OverconstrainedError')return{long:t2('micNotFound'),short:t2('micNotFoundS')};
  if(n==='NotReadableError'||n==='TrackStartError'||n==='AbortError')return{long:t2('micBusy'),short:t2('micBusyS')};
  return{long:t('micErr'),short:t('micErrShort')}; // NotAllowedError / SecurityError / その他
}

/* 録り直しの「元に戻す」：上書き直後10秒だけ旧テイクをメモリから復元できる（IndexedDBスキーマ・保存形式は不変） */
let lastReplaced=null,undoTimer=null;
function showUndoBar(sessId,itemId,old){
  hideUndoBar();
  lastReplaced={key:sessId+'_'+itemId,sessId,itemId,blob:old.blob,draft:old.draft};
  const bar=document.createElement('div');bar.id='undoBar';
  const sp=document.createElement('span');sp.textContent=t('recReplaced');
  const b=document.createElement('button');b.type='button';b.textContent=t('undoBtn');
  b.onclick=async()=>{
    const lr=lastReplaced;hideUndoBar();
    if(!lr)return;
    if(active){toast(t2('recBusy'),1);return} // 録音中の再描画はUIを壊すため復元しない
    try{
      await putAudio(lr.key,lr.blob);
      if(cur&&cur.id===lr.sessId&&cur.items[lr.itemId]){
        cur.items[lr.itemId].mime=lr.blob.type||'audio/webm';
        cur.items[lr.itemId].draft=lr.draft;
        saveDraft();
        buildExamCards();
        maybeAutoUpload(lr.itemId); // 復元した旧テイクをドライブにも再送（ローカルとドライブの不一致を防ぐ）
      }
      toast(t('undoDone'));
    }catch(e){toast(t2('storeFail'),1)}
  };
  bar.appendChild(sp);bar.appendChild(b);
  document.body.appendChild(bar);
  undoTimer=setTimeout(hideUndoBar,10000);
}
function hideUndoBar(){
  lastReplaced=null;
  if(undoTimer){clearTimeout(undoTimer);undoTimer=null}
  const el=document.getElementById('undoBar');if(el)el.remove();
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
  try{if(a.ac)a.ac.close()}catch(e){}
  const vu=document.getElementById('vu-'+itemId);if(vu)vu.remove();
  a.stream.getTracks().forEach(tr=>tr.stop());
  const btn=document.getElementById('rb-'+itemId);
  if(btn){btn.classList.remove('recording');btn.querySelector('.rlab').textContent=t('recRedo')}
  const rt=document.getElementById('rt-'+itemId);if(rt)rt.textContent='';
  const pill=document.getElementById('recPill');if(pill)pill.remove();
  // ステータスを保存済み状態に合わせて戻す（onstop成功時は「録音済み」で上書きされる。失敗時のフォールバック）
  const rs=document.getElementById('rs-'+itemId);
  if(rs){const has=cur&&cur.items[itemId]&&cur.items[itemId].hasAudio;rs.textContent=has?('● '+t('recDone')):t('recReady');rs.classList.toggle('ok',!!has)}
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
// 合否ラベル（ドライブのファイル名用。受け取るのは社長側なので言語に関わらず日本語固定）
// 合否は採点と同じ score='pass'|'fail' を使う（旧5段階の数値や未採点は「未判定」）
function verdictTag(v){return v==='pass'?'合格':v==='fail'?'不合格':'未判定'}
async function gasUpload(session,itemId,replaceId){
  const g=getGoogleCfg();
  const blob=await getAudio(session.id+'_'+itemId);if(!blob)return null;
  const b64=await blobToB64(blob);
  const it=getItems().find(x=>x.id===itemId);
  const sec=getSections().find(s=>s.id===(it&&it.secId));
  const ii=sec?getItems().filter(x=>x.secId===sec.id).findIndex(x=>x.id===itemId):0;
  const tag=sec?sec.name.charAt(0)+'-'+(ii+1):itemId;
  const ext=(blob.type.indexOf('mp4')>=0)?'mp4':'webm';
  const rec=session.items[itemId]||{};
  const name=safeName(tag+'_'+verdictTag(rec.score)+'_'+(it?it.name:itemId))+'.'+ext;
  const body={token:g.token,folder:g.folder||'口頭試問音声',examinee:session.examinee||'受験者',date:session.date||'',name,mime:blob.type||'audio/webm',dataB64:b64};
  if(replaceId)body.replaceId=replaceId; // 合否変更時：旧名のファイルをGAS側でゴミ箱へ（旧GASは無視＝新旧2本残るだけ）
  const j=await gasPost(body);
  return{id:j.id,link:j.url,name};
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
    const res=await gasUpload(sess,itemId,isRep?prev.driveFileId:null);
    if(!res)throw new Error('no-audio');
    sess.items[itemId].driveFileId=res.id;sess.items[itemId].driveLink=res.link;sess.items[itemId].driveName=res.name;
    delete sess.items[itemId].driveSt;
    persistDriveState(sess,itemId);
    showCloud(sess,itemId,'done');
  }catch(e){
    sess.items[itemId].driveSt=isRep?'failR':'fail';
    persistDriveState(sess,itemId);
    showCloud(sess,itemId,'fail');
    // 試問カード以外（採点画面・保存後）での失敗はカードが見えないのでトーストでも知らせる
    if(cur!==sess&&!(opt&&opt.quiet))toast(t2('drvFailToast'),1);
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
  if(src.driveSt)dst.driveSt=src.driveSt;else delete dst.driveSt;
  saveAll(all);
}
// 送信状態の保存先：試問中(cur)は下書き、それ以外は保存済みセッション
function persistDriveState(sess,itemId){
  // 同じセッションを別の実体（試問中cur／採点中curScore）が持っていれば送信結果を写す
  //（古い「未送信」を後から保存し直して、届いた録音を二重送信しないため）
  [typeof cur!=='undefined'?cur:null,typeof curScore!=='undefined'?curScore:null].forEach(o=>{
    if(!o||o===sess||o.id!==sess.id)return;
    const src=sess.items[itemId]||{},dst=o.items[itemId]=o.items[itemId]||{};
    ['driveFileId','driveLink','driveName'].forEach(f=>{dst[f]=src[f]});
    if(src.driveSt)dst.driveSt=src.driveSt;else delete dst.driveSt;
  });
  if(cur===sess)saveDraft();else persistDriveInfo(sess,itemId);
}
/* 未送信（送信失敗・送信中に終了）か。送信中のものは除く */
function isUnsent(sess,itemId){
  const r=sess&&sess.items&&sess.items[itemId];
  return !!(r&&r.hasAudio&&r.driveSt&&!upBusy[sess.id+'_'+itemId]);
}
function unsentCount(sess){return Object.keys((sess&&sess.items)||{}).filter(k=>isUnsent(sess,k)).length}
/* 表示中の画面（試問カード・採点カード・履歴詳細）の送信状態を更新 */
function showCloud(sess,itemId,state){
  if(cur===sess)setCloud(itemId,state);
  if(typeof curScore!=='undefined'&&curScore&&curScore.id===sess.id)setScoreCloud(sess,itemId,state);
  const d=document.getElementById('dcl-'+sanitizeId(itemId));
  if(d&&d.dataset.sid===sess.id){d.textContent=state==='up'?t('clUp'):state==='done'?t('clDone'):t2('drvUnsent');d.style.color=state==='fail'?'var(--s1)':state==='done'?'var(--pri)':'var(--sub)';d.disabled=state!=='fail';d.style.cursor=state==='fail'?'pointer':'default'}
}
/* 採点画面の各問の送信表示（未送信なら「タップで再送」） */
function setScoreCloud(sess,itemId,state){
  const el=document.getElementById('scl-'+sanitizeId(itemId));if(!el)return;
  if(state==='up'){el.textContent=t('clUp');el.style.color='var(--sub)';el.onclick=null;el.style.cursor='default'}
  else if(state==='done'){el.textContent=t('clDone');el.style.color='var(--pri)';el.onclick=null;el.style.cursor='default'}
  else if(state==='fail'){el.textContent=t2('drvUnsent');el.style.color='var(--s1)';el.style.cursor='pointer';el.onclick=()=>resendDrive(sess.id,itemId)}
  else{el.textContent='';el.onclick=null}
  el.style.display=state?'block':'none';
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
    Object.keys(s.items||{}).forEach(k=>{if(safeKey(k)&&isUnsent(s,k)){n++;resendDrive(s.id,k,true)}});
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

// 合否ボタン（試問カード）：採点と同じ score に保存。同じボタンをもう一度押すと解除
function setVerdict(itemId,v){
  if(!cur)return;
  cur.items[itemId]=cur.items[itemId]||{};
  const rec=cur.items[itemId];
  rec.score=(rec.score===v)?null:v;
  saveDraft();
  const vp=document.getElementById('vp-'+itemId),vf=document.getElementById('vf-'+itemId);
  if(vp){vp.classList.toggle('on',rec.score==='pass');vp.setAttribute('aria-pressed',rec.score==='pass'?'true':'false')}
  if(vf){vf.classList.toggle('on',rec.score==='fail');vf.setAttribute('aria-pressed',rec.score==='fail'?'true':'false')}
  if(!rec.hasAudio)return; // 録音前に判定した場合は、録音停止時のアップロードで名前に入る
  resyncDriveName(cur,itemId);
}
function setCloud(itemId,state){
  const el=document.getElementById('cl-'+itemId);if(!el)return;
  if(state==='up'){el.textContent=t('clUp');el.style.color='var(--sub)';el.onclick=null;el.style.cursor='default'}
  else if(state==='done'){el.textContent=t('clDone');el.style.color='var(--pri)';el.onclick=null;el.style.cursor='default'}
  else if(state==='fail'){el.textContent=t('clFail');el.style.color='var(--s1)';el.style.cursor='pointer';el.onclick=()=>{if(cur)resendDrive(cur.id,itemId)}}
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
