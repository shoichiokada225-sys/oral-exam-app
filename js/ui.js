/* ui.js — 描画層：試問カード/採点/履歴/詳細/グラフ/CSV/設定画面 */
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
    h+=`<div class="stit" id="sec-i${si}">${esc(sec.name)}</div>`;
    secItems.forEach((it,ii)=>{
      const rec=cur&&cur.items[it.id];
      const has=rec&&rec.hasAudio;
      h+=`<div class="cd qc${has?' done':''}" id="q-${it.id}">
        <div class="en">${esc(sec.name.charAt(0))}-${ii+1}</div>
        <div class="enm">${esc(it.name)}</div>
        <div class="ed">${esc(it.desc)}</div>
        ${it.ans?`<details class="ans"><summary>${t('ansLbl')}</summary><div class="ansb">${esc(it.ans)}</div></details>`:''}
        <div class="recrow">
          <button class="recbtn" id="rb-${it.id}" onclick="toggleRec('${it.id}')"><span class="dot"></span><span class="rlab">${has?t('recRedo'):t('recStart')}</span></button>
          <span class="rectime" id="rt-${it.id}"></span>
          <span class="recstat${has?' ok':''}" id="rs-${it.id}">${has?'● '+t('recDone'):t('recReady')}</span>
        </div>
        <audio id="au-${it.id}" controls style="display:${has?'block':'none'}"></audio>
        <div class="live" id="lv-${it.id}" style="display:${(rec&&rec.draft)?'block':'none'}"><span class="lbl">${t('liveLbl')}</span><span class="lvtxt">${esc(rec?rec.draft:'')}</span></div>
        <div class="cloud" id="cl-${it.id}" style="font-size:.78rem;font-weight:700;margin-top:6px;display:${(rec&&rec.driveLink)?'block':'none'};color:var(--pri)">${(rec&&rec.driveLink)?t('clDone'):''}</div>
      </div>`;
    });
  });
  el.innerHTML=h;
  // 旧ObjectURLを解放してから既存録音の再生用URLを復元
  examUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});examUrls=[];
  if(cur)getItems().forEach(async it=>{
    if(cur.items[it.id]&&cur.items[it.id].hasAudio){
      const b=await getAudio(cur.id+'_'+it.id);
      if(b){const au=document.getElementById('au-'+it.id);if(au){const u=URL.createObjectURL(b);examUrls.push(u);au.src=u;au.style.display='block'}}
    }
  });
  updateExamProg();
}

/* 試問タブ：録音進捗バー＋セクションジャンプ */
function updateExamProg(){
  const box=document.getElementById('examProg');if(!box)return;
  const items=getItems(),secs=getSections();
  const m=items.length;
  if(!m){box.style.display='none';return}
  box.style.display='block';
  const done=it=>cur&&cur.items[it.id]&&cur.items[it.id].hasAudio;
  const n=items.filter(done).length;
  document.getElementById('epLbl').textContent=t('progRec');
  document.getElementById('epCnt').textContent=n+' / '+m;
  document.getElementById('epBar').style.width=Math.round(n/m*100)+'%';
  const chips=document.getElementById('epChips');chips.innerHTML='';
  secs.forEach((sec,si)=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    if(!secItems.length)return;
    const d=secItems.filter(done).length;
    const b=document.createElement('button');
    b.type='button';b.className='chip'+(d===secItems.length?' done':'');
    b.textContent=sec.name+' '+d+'/'+secItems.length;
    b.onclick=()=>{const a=document.getElementById('sec-i'+si);if(a)a.scrollIntoView({behavior:'smooth',block:'start'})};
    chips.appendChild(b);
  });
}

/* ==============================================================
   採点タブ：一覧
   ============================================================== */
function drawScoreList(){
  const fil=document.getElementById('scFil').value;
  let all=getAll();
  if(fil!=='all')all=all.filter(s=>s.status!=='scored');
  all.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
  const c=document.getElementById('scList');
  document.getElementById('scDetail').style.display='none';
  c.style.display='flex';
  document.querySelector('#pgScore .hctrl').style.display='flex';
  if(!all.length){c.innerHTML=`<div class="nd">${fil==='all'?t('noData'):t('noUnscored')}</div>`;return}
  c.innerHTML=all.map(r=>{
    const sc=r.status==='scored';
    return `<div class="hi" onclick="openScore('${sanitizeId(r.id)}')"><div class="hii"><div class="hid">${esc(r.date)}　${t('erLbl')}: ${esc(r.examiner)}</div><div class="hin">${esc(r.examinee)}</div><span class="badge ${sc?'scored':'rec'}">${sc?t('stScored'):t('stRec')}</span></div><div class="hia">${sc?avg(r):'–'}</div></div>`;
  }).join('');
}

/* ==============================================================
   採点タブ：詳細（再生＋文字起こし＋採点）
   ============================================================== */
async function openScore(id){
  const r=getAll().find(s=>s.id===id);if(!r)return;
  curScore=r;
  await renderScoreDetail(r);
}
// 採点フォームの現在値をcurScoreに退避（言語切替などの再描画で入力を失わないため）
function captureScoreForm(){
  if(!curScore)return;
  getItems().forEach(it=>{
    const tr=document.getElementById('tr-'+it.id);
    const cm=document.getElementById('cm-'+it.id);
    const sel=document.querySelector('.sb[data-id="'+it.id+'"].sel');
    if(tr||cm||sel){
      curScore.items[it.id]=curScore.items[it.id]||{};
      if(tr)curScore.items[it.id].transcript=tr.value;
      if(cm)curScore.items[it.id].comment=cm.value;
      if(sel)curScore.items[it.id].score=+sel.dataset.s;
    }
  });
  const ov=document.getElementById('scOv');if(ov)curScore.overall=ov.value;
}
/* 採点の途中経過を自動保存（statusは変えない＝タブ移動・中断・誤操作で入力が消えない） */
let scSaveTimer=null;
function queueScoreDraft(){clearTimeout(scSaveTimer);scSaveTimer=setTimeout(()=>persistScoreDraft(true),800)}
function persistScoreDraft(showHint){
  clearTimeout(scSaveTimer);
  if(!curScore)return;
  captureScoreForm();
  const all=getAll();const idx=all.findIndex(s=>s.id===curScore.id);
  if(idx<0)return;
  all[idx]=curScore;saveAll(all);
  if(showHint){const el=document.getElementById('scAutoSt');if(el){el.textContent=t('draftSaved');el.style.opacity='1';setTimeout(()=>{el.style.opacity='0'},1600)}}
}
function updateScoreProg(){
  if(!curScore)return;
  const scorable=getItems().filter(it=>curScore.items[it.id]&&curScore.items[it.id].hasAudio).length;
  const n=document.querySelectorAll('#scDetail .sb.sel').length;
  const c=document.getElementById('spCnt'),b=document.getElementById('spBar');
  if(c)c.textContent=n+' / '+scorable;
  if(b)b.style.width=(scorable?Math.round(Math.min(n,scorable)/scorable*100):0)+'%';
}
async function renderScoreDetail(r){
  releaseScoreUrls();
  document.getElementById('scList').style.display='none';
  document.querySelector('#pgScore .hctrl').style.display='none';
  const det=document.getElementById('scDetail');det.style.display='block';
  const secs=getSections(),items=getItems();
  let h=`<div class="cd meta"><div style="font-size:.85rem;color:var(--sub)">${esc(r.date)}　${t('erLbl')}: ${esc(r.examiner)}</div><div style="font-size:1.1rem;font-weight:700;margin-top:2px">${esc(r.examinee)}</div><div class="pmeta" style="margin-top:10px"><span>${t('progScore')}</span><span id="spCnt"></span></div><div class="pbar"><i id="spBar"></i></div></div>`;
  secs.forEach(sec=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    if(!secItems.length)return;
    h+=`<div class="stit">${esc(sec.name)}</div>`;
    secItems.forEach((it,ii)=>{
      const rec=r.items[it.id]||{};
      const sc=rec.score;
      h+=`<div class="cd qc${sc?' scored':''}" id="sc-${it.id}">
        <div class="en">${esc(sec.name.charAt(0))}-${ii+1}</div>
        <div class="enm">${esc(it.name)}</div>
        <div class="ed">${esc(it.desc)}</div>
        ${it.ans?`<details class="ans"><summary>${t('ansLbl')}</summary><div class="ansb">${esc(it.ans)}</div></details>`:''}
        ${rec.hasAudio?`<audio id="sa-${it.id}" controls></audio>`:`<div class="recstat">${t('recReady')}</div>`}
        <div class="tlbl"><span>${t('trLbl')}</span>${rec.hasAudio?`<button class="aibtn" id="ai-${it.id}" onclick="aiTranscribe('${it.id}')">${t('aiBtn')}</button>`:''}</div>
        <textarea class="trta" id="tr-${it.id}" placeholder="${t('phTr')}">${esc(rec.transcript!=null?rec.transcript:(rec.draft||''))}</textarea>
        <div class="tlbl">${t('scoreLbl')}</div>
        <div class="sr">${[1,2,3,4,5].map(s=>`<button class="sb${sc===s?' sel':''}" data-id="${it.id}" data-s="${s}" onclick="pickScore('${it.id}',${s},this)">${s}<span class="sl">${t('s'+s)}</span></button>`).join('')}</div>
        <div class="clbl">${t('cmtLbl')}</div>
        <textarea id="cm-${it.id}" placeholder="${t('phCmt')}">${esc(rec.comment||'')}</textarea>
      </div>`;
    });
  });
  h+=`<div class="cd oasec"><h3>${t('overall')}</h3><textarea id="scOv" class="oata" rows="4" placeholder="${t('phOv')}">${esc(r.overall||'')}</textarea></div>`;
  h+=`<div class="savebar"><span class="autost" id="scAutoSt"></span><div class="bg" style="margin:0"><button class="b b1" onclick="saveScore()">${t('btnSaveScore')}</button><button class="b b3" onclick="backToScoreList()">${t('btnBack')}</button></div></div>`;
  det.innerHTML=h;
  det.querySelectorAll('textarea').forEach(el=>el.addEventListener('input',queueScoreDraft));
  updateScoreProg();
  window.scrollTo({top:0,behavior:'smooth'});
  // 音声URL
  for(const it of items){
    if(r.items[it.id]&&r.items[it.id].hasAudio){
      const b=await getAudio(r.id+'_'+it.id);
      if(b){const au=document.getElementById('sa-'+it.id);if(au){const u=URL.createObjectURL(b);curScoreUrls.push(u);au.src=u}}
    }
  }
}
function pickScore(id,s,btn){btn.parentElement.querySelectorAll('.sb').forEach(b=>b.classList.remove('sel'));btn.classList.add('sel');const c=document.getElementById('sc-'+id);if(c)c.classList.add('scored');updateScoreProg();queueScoreDraft()}
function backToScoreList(){persistScoreDraft(false);curScore=null;releaseScoreUrls();document.getElementById('scDetail').style.display='none';drawScoreList()}
function releaseScoreUrls(){curScoreUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});curScoreUrls=[]}


function saveScore(){
  clearTimeout(scSaveTimer);
  const r=curScore;if(!r)return;
  const items=getItems();
  const miss=[];
  items.forEach(it=>{
    const rec=r.items[it.id]||{};
    if(!rec.hasAudio)return; // 録音のない項目は採点対象外
    const sel=document.querySelector('.sb[data-id="'+it.id+'"].sel');
    if(!sel)miss.push(it);
  });
  if(miss.length){
    miss.forEach(it=>{const c=document.getElementById('sc-'+it.id);if(c){c.classList.add('warn');setTimeout(()=>c.classList.remove('warn'),1000)}});
    toast(t('eScore')+'（'+miss.length+'）',1);
    const f=document.getElementById('sc-'+miss[0].id);if(f)f.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  items.forEach(it=>{
    r.items[it.id]=r.items[it.id]||{};
    const tr=document.getElementById('tr-'+it.id);if(tr)r.items[it.id].transcript=tr.value;
    const cm=document.getElementById('cm-'+it.id);if(cm)r.items[it.id].comment=cm.value;
    const sel=document.querySelector('.sb[data-id="'+it.id+'"].sel');
    r.items[it.id].score=sel?+sel.dataset.s:null;
  });
  r.overall=document.getElementById('scOv').value;
  r.status='scored';
  r.updatedAt=new Date().toISOString();
  const all=getAll();const idx=all.findIndex(s=>s.id===r.id);if(idx>=0)all[idx]=r;else all.push(r);
  saveAll(all);
  toast(t('tScored'));
  curScore=null;releaseScoreUrls();
  document.getElementById('scDetail').style.display='none';
  drawScoreList();refreshSel();
}

/* ==============================================================
   履歴
   ============================================================== */
function fmtMonth(ym){const[y,m]=ym.split('-');return lang==='ja'?y+'年'+(+m)+'月':y+'-'+m}
function drawHist(){
  const f=document.getElementById('hFil').value;let all=getAll();if(f)all=all.filter(e=>e.examinee===f);
  const q=(document.getElementById('hQ').value||'').trim().toLowerCase();
  if(q)all=all.filter(e=>((e.examinee||'')+' '+(e.examiner||'')).toLowerCase().includes(q));
  all.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
  const c=document.getElementById('hList');
  if(!all.length){c.innerHTML=`<div class="nd">${t('noData')}</div>`;return}
  let h='',pm='';
  all.forEach(r=>{
    const ym=(r.date||'').slice(0,7);
    if(ym&&ym!==pm){h+=`<div class="mgrp">${esc(fmtMonth(ym))}</div>`;pm=ym}
    const sc=r.status==='scored';
    h+=`<div class="hi" onclick="showDet('${sanitizeId(r.id)}')"><div class="hii"><div class="hid">${esc(r.date)}　${t('erLbl')}: ${esc(r.examiner)}</div><div class="hin">${esc(r.examinee)}</div><span class="badge ${sc?'scored':'rec'}">${sc?t('stScored'):t('stRec')}</span></div><div class="hia">${sc?avg(r):'–'}</div></div>`;
  });
  c.innerHTML=h;
}

async function showDet(id){
  const r=getAll().find(e=>e.id===id);if(!r)return;
  releaseScoreUrls();
  const items=getItems();
  let h=`<div class="mh"><h3>${esc(r.examinee)} - ${esc(r.date)}</h3><button class="mx" onclick="closeMo()">&times;</button></div>`;
  h+=`<div style="font-size:.85rem;color:var(--sub);margin-bottom:12px">${t('erLbl')}: ${esc(r.examiner)}　／　${t('avgLbl')}: ${r.status==='scored'?avg(r):'-'}</div>`;
  items.forEach(it=>{
    const rec=r.items[it.id]||{};
    if(!rec.hasAudio&&rec.score==null&&!rec.transcript)return;
    const sc=rec.score;
    h+=`<div class="di"><div class="dih"><span class="din">${esc(it.name)}</span>${sc?`<span class="dis sb${sc}">${sc}</span>`:''}</div>`;
    if(rec.hasAudio)h+=`<audio id="da-${it.id}" controls></audio>`;
    if(rec.transcript)h+=`<div class="ditr">${esc(rec.transcript)}</div>`;
    if(rec.comment)h+=`<div class="dic">${esc(rec.comment)}</div>`;
    h+=`</div>`;
  });
  if(r.overall)h+=`<div class="dov"><strong>${t('ovLbl')}:</strong><br>${esc(r.overall)}</div>`;
  h+=`<div class="ma">${r.status!=='scored'?`<button class="b b4" style="flex:1" onclick="closeMo();gotoScore('${sanitizeId(r.id)}')">${t('btnScore')}</button>`:`<button class="b b4" style="flex:1" onclick="closeMo();gotoScore('${sanitizeId(r.id)}')">${t('btnScore')}</button>`}<button class="b b2" style="flex:1" onclick="doDel('${sanitizeId(r.id)}')">${t('btnDel')}</button><button class="b b3" style="flex:1" onclick="closeMo()">${t('btnClose')}</button></div>`;
  document.getElementById('moBody').innerHTML=h;
  document.getElementById('modal').classList.add('show');
  for(const it of items){
    if(r.items[it.id]&&r.items[it.id].hasAudio){
      const b=await getAudio(r.id+'_'+it.id);
      if(b){const au=document.getElementById('da-'+it.id);if(au){const u=URL.createObjectURL(b);curScoreUrls.push(u);au.src=u}}
    }
  }
}
function gotoScore(id){
  // 採点タブへ移動して詳細を開く
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('on'));
  document.querySelector('[data-pg="pgScore"]').classList.add('on');
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.getElementById('pgScore').classList.add('on');
  openScore(id);
}
function closeMo(){document.getElementById('modal').classList.remove('show');releaseScoreUrls()}
function doDel(id){
  if(!confirm(t('cDel')))return;
  getItems().forEach(it=>delAudio(id+'_'+it.id));
  saveAll(getAll().filter(e=>e.id!==id));
  closeMo();drawHist();refreshSel();
  if(document.getElementById('pgScore').classList.contains('on'))drawScoreList();
  toast(t('tDel'));
}

/* ==============================================================
   CSV
   ============================================================== */
function doCSV(){
  const all=getAll(),items=getItems();if(!all.length){toast(t('noData'),1);return}
  const hd=['試問日','試問者','受験者','状態',...items.map(it=>it.name+'(点)'),...items.map(it=>it.name+'(文字起こし)'),...items.map(it=>it.name+'(コメント)'),'平均点','全体所感','作成日時'];
  // 数式インジェクション対策：=,+,-,@ 等で始まる値は先頭に ' を付ける
  const cell=s=>{let v=String(s==null?'':s);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
  let csv='﻿'+hd.map(cell).join(',')+'\n';
  all.forEach(r=>{
    const row=[r.date,r.examiner,r.examinee,r.status==='scored'?t('stScored'):t('stRec'),
      ...items.map(it=>(r.items[it.id]&&r.items[it.id].score)||''),
      ...items.map(it=>(r.items[it.id]&&r.items[it.id].transcript)||''),
      ...items.map(it=>(r.items[it.id]&&r.items[it.id].comment)||''),
      r.status==='scored'?avg(r):'',r.overall||'',r.createdAt||''];
    csv+=row.map(cell).join(',')+'\n';
  });
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download='oral_exam_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.csv';a.click();
}

/* ==============================================================
   グラフ
   ============================================================== */
let cL=null,cR=null,cS=null;
function drawCharts(){
  const who=document.getElementById('chSel').value,area=document.getElementById('chArea'),none=document.getElementById('chNone');
  if(!who){area.style.display='none';none.style.display='block';none.textContent=t('selEe');return}
  const all=getAll().filter(e=>e.examinee===who&&e.status==='scored');
  if(!all.length){area.style.display='none';none.style.display='block';none.textContent=t('chNone');return}
  area.style.display='block';none.style.display='none';
  all.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const items=getItems();
  if(cL)cL.destroy();
  cL=new Chart(document.getElementById('cvL'),{type:'line',data:{labels:all.map(e=>e.date),datasets:[{label:t('chAvg'),data:all.map(e=>parseFloat(avg(e))),borderColor:'#2e5d7d',backgroundColor:'rgba(46,93,125,.1)',fill:true,tension:.3,pointRadius:5,pointBackgroundColor:'#2e5d7d'}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:1,max:5,ticks:{stepSize:1}}},plugins:{legend:{display:false}}}});
  const lat=all[all.length-1];
  // セクション別平均（直近の採点済み試問）
  const secLabels=[],secData=[];
  getSections().forEach(sec=>{
    const si=items.filter(it=>it.secId===sec.id);if(!si.length)return;
    const vs=si.map(it=>lat.items[it.id]&&lat.items[it.id].score).filter(x=>x!=null);
    if(vs.length){secLabels.push(sec.name);secData.push(+(vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2))}
  });
  if(cS)cS.destroy();
  cS=new Chart(document.getElementById('cvS'),{type:'bar',data:{labels:secLabels,datasets:[{data:secData,backgroundColor:'rgba(46,93,125,.75)',borderRadius:6,barThickness:22}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,scales:{x:{min:0,max:5,ticks:{stepSize:1}}},plugins:{legend:{display:false}}}});
  if(cR)cR.destroy();
  cR=new Chart(document.getElementById('cvR'),{type:'radar',data:{labels:items.map(it=>{const n=it.name;return n.length>6?n.slice(0,6)+'…':n}),datasets:[{label:lat.date,data:items.map(it=>(lat.items[it.id]&&lat.items[it.id].score)||0),borderColor:'#2e5d7d',backgroundColor:'rgba(46,93,125,.2)',pointBackgroundColor:'#2e5d7d'}]},options:{responsive:true,maintainAspectRatio:false,scales:{r:{min:0,max:5,ticks:{stepSize:1,font:{size:10}},pointLabels:{font:{size:11}}}},plugins:{legend:{display:true,position:'bottom'}}}});
}

/* ==============================================================
   設定：試問項目（セクション＋質問）
   ============================================================== */
function buildCfgUI(){
  const area=document.getElementById('cfgArea');
  const secs=cfg.sections,items=cfg.items;let h='';
  secs.forEach((sec,si)=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    h+=`<div class="cfg-sec" data-sec="${sec.id}">`;
    h+=`<div class="cfg-sec-hdr">
      <input type="text" value="${esc(sec.name)}" onchange="cfgSecName('${sec.id}',this.value)" placeholder="${t('secName')}">
      <div class="ci-btns">
        ${si>0?`<button onclick="moveSec('${sec.id}',-1)">&#9650;</button>`:'<button style="visibility:hidden">&#9650;</button>'}
        ${si<secs.length-1?`<button onclick="moveSec('${sec.id}',1)">&#9660;</button>`:'<button style="visibility:hidden">&#9660;</button>'}
        <button class="del" onclick="delSec('${sec.id}')">&#10005;</button>
      </div>
    </div>`;
    secItems.forEach((it,ii)=>{
      h+=`<div class="cfg-item">
        <div class="ci-row">
          <input type="text" value="${esc(it.name)}" onchange="cfgItemName('${it.id}',this.value)" placeholder="${t('itemName')}">
          <div class="ci-btns">
            ${ii>0?`<button onclick="moveItem('${it.id}',-1)">&#9650;</button>`:'<button style="visibility:hidden">&#9650;</button>'}
            ${ii<secItems.length-1?`<button onclick="moveItem('${it.id}',1)">&#9660;</button>`:'<button style="visibility:hidden">&#9660;</button>'}
            <button class="del" onclick="delItem('${it.id}')">&#10005;</button>
          </div>
        </div>
        <textarea onchange="cfgItemDesc('${it.id}',this.value)" placeholder="${t('itemDesc')}">${esc(it.desc)}</textarea>
        ${it.ans!=null?`<div class="ans-lbl">${t('ansLbl')}</div><textarea onchange="cfgItemAns('${it.id}',this.value)">${esc(it.ans)}</textarea>`:''}
      </div>`;
    });
    h+=`<div class="cfg-add"><button onclick="addItem('${sec.id}')">${t('addItem')}</button></div>`;
    h+=`</div>`;
  });
  area.innerHTML=h;
}
function cfgSecName(secId,val){const s=cfg.sections.find(s=>s.id===secId);if(s)s.name=val}
function cfgItemName(itemId,val){const it=cfg.items.find(i=>i.id===itemId);if(it)it.name=val}
function cfgItemDesc(itemId,val){const it=cfg.items.find(i=>i.id===itemId);if(it)it.desc=val}
function cfgItemAns(itemId,val){const it=cfg.items.find(i=>i.id===itemId);if(it)it.ans=val}
function addSection(){cfg.sections.push({id:'sec_'+Date.now(),name:t('secName')});buildCfgUI()}
function addItem(secId){
  const id='item_'+Date.now();
  const idxs=cfg.items.map((it,i)=>it.secId===secId?i:-1).filter(i=>i>=0);
  const at=idxs.length?idxs[idxs.length-1]+1:cfg.items.length;
  cfg.items.splice(at,0,{id,secId,name:'',desc:''});
  buildCfgUI();
  setTimeout(()=>{const ins=document.querySelectorAll('.cfg-item input[type="text"]');if(ins.length)ins[ins.length-1].focus()},50);
}
function delSec(secId){if(!confirm('このセクションと全質問を削除しますか？'))return;cfg.sections=cfg.sections.filter(s=>s.id!==secId);cfg.items=cfg.items.filter(it=>it.secId!==secId);buildCfgUI()}
function delItem(itemId){cfg.items=cfg.items.filter(it=>it.id!==itemId);buildCfgUI()}
function moveSec(secId,dir){const i=cfg.sections.findIndex(s=>s.id===secId);if(i<0)return;const j=i+dir;if(j<0||j>=cfg.sections.length)return;[cfg.sections[i],cfg.sections[j]]=[cfg.sections[j],cfg.sections[i]];buildCfgUI()}
function moveItem(itemId,dir){
  const secId=cfg.items.find(it=>it.id===itemId)?.secId;if(!secId)return;
  const secItems=cfg.items.filter(it=>it.secId===secId);
  const li=secItems.findIndex(it=>it.id===itemId);const sj=li+dir;
  if(sj<0||sj>=secItems.length)return;
  const gi=cfg.items.indexOf(secItems[li]),gj=cfg.items.indexOf(secItems[sj]);
  [cfg.items[gi],cfg.items[gj]]=[cfg.items[gj],cfg.items[gi]];buildCfgUI();
}
function saveCfg(){localStorage.setItem(CKEY,JSON.stringify(cfg));buildExamCards();toast(t('cfgSaved'))}
function resetCfg(){if(!confirm(t('cResetCfg')))return;cfg=defaultCfg();localStorage.setItem(CKEY,JSON.stringify(cfg));buildCfgUI();buildExamCards();toast(t('cfgReset'))}

/* ==============================================================
   作業カタログから質問を追加（大項目=作業 → 小項目=質問を選択）
   質問と模範解答は works-qa.js（睦沢pptx由来）から生成する
   ============================================================== */
function openCatalog(){
  let h=`<div class="mh"><h3>${t('catAddTitle')}</h3><button class="mx" onclick="closeMo()">&times;</button></div>`;
  h+=`<div class="catrow"><label>${t('catSelLbl')}</label><select id="catSel" onchange="catPickCat(this.value)"><option value="">${t('selCatPh')}</option>${WORKSQA.categories.map(c=>`<option value="${esc(c.id)}">${esc(qaCatLabel(c.id))}</option>`).join('')}</select></div>`;
  h+=`<div class="catrow"><label>${t('workSelLbl')}</label><select id="workSel2" onchange="catPickWork(this.value)"><option value="">${t('selWorkPh')}</option></select></div>`;
  h+=`<div class="catrow"><label>${t('qaSelLbl')}</label><div id="qaChecks"></div></div>`;
  h+=`<div class="ma"><button class="b b1" style="flex:1" id="btnCatConfirm" onclick="addFromCatalog()">${t('btnCatConfirm')}</button><button class="b b3" style="flex:1" onclick="closeMo()">${t('btnClose')}</button></div>`;
  document.getElementById('moBody').innerHTML=h;
  document.getElementById('modal').classList.add('show');
}
function catPickCat(catId){
  const sel=document.getElementById('workSel2');
  sel.innerHTML=`<option value="">${t('selWorkPh')}</option>`+(catId?qaWorksInCat(catId).map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join(''):'');
  document.getElementById('qaChecks').innerHTML='';
}
function catPickWork(workId){
  const w=qaWorkById(workId),box=document.getElementById('qaChecks');
  if(!w){box.innerHTML='';return}
  box.innerHTML=qaQuestions(w).map(q=>
    `<label class="qa-check"><input type="checkbox" value="${q.key}" checked><div class="qat"><div class="qan">${esc(q.name)}</div><div class="qaq">${esc(q.desc)}</div><div class="qaa">${esc(q.ans)}</div></div></label>`
  ).join('');
}
function addFromCatalog(){
  const w=qaWorkById(document.getElementById('workSel2').value);
  if(!w){toast(t('selWorkPh'),1);return}
  const keys=[...document.querySelectorAll('#qaChecks input:checked')].map(i=>i.value);
  if(!keys.length){toast(t('eNoQa'),1);return}
  // セクションは作業名で再利用（同じ作業を2回追加しても散らからない）
  let sec=cfg.sections.find(s=>s.name===w.name);
  if(!sec){sec={id:'sec_'+w.id+'_'+Date.now(),name:w.name};cfg.sections.push(sec)}
  let added=0;
  qaQuestions(w).filter(q=>keys.includes(q.key)).forEach(q=>{
    if(cfg.items.some(it=>it.secId===sec.id&&it.name===q.name))return; // 同一質問の重複を防ぐ
    cfg.items.push({id:'qa_'+w.id+'_'+q.key+'_'+Date.now(),secId:sec.id,name:q.name,desc:q.desc,ans:q.ans});
    added++;
  });
  localStorage.setItem(CKEY,JSON.stringify(cfg));
  buildCfgUI();buildExamCards();
  closeMo();
  toast(added+t('catAdded'));
}
