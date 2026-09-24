/* ui-cfg.js — 設定：試問項目・作業カタログからの追加・プリセット/質問セット
   ※ js/ui.js を機械的に分割したもの（プレーンスクリプト・グローバル名は不変）。読み込み順は ui-core → ui-exam → ui-score → ui-hist → ui-chart → ui-cfg */
/* ==============================================================
   設定：試問項目（セクション＋質問）
   ============================================================== */
/* 未保存変更のトラッキング（保存せず離脱→タブ切替時にconfirm、バッジ表示） */
let cfgDirty=false;
function markCfgDirty(){cfgDirty=true;updateDirtyBadge()}
function updateDirtyBadge(){const el=document.getElementById('cfgDirtyBadge');if(el){el.textContent='● '+t2('dirty');el.style.display=cfgDirty?'block':'none'}}
/* cfgをCKEYへ永続化して全ビューを再描画（quota失敗はToast） */
function persistCfg(){
  try{localStorage.setItem(CKEY,JSON.stringify(cfg))}catch(e){toast(t2('storeFail'),1);return}
  cfgDirty=false;updateDirtyBadge();
  buildCfgUI();buildExamCards();
  if(typeof renderExamSetSel==='function')renderExamSetSel();
}
function buildCfgUI(){
  const area=document.getElementById('cfgArea');
  const secs=cfg.sections,items=cfg.items;
  let h=`<div style="font-size:.75rem;color:var(--sub);margin-bottom:10px">${esc(t2('cfgNote'))}</div>`;
  secs.forEach((sec,si)=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    const sn=esc(sec.name||t('secName')); // 読み上げ用：削除・移動ボタンにどのセクションかを入れる
    const sid=sanitizeId(sec.id); // 多層防御: onclick属性への埋め込みは描画側でも無害化（buildExamCards/renderScoreDetailと同水準）
    h+=`<div class="cfg-sec" data-sec="${sid}">`;
    h+=`<div class="cfg-sec-hdr">
      <input type="text" value="${esc(sec.name)}" aria-label="${t('secName')}" onchange="cfgSecName('${sid}',this.value)" placeholder="${t('secName')}">
      <div class="ci-btns">
        ${si>0?`<button aria-label="${t('alUp')}: ${sn}" onclick="moveSec('${sid}',-1)">&#9650;</button>`:'<button style="visibility:hidden" aria-hidden="true">&#9650;</button>'}
        ${si<secs.length-1?`<button aria-label="${t('alDown')}: ${sn}" onclick="moveSec('${sid}',1)">&#9660;</button>`:'<button style="visibility:hidden" aria-hidden="true">&#9660;</button>'}
        <button class="del" aria-label="${t('btnDel')}: ${sn}" onclick="delSec('${sid}')">&#10005;</button>
      </div>
    </div>`;
    secItems.forEach((it,ii)=>{
      const iid=sanitizeId(it.id);
      const inm=esc(it.name||t('itemName')); // 読み上げ用：どの質問の欄・ボタンかを名前に入れる
      h+=`<div class="cfg-item">
        <div class="ci-row">
          <input type="text" value="${esc(it.name)}" aria-label="${t('itemName')}" onchange="cfgItemName('${iid}',this.value)" placeholder="${t('itemName')}">
          <div class="ci-btns">
            ${ii>0?`<button aria-label="${t('alUp')}: ${inm}" onclick="moveItem('${iid}',-1)">&#9650;</button>`:'<button style="visibility:hidden" aria-hidden="true">&#9650;</button>'}
            ${ii<secItems.length-1?`<button aria-label="${t('alDown')}: ${inm}" onclick="moveItem('${iid}',1)">&#9660;</button>`:'<button style="visibility:hidden" aria-hidden="true">&#9660;</button>'}
            <button class="del" aria-label="${t('btnDel')}: ${inm}" onclick="delItem('${iid}')">&#10005;</button>
          </div>
        </div>
        <textarea aria-label="${inm} ${t('itemDesc')}" onchange="cfgItemDesc('${iid}',this.value)" placeholder="${t('itemDesc')}">${esc(it.desc)}</textarea>
        ${it.ans!=null?`<div class="ans-lbl">${t('ansLbl')}</div><textarea aria-label="${inm} ${t('ansLbl')}" onchange="cfgItemAns('${iid}',this.value)">${esc(it.ans)}</textarea>`:''}
      </div>`;
    });
    h+=`<div class="cfg-add"><button onclick="addItem('${sid}')">${t('addItem')}</button></div>`;
    h+=`</div>`;
  });
  area.innerHTML=h;
  updateDirtyBadge();
  const sh=document.getElementById('cfgSaveHint');if(sh)sh.textContent=t2('saveCfgHint');
  if(typeof renderQsetUI==='function')renderQsetUI(); // 言語切替時にもセットUIを追従
}
/* 原文（日本語）を編集したら対応する多言語フィールドを破棄する
   （デフォルト項目の name_en 等が編集後も古い訳のまま表示され続ける事故を防ぐ） */
function dropLoc(o,k){['en','vi','id'].forEach(l=>delete o[k+'_'+l])}
function cfgSecName(secId,val){const s=cfg.sections.find(s=>s.id===secId);if(s){s.name=val;dropLoc(s,'name');markCfgDirty()}}
function cfgItemName(itemId,val){const it=cfg.items.find(i=>i.id===itemId);if(it){it.name=val;dropLoc(it,'name');markCfgDirty()}}
function cfgItemDesc(itemId,val){const it=cfg.items.find(i=>i.id===itemId);if(it){it.desc=val;dropLoc(it,'desc');markCfgDirty()}}
function cfgItemAns(itemId,val){const it=cfg.items.find(i=>i.id===itemId);if(it){it.ans=val;dropLoc(it,'ans');markCfgDirty()}}
function addSection(){cfg.sections.push({id:'sec_'+Date.now(),name:t('secName')});markCfgDirty();buildCfgUI()}
function addItem(secId){
  const id='item_'+Date.now();
  const idxs=cfg.items.map((it,i)=>it.secId===secId?i:-1).filter(i=>i>=0);
  const at=idxs.length?idxs[idxs.length-1]+1:cfg.items.length;
  cfg.items.splice(at,0,{id,secId,name:'',desc:''});
  markCfgDirty();
  buildCfgUI();
  setTimeout(()=>{const ins=document.querySelectorAll('.cfg-item input[type="text"]');if(ins.length)ins[ins.length-1].focus()},50);
}
function delSec(secId){if(!confirm(t2('delSecConfirm')))return;cfg.sections=cfg.sections.filter(s=>s.id!==secId);cfg.items=cfg.items.filter(it=>it.secId!==secId);markCfgDirty();buildCfgUI()}
function delItem(itemId){if(!confirm(t('cDelItem')))return;cfg.items=cfg.items.filter(it=>it.id!==itemId);markCfgDirty();buildCfgUI()}
function moveSec(secId,dir){const i=cfg.sections.findIndex(s=>s.id===secId);if(i<0)return;const j=i+dir;if(j<0||j>=cfg.sections.length)return;[cfg.sections[i],cfg.sections[j]]=[cfg.sections[j],cfg.sections[i]];markCfgDirty();buildCfgUI()}
function moveItem(itemId,dir){
  const secId=cfg.items.find(it=>it.id===itemId)?.secId;if(!secId)return;
  const secItems=cfg.items.filter(it=>it.secId===secId);
  const li=secItems.findIndex(it=>it.id===itemId);const sj=li+dir;
  if(sj<0||sj>=secItems.length)return;
  const gi=cfg.items.indexOf(secItems[li]),gj=cfg.items.indexOf(secItems[sj]);
  [cfg.items[gi],cfg.items[gj]]=[cfg.items[gj],cfg.items[gi]];markCfgDirty();buildCfgUI();
}
/* 使用中の試問セット（activeId）があれば、そのセットの中身も現在の項目で更新する（保存形式 {id,name,cfg} は不変）。
   セットに入っていない構成なら何もしない。戻り値=更新したセット名（無ければnull） */
function syncActiveSet(){
  const qs=getQuestionSets();
  const p=qs.activeId&&qs.presets.find(x=>x.id===qs.activeId);
  if(!p)return null;
  p.cfg=JSON.parse(JSON.stringify(cfg));
  saveQuestionSets(qs);
  return p.name;
}
function saveCfg(){
  try{localStorage.setItem(CKEY,JSON.stringify(cfg))}catch(e){toast(t2('storeFail'),1);return}
  const setName=syncActiveSet(); // 「項目を保存」1つで使用中のセットにも残す（切り替えて戻っても消えない）
  if(cfgDirty)markTplEdited(); // テンプレートの質問を書き換えた＝テンプレートそのままではない（名前に「変更あり」）
  cfgDirty=false;updateDirtyBadge();
  buildExamCards();renderQsetUI();if(typeof renderExamSetSel==='function')renderExamSetSel();
  toast(setName?t2('cfgSavedSet').replace('{n}',setName):t('cfgSaved'));
}
/* 初期設定に戻す：使用中のセットは書き換えず、セットに入っていない構成として扱う（セットの中身を黙って失わない） */
async function resetCfg(){
  if(!(await guardExamSwitch()))return false; // 出題が変わる＝保存していない試問を先に守る
  if(!confirm(t('cResetCfg')))return false;
  const qs=getQuestionSets();if(qs.activeId||qs.activeTpl){qs.activeId=null;delete qs.activeTpl;saveQuestionSets(qs)}
  cfg=defaultCfg();persistCfg();toast(t('cfgReset'));
  return true;
}

/* ==============================================================
   作業カタログから質問を追加（大項目=作業 → 小項目=質問を選択）
   質問と模範解答は works-qa.js（睦沢pptx由来）から生成する
   ============================================================== */
function openCatalog(){
  let h=`<div class="mh"><h2 id="moTitle">${t('catAddTitle')}</h2><button class="mx" aria-label="${t('btnClose')}" onclick="closeMo()">&times;</button></div>`;
  h+=`<div class="catrow"><label>${t('catSelLbl')}</label><select id="catSel" onchange="catPickCat(this.value)"><option value="">${t('selCatPh')}</option>${WORKSQA.categories.map(c=>`<option value="${esc(c.id)}">${esc(qaCatLabel(c.id))}</option>`).join('')}</select></div>`;
  h+=`<div class="catrow"><label>${t('workSelLbl')}</label><select id="workSel2" onchange="catPickWork(this.value)"><option value="">${t('selWorkPh')}</option></select></div>`;
  h+=`<div class="catrow"><label>${t('qaSelLbl')}</label><div id="qaChecks"></div></div>`;
  h+=`<div class="ma"><button class="b b1" style="flex:1" id="btnCatConfirm" onclick="addFromCatalog()">${t('btnCatConfirm')}</button><button class="b b3" style="flex:1" onclick="closeMo()">${t('btnClose')}</button></div>`;
  document.getElementById('moBody').innerHTML=h;
  moShow();
}
function catPickCat(catId){
  const sel=document.getElementById('workSel2');
  sel.innerHTML=`<option value="">${t('selWorkPh')}</option>`+(catId?qaWorksInCat(catId).map(w=>`<option value="${esc(w.id)}">${esc(qaWorkLabel(w))}</option>`).join(''):'');
  document.getElementById('qaChecks').innerHTML='';
}
function catPickWork(workId){
  const w=qaWorkById(workId),box=document.getElementById('qaChecks');
  if(!w){box.innerHTML='';return}
  // 追加済みの質問には「追加済み」バッジを付け、初期チェックを外す（重複追加の混乱を防ぐ）
  const sec=cfg.sections.find(s=>s.name===w.name);
  const isDup=q=>!!(sec&&cfg.items.some(it=>it.secId===sec.id&&it.name===q.name));
  box.innerHTML=qaQuestions(w).map(q=>{
    const dup=isDup(q);
    return `<label class="qa-check"><input type="checkbox" value="${esc(q.key)}" ${dup?'':'checked'}><div class="qat"><div class="qan">${esc(q.name)}${dup?` <span style="font-size:.68rem;color:var(--pri);font-weight:700;border:1px solid var(--pri);border-radius:4px;padding:0 4px">${esc(t2('added'))}</span>`:''}</div><div class="qaq">${esc(q.desc)}</div><div class="qaa">${lang!=='ja'?esc(t('ansJaNote'))+' ':''}${esc(q.ans)}</div></div></label>`;
  }).join('');
}
function addFromCatalog(){
  const w=qaWorkById(document.getElementById('workSel2').value);
  if(!w){toast(t('selWorkPh'),1);return}
  const keys=[...document.querySelectorAll('#qaChecks input:checked')].map(i=>i.value);
  if(!keys.length){toast(t('eNoQa'),1);return}
  // セクションは作業名で再利用（同じ作業を2回追加しても散らからない）
  let sec=cfg.sections.find(s=>s.name===w.name);
  if(!sec){sec={id:'sec_'+w.id+'_'+Date.now(),name:w.name};if(w.name_en)sec.name_en=w.name_en;cfg.sections.push(sec)}
  let added=0;
  qaQuestions(w).filter(q=>keys.includes(q.key)).forEach(q=>{
    if(cfg.items.some(it=>it.secId===sec.id&&it.name===q.name))return; // 同一質問の重複を防ぐ
    cfg.items.push({id:'qa_'+w.id+'_'+q.key+'_'+Date.now(),secId:sec.id,name:q.name,desc:q.desc,ans:q.ans});
    added++;
  });
  if(added)markTplEdited();
  syncActiveSet();persistCfg();
  closeMo();
  toast(added+t('catAdded'));
}

/* ==============================================================
   試問セット（出題）＝ テンプレート（QBANK）＋ 自分のセット（名前付き保存/切替）
   - QBANK契約: qbankPresets()/qbankPreset(id) のみ使用（js/qbank.js＋data.jsアクセサ）
   - 自分のセット: oral_exam_presets_v1 = {presets:[{id,name,cfg}],activeId}
     CKEY(oral_exam_items_v1)は常に「使用中のセットの実体」→既存データ・バックアップv1と完全互換
   - R4: テンプレートを使用中のときは同じオブジェクトに activeTpl={id,name,edited} を足して覚える（追加フィールド＝旧版は無視する）
   ============================================================== */
function qbankAvailable(){return typeof qbankPresets==='function'&&typeof QBANK!=='undefined'}
/* 今の構成が初期設定の質問そのままか（ID と原文の名前が一致） */
function isDefaultCfg(){
  try{const d=defaultCfg();return cfg.items.length===d.items.length&&cfg.items.every((it,i)=>it.id===d.items[i].id&&it.name===d.items[i].name&&it.secId===d.items[i].secId)}catch(e){return false}
}
/* 使用中の出題：自分のセット＞テンプレート＞初期設定＞（セット未保存の構成） */
function curSetInfo(){
  const qs=getQuestionSets();
  const p=qs.activeId&&qs.presets.find(x=>x.id===qs.activeId);
  if(p)return{kind:'set',id:'set:'+p.id,name:p.name};
  const tp=qs.activeTpl;
  if(tp&&tp.id)return{kind:'tpl',id:'tpl:'+tp.id+(tp.edited?'+':''),name:String(tp.name||tp.id),edited:!!tp.edited,tplId:tp.id};
  if(isDefaultCfg())return{kind:'def',id:'def',name:''};
  return{kind:null,id:'',name:''};
}
function setInfoLbl(s){return setLbl({setId:s.id,setName:s.name})}
/* テンプレート使用中に質問を足した・書き換えた：名前は残し「（変更あり）」を付ける（別の出題として記録・比較する） */
function markTplEdited(){const qs=getQuestionSets();if(qs.activeTpl&&!qs.activeTpl.edited){qs.activeTpl.edited=true;saveQuestionSets(qs)}}
/* 試問の保存時に出題を記録する（追加フィールド setId/setName/setN。既に記録がある試問＝まとめ先・続きは変えない） */
function stampSet(s){
  if(!s||s.setId!=null||s.setName!=null)return;
  const i=curSetInfo();
  s.setId=i.id;s.setName=i.name;s.setN=getItems().length;
}
/* 出題を切り替える前の保護：保存していない試問（録音・合否）があれば、先に保存するか聞く。
   OK＝保存してから切り替える（保存できなければ切り替えない）／キャンセル＝切り替えない。戻り値=切り替えてよいか */
async function guardExamSwitch(){
  if(typeof cur==='undefined'||!cur||!cur.items)return true;
  if(typeof active!=='undefined'&&active){toast(t2('recBusy'),1);return false}
  const w=curWork();
  if(!w.n&&!w.m)return true;
  if(!w.n){ // 録音のない○×だけ：保存はできない（録音のない試問は保存しない）→見えなくなることを知らせて選んでもらう
    if(!confirm(t2('swGuardPf').replace('{m}',w.m)))return false;
    snapMeta(cur);saveDraft();return true;
  }
  const el=document.getElementById('fEe');
  const e=((el&&el.value)||cur.examinee||'').trim()||t2('noName');
  if(!confirm(t2('swGuard').replace('{e}',e).replace('{n}',w.n).replace('{m}',w.m)))return false;
  const ok=await saveSession({quiet:true});
  if(ok!==true){setTimeout(()=>toast(t2('swSaveFail'),1),2600);return false} // 名前が空など：試問タブの該当欄へ案内済み
  return true;
}
function renderQsetUI(){
  const box=document.getElementById('qsetArea');if(!box)return;
  const qs=getQuestionSets();
  const info=curSetInfo();
  let h=`<div class="cd" id="qsetCard" style="margin-bottom:12px">`;
  h+=`<div style="font-weight:800;margin-bottom:4px">${esc(t2('qsTitle'))}</div>`;
  h+=`<div id="qsCurLine" style="font-size:.85rem;color:var(--sub);margin-bottom:12px">${esc(t2('qsCur'))}: <strong style="color:var(--txt)">${esc(setInfoLbl(info))}</strong> <span style="color:var(--sub)">（${esc(t2('qCnt').replace('{n}',getItems().length))}）</span>${cfgDirty?` <span style="color:var(--s2,#c60)">● ${esc(t2('dirty'))}</span>`:''}</div>`;
  // --- テンプレートから選ぶ ---
  h+=`<div style="font-weight:700;font-size:.88rem;margin-bottom:6px">${esc(t2('qbTitle'))}</div>`;
  if(qbankAvailable()){
    h+=`<select id="qbSel" style="width:100%" onchange="qbShowDesc()"><option value="">${t('selPh')}</option>${qbankPresets().map(p=>`<option value="${esc(sanitizeId(p.id))}">${esc(p.name)}</option>`).join('')}</select>`;
    h+=`<div id="qbDesc" style="font-size:.78rem;color:var(--sub);margin-top:6px"></div>`;
    h+=`<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap"><button type="button" class="b b1" style="flex:1 1 140px" onclick="applyQbank(false)">${esc(t2('qbReplace'))}</button><button type="button" class="b b4" style="flex:1 1 140px" onclick="applyQbank(true)">${esc(t2('qbAppend'))}</button></div>`;
  }else{
    h+=`<div style="font-size:.78rem;color:var(--sub)">${esc(t2('qbNone'))}</div>`;
  }
  // --- 自分のセット ---
  h+=`<div style="font-weight:700;font-size:.88rem;margin:16px 0 6px">${esc(t2('qsMine'))}</div>`;
  if(qs.presets.length){
    h+=`<select id="qsSel" style="width:100%">${qs.presets.map(p=>`<option value="${esc(sanitizeId(p.id))}"${p.id===qs.activeId?' selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
    h+=`<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button type="button" class="b b1" style="flex:1;min-width:70px" onclick="qsApplySel()">${esc(t2('qsApply'))}</button>
      <button type="button" class="b b3" style="flex:1;min-width:70px" onclick="qsRenameSel()">${esc(t2('qsRen'))}</button>
      <button type="button" class="b b2" style="flex:1;min-width:70px" onclick="qsDeleteSel()">${esc(t2('qsDel'))}</button>
    </div>`;
  }
  h+=`<button type="button" class="b b3" style="width:100%;margin-top:8px" onclick="qsSaveNew()">${esc(t2('qsSaveNew'))}</button>`;
  h+='</div>';
  box.innerHTML=h;
}
function qbShowDesc(){
  const sel=document.getElementById('qbSel'),el=document.getElementById('qbDesc');
  if(!sel||!el)return;
  const p=qbankAvailable()?qbankPresets().find(x=>sanitizeId(x.id)===sel.value):null;
  el.textContent=p?(p.desc||'')+'（'+(p.sections||[]).length+' / '+(p.items||[]).length+'）':'';
}
/* QBANK項目→cfg項目へ変換。模範解答ansは既存の折りたたみ表示(details.ans)に載せ、出典srcを末尾に明記 */
function qbankToCfgItem(p,it){
  let a=it.ans!=null?String(it.ans):'';
  if(it.src)a+=(a?'\n':'')+'（出典: '+String(it.src)+'）';
  const o={id:sanitizeId('qb_'+p.id+'_'+it.id),secId:sanitizeId('qb_'+p.id+'_'+it.secId),name:String(it.name||''),desc:String(it.desc||'')};
  if(a)o.ans=a;
  return o;
}
/* テンプレートの適用。pid 省略時は設定タブのセレクトから。置き換えは出題の切り替え＝未保存の試問を保護してから */
async function applyQbank(append,pid){
  if(!qbankAvailable())return false;
  const sel=document.getElementById('qbSel');
  const v=pid!=null?String(pid):(sel?sel.value:'');
  const p=v&&qbankPresets().find(x=>sanitizeId(x.id)===v);
  if(!p){toast(t('selPh'),1);return false}
  if(!append){
    if(!(await guardExamSwitch()))return false;
    if(!confirm(t2('qbRepConfirm').replace('{n}',p.name)))return false;
    cfg={sections:(p.sections||[]).map(s=>({id:sanitizeId('qb_'+p.id+'_'+s.id),name:String(s.name||'')})),
         items:(p.items||[]).map(it=>qbankToCfgItem(p,it))};
    const qs=getQuestionSets();qs.activeId=null;qs.activeTpl={id:p.id,name:p.name};saveQuestionSets(qs); // テンプレート名を「使用中」として覚える
    persistCfg();
    toast(t2('qbApplied'));
  }else{
    let added=0;
    (p.sections||[]).forEach(s=>{const sid=sanitizeId('qb_'+p.id+'_'+s.id);if(!cfg.sections.some(x=>x.id===sid))cfg.sections.push({id:sid,name:String(s.name||'')})});
    (p.items||[]).forEach(it=>{
      const o=qbankToCfgItem(p,it);
      if(cfg.items.some(x=>x.id===o.id))return; // 同一プリセット項目の重複追加を防ぐ
      cfg.items.push(o);added++;
    });
    if(added)markTplEdited();
    syncActiveSet();persistCfg();
    toast(added+t('catAdded'));
  }
  return true;
}
/* --- 自分のセット（名前付き保存/切替） --- */
function qsSelP(){const s=document.getElementById('qsSel');if(!s)return null;return getQuestionSets().presets.find(p=>sanitizeId(p.id)===s.value)||null}
function qsSaveNew(){
  const name=prompt(t2('qsNamePrompt'),'');if(name==null)return;
  const nm=name.trim();if(!nm)return;
  const qs=getQuestionSets();
  const id='set_'+Date.now();
  qs.presets.push({id,name:nm,cfg:JSON.parse(JSON.stringify(cfg))});
  qs.activeId=id;delete qs.activeTpl;saveQuestionSets(qs);
  renderQsetUI();if(typeof renderExamSetSel==='function')renderExamSetSel();
  toast(t2('qsSaved'));
}
async function applySet(id){
  const qs0=getQuestionSets();
  const p0=qs0.presets.find(x=>sanitizeId(x.id)===String(id));
  if(!p0||!p0.cfg)return false;
  if(!(await guardExamSwitch()))return false;
  if(!confirm(t2('qsSwConfirm').replace('{n}',p0.name)))return false;
  const qs=getQuestionSets(); // 保存（guard）の間に書き換わっていても最新を読む
  const p=qs.presets.find(x=>x.id===p0.id);if(!p||!p.cfg)return false;
  // 無害化しつつディープコピー（importBackupと同水準。多言語フィールドはcopyLocFieldsで保持）
  cfg={sections:(p.cfg.sections||[]).map(s=>copyLocFields(s,{id:sanitizeId(s.id),name:String(s.name||'')},['name'])),
       items:(p.cfg.items||[]).map(it=>{const o={id:sanitizeId(it.id),secId:sanitizeId(it.secId),name:String(it.name||''),desc:String(it.desc||'')};if(it.ans!=null)o.ans=String(it.ans);return copyLocFields(it,o,['name','desc','ans'])})};
  qs.activeId=p.id;delete qs.activeTpl;saveQuestionSets(qs);
  persistCfg();
  toast(t2('qsApplied'));
  return true;
}
function qsApplySel(){const p=qsSelP();if(p)return applySet(sanitizeId(p.id))}
function qsRenameSel(){
  const qs=getQuestionSets();const s=document.getElementById('qsSel');if(!s)return;
  const p=qs.presets.find(x=>sanitizeId(x.id)===s.value);if(!p)return;
  const name=prompt(t2('qsNamePrompt'),p.name);if(name==null)return;
  const nm=name.trim();if(!nm)return;
  p.name=nm;saveQuestionSets(qs);
  renderQsetUI();if(typeof renderExamSetSel==='function')renderExamSetSel();
}
function qsDeleteSel(){
  const qs=getQuestionSets();const s=document.getElementById('qsSel');if(!s)return;
  const p=qs.presets.find(x=>sanitizeId(x.id)===s.value);if(!p)return;
  if(!confirm(t2('qsDelConfirm').replace('{n}',p.name)))return;
  qs.presets=qs.presets.filter(x=>x!==p);
  if(qs.activeId===p.id)qs.activeId=null;
  saveQuestionSets(qs);
  renderQsetUI();if(typeof renderExamSetSel==='function')renderExamSetSel();
  toast(t2('qsDeleted'));
}
/* 試問タブ：受験者名の下に「出題：〇〇（N問）［変更］」を常に1行で出す（R4）。
   ［変更］はテンプレート・自分のセット・初期設定を1つのリストにまとめて選べるモーダルを開く */
const HOWTOKEY='oral_exam_howto_off';
function renderExamSetSel(){
  const box=document.getElementById('examSetBox');if(!box)return;
  box.style.display='';
  const info=curSetInfo();
  let off=false;try{off=localStorage.getItem(HOWTOKEY)==='1'}catch(e){}
  box.innerHTML=`<div class="esl"><span class="esl-k">${esc(t2('examSetLbl'))}</span><strong id="examSetName" class="esl-v">${esc(setInfoLbl(info))}</strong><span class="esl-n" id="examSetCnt">${esc(t2('qCnt').replace('{n}',getItems().length))}</span>`
    +`<button type="button" class="b b3 esl-b" id="examSetBtn" onclick="openSetPicker()" aria-label="${esc(t2('examSetLbl')+': '+t2('setChange'))}">${esc(t2('setChange'))}</button>`
    +(off?`<button type="button" class="b b4 esl-q" id="howtoBtn" onclick="toggleHowto(true)" aria-label="${esc(t2('howtoShow'))}" title="${esc(t2('howtoShow'))}">?</button>`:'')
    +`</div>`;
  renderHowto();
}
/* 使い方の案内：初回だけ開いて出す。閉じたら「？」に畳む（DRVHINTKEY と同じ仕組みで覚える） */
function renderHowto(){
  const h=document.getElementById('examHowto');if(!h)return;
  let off=false;try{off=localStorage.getItem(HOWTOKEY)==='1'}catch(e){}
  h.style.display=off?'none':'';
}
function toggleHowto(show){
  try{if(show)localStorage.removeItem(HOWTOKEY);else localStorage.setItem(HOWTOKEY,'1')}catch(e){}
  renderExamSetSel();
  if(show){const h=document.getElementById('examHowto');if(h)h.scrollIntoView({behavior:'smooth',block:'nearest'})}
  else{const b=document.getElementById('howtoBtn');if(b)b.focus()}
}
function examSetChange(v){
  if(!v){renderExamSetSel();return Promise.resolve(false)}
  return applySet(v).then(ok=>{if(!ok)renderExamSetSel();return ok}); // キャンセル時は表示を元に戻す
}
/* 出題の選択モーダル（テンプレート・自分のセット・初期設定を1つのリストに） */
function openSetPicker(){
  if(typeof active!=='undefined'&&active){toast(t2('recBusy'),1);return}
  const qs=getQuestionSets(),info=curSetInfo();
  const row=(kind,id,name,n,on)=>`<button type="button" class="b ${on?'b1':'b3'} setpick" data-kind="${kind}" data-id="${esc(sanitizeId(id))}" onclick="pickSetFromList('${kind}','${esc(sanitizeId(id))}')"${on?' aria-current="true"':''}><span class="sp-n">${esc(name)}</span><span class="sp-c">${esc(t2('qCnt').replace('{n}',n))}${on?' · '+esc(t2('setPickCur')):''}</span></button>`;
  let h=`<div class="mh"><h2 id="moTitle">${esc(t2('setPickTitle'))}</h2><button class="mx" aria-label="${t('btnClose')}" onclick="closeMo()">&times;</button></div>`;
  h+=`<div class="sp-g">${esc(t2('qsMine'))}</div>`;
  h+=qs.presets.length?qs.presets.map(p=>row('set',p.id,p.name,((p.cfg&&p.cfg.items)||[]).length,info.kind==='set'&&info.id==='set:'+p.id)).join(''):`<div class="sp-none">${esc(t2('setPickNoMine'))}</div>`;
  h+=`<div class="sp-g">${esc(t2('setPickTpl'))}</div>`;
  h+=row('def','def',t2('setDefault'),defaultCfg().items.length,info.kind==='def');
  if(qbankAvailable())h+=qbankPresets().map(p=>row('tpl',p.id,p.name,(p.items||[]).length,info.kind==='tpl'&&!info.edited&&sanitizeId(info.tplId)===sanitizeId(p.id))).join('');
  h+=`<div class="ma"><button class="b b3" style="flex:1" onclick="closeMo()">${t('btnClose')}</button></div>`;
  document.getElementById('moBody').innerHTML=h;
  moShow();
}
async function pickSetFromList(kind,id){
  closeMo();
  let ok=false;
  if(kind==='set')ok=await examSetChange(id);
  else if(kind==='tpl')ok=await applyQbank(false,id);
  else if(kind==='def')ok=await resetCfg();
  if(ok){const b=document.getElementById('examSetBox');if(b&&document.getElementById('pgExam').classList.contains('on'))b.scrollIntoView({behavior:'smooth',block:'nearest'})}
  return ok;
}
