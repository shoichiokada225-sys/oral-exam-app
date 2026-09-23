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
    const sid=sanitizeId(sec.id); // 多層防御: onclick属性への埋め込みは描画側でも無害化（buildExamCards/renderScoreDetailと同水準）
    h+=`<div class="cfg-sec" data-sec="${sid}">`;
    h+=`<div class="cfg-sec-hdr">
      <input type="text" value="${esc(sec.name)}" onchange="cfgSecName('${sid}',this.value)" placeholder="${t('secName')}">
      <div class="ci-btns">
        ${si>0?`<button aria-label="${t('alUp')}" onclick="moveSec('${sid}',-1)">&#9650;</button>`:'<button style="visibility:hidden" aria-hidden="true">&#9650;</button>'}
        ${si<secs.length-1?`<button aria-label="${t('alDown')}" onclick="moveSec('${sid}',1)">&#9660;</button>`:'<button style="visibility:hidden" aria-hidden="true">&#9660;</button>'}
        <button class="del" aria-label="${t('btnDel')}" onclick="delSec('${sid}')">&#10005;</button>
      </div>
    </div>`;
    secItems.forEach((it,ii)=>{
      const iid=sanitizeId(it.id);
      h+=`<div class="cfg-item">
        <div class="ci-row">
          <input type="text" value="${esc(it.name)}" onchange="cfgItemName('${iid}',this.value)" placeholder="${t('itemName')}">
          <div class="ci-btns">
            ${ii>0?`<button aria-label="${t('alUp')}" onclick="moveItem('${iid}',-1)">&#9650;</button>`:'<button style="visibility:hidden" aria-hidden="true">&#9650;</button>'}
            ${ii<secItems.length-1?`<button aria-label="${t('alDown')}" onclick="moveItem('${iid}',1)">&#9660;</button>`:'<button style="visibility:hidden" aria-hidden="true">&#9660;</button>'}
            <button class="del" aria-label="${t('btnDel')}" onclick="delItem('${iid}')">&#10005;</button>
          </div>
        </div>
        <textarea onchange="cfgItemDesc('${iid}',this.value)" placeholder="${t('itemDesc')}">${esc(it.desc)}</textarea>
        ${it.ans!=null?`<div class="ans-lbl">${t('ansLbl')}</div><textarea onchange="cfgItemAns('${iid}',this.value)">${esc(it.ans)}</textarea>`:''}
      </div>`;
    });
    h+=`<div class="cfg-add"><button onclick="addItem('${sid}')">${t('addItem')}</button></div>`;
    h+=`</div>`;
  });
  area.innerHTML=h;
  updateDirtyBadge();
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
function saveCfg(){
  try{localStorage.setItem(CKEY,JSON.stringify(cfg))}catch(e){toast(t2('storeFail'),1);return}
  cfgDirty=false;updateDirtyBadge();
  buildExamCards();toast(t('cfgSaved'));
}
function resetCfg(){if(!confirm(t('cResetCfg')))return;cfg=defaultCfg();persistCfg();toast(t('cfgReset'))}

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
  persistCfg();
  closeMo();
  toast(added+t('catAdded'));
}

/* ==============================================================
   プリセット試問セット（QBANK）＋ 質問セット管理（保存/切替）
   - QBANK契約: qbankPresets()/qbankPreset(id) のみ使用（js/qbank.js＋data.jsアクセサ）
   - 質問セット: oral_exam_presets_v1 = {presets:[{id,name,cfg}],activeId}
     CKEY(oral_exam_items_v1)は常に「アクティブセットの実体」→既存データ・バックアップv1と完全互換
   ============================================================== */
function qbankAvailable(){return typeof qbankPresets==='function'&&typeof QBANK!=='undefined'}
function renderQsetUI(){
  const box=document.getElementById('qsetArea');if(!box)return;
  const qs=getQuestionSets();
  let h='';
  // --- プリセット（テンプレート）適用 ---
  h+=`<div class="cd" style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:6px">${esc(t2('qbTitle'))}</div>`;
  if(qbankAvailable()){
    h+=`<select id="qbSel" style="width:100%" onchange="qbShowDesc()"><option value="">${t('selPh')}</option>${qbankPresets().map(p=>`<option value="${esc(sanitizeId(p.id))}">${esc(p.name)}</option>`).join('')}</select>`;
    h+=`<div id="qbDesc" style="font-size:.78rem;color:var(--sub);margin-top:6px"></div>`;
    h+=`<div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="b b1" style="flex:1" onclick="applyQbank(false)">${esc(t2('qbReplace'))}</button><button type="button" class="b b4" style="flex:1" onclick="applyQbank(true)">${esc(t2('qbAppend'))}</button></div>`;
  }else{
    h+=`<div style="font-size:.78rem;color:var(--sub)">${esc(t2('qbNone'))}</div>`;
  }
  h+='</div>';
  // --- 保存済み質問セットの管理 ---
  h+=`<div class="cd" style="margin-bottom:12px"><div style="font-weight:700;margin-bottom:6px">${esc(t2('qsTitle'))}</div>`;
  const act=qs.presets.find(p=>p.id===qs.activeId);
  h+=`<div style="font-size:.8rem;color:var(--sub);margin-bottom:6px">${esc(t2('qsCur'))}: <strong style="color:var(--txt)">${esc(act?act.name:t2('qsNone'))}</strong>${cfgDirty?` <span style="color:var(--s2,#c60)">● ${esc(t2('dirty'))}</span>`:''}</div>`;
  if(qs.presets.length){
    h+=`<select id="qsSel" style="width:100%">${qs.presets.map(p=>`<option value="${esc(sanitizeId(p.id))}"${p.id===qs.activeId?' selected':''}>${esc(p.name)}</option>`).join('')}</select>`;
    h+=`<div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button type="button" class="b b1" style="flex:1;min-width:70px" onclick="qsApplySel()">${esc(t2('qsApply'))}</button>
      <button type="button" class="b b4" style="flex:1;min-width:70px" onclick="qsOverwriteSel()">${esc(t2('qsOver'))}</button>
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
function applyQbank(append){
  if(!qbankAvailable())return;
  const sel=document.getElementById('qbSel');
  const p=sel&&qbankPresets().find(x=>sanitizeId(x.id)===sel.value);
  if(!p){toast(t('selPh'),1);return}
  if(!append){
    if(!confirm(t2('qbRepConfirm').replace('{n}',p.name)))return;
    cfg={sections:(p.sections||[]).map(s=>({id:sanitizeId('qb_'+p.id+'_'+s.id),name:String(s.name||'')})),
         items:(p.items||[]).map(it=>qbankToCfgItem(p,it))};
    const qs=getQuestionSets();qs.activeId=null;saveQuestionSets(qs);
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
    persistCfg();
    toast(added+t('catAdded'));
  }
}
/* --- 質問セット（名前付き保存/切替） --- */
function qsSelP(){const s=document.getElementById('qsSel');if(!s)return null;return getQuestionSets().presets.find(p=>sanitizeId(p.id)===s.value)||null}
function qsSaveNew(){
  const name=prompt(t2('qsNamePrompt'),'');if(name==null)return;
  const nm=name.trim();if(!nm)return;
  const qs=getQuestionSets();
  const id='set_'+Date.now();
  qs.presets.push({id,name:nm,cfg:JSON.parse(JSON.stringify(cfg))});
  qs.activeId=id;saveQuestionSets(qs);
  renderQsetUI();if(typeof renderExamSetSel==='function')renderExamSetSel();
  toast(t2('qsSaved'));
}
function applySet(id){
  const qs=getQuestionSets();
  const p=qs.presets.find(x=>sanitizeId(x.id)===String(id));
  if(!p||!p.cfg)return false;
  if(!confirm(t2('qsSwConfirm').replace('{n}',p.name)))return false;
  // 無害化しつつディープコピー（importBackupと同水準。多言語フィールドはcopyLocFieldsで保持）
  cfg={sections:(p.cfg.sections||[]).map(s=>copyLocFields(s,{id:sanitizeId(s.id),name:String(s.name||'')},['name'])),
       items:(p.cfg.items||[]).map(it=>{const o={id:sanitizeId(it.id),secId:sanitizeId(it.secId),name:String(it.name||''),desc:String(it.desc||'')};if(it.ans!=null)o.ans=String(it.ans);return copyLocFields(it,o,['name','desc','ans'])})};
  qs.activeId=p.id;saveQuestionSets(qs);
  persistCfg();
  toast(t2('qsApplied'));
  return true;
}
function qsApplySel(){const p=qsSelP();if(p)applySet(sanitizeId(p.id))}
function qsOverwriteSel(){
  const qs=getQuestionSets();const s=document.getElementById('qsSel');if(!s)return;
  const p=qs.presets.find(x=>sanitizeId(x.id)===s.value);if(!p)return;
  p.cfg=JSON.parse(JSON.stringify(cfg));qs.activeId=p.id;saveQuestionSets(qs);
  cfgDirty=false;updateDirtyBadge();
  renderQsetUI();if(typeof renderExamSetSel==='function')renderExamSetSel();
  toast(t2('qsSaved'));
}
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
/* 試問タブ上部のセット切替セレクト（保存済みセットがある時だけ表示） */
function renderExamSetSel(){
  const box=document.getElementById('examSetBox');if(!box)return;
  const qs=getQuestionSets();
  if(!qs.presets.length){box.style.display='none';box.innerHTML='';return}
  box.style.display='block';
  const act=qs.presets.find(p=>p.id===qs.activeId);
  box.innerHTML=`<label style="display:block;font-size:.78rem;font-weight:600;color:var(--sub);margin-bottom:4px">${esc(t2('qsTitle'))}</label>
    <select style="width:100%" onchange="examSetChange(this.value)">
      <option value="">${esc(t2('qsCur'))}: ${esc(act?act.name:t2('qsNone'))}</option>
      ${qs.presets.filter(p=>p.id!==qs.activeId).map(p=>`<option value="${esc(sanitizeId(p.id))}">${esc(p.name)}</option>`).join('')}
    </select>`;
}
function examSetChange(v){
  if(!v){renderExamSetSel();return}
  if(!applySet(v))renderExamSetSel(); // confirmキャンセル時はセレクトを元に戻す
}
