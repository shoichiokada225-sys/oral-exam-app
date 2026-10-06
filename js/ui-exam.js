/* ui-exam.js — 試問タブ：カード生成・録音進捗・次の未録音への導線
   ※ js/ui.js を機械的に分割したもの（プレーンスクリプト・グローバル名は不変）。読み込み順は ui-core → ui-exam → ui-score → ui-hist → ui-chart → ui-cfg */
/* ==============================================================
   試問タブ：カード生成
   ============================================================== */
function buildExamCards(){
  const el=document.getElementById('examCards');
  const secs=getSections(),items=getItems();
  let h='';
  secs.forEach((sec,si)=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    if(!secItems.length)return;
    const secName=loc(sec,'name'); // 多言語コンテンツ（name_en等があれば言語追従・無ければ原文）
    h+=`<h2 class="stit" id="sec-i${si}">${esc(secName)}</h2>`;
    secItems.forEach((it,ii)=>{
      const iid=sanitizeId(it.id); // 多層防御: onclick/DOM idへの埋め込みは描画側でも無害化（loadCfg/importBackup/applySetの上流無害化に一点依存しない）
      const rec=cur&&cur.items[it.id];
      const has=rec&&rec.hasAudio;
      const ansTxt=loc(it,'ans');
      h+=`<div class="cd qc${has&&isPF(rec.score)?' done':''}" id="q-${iid}">
        <div class="en">${esc(secName.charAt(0))}-${ii+1}</div>
        ${it.free?`<textarea class="qtx" id="qt-${iid}" rows="2" placeholder="${esc(t2('freePh'))}" aria-label="${esc(freeLbl(ii+1))}" oninput="setQText('${iid}',this.value)">${esc(rec&&rec.qText||'')}</textarea>`
          :`<div class="enm">${esc(loc(it,'name'))}</div>
        <div class="ed">${esc(loc(it,'desc'))}</div>`}
        ${ansTxt?`<details class="ans"><summary>${t('ansLbl')}${lang!=='ja'&&ansTxt===it.ans?' '+esc(t('ansJaNote')):''}</summary><div class="ansb">${esc(ansTxt)}</div></details>`:''}
        <div class="recrow">
          <button class="recbtn" id="rb-${iid}" onclick="toggleRec('${iid}')"><span class="dot"></span><span class="rlab">${has?t('recRedo'):t('recStart')}</span></button>
          <span class="rectime" id="rt-${iid}"></span>
          <span class="recstat${has?' ok':''}" id="rs-${iid}">${has?'● '+t('recDone'):t('recReady')}</span>
          <span class="verd" role="group" aria-label="${esc(t2('pfLbl'))}"><button type="button" class="vb vpass${rec&&rec.score==='pass'?' on':''}" id="vp-${iid}" aria-pressed="${rec&&rec.score==='pass'?'true':'false'}" onclick="setVerdict('${iid}','pass')">○ ${esc(t2('pass'))}</button><button type="button" class="vb vfail${rec&&rec.score==='fail'?' on':''}" id="vf-${iid}" aria-pressed="${rec&&rec.score==='fail'?'true':'false'}" onclick="setVerdict('${iid}','fail')">× ${esc(t2('fail'))}</button></span>${rec&&isOld(rec.score)?`<span class="vold" id="vo-${iid}">${esc(scoreTxt(rec.score))}</span>`:''}
          <button type="button" class="b b3" id="nx-${iid}" style="display:${has?'inline-block':'none'};flex:0 0 auto;padding:6px 10px;font-size:.74rem;margin-left:auto" onclick="gotoNextUnrec('${iid}')">${esc(t2('nextUnrec'))} ▾</button>
        </div>
        <audio id="au-${iid}" controls style="display:${has?'block':'none'}"></audio>
        <button type="button" class="b b3 rcont" id="rc-${iid}" style="display:${has?'inline-flex':'none'}" onclick="contRec('${iid}')">＋ ${esc(t2('recCont'))}</button>
        <div class="live" id="lv-${iid}" style="display:${(rec&&rec.draft)?'block':'none'}"><span class="lbl">${t('liveLbl')}</span><span class="lvtxt">${esc(rec?rec.draft:'')}</span></div>
        <div class="cloud" id="cl-${iid}" style="font-size:.78rem;font-weight:700;margin-top:6px;display:${(rec&&rec.driveLink)?'block':'none'};color:var(--pri)">${(rec&&rec.driveLink)?t('clDone'):''}</div>
      </div>`;
    });
  });
  // 質問が0件（全削除・空のセットに切替えた直後など）：説明とフォームだけの行き止まりにせず、次の手を示す
  if(!items.length)h=`<div class="cd" id="examEmpty" role="status" style="text-align:center;padding:18px 14px">
    <div style="font-weight:800;font-size:1rem;margin-bottom:6px">${esc(t2('noItemsT'))}</div>
    <div style="font-size:.85rem;color:var(--sub);line-height:1.6;margin-bottom:12px">${esc(t2('noItems'))}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
      <button type="button" class="b b1" id="emGoCfg" style="flex:1 1 160px" onclick="gotoCfgPart('btnCatAdd')">${esc(t2('goCfg'))}</button>
      <button type="button" class="b b4" id="emPickSet" style="flex:1 1 160px" onclick="gotoCfgPart('qsetArea')">${esc(t2('pickSet'))}</button>
    </div></div>`;
  el.innerHTML=h;
  // 旧ObjectURLを解放してから既存録音の再生用URLを復元
  examUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});examUrls=[];
  if(cur)getItems().forEach(async it=>{
    if(cur.items[it.id]&&cur.items[it.id].hasAudio){
      await attachAudio(cur.id+'_'+it.id,document.getElementById('au-'+sanitizeId(it.id)),examUrls);
    }
  });
  updateExamProg();
  if(cur)getItems().forEach(it=>{
    const iid=sanitizeId(it.id);
    // 録音の端末保存に失敗したテイク（保存し直す／ダウンロード）を再描画後も出し続ける
    if(typeof renderRecFail==='function')renderRecFail(iid);
    // ドライブへ届いていない録音（前回の失敗・送信中の終了）は「未送信（タップで再送）」を出す
    if(typeof isUnsent==='function'&&isUnsent(cur,it.id))setCloud(iid,'fail');
  });
}
/* 空状態の導線：設定タブを開いて該当箇所へスクロール */
function gotoCfgPart(anchorId){
  const tb=document.querySelector('.tabs [data-pg="pgCfg"]');if(!tb)return;
  swTab(tb);
  const a=document.getElementById(anchorId);if(!a)return;
  // 閉じた折りたたみ（Googleドライブ欄など）の中なら開いてから連れて行く
  let d=a.closest('details');while(d){d.open=true;d=d.parentElement&&d.parentElement.closest('details')}
  setTimeout(()=>a.scrollIntoView({behavior:'smooth',block:'start'}),80);
}
/* ドライブ保存の状態表示（試問タブ）
   ・進捗ヒーローに1行：自動保存ON／OFF／未設定（録音が端末だけに残るのかを試問中に分かるように）
   ・未設定のとき：初回カード（使い方）が出ている間はその中の1行＋設定へのリンク（閉じるは初回カードの1つだけ）。
     初回カードを閉じた後も未設定なら、使い方の下に小さな案内（閉じたら DRVHINTKEY に記録して以後出さない） */
const DRVHINTKEY='oral_exam_drvhint_off';
let drvHintAsked=false; // この画面で「？」から使い方を開き直した（toggleHowto(true)）
function driveState(){const g=getGoogleCfg();return !g.url?'none':g.auto?'on':'off'}
function howtoOff(){try{return localStorage.getItem(HOWTOKEY)==='1'}catch(e){return false}}
function dismissDrvHint(){try{localStorage.setItem(DRVHINTKEY,'1')}catch(e){}const h=document.getElementById('drvHint');if(h)h.style.display='none'}
function updateDriveUi(){
  const st=driveState();
  const box=document.getElementById('examProg');
  if(box){
    let el=document.getElementById('epDrv');
    if(!el){el=document.createElement('button');el.type='button';el.id='epDrv';el.className='epdrv';el.onclick=()=>gotoCfgPart('gUrl');box.appendChild(el)}
    el.textContent=t2(st==='on'?'drvOn':st==='off'?'drvOff':'drvNone');
    el.dataset.st=st;
  }
  if(typeof renderGShare==='function')renderGShare();
  const h=document.getElementById('drvHint');
  if(h){
    const hw=document.getElementById('examHowto'),meta=document.querySelector('#pgExam .cd.meta');
    const inCard=!!hw&&!howtoOff();
    // 置き場所：初回カードの中（閉じるボタンの前）／カードを閉じた後はカードと入力欄の間
    if(inCard){if(h.parentElement!==hw){hw.insertBefore(h,document.getElementById('howtoX'))}h.className='hw-drv'}
    else{if(meta&&h.parentElement!==meta.parentElement)meta.parentElement.insertBefore(h,meta);h.className='cd'}
    let off=false;try{off=localStorage.getItem(DRVHINTKEY)==='1'}catch(e){}
    // 以前この案内だけを閉じた端末（DRVHINTKEY）は、初回カードの中の1行としても出し直さない。
    // ただし「？」で使い方を自分で開き直したとき（drvHintAsked）はカードの中に戻す（キーは消さない）
    if(st!=='none'||(off&&!(inCard&&drvHintAsked))){h.style.display='none';return}
    h.style.display='';
    if(inCard){
      h.innerHTML=`☁ ${esc(t2('drvHintS'))} <button type="button" class="hw-link" id="drvHintGo" onclick="gotoCfgPart('gUrl')">${esc(t2('drvHintGo'))} ›</button>`;
      return;
    }
    h.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.8rem;color:var(--sub);line-height:1.6">
      <span style="flex:1 1 200px">${esc(t2('drvHint'))}</span>
      <button type="button" class="b b3" id="drvHintGo" style="flex:0 0 auto;padding:6px 10px;font-size:.74rem" onclick="gotoCfgPart('gUrl')">${esc(t2('drvHintGo'))}</button>
      <button type="button" class="b b4" id="drvHintX" style="flex:0 0 auto;padding:6px 10px;font-size:.74rem" onclick="dismissDrvHint()" aria-label="${esc(t('btnClose'))}">${esc(t('btnClose'))}</button></div>`;
  }
}
/* 初回カードの「詳しく」：使い方の全文を開く／畳む */
let howtoMoreOn=false;
function renderHowtoMore(){
  const b=document.getElementById('howtoMore'),l=document.getElementById('howtoLong');if(!b||!l)return;
  b.textContent=t2(howtoMoreOn?'howtoLess':'howtoMore')+(howtoMoreOn?' ▴':' ▾');
  b.setAttribute('aria-expanded',howtoMoreOn?'true':'false');
  l.hidden=!howtoMoreOn;
}
function toggleHowtoMore(){howtoMoreOn=!howtoMoreOn;renderHowtoMore()}

/* 試問タブ：録音進捗バー＋合否の進捗＋セクションジャンプ
   完了（緑・✓）は「録音と○×の両方がそろった」とき。録音だけでは完了にしない（○×の付け忘れを見逃さない） */
function examRecd(it){return !!(cur&&cur.items[it.id]&&cur.items[it.id].hasAudio)}
// 「質問しなかった」（採点画面で付けた na）は判定済み＝○×の催促に数えない（M-5）
function examJudged(it){const r=cur&&cur.items[it.id];return !!(r&&(isPF(r.score)||r.na))}
function updateExamProg(){
  const box=document.getElementById('examProg');if(!box)return;
  updateDriveUi();
  const items=getItems(),secs=getSections();
  const m=items.length;
  if(!m){box.style.display='none';box.classList.remove('complete');return}
  // 初回（使い方カードが開いていて、まだ1問も録音していない）はヒーローを出さない：
  // 最初の画面に1問目の「録音」まで収める（ドライブの状態は初回カードの中に出る）。1件録音するか、カードを閉じたら出す
  const n0=items.filter(examRecd).length;
  box.style.display=(!n0&&!howtoOff()&&document.getElementById('examHowto'))?'none':'block';
  const done=it=>examRecd(it)&&examJudged(it);
  const n=items.filter(examRecd).length;
  box.classList.toggle('fresh',!n); // まだ1問も録音していない：スマホではセクションのチップを畳んで1問目を最初の画面に出す
  const j=items.filter(it=>examRecd(it)&&examJudged(it)).length;
  // 録音完了直後（media.jsのonstopから呼ばれる）に「次の未録音へ」ボタンを出す
  items.forEach(it=>{const b=document.getElementById('nx-'+sanitizeId(it.id));if(b)b.style.display=examRecd(it)?'inline-block':'none'});
  // 停止した録音の後ろに足す「続きを録音」（誤って停止しても後半を録れる）。その問を録音している間は隠す
  items.forEach(it=>{const b=document.getElementById('rc-'+sanitizeId(it.id));if(b)b.style.display=examRecd(it)&&!(typeof active!=='undefined'&&active&&active.itemId===it.id)?'inline-flex':'none'});
  // カード右上の✓も進捗バー・チップと同じ基準（録音と○×の両方）で付け外しする
  items.forEach(it=>{const c=document.getElementById('q-'+sanitizeId(it.id));if(c){c.classList.toggle('done',done(it));const sc=cur&&cur.items[it.id]?cur.items[it.id].score:null;c.classList.toggle('v-pass',done(it)&&sc==='pass');c.classList.toggle('v-fail',done(it)&&sc==='fail')}});
  document.getElementById('epLbl').textContent=t('progRec');
  document.getElementById('epCnt').textContent=n+' / '+m;
  document.getElementById('epBar').style.width=Math.round(n/m*100)+'%';
  const allDone=items.every(done);
  box.classList.toggle('complete',allDone); // 全問の録音と合否がそろったら完了色（中立の濃紺）
  // 完了時の色は合否に連動：全問合格=緑・全問不合格=赤・混在=中立。「完了=緑」で全員合格に見せない
  const np=allDone?items.filter(it=>cur.items[it.id].score==='pass').length:-1;
  const rc=!allDone?'':np===items.length?'res-a5':np===0?'res-a1':'res-a3';
  ['res-a5','res-a1','res-a3'].forEach(k=>box.classList.toggle(k,k===rc));
  // 合否の進捗「合否 j / 録音 n」＋○×が未入力の録音があれば「次の未判定へ」
  const pf=document.getElementById('epPf');
  if(pf){
    const miss=n-j;
    if(!n){pf.innerHTML='';pf.style.display='none'}else{pf.style.display='';
    pf.innerHTML=`<span class="${miss?'pj-warn':''}" id="epPfTxt">${esc(t2('pfProg').replace('{j}',j).replace('{n}',n))}${miss?' · '+esc(t2('pfMiss').replace('{n}',miss)):''}</span>`
      +(miss?`<button type="button" id="epNextUnj" onclick="gotoNextUnjudged()">${esc(t2('nextUnjudged'))} ▾</button>`:'');
    } // 録音0件のうちは「合否 0 / 録音 0」を出さない（まだ何も無い段階のノイズ）
  }
  const chips=document.getElementById('epChips');chips.innerHTML='';
  secs.forEach((sec,si)=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    if(!secItems.length)return;
    const d=secItems.filter(done).length;
    const b=document.createElement('button');
    b.type='button';b.className='chip'+(d===secItems.length?' done':'');
    b.textContent=loc(sec,'name')+' '+d+'/'+secItems.length;
    b.onclick=()=>{const a=document.getElementById('sec-i'+si);if(a)a.scrollIntoView({behavior:'smooth',block:'start'})};
    chips.appendChild(b);
  });
}
/* 録音済みで○×が未入力の問へスクロール（gotoNextUnrecと同じ折り返し。fromId省略時は先頭から） */
function gotoNextUnjudged(fromId){
  const items=getItems();
  const i=fromId?items.findIndex(it=>it.id===fromId):-1;
  const order=items.slice(i+1).concat(items.slice(0,Math.max(i,0)+1));
  const nxt=order.find(it=>examRecd(it)&&!examJudged(it));
  if(!nxt){toast(t2('allJudged'));return}
  const c=document.getElementById('q-'+sanitizeId(nxt.id));
  if(c){c.scrollIntoView({behavior:'smooth',block:'center'});const v=c.querySelector('.verd');if(v){v.classList.add('attn');setTimeout(()=>v.classList.remove('attn'),2200)}}
}

/* 録音完了後の導線：次の未録音項目へスクロール（末尾までいったら先頭へ折り返し） */
function gotoNextUnrec(fromId){
  const items=getItems();
  const i=items.findIndex(it=>it.id===fromId);
  const order=items.slice(i+1).concat(items.slice(0,Math.max(i,0)+1));
  const nxt=order.find(it=>!(cur&&cur.items[it.id]&&cur.items[it.id].hasAudio));
  if(!nxt){toast(t2('allRec'));return}
  const c=document.getElementById('q-'+sanitizeId(nxt.id));
  if(c)c.scrollIntoView({behavior:'smooth',block:'center'});
}

/* 平均点→評価色クラス（4.5+:優 3.5+:良 2.5+:可 1.5+:要改善 それ未満:不可） */
function avgCls(v){const n=parseFloat(v);if(isNaN(n))return'';return n>=4.5?'a5':n>=3.5?'a4':n>=2.5?'a3':n>=1.5?'a2':'a1'}
/* ==============================================================
   端末ストレージの守り（R3）
   ・永続化：ドライブ未設定の端末では録音の写しは IndexedDB だけ。best-effort のままだと
     端末の空きが減ったときにブラウザがこのサイトのデータをまとめて消すことがある→persist() を1回頼む。
     断られたら設定の「データの引き継ぎ」にバックアップを勧める一文を出す（データは消さない）
   ・残り容量：試問を始める（録音する）ときに estimate() を見て、少なければ試問画面の上に常設の警告
   ============================================================== */
let stoPersist=null,stoAsked=false,stoLow=false;
const STO_MIN_FREE=50*1048576,STO_MAX_RATIO=0.9;
async function stoInit(){
  try{if(navigator.storage&&navigator.storage.persisted)stoPersist=!!(await navigator.storage.persisted())}catch(e){stoPersist=null}
  renderPersistNote();
  checkStorage();
}
/* 最初の録音で1回だけ永続化を頼む（Firefox は確認を出すので、利用者の操作のときに頼む） */
async function askPersist(){
  if(stoAsked||stoPersist===true)return;stoAsked=true;
  try{if(navigator.storage&&navigator.storage.persist)stoPersist=!!(await navigator.storage.persist())}catch(e){}
  renderPersistNote();
}
function renderPersistNote(){
  const el=document.getElementById('bkPersist');if(!el)return;
  el.textContent=t2('stoNotPersist');
  el.style.display=stoPersist===false?'block':'none';
}
async function checkStorage(){
  try{
    if(!navigator.storage||!navigator.storage.estimate)return;
    const e=await navigator.storage.estimate();
    const q=+e.quota||0,u=+e.usage||0;
    stoLow=q>0&&(q-u<STO_MIN_FREE||u/q>STO_MAX_RATIO);
  }catch(e){return}
  renderStoWarn();
}
function renderStoWarn(){
  const el=document.getElementById('stoWarn');if(!el)return;
  if(!stoLow){el.style.display='none';el.innerHTML='';return}
  el.innerHTML=`<div style="font-weight:800;color:var(--s1);margin-bottom:4px">⚠ ${esc(t2('stoLowT'))}</div>
    <div style="font-size:.85rem;line-height:1.6;margin-bottom:10px">${esc(t2('stoLow'))}</div>
    <button type="button" class="b b3" id="stoBk" onclick="gotoCfgPart('bkExportBtn')">${esc(t2('stoBackup'))}</button>`;
  el.style.display='block';
}
/* 録音を始めるとき（toggleRec）：永続化を頼み、残り容量を見直す（録音自体は待たせない） */
function storageOnRec(){askPersist();checkStorage()}

/* その場で出題：問題文を試問ごとに保存（入力のたびに下書きへ）。録音済みならドライブのファイル名も付け直す */
let qtTimer=null;
function setQText(itemId,v){
  if(!cur)return;
  cur.items[itemId]=cur.items[itemId]||{};
  cur.items[itemId].qText=String(v||'');
  clearTimeout(qtTimer);qtTimer=setTimeout(()=>{if(typeof saveDraft==='function')saveDraft()},400);
  if(cur.items[itemId].hasAudio&&typeof resyncDriveName==='function')resyncDriveName(cur,itemId);
}
