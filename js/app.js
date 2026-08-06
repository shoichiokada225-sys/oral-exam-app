/* app.js — アプリ層：初期化・タブ・セッションフロー・項目設定の保存 */
/* ==============================================================
   言語
   ============================================================== */
function setLang(l){
  if(active){toast(t('recStop'),1);return} // 録音中は切替不可（カード再描画でUIが壊れるため）
  lang=l;localStorage.setItem(LKEY,l);document.documentElement.lang=l;
  document.querySelectorAll('.lsw button').forEach(b=>{const on=b.textContent.trim()==={ja:'JP',en:'EN',vi:'VI',id:'ID'}[l];b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false')});
  applyT();buildExamCards();buildCfgUI();
  // 開いている採点画面・一覧を再描画（入力中の採点は退避してから再描画）
  if(document.getElementById('pgScore').classList.contains('on')){if(curScore){captureScoreForm();renderScoreDetail(curScore)}else{drawScoreList()}}
}
function applyT(){
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t)});
  document.querySelectorAll('[data-ph]').forEach(el=>{el.placeholder=t(el.dataset.ph)});
  // 言語に追従するアクセシブルネーム
  const nav=document.getElementById('mainNav');if(nav)nav.setAttribute('aria-label',t('navMain'));
  const hq=document.getElementById('hQ');if(hq)hq.setAttribute('aria-label',t('searchPh'));
  const sf=document.getElementById('scFil');if(sf)sf.setAttribute('aria-label',t('alFilter'));
  const hf=document.getElementById('hFil');if(hf)hf.setAttribute('aria-label',t('alFilter'));
  const tb=document.getElementById('thBtn');if(tb&&typeof theme!=='undefined'){const lbl=t(theme==='auto'?'thAuto':theme==='light'?'thLight':'thDark');tb.title=lbl;tb.setAttribute('aria-label',lbl)}
}

/* ==============================================================
   テーマ（自動→ライト→ダークの3段切替。localStorageに保存）
   ============================================================== */
const TKEY='oral_exam_theme';
let theme=localStorage.getItem(TKEY)||'auto';
const THICONS={
  auto:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>',
  light:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8"/></svg>',
  dark:'<svg viewBox="0 0 24 24"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>'
};
function applyTheme(mode){
  if(mode==='auto')delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme=mode;
  const b=document.getElementById('thBtn');
  if(b){b.innerHTML=THICONS[mode];const lbl=t(mode==='auto'?'thAuto':mode==='light'?'thLight':'thDark');b.title=lbl;b.setAttribute('aria-label',lbl)}
  // アドレスバー色をテーマに追従
  const dark=mode==='dark'||(mode==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach(m=>{
    if(mode==='auto')m.content=(m.media||'').includes('dark')?'#132c3d':'#2e5d7d';
    else m.content=dark?'#132c3d':'#2e5d7d';
  });
  // グラフはCSS変数を描画時に読むため引き直す
  if(document.getElementById('pgCh').classList.contains('on'))drawCharts();
}
function cycleTheme(){
  theme={auto:'light',light:'dark',dark:'auto'}[theme]||'auto';
  localStorage.setItem(TKEY,theme);
  applyTheme(theme);
  toast(document.getElementById('thBtn').title);
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
  document.addEventListener('keydown',e=>{
    const mo=document.getElementById('modal');
    if(!mo.classList.contains('show'))return;
    if(e.key==='Escape'){closeMo();return}
    // フォーカストラップ（Tabをモーダル内で循環させる）
    if(e.key==='Tab'){
      const f=[...mo.querySelectorAll('button,select,input,textarea,audio,[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
      if(!f.length)return;
      const first=f[0],last=f[f.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}
      else if(!mo.contains(document.activeElement)){e.preventDefault();first.focus()}
    }
  });
  applyTheme(theme);
  // OSのライト/ダーク切替に合わせてメタ色・グラフ配色を引き直す（自動モード時）
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>applyTheme(theme))}catch(e){}
  // オフライン/復帰の通知（現場の電波切れでも記録は端末内に残ることを伝える）
  window.addEventListener('offline',()=>toast(t('tOffline'),1));
  window.addEventListener('online',()=>toast(t('tOnline')));
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
