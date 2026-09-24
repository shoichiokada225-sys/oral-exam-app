/* ui-hist.js — 履歴（受験者別サマリ・詳細モーダル）とCSV書き出し
   ※ js/ui.js を機械的に分割したもの（プレーンスクリプト・グローバル名は不変）。読み込み順は ui-core → ui-exam → ui-score → ui-hist → ui-chart → ui-cfg */
/* ==============================================================
   履歴
   ============================================================== */
function fmtMonth(ym){const[y,m]=ym.split('-');return lang==='ja'?y+'年'+(+m)+'月':y+'-'+m}
/* 受験者別サマリ（採点済み試問から：回数/最新平均/前回比） */
let _eeSums=[];
function eeSummary(){
  const map={};
  getAll().filter(s=>s.status==='scored').forEach(s=>{(map[s.examinee]=map[s.examinee]||[]).push(s)});
  return Object.keys(map).sort().map(n=>{
    const arr=map[n].sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.createdAt||'').localeCompare(b.createdAt||''));
    // 合否採点のある試問だけで比較（旧5段階のみの試問は合格率を出せない）
    const pf=arr.filter(x=>!isNaN(passRate(x)));
    // 旧5段階のみの受験者もカードは出す（合格率の対象外と明示）
    if(!pf.length){const lo=arr[arr.length-1];return oldCount(lo)?{name:n,count:arr.length,oldOnly:true,lastLbl:resLbl(lo),lastCls:'old'}:null}
    // 前回比は同じ出題（試問セット）どうしだけ（R4：問題の違う試問を比べて「下がった」と見せない）
    const lr=pf[pf.length-1],same=pf.slice(0,-1).filter(x=>setKey(x)===setKey(lr)),pr=same.length?same[same.length-1]:null;
    const lbl=x=>oldCount(x)?resLbl(x):pfBrief(x); // 「合格 1/2」を全体の合格と読ませない：○×の数と出題数で出す
    return{name:n,count:arr.length,last:passRate(lr),lastLbl:lbl(lr),lastCls:resCls(lr),prev:pr?passRate(pr):null,prevLbl:pr?lbl(pr):'',mixed:!!(oldCount(lr)||(pr&&oldCount(pr))),setName:setLbl(lr)};
  }).filter(Boolean);
}
function eeFilterIdx(i){const s=_eeSums[i];if(!s)return;const hf=document.getElementById('hFil');hf.value=s.name;drawHist()}
function eeSummaryHtml(filterName){
  _eeSums=eeSummary();
  let sums=_eeSums.map((s,i)=>({...s,idx:i}));
  if(filterName)sums=sums.filter(s=>s.name===filterName);
  if(!sums.length)return'';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">`+sums.map(s=>{
    const arrow=(s.oldOnly||s.prev==null)?'':s.last>s.prev?'▲':s.last<s.prev?'▼':'→';
    const col=arrow==='▲'?'var(--s4)':arrow==='▼'?'var(--s1)':'var(--sub)';
    return `<button type="button" class="cd" style="flex:1 1 150px;min-width:140px;text-align:left;cursor:pointer;padding:10px 12px;margin:0" onclick="eeFilterIdx(${s.idx})">
      <div style="font-weight:700;font-size:.9rem">${esc(s.name)}</div>
      <div style="font-size:.74rem;color:var(--sub)">${s.count}${esc((s.count===1&&(TX2[lang]||{}).sumTimes1)||t2('sumTimes'))}${s.setName?' · '+esc(t2('examSetLbl'))+': '+esc(s.setName):''}</div>
      <div class="eelast" style="font-size:${s.oldOnly?'.9rem':'1.05rem'};font-weight:800;margin-top:2px"><span class="${s.lastCls}">${esc(s.lastLbl)}</span>${arrow?` <span style="font-size:.8rem;font-weight:700;color:${col}">${arrow} ${esc(t2('prevLbl'))} ${esc(s.prevLbl)}</span>`:''}</div>
      ${s.oldOnly?`<div class="eenote">${esc(t2('oldOnly'))}</div>`:s.mixed?`<div class="eenote">${esc(t2('mixNote'))}</div>`:''}
    </button>`;
  }).join('')+'</div>';
}
function drawHist(){
  const f=document.getElementById('hFil').value;let all=getAll();if(f)all=all.filter(e=>e.examinee===f);
  const q=(document.getElementById('hQ').value||'').trim().toLowerCase();
  if(q)all=all.filter(e=>((e.examinee||'')+' '+(e.examiner||'')).toLowerCase().includes(q));
  all.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
  const c=document.getElementById('hList');
  const none=!getAll().length; // データ0件（新しい端末など）→CSVは押せなくし、次の手を示す
  const cb=document.getElementById('hCsv');if(cb){cb.disabled=none;cb.setAttribute('aria-disabled',none?'true':'false')}
  if(none){c.innerHTML=`<div class="nd">${emptyGuideHtml(true)}</div>`;return}
  if(!all.length){c.innerHTML=`<div class="nd">${t('noData')}</div>`;return}
  let h=q?'':eeSummaryHtml(f),pm='';
  all.forEach(r=>{
    const ym=(r.date||'').slice(0,7);
    if(ym&&ym!==pm){h+=`<div class="mgrp">${esc(fmtMonth(ym))}</div>`;pm=ym}
    const x=rowRes(r);
    h+=`<button type="button" class="hi" onclick="showDet('${sanitizeId(r.id)}')"><span class="hii"><span class="hid">${esc(r.date)} · ${t('erLbl')}: ${esc(r.examiner)} · <span class="hset">${esc(setLbl(r))}</span></span><span class="hin">${esc(r.examinee)}</span>${x.badge}</span><span class="hia ${x.cls}">${esc(x.lbl)}</span></button>`;
  });
  c.innerHTML=h;
}

async function showDet(id){
  const r=getAll().find(e=>e.id===id);if(!r)return;
  releaseScoreUrls();
  // cfg変更後も過去項目が消えないよう「cfg ∪ セッション自身のキー」で走査、名前はスナップショット優先
  const ids=sessItemIds(r);
  let h=`<div class="mh"><h2 id="moTitle">${esc(r.examinee)} - ${esc(r.date)}</h2><button class="mx" aria-label="${t('btnClose')}" onclick="closeMo()">&times;</button></div>`;
  h+=`<div style="font-size:.85rem;color:var(--sub);margin-bottom:12px">${t('erLbl')}: ${esc(r.examiner)} · ${esc(t2('examSetLbl'))}: ${esc(setLbl(r))} · ${esc(resHead(r))}: ${esc(r.status==='scored'?resLbl(r):pendLbl(r)||'-')}${unaskedCount(r)?' · '+esc(t2('unaskedN').replace('{u}',unaskedCount(r))):''}</div>`;
  ids.forEach(iid=>{
    const rec=r.items[iid]||{};
    if(!rec.hasAudio&&rec.score==null&&!rec.transcript)return;
    const sc=rec.score;
    const m=itemMeta(r,iid);
    h+=`<div class="di"><div class="dih"><span class="din">${esc(m.name)}</span>${sc!=null?`<span class="dis ${isPF(sc)?'pf-'+sc:'old'}">${esc(scoreTxt(sc))}</span>`:''}</div>`;
    if(rec.hasAudio)h+=`<audio id="da-${iid}" controls></audio>`;
    // ドライブへ届いていない録音：履歴からも分かり・再送できるように
    if(rec.hasAudio&&typeof isUnsent==='function'&&isUnsent(r,iid))h+=`<button type="button" class="cloud" id="dcl-${sanitizeId(iid)}" data-sid="${esc(r.id)}" onclick="resendDrive('${sanitizeId(r.id)}','${sanitizeId(iid)}')" style="display:block;background:none;border:0;padding:0;margin-top:6px;font:inherit;font-size:.78rem;font-weight:700;color:${driveNoAudio(rec)?'var(--sub)':'var(--s1)'};cursor:${driveNoAudio(rec)?'default':'pointer'};text-align:left"${driveNoAudio(rec)?' disabled':''} title="${esc(driveErrText(rec))}">${unsentHtml(rec,t2('drvUnsent'))}</button>`;
    // ドライブに残った旧名のファイル（名前の訂正で送り直した録音）。送り直しが後で終わったら showCloud が差し替える
    if(rec.hasAudio)h+=`<div id="dor-${sanitizeId(iid)}" data-sid="${esc(r.id)}">${typeof orphanHtml==='function'?orphanHtml(rec):''}</div>`;
    if(rec.transcript)h+=`<div class="ditr">${esc(rec.transcript)}</div>`;
    if(rec.comment)h+=`<div class="dic">${esc(rec.comment)}</div>`;
    h+=`</div>`;
  });
  if(r.overall)h+=`<div class="dov"><strong>${t('ovLbl')}:</strong><br>${esc(r.overall)}</div>`;
  // 試問当日の運用：途中で中断した試問の続きを録る／受験者名・試問者名の表記を直す
  h+=`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">${typeof resumeBtnHtml==='function'?resumeBtnHtml(r,'mo'):''}<button type="button" class="b b3" id="rnBtn" style="flex:1 1 140px" onclick="renameForm('${sanitizeId(r.id)}')">✎ ${esc(t2('rnBtn'))}</button></div>`;
  h+=`<div class="ma"><button class="b b4" style="flex:1" onclick="closeMo();gotoScore('${sanitizeId(r.id)}')">${t('btnScore')}</button><button class="b b2" style="flex:1" onclick="doDel('${sanitizeId(r.id)}')">${t('btnDel')}</button><button class="b b3" style="flex:1" onclick="closeMo()">${t('btnClose')}</button></div>`;
  document.getElementById('moBody').innerHTML=h;
  moShow();
  for(const iid of ids){
    if(r.items[iid]&&r.items[iid].hasAudio){
      await attachAudio(r.id+'_'+iid,document.getElementById('da-'+iid),curScoreUrls);
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
/* モーダルを開く（開いた要素を記憶し、閉じるボタンへフォーカス移動） */
let moOpener=null;
/* モーダル表示中は背後（ヘッダー・本文・タブ）を inert にして、読み上げのスワイプ操作でも背後へ移れないようにする
   （inert 非対応ブラウザでは aria-hidden で読み上げ対象から外す） */
function moSetBackdrop(on){
  document.querySelectorAll('body>header,body>main,body>nav.tabs').forEach(el=>{
    if('inert' in el)el.inert=on;
    if(on)el.setAttribute('aria-hidden','true');else el.removeAttribute('aria-hidden');
  });
}
function moShow(){
  moOpener=document.activeElement;
  const mb=document.getElementById('moBody');
  if(mb&&document.getElementById('moTitle'))mb.setAttribute('aria-labelledby','moTitle');
  moSetBackdrop(true);
  document.getElementById('modal').classList.add('show');
  const mx=document.querySelector('#moBody .mx');
  if(mx)setTimeout(()=>mx.focus(),60);
}
function closeMo(){
  document.getElementById('modal').classList.remove('show');
  moSetBackdrop(false); // フォーカスを戻す前に背後の inert を外す（inert の要素へは focus できない）
  releaseScoreUrls();
  if(moOpener&&moOpener.isConnected&&moOpener.focus)moOpener.focus();
  moOpener=null;
}
function doDel(id){
  if(!confirm(t('cDel')))return;
  // セッション自身のキーで削除（cfg変更後でも旧項目の音声がIndexedDBに孤児残留しない）
  // 先に一覧から外す。保存に失敗したら（容量不足等）録音も消さない＝履歴に残るのに音声だけ無い状態を作らない
  const r=getAll().find(e=>e.id===id);
  if(!saveAll(getAll().filter(e=>e.id!==id)))return;
  if(r)Object.keys(r.items||{}).forEach(k=>delAudio(id+'_'+k));
  closeMo();drawHist();refreshSel();
  if(document.getElementById('pgScore').classList.contains('on'))drawScoreList();
  toast(t('tDel'));
}

/* ==============================================================
   CSV
   ============================================================== */
function doCSV(){
  const all=getAll();if(!all.length){toast(t('noData'),1);return}
  // 列=現在のcfg項目 ∪ 全セッションの項目キー（cfg変更後も過去の点・文字起こしが列から消えない）
  const cols=[];const seen=new Set();
  getItems().forEach(it=>{if(!seen.has(it.id)){seen.add(it.id);cols.push({id:it.id,name:loc(it,'name')})}});
  all.forEach(r=>Object.keys(r.items||{}).forEach(id=>{
    if(!seen.has(id)&&safeKey(id)){seen.add(id);cols.push({id,name:itemMeta(r,id).name})}
  }));
  // ヘッダーはUI言語に追従（CSVは書き出し専用＝再取り込みしないため後方互換の懸念なし）
  const hd=[t('labelDate'),t('labelExaminer'),t('labelExaminee'),t2('qsTitle'),t('csvStatus'),...cols.map(c=>c.name+'('+t2('pfLbl')+')'),...cols.map(c=>c.name+'('+t('trLbl')+')'),...cols.map(c=>c.name+'('+t('csvCmt')+')'),t2('csvPass'),t('overall'),t('csvCreated')];
  // 数式インジェクション対策：=,+,-,@ 等で始まる値は先頭に ' を付ける
  const cell=s=>{let v=String(s==null?'':s);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
  let csv='﻿'+hd.map(cell).join(',')+'\n';
  all.forEach(r=>{
    const row=[r.date,r.examiner,r.examinee,setLbl(r),r.status==='scored'?t('stScored'):t('stRec'),
      ...cols.map(c=>{const v=r.items[c.id]&&r.items[c.id].score;return v==null?'':scoreTxt(v)}),
      ...cols.map(c=>(r.items[c.id]&&r.items[c.id].transcript)||''),
      ...cols.map(c=>(r.items[c.id]&&r.items[c.id].comment)||''),
      r.status==='scored'?resLbl(r):pendLbl(r),r.overall||'',r.createdAt||''];
    csv+=row.map(cell).join(',')+'\n';
  });
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download='oral_exam_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000); // 書き出しの度にBlobが端末メモリへ残るのを防ぐ（exportBackupと同じ後始末）
}
