/* media.js — 録音（MediaRecorder/WebSpeech）・GASドライブ保存・AI文字起こし */
/* ==============================================================
   録音（MediaRecorder + Web Speech API）
   R8（スマホ現場）: 画面ロック・マイクの横取り・誤停止に備える
   ・録音は1秒ごとに IndexedDB の一時キー（LIVEPFX…）へ書き足す＝端末が落ちても「そこまで」は残る
   ・画面が消える／別アプリへ移る（visibilitychange=hidden・pagehide）とそこまでを確定保存して止める
   ・マイクが止められた（track ended/mute・onstop が停止操作なしで発火）ら録音中表示を解除して知らせる
   ・一時停止／再開、停止後の「続きを録音」（前の録音の後ろに足す）
   ============================================================== */
/* 拡張子（続きを録音でつないだ録音は WAV になる） */
function audioExt(type){type=String(type||'');return type.indexOf('mp4')>=0?'mp4':type.indexOf('wav')>=0?'wav':'webm'}
function recElapsed(a){const now=Date.now();return Math.max(0,now-a.t0-(a._pTot||0)-(a.paused&&a._pAt?now-a._pAt:0))}
function recMMSS(ms){const s=Math.floor(ms/1000);return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0')}

/* 開始・停止の手応え（手袋・騒音の現場向け）：振動（Android）＋任意の短い音（設定でON） */
const BEEPKEY='oral_exam_beep';
function beepOn(){try{return localStorage.getItem(BEEPKEY)==='1'}catch(e){return false}}
function setBeep(on){try{localStorage.setItem(BEEPKEY,on?'1':'0')}catch(e){}}
function recCue(kind){
  try{if(navigator.vibrate)navigator.vibrate(kind==='start'?60:[40,60,40])}catch(e){}
  if(!beepOn())return;
  try{
    const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return;
    const ac=new AC(),t0=ac.currentTime;
    const one=(at,f)=>{const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=f;g.gain.value=.15;o.connect(g);g.connect(ac.destination);o.start(at);o.stop(at+.1)};
    if(kind==='start')one(t0,880);else{one(t0,660);one(t0+.18,660)}
    setTimeout(()=>{try{ac.close()}catch(e){}},700);
  }catch(e){}
}

/* 画面の自動ロック対策（Wake Lock）。使えない端末では「画面を消さないで」を録音中ずっと出す */
let wakeLock=null;
async function acquireWake(){
  try{
    if(navigator.wakeLock&&navigator.wakeLock.request){
      const l=await navigator.wakeLock.request('screen');
      if(!active){try{l.release()}catch(e){}return false} // 取得待ちの間に録音が終わった
      wakeLock=l;
      try{l.addEventListener('release',()=>{if(wakeLock===l)wakeLock=null;if(active)showWakeNote(true)})}catch(e){}
      showWakeNote(false);return true;
    }
  }catch(e){}
  wakeLock=null;if(active)showWakeNote(true);return false;
}
function releaseWake(){const l=wakeLock;wakeLock=null;if(l){try{l.release()}catch(e){}}showWakeNote(false)}
function showWakeNote(on){
  let n=document.getElementById('wakeNote');
  if(!on){if(n)n.remove();return}
  if(!n){n=document.createElement('div');n.id='wakeNote';n.setAttribute('role','note');document.body.appendChild(n)}
  n.textContent='☀ '+t2('wakeNote');
}

/* 録音中の一時保存（1秒ごと）。書き込みは直列化し、停止処理（_liveDone）の後には書かない */
function liveSave(a){
  if(a._liveQueued||a._liveDone)return;
  a._liveQueued=true;
  a._liveQ=a._liveQ.then(()=>{
    a._liveQueued=false;
    if(a._liveDone||!a.chunks.length)return;
    const type=a.mr.mimeType||'audio/webm';
    const rec={sid:a.sid,itemId:a.itemId,mime:type,t0:a.t0,ts:Date.now(),dur:recElapsed(a),draft:a.draft||'',append:!!a._append,
      examinee:cur?String(cur.examinee||''):'',examiner:cur?String(cur.examiner||''):'',date:cur?String(cur.date||''):'',
      blob:new Blob(a.chunks,{type})};
    return putAudio(a._liveKey,rec);
  }).catch(()=>{});
}

async function toggleRec(itemId,opt){
  if(active&&active.itemId===itemId){await stopRec();return}
  if(active){toast(t('recOther'),1);jumpToActiveRec(true);return} // 誤タップでも録音中カードへ自動で連れて行く
  // ドライブ自動保存がONなら、録音は停止直後に「受験者名」のフォルダへ送られる→名前が空のうちは録音を始めない
  {const g=getGoogleCfg();const fe=document.getElementById('fEe');
   if(g.url&&g.auto&&fe&&!fe.value.trim()){needExamineeUi();return}}
  const had=!!(cur&&cur.items[itemId]&&cur.items[itemId].hasAudio);
  const append=!!(opt&&opt.append&&had); // 続きを録音：前の録音の後ろに足す（上書きしない）
  // 録り直しは開始前に必ず確認（停止した瞬間に前のテイクが上書きされるため。誤タップの唯一の出口が破壊にならないように）
  if(had&&!append&&!confirm(t('reRecConfirm')))return;
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
  const t0=Date.now();
  const a={itemId,mr,stream,chunks,rec:null,draft:'',timer:null,t0,_resolve:null,_old:null,sid:cur.id,
    _liveKey:LIVEPFX+cur.id+'_'+itemId+'_'+t0,_liveQ:Promise.resolve(),_pTot:0,paused:false,_append:append,
    _baseDraft:append?String(cur.items[itemId].draft||''):''};
  // 録り直し・続きの場合は旧テイクをメモリ退避（上書き後に「元に戻す」を出すため／続きはこの後ろにつなぐ。保存形式は不変）
  if(had){
    try{const ob=await getAudio(cur.id+'_'+itemId);if(ob)a._old={blob:ob,draft:cur.items[itemId].draft||''}}catch(e){}
    if(append&&!a._old){a._append=false;a._baseDraft=''} // 前の録音を読めない：通常の録音として扱う
  }
  mr.ondataavailable=e=>{if(e.data&&e.data.size>0){chunks.push(e.data);liveSave(a)}};
  // MediaRecorderがエラーで死んだらタイマーとピルを止めて失敗を明示（「録音できているつもり」で試問を続けさせない）
  mr.onerror=()=>{if(active&&active.mr===mr){toast(t('recFail'),1);stopRec()}};
  mr.onstop=async()=>{
    // 停止操作なしで止まった（マイクを他アプリ・通話・OSに取られた）：録音中表示を解除して知らせる
    if(active===a)recInterrupted(a);
    a._liveDone=true;
    try{await a._liveQ}catch(e){}
    try{
      let blob=new Blob(chunks,{type:mr.mimeType||'audio/webm'});
      // 0バイト録音（マイク経路死亡等）は保存しない＝hasAudioを立てず失敗を明示（旧テイクは無傷のまま）
      if(!blob.size){
        toast(t('recFail'),1);
        if(cur&&cur.items[itemId]){
          if(a._old)cur.items[itemId].draft=a._old.draft; // 下書きも旧テイクのものへ戻す
          saveDraft();
        }
        const rs=document.getElementById('rs-'+itemId);
        if(rs&&!(cur&&cur.items[itemId]&&cur.items[itemId].hasAudio)){rs.textContent='⚠ '+t('recFailStat');rs.classList.remove('ok')}
        delAudio(a._liveKey);
        return;
      }
      const sess=cur,newDraft=(cur.items[itemId]&&cur.items[itemId].draft)||'';
      // 続きを録音：前の録音の後ろにつなぐ（つなげなければ前の録音は無傷のまま・続きの部分はダウンロードで取り出せる）
      if(a._append&&a._old){
        try{blob=await mergeAudio(a._old.blob,blob)}
        catch(err){
          toast(t2('mergeFail'),1);
          if(sess.items[itemId])sess.items[itemId].draft=a._old.draft;
          if(cur===sess)saveDraft();
          failedTakes[sess.id+'_'+itemId]={sess,blob,draft:newDraft,old:a._old,dlOnly:true};
          renderRecFail(itemId);
          return;
        }
      }
      try{await putAudio(sess.id+'_'+itemId,blob)}
      catch(err){recStoreFailed(sess,itemId,blob,newDraft,a._old);return}
      delAudio(a._liveKey); // 正式キーに書けた＝一時保存は不要
      commitTake(sess,itemId,blob,a._old,a._append?t2('recAppended'):null);
      if(a._cut!=null){const rs=document.getElementById('rs-'+itemId);if(rs){rs.textContent='⚠ '+t2('recCutStat').replace('{s}',a._cut);rs.classList.remove('ok')}}
    }catch(e){toast(t2('storeFail'),1)} // 想定外の失敗でも「未録音」に黙って戻さない
    finally{a._stopDone=true;if(a._resolve)a._resolve()}
  };
  startSR(a);
  // 簡易VUメーター（音を拾えているかの可視化。WebAudioが使えなくても録音は継続）
  try{
    const AC=window.AudioContext||window.webkitAudioContext;
    if(AC){
      const ac=new AC();const an=ac.createAnalyser();an.fftSize=512;
      ac.createMediaStreamSource(stream).connect(an);
      a.ac=ac;a.an=an;a.buf=new Uint8Array(an.fftSize);a.lastSound=Date.now();
    }
  }catch(e){a.ac=null;a.an=null}
  // マイクが外から止められた（通話・他アプリ・Bluetooth切替）：ended は即、mute は2秒続いたら止める
  stream.getAudioTracks().forEach(tr=>{
    tr.addEventListener('ended',()=>recInterrupted(a));
    tr.addEventListener('mute',()=>{clearTimeout(a._muteT);a._muteT=setTimeout(()=>{if(tr.muted)recInterrupted(a)},2000)});
    tr.addEventListener('unmute',()=>clearTimeout(a._muteT));
  });
  active=a;
  mr.start(1000); // 1秒ごとに取り出して一時保存（停止するまで1バイトも残らない状態をなくす）
  recCue('start');
  acquireWake();
  // UI
  const btn=document.getElementById('rb-'+itemId);
  btn.classList.add('recording');btn.querySelector('.rlab').textContent=t('recStop');
  // VUバー（録音中だけ表示。ミュート/故障マイクと正常録音の画面が同一になるのを防ぐ）
  if(btn.parentElement&&!document.getElementById('vu-'+itemId)){
    const vu=document.createElement('i');vu.className='vu';vu.id='vu-'+itemId;
    btn.parentElement.insertBefore(vu,document.getElementById('rs-'+itemId)||null);
  }
  // 一時停止／再開（止めずに間を空けられる。停止＝確定は隣の赤いボタン）
  if(btn.parentElement&&!document.getElementById('rp-'+itemId)){
    const pb=document.createElement('button');pb.type='button';pb.className='recbtn pausebtn';pb.id='rp-'+itemId;
    pb.onclick=()=>togglePause();
    btn.insertAdjacentElement('afterend',pb);
  }
  renderPauseBtn(a);
  const rc=document.getElementById('rc-'+itemId);if(rc)rc.style.display='none';
  // ステータスも「録音中」に（タイマーの横に「未録音」が残る矛盾表示を防ぐ）
  const rs0=document.getElementById('rs-'+itemId);
  if(rs0){rs0.textContent='● '+t('recNow');rs0.classList.remove('ok')}
  const lv=document.getElementById('lv-'+itemId);if(lv){lv.style.display='block';lv.querySelector('.lvtxt').textContent=a._baseDraft}
  // 固定ピル：どこへスクロールしても録音中であることが見え、タップで録音中カードへ戻る／停止できる
  let pill=document.getElementById('recPill');
  if(!pill){pill=document.createElement('button');pill.type='button';pill.id='recPill';pill.onclick=()=>jumpToActiveRec();document.body.appendChild(pill)}
  pill.textContent='● 00:00 '+t('recStop');
  // 録音行が固定表示（ヘッダー・ヒーロー・タブ）に隠れていれば見える範囲の中央へ（横向きのスマホ）
  revealRecRow();
  a.timer=setInterval(()=>recTick(a),250);
}
/* 録音中の表示更新（タイマー・VU・無音警告・ピルのラベル） */
function recTick(a){
  if(active!==a)return;
  const itemId=a.itemId;
  const mm=recMMSS(recElapsed(a));
  const rt=document.getElementById('rt-'+itemId);if(rt)rt.textContent=mm;
  // VU: 入力音量をバー幅に反映。無音が10秒続いたら警告表示（ミュート/BTヘッドセット横取り対策）
  let silent=false;
  if(a.an&&!a.paused){
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
  if(rs){rs.textContent=a.paused?('⏸ '+t2('recPaused')):silent?('⚠ '+t('noSignal')):('● '+t('recNow'));rs.classList.remove('ok')}
  // ピルのラベルは実際の動作に一致させる：停止ボタンが見えていれば「停止」、見えていなければ「録音中の項目へ▲」
  //（見えているか＝ヘッダー・ヒーローの下端からタブの上端まで。タブの裏に隠れたボタンは「見えていない」）
  const p=document.getElementById('recPill');
  if(p){
    const rb=document.getElementById('rb-'+itemId);
    const inV=!!rb&&(typeof inBand==='function'?inBand(rb):true);
    p.textContent=(a.paused?'⏸ ':silent?'⚠ ':'● ')+mm+' '+(inV?t('recStop'):t('recJump'));
    p.classList.toggle('paused',!!a.paused);
  }
}
/* 自動文字起こし（ベストエフォート。Web Speech API対応ブラウザのみ） */
function startSR(a){
  const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
  if(!SR)return;
  try{
    const rec=new SR();rec.lang=speechLang();rec.continuous=true;rec.interimResults=true;
    rec.onresult=e=>{
      if(a.paused)return;
      let fin='';
      for(let i=e.resultIndex;i<e.results.length;i++){if(e.results[i].isFinal)fin+=e.results[i][0].transcript}
      if(fin){a.draft+=fin;updateLive(a.itemId,[a._baseDraft,a.draft].filter(Boolean).join(' '))}
    };
    rec.onerror=()=>{};
    rec.start();a.rec=rec;
  }catch(e){a.rec=null}
}
/* 一時停止／再開（MediaRecorder.pause/resume。止めないので1本の録音のまま） */
function togglePause(){
  const a=active;if(!a)return;
  if(a.mr.state==='recording'){
    try{a.mr.pause()}catch(e){toast(t2('pauseNA'),1);return}
    a.paused=true;a._pAt=Date.now();
    try{if(a.rec)a.rec.stop()}catch(e){}a.rec=null;
    try{a.mr.requestData()}catch(e){} // 休止までの分をすぐ一時保存へ
  }else if(a.mr.state==='paused'){
    try{a.mr.resume()}catch(e){return}
    a._pTot+=Date.now()-a._pAt;a._pAt=0;a.paused=false;a.lastSound=Date.now();
    startSR(a);
  }else return;
  renderPauseBtn(a);recTick(a);
}
function renderPauseBtn(a){
  const pb=document.getElementById('rp-'+a.itemId);if(!pb)return;
  pb.textContent=a.paused?('▶ '+t2('recResume')):('⏸ '+t2('recPause'));
  pb.setAttribute('aria-pressed',a.paused?'true':'false');
  pb.classList.toggle('on',!!a.paused);
}
/* 録音行（録音ボタン〜○×）が固定表示に隠れていれば、見える範囲の中央へスクロール */
function revealRecRow(){
  if(!active||typeof inBand!=='function')return;
  const row=document.querySelector('#q-'+sanitizeId(active.itemId)+' .recrow');
  if(row&&!inBand(row))scrollToBand(row);
}
/* 停止操作なしで録音が止まった／止めた（マイクの横取り・画面が消えた） */
function recInterrupted(a,why){
  if(active!==a)return;
  const s=Math.floor(recElapsed(a)/1000);
  a._cut=s;
  stopRec();
  if(why==='hidden'){hidStop={s};return} // 画面に戻ったときに知らせる（非表示中のトーストは見えない）
  toast(t2('recCut').replace('{s}',s),1);
}
/* 画面が消えた・別アプリへ移った：そこまでを確定保存して止める */
let hidStop=null;
function onHideWhileRec(){
  if(!active)return;
  const a=active;
  try{if(a.mr.state!=='inactive')a.mr.requestData()}catch(e){}
  recInterrupted(a,'hidden');
}
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='hidden'){onHideWhileRec();return}
  if(hidStop){toast(t2('recHidStop').replace('{s}',hidStop.s),1);hidStop=null}
  if(active&&!wakeLock)acquireWake(); // 画面に戻ったら取り直す（非表示でOSが解放するため）
});
window.addEventListener('pagehide',onHideWhileRec);
/* 回転・幅の変化：録音中なら録音行を見える範囲へ戻す */
window.addEventListener('resize',()=>{if(active)requestAnimationFrame(revealRecRow)});

/* 停止した録音の後ろに続きを録る（上書きしない）。録音中に押されたら通常の録音ボタンと同じ扱い */
function contRec(itemId){
  if(active){toggleRec(itemId);return}
  if(!(cur&&cur.items[itemId]&&cur.items[itemId].hasAudio)){toggleRec(itemId);return}
  toggleRec(itemId,{append:true});
}
/* 2本の録音を1本（16kHzモノラルWAV）につなぐ。WebAudioでデコード→オフラインで連結→PCM書き出し */
async function mergeAudio(b1,b2){
  const AC=window.AudioContext||window.webkitAudioContext,OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!AC||!OAC)throw new Error('no-webaudio');
  const ac=new AC();
  try{
    const dec=async b=>{const buf=await b.arrayBuffer();return await new Promise((res,rej)=>{const p=ac.decodeAudioData(buf,res,rej);if(p&&p.then)p.then(res,rej)})};
    const x1=await dec(b1),x2=await dec(b2);
    const SRATE=16000,len=Math.max(1,Math.ceil((x1.duration+x2.duration)*SRATE));
    const oc=new OAC(1,len,SRATE);
    [[x1,0],[x2,x1.duration]].forEach(([x,at])=>{const s=oc.createBufferSource();s.buffer=x;s.connect(oc.destination);s.start(at)});
    const out=await oc.startRendering();
    return wavBlob(out.getChannelData(0),SRATE);
  }finally{try{ac.close()}catch(e){}}
}
function wavBlob(f32,sr){
  const n=f32.length,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  ws(0,'RIFF');v.setUint32(4,36+n*2,true);ws(8,'WAVE');ws(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);ws(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){const s=Math.max(-1,Math.min(1,f32[i]));v.setInt16(44+i*2,s<0?s*0x8000:s*0x7fff,true)}
  return new Blob([buf],{type:'audio/wav'});
}

/* ==============================================================
   中断された録音の復元（端末が落ちた・タブが閉じられた録音の一時保存を、次の起動で取り戻す）
   ============================================================== */
async function liveKeys(){
  const db=await openDB();
  const keys=await new Promise((res,rej)=>{const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error)});
  return keys.filter(k=>String(k).startsWith(LIVEPFX)&&!(active&&active._liveKey===k));
}
async function checkLiveTakes(){
  let keys=[];try{keys=await liveKeys()}catch(e){return}
  let box=document.getElementById('liveRec');
  if(!keys.length){if(box)box.remove();return}
  const k=keys[0];let r=null;try{r=await getAudio(k)}catch(e){}
  if(!r||!r.blob||!r.blob.size||!safeKey(r.itemId)){await delAudio(k);return checkLiveTakes()} // 中身のない一時保存は片付ける
  if(!box){
    box=document.createElement('div');box.id='liveRec';box.className='cd';box.setAttribute('role','alert');
    const cards=document.getElementById('examCards');if(!cards)return;
    cards.parentElement.insertBefore(box,cards);
  }
  const it=getItems().find(x=>x.id===r.itemId);
  const qn=it?loc(it,'name'):r.itemId;
  const secs=Math.max(1,Math.round((r.dur||(r.ts-r.t0)||0)/1000));
  const when=new Date(r.t0||r.ts||Date.now());
  const ts=when.getFullYear()+'-'+String(when.getMonth()+1).padStart(2,'0')+'-'+String(when.getDate()).padStart(2,'0')+' '+String(when.getHours()).padStart(2,'0')+':'+String(when.getMinutes()).padStart(2,'0');
  const msg=t2('liveFound').replace('{e}',r.examinee||'—').replace('{q}',qn).replace('{s}',secs).replace('{t}',ts);
  const u=URL.createObjectURL(r.blob);examUrls.push(u);
  const fn=safeName((r.examinee||'rec')+'_'+r.itemId+'_'+ts.replace(/[-: ]/g,''))+'.'+audioExt(r.blob.type);
  box.innerHTML=`<div class="lrmsg">⚠ ${esc(msg)}${keys.length>1?' '+esc(t2('liveMore').replace('{n}',keys.length-1)):''}</div>
    <div class="lrbtns"><button type="button" class="b b1" id="lrRestore">${esc(t2('liveRestore'))}</button><a class="b b3" id="lrDl" download="${esc(fn)}" href="${u}">⬇ ${esc(t2('recDl'))}</a><button type="button" class="b b4" id="lrDiscard">${esc(t2('liveDiscard'))}</button></div>`;
  document.getElementById('lrRestore').onclick=()=>restoreLive(k);
  document.getElementById('lrDiscard').onclick=async()=>{if(!confirm(t2('liveDiscardQ')))return;await delAudio(k);checkLiveTakes()};
}
async function restoreLive(k){
  if(active){toast(t2('recBusy'),1);return}
  let r=null;try{r=await getAudio(k)}catch(e){}
  if(!r||!r.blob){checkLiveTakes();return}
  const iid=r.itemId;if(!safeKey(iid))return;
  // 戻し先：試問中の同じ試問 → 保存済みの同じ試問 → まだ何も録音していない今の試問（受験者名などを引き継ぐ）
  let sess=null,saved=false;
  if(cur&&cur.id===r.sid)sess=cur;
  else{const x=getAll().find(s=>s.id===r.sid);if(x){sess=x;saved=true}}
  if(!sess&&cur&&!Object.values(cur.items||{}).some(x=>x&&x.hasAudio)){
    cur.id=r.sid;
    [['examinee','fEe'],['examiner','fEr'],['date','fDate']].forEach(([f,id])=>{if(!String(cur[f]||'').trim()&&r[f]){cur[f]=r[f];const el=document.getElementById(id);if(el)el.value=r[f]}});
    sess=cur;
  }
  if(!sess){toast(t2('liveNoSess'),1);return}
  const key=sess.id+'_'+iid;
  const rec0=sess.items[iid];
  let base=null;if(rec0&&rec0.hasAudio){try{base=await getAudio(key)}catch(e){}}
  let blob=r.blob;
  if(r.append&&base){try{blob=await mergeAudio(base,blob)}catch(e){toast(t2('mergeFail'),1);return}}
  else if(base&&!confirm(t2('liveReplace')))return;
  try{await putAudio(key,blob)}catch(e){toast(t2('storeFail'),1);return}
  sess.items[iid]=sess.items[iid]||{};
  const it=sess.items[iid],d=String(r.draft||'').trim();
  it.hasAudio=true;it.mime=blob.type;
  it.draft=r.append?[it.draft||'',d].filter(Boolean).join(' '):(d||it.draft||'');
  if(saved){const all=getAll();const i=all.findIndex(s=>s.id===sess.id);if(i>=0){all[i]=sess;saveAll(all)}}
  else{saveDraft();buildExamCards()}
  await delAudio(k);
  toast(t2('liveRestored'));
  if(getGoogleCfg().auto)maybeAutoUpload(iid,it.driveFileId?{replace:true}:undefined,saved?sess:undefined);
  checkLiveTakes();
}

/* 録音を端末(IndexedDB)へ書けた後の確定処理（通常の停止・「保存し直す」の両方から呼ぶ） */
function commitTake(sess,itemId,blob,old,undoLbl){
  sess.items[itemId]=sess.items[itemId]||{};
  sess.items[itemId].hasAudio=true;
  sess.items[itemId].mime=blob.type;
  if(sess.items[itemId].draft==null)sess.items[itemId].draft='';
  if(cur!==sess)return; // 保存し直す前に試問が切り替わった（通常は起きない）
  saveDraft();
  clearRecFail(itemId);
  const au=document.getElementById('au-'+itemId);
  if(au){const u=URL.createObjectURL(blob);examUrls.push(u);au.src=u;au.style.display='block'}
  // カードの✓(done)は updateExamProg が録音と○×の両方で付け外しする
  const rs=document.getElementById('rs-'+itemId);if(rs){rs.textContent='● '+t('recDone');rs.classList.add('ok')}
  const rb=document.getElementById('rb-'+itemId);if(rb){const l=rb.querySelector('.rlab');if(l)l.textContent=t('recRedo')}
  updateExamProg();
  const lv=document.getElementById('lv-'+itemId);
  if(lv){lv.querySelector('.lvtxt').textContent=sess.items[itemId].draft;lv.style.display=sess.items[itemId].draft?'block':'none'}
  maybeAutoUpload(itemId); // Googleドライブ自動保存（設定時のみ）
  if(old)showUndoBar(sess.id,itemId,old,undoLbl); // 録り直し・続きの上書き完了：次の操作まで「元に戻す」を提示
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
  if(rs){rs.textContent='⚠ '+(f.dlOnly?t2('mergeFailStat'):t2('recSaveFail')+(has?' '+t2('recKeptOld'):''));rs.classList.remove('ok')}
  const rb=document.getElementById('rb-'+itemId);if(rb){const l=rb.querySelector('.rlab');if(l)l.textContent=has?t('recRedo'):t('recStart')}
  // 取り戻し用の操作（保存し直す／ダウンロード）をカードに出す（続きをつなげなかった分はダウンロードのみ＝前の録音を上書きしない）
  const card=document.getElementById('q-'+itemId);if(!card)return;
  let box=document.getElementById('rf-'+itemId);
  if(!box){box=document.createElement('div');box.id='rf-'+itemId;box.className='recfail';box.setAttribute('role','alert');
    box.style.cssText='display:flex;gap:8px;flex-wrap:wrap;margin-top:6px';
    const row=card.querySelector('.recrow');if(row&&row.nextSibling)card.insertBefore(box,row.nextSibling);else card.appendChild(box)}
  const u=URL.createObjectURL(blob);examUrls.push(u);
  const ext=audioExt(blob.type);
  const fn=safeName((sess.examinee||'rec')+'_'+itemId+(f.dlOnly?'_cont':'')+'_'+new Date().toISOString().slice(0,19).replace(/[-:T]/g,''))+'.'+ext;
  box.innerHTML=(f.dlOnly?'':`<button type="button" class="b b1" id="rfr-${itemId}" style="flex:0 0 auto;padding:6px 10px;font-size:.78rem">${esc(t2('recRetryStore'))}</button>`)+`<a class="b b3" id="rfd-${itemId}" style="flex:0 0 auto;padding:6px 10px;font-size:.78rem;text-decoration:none" download="${esc(fn)}" href="${u}">⬇ ${esc(t2('recDl'))}</a>`;
  const rr=document.getElementById('rfr-'+itemId);if(rr)rr.onclick=()=>retryStoreTake(sess.id,itemId);
}
async function retryStoreTake(sid,itemId){
  const f=failedTakes[sid+'_'+itemId];if(!f||f.dlOnly)return;
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

/* 録り直し・続きの「元に戻す」：上書きした旧テイクをメモリから復元できる（IndexedDBスキーマ・保存形式は不変）。
   10秒で消すと「気づいた時には戻せない」ため、次の操作（次の録音・試問の保存・タブ移動・✕）まで出し続ける */
let lastReplaced=null,undoTimer=null;
function showUndoBar(sessId,itemId,old,label){
  hideUndoBar();
  lastReplaced={key:sessId+'_'+itemId,sessId,itemId,blob:old.blob,draft:old.draft};
  const bar=document.createElement('div');bar.id='undoBar';bar.setAttribute('role','status');
  const sp=document.createElement('span');sp.textContent=label||t('recReplaced');
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
  const x=document.createElement('button');x.type='button';x.className='ubx';x.textContent='✕';x.setAttribute('aria-label',t2('undoClose'));x.onclick=hideUndoBar;
  bar.appendChild(sp);bar.appendChild(b);bar.appendChild(x);
  document.body.appendChild(bar);
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
  clearInterval(a.timer);clearTimeout(a._muteT);
  // 自動文字起こしの下書きを確定（onstopが発火する前にactiveがnullになるため、ここで保存）。続きは前の下書きの後ろへ
  cur.items[itemId]=cur.items[itemId]||{};
  const nd=(a.draft||'').trim();
  cur.items[itemId].draft=a._append?[a._baseDraft.trim(),nd].filter(Boolean).join(' '):nd;
  const p=new Promise(res=>{a._resolve=res});
  // すでに止まっている（マイクを取られた等で onstop が先に走った／走る途中）なら stop() は呼ばない＝待ちっぱなしにしない
  if(a._stopDone)a._resolve();
  else if(a.mr.state!=='inactive'){try{a.mr.stop()}catch(e){a._resolve()}}
  setTimeout(()=>{if(a._resolve)a._resolve()},10000); // 保険：onstop が来なくても呼び出し側を永久に待たせない
  try{if(a.rec)a.rec.stop()}catch(e){}
  try{if(a.ac)a.ac.close()}catch(e){}
  const vu=document.getElementById('vu-'+itemId);if(vu)vu.remove();
  const pb=document.getElementById('rp-'+itemId);if(pb)pb.remove();
  try{a.stream.getTracks().forEach(tr=>tr.stop())}catch(e){}
  const btn=document.getElementById('rb-'+itemId);
  if(btn){btn.classList.remove('recording');btn.querySelector('.rlab').textContent=t('recRedo')}
  const rt=document.getElementById('rt-'+itemId);if(rt)rt.textContent='';
  const pill=document.getElementById('recPill');if(pill)pill.remove();
  // ステータスを保存済み状態に合わせて戻す（onstop成功時は「録音済み」で上書きされる。失敗時のフォールバック）
  const rs=document.getElementById('rs-'+itemId);
  if(rs){const has=cur&&cur.items[itemId]&&cur.items[itemId].hasAudio;rs.textContent=has?('● '+t('recDone')):t('recReady');rs.classList.toggle('ok',!!has)}
  active=null;
  releaseWake();
  recCue('stop');
  if(typeof updateExamProg==='function')updateExamProg(); // 「続きを録音」の表示を戻す
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
    toast(t('gTestFail')+'（'+e.message+'）'+(pend?' · '+t2('gAutoPend'):''),1);
  }
  finally{btn.disabled=false;btn.textContent=old}
}
// 合否ラベル（ドライブのファイル名用。受け取るのは社長側なので言語に関わらず日本語固定）
// 合否は採点と同じ score='pass'|'fail' を使う（旧5段階の数値や未採点は「未判定」）
function verdictTag(v){return v==='pass'?'合格':v==='fail'?'不合格':'未判定'}
/* ドライブのファイル名（拡張子なし）：飼-1_合格_質問名 */
function driveBaseName(session,itemId){
  const it=getItems().find(x=>x.id===itemId);
  const sec=getSections().find(s=>s.id===(it&&it.secId));
  const ii=sec?getItems().filter(x=>x.secId===sec.id).findIndex(x=>x.id===itemId):0;
  const tag=sec?sec.name.charAt(0)+'-'+(ii+1):itemId;
  const rec=session.items[itemId]||{};
  return safeName(tag+'_'+verdictTag(rec.score)+'_'+(it?it.name:itemId));
}
/* 送った時の合否ラベルが今の合否と違うか（driveName が無い旧データは判定しない） */
function driveNameStale(session,itemId){
  const r=session.items[itemId];if(!r||!r.driveName)return false;
  return String(r.driveName).replace(/\.[^.]+$/,'')!==driveBaseName(session,itemId);
}
async function gasUpload(session,itemId,replaceId){
  const g=getGoogleCfg();
  const blob=await getAudio(session.id+'_'+itemId);if(!blob)return null;
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
    sess.items[itemId].driveFileId=res.id;sess.items[itemId].driveLink=res.link;sess.items[itemId].driveName=res.name;sess.items[itemId].driveEe=res.ee; // 送った受験者名（保存時に名前が変わっていたら付け直す）
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
  if(src.driveEe!==undefined)dst.driveEe=src.driveEe;
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
    ['driveFileId','driveLink','driveName','driveEe'].forEach(f=>{if(src[f]!==undefined||f!=='driveEe')dst[f]=src[f]});
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

/* 「試問を保存」の直後：確定した受験者名とドライブへ送った名前が違う録音を付け直す（replaceId で旧ファイルを置き換え）。
   名前が空で送れずに待っていた録音もここで送る。saved は保存したセッション（保存後は cur ではない） */
function syncExamineeOnSave(saved){
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
    if(!r.driveFileId&&g.auto&&!r.driveSt){n++;maybeAutoUpload(k,undefined,saved)} // 名前待ちで送っていなかった録音
  });
  return n;
}
/* 受験者名が必要な場面：受験者名欄へスクロールしてフォーカス・赤枠 */
function needExamineeUi(){
  toast(t2('needEe'),1);
  if(typeof markInvalid==='function')markInvalid('fEe');
}
// 合否ボタン（試問カード）：採点と同じ score に保存。同じボタンをもう一度押すと解除
const vdLast={};
function setVerdict(itemId,v){
  if(!cur)return;
  cur.items[itemId]=cur.items[itemId]||{};
  const rec=cur.items[itemId];
  // 手袋のチャタリング・二度押し：同じボタンを500ms以内に続けて押したら2回目は無視（黙って合否が消えるのを防ぐ）
  const now=Date.now(),lp=vdLast[itemId];
  vdLast[itemId]={v,t:now};
  if(lp&&lp.v===v&&now-lp.t<500)return;
  const cleared=rec.score===v;
  rec.score=cleared?null:v;
  saveDraft();
  if(cleared)toast(t2('pfCleared')); // 解除は画面に出して知らせる（緑が消えるだけでは受験者を見ている試問者は気づかない）
  const vp=document.getElementById('vp-'+itemId),vf=document.getElementById('vf-'+itemId);
  if(vp){vp.classList.toggle('on',rec.score==='pass');vp.setAttribute('aria-pressed',rec.score==='pass'?'true':'false')}
  if(vf){vf.classList.toggle('on',rec.score==='fail');vf.setAttribute('aria-pressed',rec.score==='fail'?'true':'false')}
  if(typeof updateExamProg==='function')updateExamProg(); // 合否の進捗・完了色を即時に反映
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
    const ext=audioExt(blob.type);
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
