/* media.js — 録音（MediaRecorder/WebSpeech）・一時保存と復元・AI文字起こし（ドライブ送信は drive.js、合否トグルは verdict.js） */
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

/* 録音中の状態 {itemId,mr,stream,chunks,rec,draft,timer,t0}。このファイルの resize/visibilitychange が
   app.js より先に発火しても参照できるよう、使う側（ここ）で宣言する（X-1） */
let active=null;

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
    const from=a._liveN||0,parts=a.chunks.slice(from); // まだ書いていない塊だけ（書き込み量は録音時間に比例）
    const rec={sid:a.sid,itemId:a.itemId,mime:type,t0:a.t0,ts:Date.now(),dur:recElapsed(a),draft:a.draft||'',append:!!a._append,
      examinee:cur?String(cur.examinee||''):'',examiner:cur?String(cur.examiner||''):'',date:cur?String(cur.date||''):'',
      n:from+parts.length};
    return putLiveParts(a._liveKey,rec,parts,from).then(()=>{a._liveN=from+parts.length});
  }).catch(()=>{});
}

async function toggleRec(itemId,opt){
  if(active&&active.itemId===itemId){await stopRec();return}
  if(active){toast(t('recOther'),1);jumpToActiveRec(true);return} // 誤タップでも録音中カードへ自動で連れて行く
  // ドライブ自動保存がONなら、録音は停止直後に「受験者名」のフォルダへ送られる→名前が空のうちは録音を始めない
  {const g=getGoogleCfg();const fe=document.getElementById('fEe');
   if(g.url&&g.auto&&fe&&!fe.value.trim()){needExamineeUi();return}}
  // ドライブ未設定・OFFでも、受験者名が空なら1試問に1回だけ名前の入力を促す（録音は止めない）
  if(!(active&&active.itemId===itemId)&&typeof nagEmptyExaminee==='function')nagEmptyExaminee();
  if(typeof storageOnRec==='function')storageOnRec(); // 端末ストレージの永続化・残り容量（待たずに裏で）
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
        delLive(a._liveKey);
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
          // 一時保存は残す＝続きの部分の唯一の写し（この画面が落ちても次の起動で取り戻せる）
          failedTakes[sess.id+'_'+itemId]={sess,blob,draft:newDraft,old:a._old,dlOnly:true,liveKey:a._liveKey};
          renderRecFail(itemId);
          return;
        }
      }
      // 正式キーへの保存と同じトランザクションで一時保存に「保存済み」の印（その後に落ちても復元で二重につながない）
      // 書けなかったら一時保存は残す＝この画面が落ちても次の起動で取り戻せる唯一の写し（保存し直せたら片付ける）
      try{await putAudio(sess.id+'_'+itemId,blob,a._liveKey)}
      catch(err){recStoreFailed(sess,itemId,blob,newDraft,a._old,a._liveKey);return}
      commitTake(sess,itemId,blob,a._old,a._append?t2('recAppended'):null); // 試問の記録（hasAudio）を先に保存
      delLive(a._liveKey); // その後で一時保存を片付ける
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
  // 名前が空で止めたときの赤いトースト（needEe）は、録音が始まったら消す（L-15：録音中に「録音できない」と読める表示を残さない）
  if(typeof toastClear==='function')toastClear(t2('needEe'));
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
  document.documentElement.style.setProperty('--recpill-w',pill.offsetWidth+'px');
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
    document.documentElement.style.setProperty('--recpill-w',p.offsetWidth+'px'); // 録音中の文字起こし欄の右の空き（V-2）
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
/* 回転・幅の変化：録音中なら録音行を見える範囲へ戻す。
   高さだけの変化（アドレスバーの出入り・キーボード）と、文字を入力している間は動かさない（M-20：別の問の入力中に引き戻さない） */
let recLastW=window.innerWidth;
function typingNow(){const e=document.activeElement;return !!(e&&(e.isContentEditable||/^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName)))}
window.addEventListener('resize',()=>{
  const w=window.innerWidth,wc=w!==recLastW;recLastW=w;
  if(active&&wc&&!typingNow())requestAnimationFrame(revealRecRow);
});

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
  // 見出しだけ（塊は除く）。録音中のもの・この画面で保存に失敗して取り戻し待ちのもの（failedTakes）は出さない
  const busy=new Set(Object.values(failedTakes).map(f=>f.liveKey).filter(Boolean));
  return keys.filter(k=>isLiveHead(k)&&!(active&&active._liveKey===k)&&!busy.has(k));
}
async function checkLiveTakes(){
  let keys=[];try{keys=await liveKeys()}catch(e){return}
  let box=document.getElementById('liveRec');
  if(!keys.length){if(box)box.remove();return}
  const k=keys[0];let r=null;try{r=await getLive(k)}catch(e){}
  if(!r||!r.blob||!r.blob.size||!safeKey(r.itemId)){await delLive(k);return checkLiveTakes()} // 中身のない一時保存は片付ける
  if(r.done){ // 正式キーへ保存済みで、試問の記録にも録音が載っている＝片付けだけが残っていた
    const ss=cur&&cur.id===r.sid?cur:getAll().find(x=>x.id===r.sid);
    if(ss&&ss.items&&ss.items[r.itemId]&&ss.items[r.itemId].hasAudio){await delLive(k);return checkLiveTakes()}
  }
  if(!box){
    box=document.createElement('div');box.id='liveRec';box.className='cd';box.setAttribute('role','alert');
    const cards=document.getElementById('examCards');if(!cards)return;
    cards.parentElement.insertBefore(box,cards);
  }
  const it=getItems().find(x=>x.id===r.itemId);
  const qn=it?(it.free?qName(cur,it,itemNo(it)):loc(it,'name')):r.itemId;
  const secs=Math.max(1,Math.round((r.dur||(r.ts-r.t0)||0)/1000));
  const when=new Date(r.t0||r.ts||Date.now());
  const ts=when.getFullYear()+'-'+String(when.getMonth()+1).padStart(2,'0')+'-'+String(when.getDate()).padStart(2,'0')+' '+String(when.getHours()).padStart(2,'0')+':'+String(when.getMinutes()).padStart(2,'0');
  const msg=t2('liveFound').replace('{e}',r.examinee||'—').replace('{q}',qn).replace('{s}',secs).replace('{t}',ts);
  const u=URL.createObjectURL(r.blob);examUrls.push(u);
  const fn=safeName((r.examinee||'rec')+'_'+r.itemId+'_'+ts.replace(/[-: ]/g,''))+'.'+audioExt(r.blob.type);
  box.innerHTML=`<div class="lrmsg">⚠ ${esc(msg)}${keys.length>1?' '+esc(t2('liveMore').replace('{n}',keys.length-1)):''}</div>
    <div class="lrbtns"><button type="button" class="b b1" id="lrRestore">${esc(t2('liveRestore'))}</button><a class="b b3" id="lrDl" download="${esc(fn)}" href="${u}">⬇ ${esc(t2('recDl'))}</a><button type="button" class="b b4" id="lrDiscard">${esc(t2('liveDiscard'))}</button></div>`;
  document.getElementById('lrRestore').onclick=()=>restoreLive(k);
  document.getElementById('lrDiscard').onclick=async()=>{if(!confirm(t2('liveDiscardQ')))return;await delLive(k);checkLiveTakes()};
}
async function restoreLive(k){
  if(active){toast(t2('recBusy'),1);return}
  let r=null;try{r=await getLive(k)}catch(e){}
  if(!r||!r.blob){checkLiveTakes();return}
  const iid=r.itemId;if(!safeKey(iid))return;
  // 戻し先：試問中の同じ試問 → 保存済みの同じ試問 → まだ何も録音していない今の試問（受験者名などを引き継ぐ）
  let sess=null,saved=false;
  if(cur&&cur.id===r.sid)sess=cur;
  else{const x=getAll().find(s=>s.id===r.sid);if(x){sess=x;saved=true}}
  if(!sess&&cur&&!Object.values(cur.items||{}).some(x=>x&&x.hasAudio)){
    // 今の試問が別の受験者のものなら入れない（録音を取り違えない。自動保存ONなら別人のドライブフォルダへ送られてしまう）
    const nm=x=>String(x||'').trim().replace(/\s+/g,' ');
    const fe=document.getElementById('fEe');
    const now=nm(fe?fe.value:cur.examinee),was=nm(r.examinee);
    if(now&&was&&now!==was){toast(t2('liveOtherEe').replace('{a}',was).replace('{b}',now),1);return}
    // 受験者名のない録音を名前の入った試問へ／名前のない試問に合否・下書きがある：どちらの人か画面からは分からない→確かめる
    if(now&&!was&&!confirm(t2('liveNoNameQ').replace('{b}',now)))return;
    if(!now&&Object.values(cur.items||{}).some(x=>x&&(x.score!=null&&x.score!==''||String(x.draft||'').trim()))&&
       !confirm(t2('liveMixQ').replace('{a}',was||'—')))return;
    cur.id=r.sid;
    [['examinee','fEe'],['examiner','fEr'],['date','fDate']].forEach(([f,id])=>{if(!String(cur[f]||'').trim()&&r[f]){cur[f]=r[f];const el=document.getElementById(id);if(el)el.value=r[f]}});
    sess=cur;
  }
  if(!sess){toast(t2('liveNoSess'),1);return}
  const key=sess.id+'_'+iid;
  const rec0=sess.items[iid];
  let base=null;if(rec0&&rec0.hasAudio){try{base=await getAudio(key)}catch(e){}}
  let blob=r.blob;
  // 「正式キーへ保存済み」の印：保存の直後（試問の記録を書く前）に落ちた＝録音は正式キーにある。つなぎ直さず記録だけ戻す
  const doneBase=r.done&&!base&&r.doneKey===key?await getAudio(key).catch(()=>null):null;
  if(r.done&&(base||doneBase))blob=base||doneBase;
  else{
    if(r.append&&base){try{blob=await mergeAudio(base,blob)}catch(e){toast(t2('mergeFail'),1);return}}
    else if(base&&!confirm(t2('liveReplace')))return;
    try{await putAudio(key,blob,k)}catch(e){toast(t2('storeFail'),1);return}
  }
  sess.items[iid]=sess.items[iid]||{};
  const it=sess.items[iid],d=String(r.draft||'').trim();
  it.hasAudio=true;it.mime=blob.type;
  it.draft=r.append?[it.draft||'',d].filter(Boolean).join(' '):(d||it.draft||'');
  if(saved){const all=getAll();const i=all.findIndex(s=>s.id===sess.id);if(i>=0){all[i]=sess;saveAll(all)}}
  else{saveDraft();buildExamCards()}
  await delLive(k); // 試問の記録を保存した後で一時保存を片付ける
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
  if(au){const u=URL.createObjectURL(blob);examUrls.push(u);au.src=u;au.style.display='block';const ms=document.getElementById(au.id+'-miss');if(ms)ms.remove()} // 「録音が見つかりません」は録り直しで消す
  // カードの✓(done)は updateExamProg が録音と○×の両方で付け外しする
  const rs=document.getElementById('rs-'+itemId);if(rs){rs.textContent='● '+t('recDone');rs.classList.add('ok')}
  const rb=document.getElementById('rb-'+itemId);if(rb){const l=rb.querySelector('.rlab');if(l)l.textContent=t('recRedo')}
  updateExamProg();
  const lv=document.getElementById('lv-'+itemId);
  if(lv){lv.querySelector('.lvtxt').textContent=sess.items[itemId].draft;lv.style.display=sess.items[itemId].draft?'block':'none'}
  queueDriveTake(sess,itemId); // Googleドライブ自動保存（設定時のみ）。少し待って○×と一緒に1回で送る・前のファイルは置き換え（drive.js）
  if(old)showUndoBar(sess.id,itemId,old,undoLbl); // 録り直し・続きの上書き完了：次の操作まで「元に戻す」を提示
}
/* 録音を端末に書き込めなかった（容量不足等）：黙って「未録音」に戻さず、失敗を常設表示し、
   その録音を「保存し直す／ダウンロード」で取り戻せるようにする（録り直しなら前のテイクが残っていると明示） */
const failedTakes={};
function recStoreFailed(sess,itemId,blob,newDraft,old,liveKey){
  toast(t2('storeFail'),1);
  const rec=sess.items[itemId];
  if(rec){rec.draft=old?old.draft:(rec.hasAudio?rec.draft:newDraft)} // 下書きは実際に残っている録音に合わせる
  if(cur===sess)saveDraft();
  failedTakes[sess.id+'_'+itemId]={sess,blob,draft:newDraft,old,liveKey:liveKey||null};
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
  const fn=safeName((sess.examinee||'rec')+'_'+itemId+(f.dlOnly?'_cont':'')+'_'+localStamp())+'.'+ext;
  box.innerHTML=(f.dlOnly?'':`<button type="button" class="b b1" id="rfr-${itemId}" style="flex:0 0 auto;padding:6px 10px;font-size:.78rem">${esc(t2('recRetryStore'))}</button>`)+`<a class="b b3" id="rfd-${itemId}" style="flex:0 0 auto;padding:6px 10px;font-size:.78rem;text-decoration:none" download="${esc(fn)}" href="${u}">⬇ ${esc(t2('recDl'))}</a>`;
  const rr=document.getElementById('rfr-'+itemId);if(rr)rr.onclick=()=>retryStoreTake(sess.id,itemId);
}
async function retryStoreTake(sid,itemId){
  const f=failedTakes[sid+'_'+itemId];if(!f||f.dlOnly)return;
  if(active){toast(t2('recBusy'),1);return}
  try{await putAudio(sid+'_'+itemId,f.blob,f.liveKey)}catch(e){toast(t2('storeFail'),1);return}
  delete failedTakes[sid+'_'+itemId];
  if(f.sess.items[itemId])f.sess.items[itemId].draft=f.draft;else f.sess.items[itemId]={draft:f.draft};
  commitTake(f.sess,itemId,f.blob,f.old);
  if(f.liveKey)delLive(f.liveKey); // 保存し直せた＝取り戻し用の一時保存は不要
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
        queueDriveTake(cur,lr.itemId); // 復元した旧テイクをドライブにも再送（ローカルとドライブの不一致を防ぐ。前のファイルは置き換え）
      }
      toast(t('undoDone'));
    }catch(e){toast(t2('storeFail'),1)}
  };
  const x=document.createElement('button');x.type='button';x.className='ubx';x.textContent='✕';x.setAttribute('aria-label',t2('undoClose'));x.onclick=hideUndoBar;
  bar.appendChild(sp);bar.appendChild(b);bar.appendChild(x);
  document.body.appendChild(bar);
  fitUndoBar();
  // 今録った問の操作（×不合格・録り直し・続き）がバーの裏に入っていたら、バーの上へ出す
  requestAnimationFrame(()=>{
    const el=document.getElementById('undoBar');if(!el)return;
    const top=el.getBoundingClientRect().top;
    const q=['vf-','vp-','rb-','rc-'].map(p=>document.getElementById(p+itemId)).filter(Boolean);
    const low=Math.max(0,...q.map(n=>n.getBoundingClientRect().bottom));
    if(low>top-8)window.scrollBy(0,low-(top-8));
  });
}
/* バーの実際の高さをページ下の余白（html.undo-on）へ反映＝バーは最下部の操作を覆わない */
function fitUndoBar(){
  const el=document.getElementById('undoBar'),de=document.documentElement;
  if(!el){de.classList.remove('undo-on');de.style.removeProperty('--undo-h');return}
  de.style.setProperty('--undo-h',Math.ceil(el.getBoundingClientRect().height+10)+'px');
  de.classList.add('undo-on');
}
window.addEventListener('resize',fitUndoBar);
function hideUndoBar(){
  lastReplaced=null;
  if(undoTimer){clearTimeout(undoTimer);undoTimer=null}
  const el=document.getElementById('undoBar');if(el)el.remove();
  fitUndoBar();
}
function updateLive(itemId,txt){const lv=document.getElementById('lv-'+itemId);if(lv)lv.querySelector('.lvtxt').textContent=txt}
let recStopAt=0; // 最後に停止した時刻（停止直後の二度押しで別の操作に飛ばない・M-9）
function stopRec(){
  if(!active)return Promise.resolve();
  recStopAt=Date.now();
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
  document.documentElement.style.removeProperty('--recpill-w');
  // ステータスを保存済み状態に合わせて戻す（onstop成功時は「録音済み」で上書きされる。失敗時のフォールバック）
  const rs=document.getElementById('rs-'+itemId);
  if(rs){const has=cur&&cur.items[itemId]&&cur.items[itemId].hasAudio;rs.textContent=has?('● '+t('recDone')):t('recReady');rs.classList.toggle('ok',!!has)}
  active=null;
  releaseWake();
  recCue('stop');
  if(typeof updateExamProg==='function')updateExamProg(); // 「続きを録音」の表示を戻す
  return p;
}

/* 受験者名が必要な場面：受験者名欄へスクロールしてフォーカス・赤枠 */
function needExamineeUi(){
  toast(t2('needEe'),1);
  if(typeof markInvalid==='function')markInvalid('fEe');
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
  }catch(e){toast(t('aiFail')+pParen(e.message),1)}
  finally{btn.disabled=false;btn.textContent=old}
}
