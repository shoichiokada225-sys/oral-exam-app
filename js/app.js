/* app.js — アプリ層：初期化・タブ・セッションフロー・項目設定の保存 */
/* ==============================================================
   言語
   ============================================================== */
function setLang(l){
  if(active){toast(t('recStop'),1);return} // 録音中は切替不可（カード再描画でUIが壊れるため）
  lang=l;localStorage.setItem(LKEY,l);document.documentElement.lang=l;
  document.querySelectorAll('.lsw button').forEach(b=>b.classList.toggle('on',b.textContent.trim()==={ja:'JP',en:'EN',vi:'VI',id:'ID'}[l]));
  applyT();buildExamCards();buildCfgUI();
  // 開いている採点画面・一覧を再描画（入力中の採点は退避してから再描画）
  if(document.getElementById('pgScore').classList.contains('on')){if(curScore){captureScoreForm();renderScoreDetail(curScore)}else{drawScoreList()}}
}
function applyT(){
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t)});
  document.querySelectorAll('[data-ph]').forEach(el=>{el.placeholder=t(el.dataset.ph)});
}

/* ==============================================================
   初期化
   ============================================================== */
document.addEventListener('DOMContentLoaded',()=>{
  restoreDraftOrNew();
  document.getElementById('fDate').value=cur.date||new Date().toISOString().split('T')[0];
  document.getElementById('fEr').value=cur.examiner||'';
  document.getElementById('fEe').value=cur.examinee||'';
  ['fDate','fEr','fEe'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{if(cur){cur.date=document.getElementById('fDate').value;cur.examiner=document.getElementById('fEr').value;cur.examinee=document.getElementById('fEe').value;saveDraft()}}));
  const s=getStt();
  document.getElementById('sttEndpoint').value=s.endpoint||'';
  document.getElementById('sttModel').value=s.model||'';
  document.getElementById('sttKey').value=s.key||'';
  const gImported=applyUrlConfig();
  setLang(lang);
  if(gImported)setTimeout(()=>toast(t('gCfgSaved')),400);
  window.addEventListener('beforeunload',e=>{if(active){e.preventDefault();e.returnValue=''}});
  // PWA: オフライン利用・ホーム画面インストール（https/localhostのみ。file://直開きでは何もしない）
  if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
});

function newSession(){
  cur={id:crypto.randomUUID(),date:new Date().toISOString().split('T')[0],examiner:'',examinee:'',items:{},overall:'',status:'rec',createdAt:new Date().toISOString()};
}
function restoreDraftOrNew(){
  try{
    const d=JSON.parse(localStorage.getItem(DRAFTKEY));
    // 録音済み項目を含む下書きのみ復元（保存済みセッションと重複しないもの）
    if(d&&d.id&&d.items&&Object.values(d.items).some(x=>x&&x.hasAudio)&&!getAll().some(s=>s.id===d.id)){cur=d;return}
  }catch(e){}
  newSession();
}
function saveDraft(){if(cur)localStorage.setItem(DRAFTKEY,JSON.stringify(cur))}

/* ==============================================================
   試問の保存・リセット
   ============================================================== */
async function saveSession(){
  if(active)await stopRec();
  cur.date=document.getElementById('fDate').value;
  cur.examiner=document.getElementById('fEr').value.trim();
  cur.examinee=document.getElementById('fEe').value.trim();
  if(!cur.examiner||!cur.examinee){toast(t('eNm'),1);return}
  if(!cur.date){toast(t('eDt'),1);return}
  const recd=getItems().some(it=>cur.items[it.id]&&cur.items[it.id].hasAudio);
  if(!recd){toast(t('eNoRec'),1);return}
  const all=getAll();
  const idx=all.findIndex(s=>s.id===cur.id);
  cur.updatedAt=new Date().toISOString();
  if(idx>=0)all[idx]=cur;else all.push(cur);
  saveAll(all);
  localStorage.removeItem(DRAFTKEY);
  toast(t('tSaved'));
  newSession();
  document.getElementById('fEr').value='';document.getElementById('fEe').value='';
  document.getElementById('fDate').value=new Date().toISOString().split('T')[0];
  buildExamCards();refreshSel();
}
async function resetExam(){
  if(!confirm(t('cReset')))return;
  if(active)await stopRec();
  // 未保存セッションの音声を破棄
  const saved=getAll().some(s=>s.id===cur.id);
  if(!saved)getItems().forEach(it=>{if(cur.items[it.id]&&cur.items[it.id].hasAudio)delAudio(cur.id+'_'+it.id)});
  newSession();
  document.getElementById('fEr').value='';document.getElementById('fEe').value='';
  document.getElementById('fDate').value=new Date().toISOString().split('T')[0];
  localStorage.removeItem(DRAFTKEY);
  buildExamCards();
  toast(t('tReset'));
}

/* ==============================================================
   タブ切替
   ============================================================== */
function swTab(btn){
  if(active){toast(t('recStop'),1);return}
  if(curScore)persistScoreDraft(false); // 採点途中の入力をタブ移動前に自動退避
  document.querySelectorAll('.tabs button').forEach(b=>b.classList.remove('on'));btn.classList.add('on');
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('on'));
  document.getElementById(btn.dataset.pg).classList.add('on');
  releaseScoreUrls();
  if(btn.dataset.pg==='pgScore'){curScore=null;document.getElementById('scDetail').style.display='none';document.querySelector('#pgScore .hctrl').style.display='flex';drawScoreList()}
  if(btn.dataset.pg==='pgHi'){refreshSel();drawHist()}
  if(btn.dataset.pg==='pgCh'){refreshSel();drawCharts()}
  if(btn.dataset.pg==='pgCfg'){buildCfgUI();const s=getStt();document.getElementById('sttEndpoint').value=s.endpoint||'';document.getElementById('sttModel').value=s.model||'';document.getElementById('sttKey').value=s.key||'';const g=getGoogleCfg();document.getElementById('gUrl').value=g.url||'';document.getElementById('gToken').value=g.token||'';document.getElementById('gFolder').value=g.folder||'';document.getElementById('gAuto').checked=!!g.auto;updateGoogleStatus()}
}
function refreshSel(){
  const ns=[...new Set(getAll().map(e=>e.examinee))].sort();
  const hf=document.getElementById('hFil'),hv=hf.value;
  hf.innerHTML=`<option value="">${t('filterAllEe')}</option>`+ns.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');hf.value=hv;
  const cs=document.getElementById('chSel'),cv=cs.value;
  cs.innerHTML=`<option value="">${t('selPh')}</option>`+ns.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');cs.value=cv;
}

let cur=null;            // 現在編集中の試問セッション（試問タブ）
let active=null;         // 録音中の状態 {itemId,mr,stream,chunks,rec,draft,timer,t0}
let curScore=null;       // 採点中のセッション
let curScoreUrls=[];     // 採点画面で作成したObjectURL（破棄用）
let examUrls=[];         // 試問画面で作成したObjectURL（破棄用）
