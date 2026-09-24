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
/* 録音中の一時保存（1秒ごとに追記。停止して正式キー session.id+'_'+itemId に書けたら消す）。
   正式キーとは接頭辞で区別する＝既存の録音キー・保存形式は不変。孤児音声GCの対象外 */
const LIVEPFX='live__';

let cfg=loadCfg();
/* 2026-09-23 既定を3問（健康観察・消毒・異常報告）へ変更：使用中の端末も起動時に一度だけ3問へ切り替える。
   過去の試問データ（sessions）と録音には触らない＝履歴・CSVには旧項目がスナップショット名で残る */
const MIG3KEY='oral_exam_cfg3_migrated';
(function(){try{
  if(localStorage.getItem(MIG3KEY))return;
  cfg=defaultCfg();
  localStorage.setItem(CKEY,JSON.stringify(cfg));
  const qs=getQuestionSets();if(qs.activeId){qs.activeId=null;localStorage.setItem(PSKEY,JSON.stringify(qs))}
  localStorage.setItem(MIG3KEY,'1');
}catch(e){}})();

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
/* QuotaExceeded等で採点が無言で消えないよう、書込失敗は必ずToastで知らせる。
   戻り値: 成功=true／失敗=false（呼び出し側は失敗時に下書き削除・画面遷移をしないこと） */
function saveAll(arr){try{localStorage.setItem(SKEY,JSON.stringify({sessions:arr}));return true}catch(e){toast(t2('storeFail'),1);return false}}
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
/* liveKey を渡すと、正式キーへの保存と同じトランザクションで一時保存の見出しに「正式キーへ保存済み（done）」の印を付ける。
   一時保存を消すのは、呼び出し側が試問の記録（hasAudio）を保存した後（delLive）。
   ＝その間に落ちても録音は失われず（見出しが残る）、次の起動の復元は印を見て「もう一度つなぐ」をしない */
async function putAudio(key,blob,liveKey){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE);os.put(blob,key);
  if(liveKey){const g=os.get(liveKey);g.onsuccess=()=>{const h=g.result;if(h&&typeof h==='object')os.put(Object.assign({},h,{done:true,doneKey:key}),liveKey)}}
  tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)})}
async function getAudio(key){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const rq=tx.objectStore(STORE).get(key);rq.onsuccess=()=>res(rq.result||null);rq.onerror=()=>rej(rq.error)})}
async function delAudio(key){const db=await openDB();return new Promise((res)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=()=>res();tx.onerror=()=>res()})}
/* 録音中の一時保存（分割形式）：見出し LIVEPFX… ＝小さな記録（blobなし・n=塊の数）＋ 塊 見出し+'~c'+6桁（1回ずつ書き足すだけ）
   ＝書き込み量は録音時間に比例（毎秒の丸ごと書き直しをしない）。旧形式（見出しに blob を丸ごと持つ）もそのまま読める。
   '~' は試問ID(UUID)・項目ID(英数_-)に現れないので見出しと塊を取り違えない */
const LIVECH='~c';
function isLiveHead(k){k=String(k);return k.startsWith(LIVEPFX)&&k.indexOf(LIVECH)<0}
function liveChunkRange(k){return IDBKeyRange.bound(k+LIVECH,k+LIVECH+'\uffff')}
/* 見出しの更新と新しい塊の追記を1つのトランザクションで */
async function putLiveParts(k,head,parts,from){
  const db=await openDB();
  return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE);
    parts.forEach((b,i)=>os.put(b,k+LIVECH+String(from+i).padStart(6,'0')));os.put(head,k);
    tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error)});
}
/* 一時保存を1本の録音として読む（{...見出し, blob}）。無ければ null */
async function getLive(k){
  const db=await openDB();
  return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly'),os=tx.objectStore(STORE);
    const rq=os.get(k);
    rq.onsuccess=()=>{const r=rq.result||null;
      if(!r||typeof r!=='object'||r.blob){res(r);return} // 旧形式
      const rc=os.getAll(liveChunkRange(k));
      rc.onsuccess=()=>{const parts=rc.result||[];res(Object.assign({},r,{blob:parts.length?new Blob(parts,{type:r.mime||'audio/webm'}):null}))};
      rc.onerror=()=>rej(rc.error)};
    rq.onerror=()=>rej(rq.error)});
}
/* 一時保存（見出し＋塊）を消す */
async function delLive(k){
  const db=await openDB();
  return new Promise(res=>{const tx=db.transaction(STORE,'readwrite'),os=tx.objectStore(STORE);
    os.delete(k);os.delete(liveChunkRange(k));tx.oncomplete=()=>res();tx.onerror=()=>res();tx.onabort=()=>res()});
}

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
/* 採点は合格/不合格（score='pass'|'fail'）。2026-09-23以前の5段階（score=1〜5の数値）は旧データとして読めるよう残す */
function isPF(v){return v==='pass'||v==='fail'}
/* recOnly=true：録音した問だけを数える（未確定の試問の表示用。試問画面は録音前でも○×を押せるため、
   録音していない問の○を合格数に混ぜると「合格2・判定1/録音2」のように食い違う） */
function scoredVals(r,recOnly){return sessItemIds(r).filter(id=>!recOnly||(r.items[id]&&r.items[id].hasAudio)).map(id=>r.items[id]&&r.items[id].score).filter(x=>x!=null)}
/* 合否集計 {pass,total}。旧5段階の数値は数えない */
function pfCount(r,recOnly){const v=scoredVals(r,recOnly).filter(isPF);return{pass:v.filter(x=>x==='pass').length,total:v.length}}
/* 合格率(0〜100)。合否採点が無ければNaN */
function passRate(r){const c=pfCount(r);return c.total?Math.round(c.pass/c.total*100):NaN}
/* 旧5段階の数値か（数値1〜5。文字列'4'等の混入にも耐える）。pass/fail・null・N/Aは偽 */
function isOld(v){if(v==null||v===''||isPF(v))return false;const n=Number(v);return isFinite(n)&&n>=1&&n<=5}
/* 旧5段階の採点が付いた項目数 */
function oldCount(r,recOnly){return scoredVals(r,recOnly).filter(isOld).length}
/* 旧5段階の平均（旧データ表示用） */
function avg(r){const v=scoredVals(r).filter(isOld).map(Number);return v.length?(v.reduce((a,b)=>a+b,0)/v.length).toFixed(1):'-'}
/* 一覧・詳細に出す結果ラベル：合否のみ「2/3」、旧評価が混ざれば「1/1＋旧評価2問」、旧データのみ「旧評価 平均4.0」
   （旧5段階の点数を黙って捨てない＝低評価が合格表示に化けない） */
function resLbl(r,recOnly){
  const c=pfCount(r,recOnly),o=oldCount(r,recOnly);
  if(c.total)return c.pass+'/'+c.total+(o?'＋'+t2('oldN').replace('{n}',o):'');
  if(o)return t2('oldAvg')+avg(r);
  return '-';
}
/* 詳細等で結果ラベルの前に付ける見出し（合否があれば「合格」、旧データのみなら「旧5段階評価」） */
function resHead(r){return pfCount(r).total||!oldCount(r)?t2('passCnt'):t2('oldScore')}
/* 結果の色クラス：全問合格=a5・全問不合格=a1・混在=a3。旧5段階が1問でも残れば中立色(old)＝全問合格の緑に見せない */
function resCls(r,recOnly){const c=pfCount(r,recOnly);if(oldCount(r,recOnly))return'old';if(c.total)return c.pass===c.total?'a5':c.pass===0?'a1':'a3';return''}
/* 未確定の試問で、録音した問に合否が1問以上付いているか（試問中の○×だけで未確定のものも含む）。
   録音していない問の○×は数えない（judgeState・pendLblと同じ問の集合で数える） */
function hasPF(r){return pfCount(r,true).total>0}
/* 未確定の試問の判定状況：録音した問（rec）のうち合否または「質問しなかった」が付いた数（judged）。
   full=録音した全問が判定済み（＝「判定済み・確定待ち」）。途中までなら「採点途中」として区別する */
function judgeState(r){
  const ids=Object.keys((r&&r.items)||{}).filter(id=>r.items[id]&&r.items[id].hasAudio);
  const judged=ids.filter(id=>{const x=r.items[id];return isPF(x.score)||isOld(x.score)||!!x.na}).length;
  return{rec:ids.length,judged,full:ids.length>0&&judged===ids.length};
}
/* 未確定の試問の結果ラベル：全問判定済み→「2/3（未確定）」、途中→「合格1・判定1/録音2」、合否なし→'' */
function pendLbl(r){
  if(!hasPF(r))return'';
  const j=judgeState(r);
  if(j.full)return resLbl(r,true)+t2('unconf');
  return t2('partLbl').replace('{p}',pfCount(r,true).pass).replace('{j}',j.judged).replace('{m}',j.rec);
}

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
    // 下書き（未保存の試問）のセッションに属する録音は、項目キーが下書きに無くても消さない
    //（保存失敗・録音の書込途中の終了などで下書きと録音がずれても、最後の写しを守る）
    const keep=new Set();
    if(typeof cur!=='undefined'&&cur&&cur.id)keep.add(cur.id);
    try{const d=JSON.parse(localStorage.getItem(DRAFTKEY));if(d&&d.id)keep.add(String(d.id))}catch(e){}
    const orphans=keys.filter(k=>!String(k).startsWith(LIVEPFX)&&!valid.has(k)&&![...keep].some(id=>String(k).startsWith(id+'_')));
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
    // 保存できなかった（または保存前の）試問も書き出す：録音のある下書きは「録音のみ」のセッションとして同梱
    //（容量不足で「試問を保存」が失敗した時の退避先。形式は通常のセッションと同じ）
    if(typeof cur!=='undefined'&&cur&&cur.id&&!sessions.some(s=>s.id===cur.id)&&Object.values(cur.items||{}).some(x=>x&&x.hasAudio)){
      const c=JSON.parse(JSON.stringify(cur));snapMeta(c);if(!c.updatedAt)c.updatedAt=new Date().toISOString();sessions.push(c);
    }
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
      if(!saveAll(Object.values(map))){input.value='';return} // 保存失敗（storeFail表示済み）＝取り込み件数を偽って出さない
      // 試問項目はインポート側を採用（採点との整合のため）。ID・文字列を無害化して取り込む
      if(bk.cfg&&Array.isArray(bk.cfg.sections)&&Array.isArray(bk.cfg.items)){
        cfg={sections:bk.cfg.sections.map(s=>copyLocFields(s,{id:sanitizeId(s.id),name:String(s.name||'')},['name'])),
             items:bk.cfg.items.map(it=>{
               const o={id:sanitizeId(it.id),secId:sanitizeId(it.secId),name:String(it.name||''),desc:String(it.desc||'')};
               if(it.ans!=null)o.ans=String(it.ans);
               return copyLocFields(it,o,['name','desc','ans']);
             })};
        localStorage.setItem(CKEY,JSON.stringify(cfg));
        // 取り込んだ構成は使用中セットの中身ではない：activeIdを外す（resetCfg・項目の置き換えと同じ）。
        // 外さないと次の「項目を保存」(syncActiveSet)で保存済みセットが黙って上書きされる。presets自体は触らない
        const qs=getQuestionSets();if(qs.activeId){qs.activeId=null;saveQuestionSets(qs)}
        if(typeof renderQsetUI==='function')renderQsetUI();if(typeof renderExamSetSel==='function')renderExamSetSel();
      }
      buildExamCards();buildCfgUI();refreshSel();
      toast(added+t('bkImported'));
    }catch(e){toast(t('bkFail')+'（'+e.message+'）',1)}
    input.value='';
  };
  reader.onerror=()=>{toast(t('bkFail'),1);input.value=''};
  reader.readAsText(file);
}
