/* store.js — 永続化層：localStorage/IndexedDB・セッション・バックアップ */
/* ==============================================================
   グローバル状態・キー
   ============================================================== */
const SKEY='oral_exam_sessions_v1';
const CKEY='oral_exam_items_v1';
const STTKEY='oral_exam_stt_v1';
const GKEY='oral_exam_google_v1';
const DRAFTKEY='oral_exam_draft_v1';
const PSKEY='oral_exam_presets_v1';   // 質問セット（名前付きcfgスナップショット）。CKEYは常に「アクティブな実体」
const EKEY='oral_exam_last_examiner'; // 前回の試問者名（入力初期値）
const DBNAME='oralExamDB',STORE='audio';

let cfg=loadCfg();

/* 多層防御: cfgのid/secIdはonclick属性・DOM idへ埋め込まれるため、読み込み時にも無害化する
   （importBackup/applySet/applyQbankの上流無害化に一点依存しない。正常なIDは全て英数_-のみ＝実質不変） */
function sanitizeLoadedCfg(c){
  if(!c||!Array.isArray(c.sections)||!Array.isArray(c.items))return defaultCfg();
  c.sections.forEach(s=>{s.id=sanitizeId(s.id)});
  c.items.forEach(it=>{it.id=sanitizeId(it.id);it.secId=sanitizeId(it.secId)});
  return c;
}
function loadCfg(){try{const r=localStorage.getItem(CKEY);return r?sanitizeLoadedCfg(JSON.parse(r)):defaultCfg()}catch{return defaultCfg()}}
/* 多言語の任意フィールド（name_en / desc_vi 等）を文字列化して安全にコピー。
   importBackup/applySetの無害化取り込みで翻訳を落とさないための共通ヘルパー（後方互換: 無ければ何もしない） */
function copyLocFields(src,dst,keys){
  if(src&&typeof src==='object')keys.forEach(k=>['en','vi','id'].forEach(l=>{const f=k+'_'+l;if(src[f]!=null&&src[f]!=='')dst[f]=String(src[f])}));
  return dst;
}
function getItems(){return cfg.items}
function getSections(){return cfg.sections}
function getAll(){try{const r=localStorage.getItem(SKEY);return r?JSON.parse(r).sessions||[]:[]}catch{return[]}}
/* QuotaExceeded等で採点が無言で消えないよう、書込失敗は必ずToastで知らせる */
function saveAll(arr){try{localStorage.setItem(SKEY,JSON.stringify({sessions:arr}))}catch(e){toast(t2('storeFail'),1)}}
function getStt(){try{return JSON.parse(localStorage.getItem(STTKEY))||{}}catch{return{}}}
function getGoogleCfg(){try{return JSON.parse(localStorage.getItem(GKEY))||{}}catch{return{}}}
/* 質問セット（名前付きセット）。形状: {presets:[{id,name,cfg}],activeId} */
function getQuestionSets(){try{return JSON.parse(localStorage.getItem(PSKEY))||{presets:[],activeId:null}}catch{return{presets:[],activeId:null}}}
function saveQuestionSets(q){try{localStorage.setItem(PSKEY,JSON.stringify(q))}catch(e){toast(t2('storeFail'),1)}}

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
   集計・セッション項目の走査
   設定で質問を削除/差替えても、過去セッションの点数・録音・文字起こしが
   平均/CSV/履歴/バックアップから消えないよう、走査は
   「現在のgetItems() ∪ session.itemsのキー」で行う。
   表示名はセッション保存時のスナップショット(s.meta)優先→cfgフォールバック。
   ============================================================== */
/* onclick属性・DOM idへ埋め込んでも安全なキーのみ許可（バックアップ由来の注入対策） */
function safeKey(id){return /^[A-Za-z0-9_-]+$/.test(String(id))}
/* セッションを軸にした項目IDの全集合（cfg順→セッションのみに残る旧項目） */
function sessItemIds(r){
  const out=getItems().map(it=>it.id);
  const seen=new Set(out);
  Object.keys((r&&r.items)||{}).forEach(id=>{if(!seen.has(id)&&safeKey(id))out.push(id)});
  return out;
}
/* 項目メタ（名前・セクション名）。スナップショット優先→cfg→ID */
function itemMeta(r,id){
  const m=r&&r.meta&&r.meta[id];
  if(m&&m.name)return{name:m.name,sec:m.sec||''};
  const it=getItems().find(x=>x.id===id);
  if(it){const sec=getSections().find(s=>s.id===it.secId);return{name:it.name,sec:sec?sec.name:''}}
  return{name:id,sec:''};
}
/* セッション保存時に項目名スナップショットを追記（既存フィールド不変・追記のみ＝後方互換） */
function snapMeta(s){
  if(!s||!s.items)return;
  const m=s.meta||{};
  getItems().forEach(it=>{
    if(s.items[it.id]){
      const sec=getSections().find(x=>x.id===it.secId);
      m[it.id]={name:it.name,sec:sec?sec.name:''};
    }
  });
  s.meta=m;
}
function scoredVals(r){return sessItemIds(r).map(id=>r.items[id]&&r.items[id].score).filter(x=>x!=null)}
function avg(r){const v=scoredVals(r);return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):'-'}

/* ==============================================================
   孤児音声GC（どのセッションにも属さないIndexedDBの録音を削除）
   起動時に呼ばれる。削除前に件数を確認してから実行する。
   ============================================================== */
async function gcOrphanAudio(){
  try{
    const db=await openDB();
    const keys=await new Promise((res,rej)=>{const rq=db.transaction(STORE,'readonly').objectStore(STORE).getAllKeys();rq.onsuccess=()=>res(rq.result||[]);rq.onerror=()=>rej(rq.error)});
    if(!keys.length)return;
    const valid=new Set();
    getAll().forEach(s=>Object.keys(s.items||{}).forEach(k=>valid.add(s.id+'_'+k)));
    if(typeof cur!=='undefined'&&cur)Object.keys(cur.items||{}).forEach(k=>valid.add(cur.id+'_'+k));
    const orphans=keys.filter(k=>!valid.has(k));
    if(!orphans.length)return;
    if(!confirm(t2('gcConfirm').replace('{n}',orphans.length)))return;
    for(const k of orphans)await delAudio(k);
    toast(orphans.length+t2('gcDone'));
  }catch(e){}
}

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
      // cfg変更後でも旧項目の音声が漏れないよう、セッション自身のキーで走査する
      for(const key of Object.keys(s.items||{})){
        if(s.items[key]&&s.items[key].hasAudio){
          const b=await getAudio(s.id+'_'+key);
          if(b)audio[s.id+'_'+key]={mime:b.type,data:await blobToB64(b)};
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
        cfg={sections:bk.cfg.sections.map(s=>copyLocFields(s,{id:sanitizeId(s.id),name:String(s.name||'')},['name'])),
             items:bk.cfg.items.map(it=>{
               const o={id:sanitizeId(it.id),secId:sanitizeId(it.secId),name:String(it.name||''),desc:String(it.desc||'')};
               if(it.ans!=null)o.ans=String(it.ans);
               return copyLocFields(it,o,['name','desc','ans']);
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
