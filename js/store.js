/* store.js — 永続化層：localStorage/IndexedDB・セッション・バックアップ */
/* ==============================================================
   グローバル状態・キー
   ============================================================== */
const SKEY='oral_exam_sessions_v1';
const CKEY='oral_exam_items_v1';
const STTKEY='oral_exam_stt_v1';
const GKEY='oral_exam_google_v1';
const DRAFTKEY='oral_exam_draft_v1';
const DBNAME='oralExamDB',STORE='audio';

let cfg=loadCfg();

function loadCfg(){try{const r=localStorage.getItem(CKEY);return r?JSON.parse(r):defaultCfg()}catch{return defaultCfg()}}
function getItems(){return cfg.items}
function getSections(){return cfg.sections}
function getAll(){try{const r=localStorage.getItem(SKEY);return r?JSON.parse(r).sessions||[]:[]}catch{return[]}}
function saveAll(arr){localStorage.setItem(SKEY,JSON.stringify({sessions:arr}))}
function getStt(){try{return JSON.parse(localStorage.getItem(STTKEY))||{}}catch{return{}}}
function getGoogleCfg(){try{return JSON.parse(localStorage.getItem(GKEY))||{}}catch{return{}}}

/* ==============================================================
   IndexedDB（音声Blob保存）
   ============================================================== */
let _db=null;
function openDB(){
  return new Promise((res,rej)=>{
    if(_db)return res(_db);
    const r=indexedDB.open(DBNAME,1);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE)};
    r.onsuccess=()=>{_db=r.result;res(_db)};
    r.onerror=()=>rej(r.error);
  });
}
async function putAudio(key,blob){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(blob,key);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function getAudio(key){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).get(key);rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>rej(rq.error)})}
async function delAudio(key){const db=await openDB();return new Promise((res)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=()=>res();tx.onerror=()=>res()})}

/* ==============================================================
   集計
   ============================================================== */
function scoredVals(r){return getItems().map(it=>r.items[it.id]&&r.items[it.id].score).filter(x=>x!=null)}
function avg(r){const v=scoredVals(r);return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):'-'}

/* ==============================================================
   データの引き継ぎ（バックアップ／復元）
   APIキーは含めない。音声はbase64で同梱。
   ============================================================== */

async function exportBackup(){
  const btn=document.getElementById('bkExportBtn');const old=btn.textContent;btn.disabled=true;btn.textContent=t('bkExporting');
  try{
    const sessions=getAll();
    const audio={};
    for(const s of sessions){
      for(const it of getItems()){
        if(s.items[it.id]&&s.items[it.id].hasAudio){
          const b=await getAudio(s.id+'_'+it.id);
          if(b)audio[s.id+'_'+it.id]={mime:b.type,data:await blobToB64(b)};
        }
      }
    }
    const backup={app:'oral-exam-app',version:1,exportedAt:new Date().toISOString(),cfg,sessions,audio};
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([JSON.stringify(backup)],{type:'application/json'}));
    a.download='oral_exam_backup_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.json';
    a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    toast(t('bkExported'));
  }catch(e){toast(t('bkFail')+'（'+e.message+'）',1)}
  finally{btn.disabled=false;btn.textContent=old}
}

function importBackup(input){
  const file=input.files&&input.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=async()=>{
    let bk;
    try{bk=JSON.parse(reader.result)}catch(e){toast(t('bkBadFile'),1);input.value='';return}
    if(!bk||bk.app!=='oral-exam-app'||!Array.isArray(bk.sessions)){toast(t('bkBadFile'),1);input.value='';return}
    if(!confirm(t('bkConfirm'))){input.value='';return}
    try{
      // 音声を復元（キー形式を検証してから書き込む）
      if(bk.audio){for(const k in bk.audio){if(!/^[\w-]+_[\w-]+$/.test(k))continue;const a=bk.audio[k];await putAudio(k,b64ToBlob(a.data,a.mime))}}
      // セッションを統合（idで突き合わせ、updatedAtが新しい方を採用）
      // idはonclick属性に埋め込まれるため、不正な形式のセッションは取り込まない
      const okSess=s=>s&&typeof s==='object'&&typeof s.id==='string'&&/^[\w-]+$/.test(s.id)&&s.items&&typeof s.items==='object';
      const cur2=getAll();const map={};cur2.forEach(s=>map[s.id]=s);
      let added=0;
      bk.sessions.filter(okSess).forEach(s=>{
        const ex=map[s.id];
        if(!ex){map[s.id]=s;added++;}
        else if((s.updatedAt||'')>(ex.updatedAt||'')){map[s.id]=s;added++;}
      });
      saveAll(Object.values(map));
      // 試問項目はインポート側を採用（採点との整合のため）。ID・文字列を無害化して取り込む
      if(bk.cfg&&Array.isArray(bk.cfg.sections)&&Array.isArray(bk.cfg.items)){
        cfg={sections:bk.cfg.sections.map(s=>({id:sanitizeId(s.id),name:String(s.name||'')})),
             items:bk.cfg.items.map(it=>{
               const o={id:sanitizeId(it.id),secId:sanitizeId(it.secId),name:String(it.name||''),desc:String(it.desc||'')};
               if(it.ans!=null)o.ans=String(it.ans);
               return o;
             })};
        localStorage.setItem(CKEY,JSON.stringify(cfg));
      }
      buildExamCards();buildCfgUI();refreshSel();
      toast(added+t('bkImported'));
    }catch(e){toast(t('bkFail')+'（'+e.message+'）',1)}
    input.value='';
  };
  reader.onerror=()=>{toast(t('bkFail'),1);input.value=''};
  reader.readAsText(file);
}
