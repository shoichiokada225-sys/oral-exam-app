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
      h+=`<div class="cd qc${has?' done':''}" id="q-${iid}">
        <div class="en">${esc(secName.charAt(0))}-${ii+1}</div>
        <div class="enm">${esc(loc(it,'name'))}</div>
        <div class="ed">${esc(loc(it,'desc'))}</div>
        ${ansTxt?`<details class="ans"><summary>${t('ansLbl')}${lang!=='ja'&&ansTxt===it.ans?' '+esc(t('ansJaNote')):''}</summary><div class="ansb">${esc(ansTxt)}</div></details>`:''}
        <div class="recrow">
          <button class="recbtn" id="rb-${iid}" onclick="toggleRec('${iid}')"><span class="dot"></span><span class="rlab">${has?t('recRedo'):t('recStart')}</span></button>
          <span class="rectime" id="rt-${iid}"></span>
          <span class="recstat${has?' ok':''}" id="rs-${iid}">${has?'● '+t('recDone'):t('recReady')}</span>
          <span class="verd" role="group" aria-label="${esc(t2('pfLbl'))}"><button type="button" class="vb vpass${rec&&rec.score==='pass'?' on':''}" id="vp-${iid}" aria-pressed="${rec&&rec.score==='pass'?'true':'false'}" onclick="setVerdict('${iid}','pass')">○ ${esc(t2('pass'))}</button><button type="button" class="vb vfail${rec&&rec.score==='fail'?' on':''}" id="vf-${iid}" aria-pressed="${rec&&rec.score==='fail'?'true':'false'}" onclick="setVerdict('${iid}','fail')">× ${esc(t2('fail'))}</button></span>
          <button type="button" class="b b3" id="nx-${iid}" style="display:${has?'inline-block':'none'};flex:0 0 auto;padding:6px 10px;font-size:.74rem;margin-left:auto" onclick="gotoNextUnrec('${iid}')">${esc(t2('nextUnrec'))} ▾</button>
        </div>
        <audio id="au-${iid}" controls style="display:${has?'block':'none'}"></audio>
        <div class="live" id="lv-${iid}" style="display:${(rec&&rec.draft)?'block':'none'}"><span class="lbl">${t('liveLbl')}</span><span class="lvtxt">${esc(rec?rec.draft:'')}</span></div>
        <div class="cloud" id="cl-${iid}" style="font-size:.78rem;font-weight:700;margin-top:6px;display:${(rec&&rec.driveLink)?'block':'none'};color:var(--pri)">${(rec&&rec.driveLink)?t('clDone'):''}</div>
      </div>`;
    });
  });
  el.innerHTML=h;
  // 旧ObjectURLを解放してから既存録音の再生用URLを復元
  examUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});examUrls=[];
  if(cur)getItems().forEach(async it=>{
    if(cur.items[it.id]&&cur.items[it.id].hasAudio){
      const b=await getAudio(cur.id+'_'+it.id);
      if(b){const au=document.getElementById('au-'+sanitizeId(it.id));if(au){const u=URL.createObjectURL(b);examUrls.push(u);au.src=u;au.style.display='block'}}
    }
  });
  updateExamProg();
}

/* 試問タブ：録音進捗バー＋セクションジャンプ */
function updateExamProg(){
  const box=document.getElementById('examProg');if(!box)return;
  const items=getItems(),secs=getSections();
  const m=items.length;
  if(!m){box.style.display='none';box.classList.remove('complete');return}
  box.style.display='block';
  const done=it=>cur&&cur.items[it.id]&&cur.items[it.id].hasAudio;
  const n=items.filter(done).length;
  // 録音完了直後（media.jsのonstopから呼ばれる）に「次の未録音へ」ボタンを出す
  items.forEach(it=>{const b=document.getElementById('nx-'+sanitizeId(it.id));if(b)b.style.display=done(it)?'inline-block':'none'});
  document.getElementById('epLbl').textContent=t('progRec');
  document.getElementById('epCnt').textContent=n+' / '+m;
  document.getElementById('epBar').style.width=Math.round(n/m*100)+'%';
  box.classList.toggle('complete',n===m); // 全問録音でバーが完了色に
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
