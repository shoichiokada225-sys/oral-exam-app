/* ui-ops.js — 試問当日の運用（R9）
   ・名前の候補（datalist）と表記ゆれの吸収（比較キー nameKey）
   ・保存済み試問の再開（「この試問を続ける」）と同じ日の再試問（まとめる／追試として別に保存）
   ・履歴からの名前の訂正（1件／同じ人の全件）
   ・起動時に復元した下書きの常設案内
   ・ドライブに残った旧名のファイルの案内（GAS の replaceId は別フォルダのファイルを消さないため）
   保存形式は変えない（sessions の examinee/examiner を書き換えるだけ。追加するのは任意の項目 attempt・item.driveOrphan・下書きの _resume のみ） */

/* ==============================================================
   名前の比較キーと候補
   ============================================================== */
/* NFKC・小文字・空白/中黒/記号を除去・ラテン文字の声調記号を外す（かなの濁点は外さない）。
   例：「グエン・ヴァン・A」「グエン ヴァン A」「ｸﾞｴﾝ ｳﾞｧﾝ a」→同じキー／「Nguyễn Văn An」「nguyen van an」→同じキー */
function nameKey(s){
  let v=String(s==null?'':s).normalize('NFKC').toLowerCase();
  try{v=v.normalize('NFD').replace(/(\p{Script=Latin})\p{M}+/gu,'$1').normalize('NFC')}catch(e){}
  return v.replace(/đ/g,'d').replace(/[\s・･·•.,，、_\-‐‑–—－/／]+/g,'');
}
/* 保存済みの名前と件数（field='examinee'|'examiner'） */
function knownNames(field){
  const cnt={};
  getAll().forEach(s=>{const n=String(s[field]||'').trim();if(n)cnt[n]=(cnt[n]||0)+1});
  return cnt;
}
/* 受験者名・試問者名の入力欄に、保存済みの名前の候補を付ける */
function refreshNameLists(){
  [['fEe','dlEe','examinee'],['fEr','dlEr','examiner']].forEach(([iid,lid,f])=>{
    let dl=document.getElementById(lid);
    if(!dl){dl=document.createElement('datalist');dl.id=lid;document.body.appendChild(dl)}
    const names=knownNames(f);
    if(f==='examiner'){try{const e=localStorage.getItem(EKEY);if(e&&!names[e])names[e]=1}catch(e){}}
    dl.innerHTML=Object.keys(names).sort((a,b)=>a.localeCompare(b)).map(n=>`<option value="${esc(n)}"></option>`).join('');
    const inp=document.getElementById(iid);
    if(inp){inp.setAttribute('list',lid);inp.setAttribute('autocomplete','off')}
  });
}
/* 表記の同一判定（完全一致）：NFC・前後の空白・空白の連続だけをそろえる（声調記号・字形記号・大小文字は区別する）。
   nameKey は「候補を出す」ためのゆるい比較。同じ日の判定・一括の名前訂正は、この完全一致か利用者が同じ人と認めた名前だけ
   （例：「Nguyễn Văn Hùng」と「Nguyễn Văn Hưng」は nameKey では同じだが別人） */
function nameExact(s){return String(s==null?'':s).normalize('NFC').trim().replace(/\s+/g,' ')}
/* 同じ比較キーで表記だけ違う既存の名前（多い順）。同じ表記が既にあれば []（そろっている） */
function findNameVariants(name,field,exceptId){
  const nm=nameExact(name),k=nameKey(nm);if(!k)return[];
  const cnt={};let exact=false;
  getAll().forEach(s=>{
    if(exceptId&&s.id===exceptId)return;
    const n=String(s[field]||'').trim();if(!n||nameKey(n)!==k)return;
    if(nameExact(n)===nm){exact=true;return}
    cnt[n]=(cnt[n]||0)+1;
  });
  if(exact)return[];
  return Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]||a.localeCompare(b));
}
function findNameVariant(name,field,exceptId){return findNameVariants(name,field,exceptId)[0]||null}
/* 保存の直前：既存の名前と表記だけ違えば「同じ人ですか？」と候補ごとに確認し、OKの表記にそろえる。
   すべてキャンセル＝別の人（入力した表記のまま。同じ日の判定・一括訂正でも別人として扱う） */
function alignNames(sess){
  [['examinee','fEe','labelExaminee'],['examiner','fEr','labelExaminer']].forEach(([f,iid,lbl])=>{
    const vs=findNameVariants(sess[f],f,sess.id);
    for(const v of vs){
      const msg=t2('nameSame').replace(/\{f\}/g,t(lbl)).replace(/\{a\}/g,v).replace(/\{b\}/g,sess[f]);
      if(!confirm(msg))continue;
      sess[f]=v;
      const el=document.getElementById(iid);if(el&&sess===cur)el.value=v;
      if(f==='examinee'&&sess===cur&&typeof eeBefore!=='undefined')eeBefore=v;
      break;
    }
  });
}
/* 同じ受験者（表記の完全一致）・同じ日の保存済み試問（自分自身を除く）。
   表記ゆれは alignNames で利用者が「同じ人」と答えた時だけ既存の表記にそろい、ここで一致する */
function sameDaySessions(sess){
  const k=nameExact(sess.examinee);if(!k)return[];
  return getAll().filter(s=>s.id!==sess.id&&s.date===sess.date&&nameExact(s.examinee)===k);
}
/* 録音したことのある項目 */
function recKeys(s){return Object.keys((s&&s.items)||{}).filter(k=>s.items[k]&&s.items[k].hasAudio&&safeKey(k))}

/* 同じ日の続きとしてまとめる：src（今の試問）の録音と合否を tgt（保存済みの試問の複製）へ写す。
   録音は src.id_item → tgt.id_item へ複製（同じ問の録音が両方にある場合は呼ばない）。写したキーを返す */
async function copySessInto(src,tgt){
  // 送信中の録音は、届いてから写す（送信結果が行き場を失って二重送信にならないように）
  for(let i=0;i<60&&recKeys(src).some(k=>typeof upBusy!=='undefined'&&upBusy[src.id+'_'+k]);i++)await new Promise(r=>setTimeout(r,250));
  const copied=[];
  for(const k of Object.keys(src.items||{})){
    const r=src.items[k];if(!r||!safeKey(k))continue;
    if(r.hasAudio){
      const b=await getAudio(src.id+'_'+k);
      if(!b){for(const c of copied)await delAudio(tgt.id+'_'+c);throw new Error('no-audio')}
      await putAudio(tgt.id+'_'+k,b);copied.push(k);
      tgt.items[k]=JSON.parse(JSON.stringify(r));
    }else if(isPF(r.score)&&!(tgt.items[k]&&tgt.items[k].score!=null)){
      tgt.items[k]=Object.assign(tgt.items[k]||{},{score:r.score});
    }
  }
  return copied; // 項目名のスナップショットは呼び出し側で snapMeta(tgt) する
}

/* ==============================================================
   受験者名の入力中はドライブへ送らない（途中の名前のフォルダを作らない）
   ============================================================== */
let eeTyping=false;const eeWaitQ=[];
function eeEditing(){const el=document.getElementById('fEe');return !!(eeTyping&&el&&document.activeElement===el)}
function eeWaitSend(itemId,opt){if(!eeWaitQ.some(x=>x.itemId===itemId&&!!(x.opt&&x.opt.replace)===!!(opt&&opt.replace)))eeWaitQ.push({itemId,opt,sid:cur&&cur.id})}
function eeCommitted(){
  eeTyping=false;
  const q=eeWaitQ.splice(0);
  q.forEach(x=>{if(cur&&cur.id===x.sid&&cur.items[x.itemId])maybeAutoUpload(x.itemId,x.opt)});
}
/* 受験者名が空のまま録音を始めたら、1試問につき1回だけ名前の入力を促す（録音は止めない） */
let eeNagged='';
function nagEmptyExaminee(){
  const fe=document.getElementById('fEe');
  if(!cur||!fe||fe.value.trim()||eeNagged===cur.id)return;
  eeNagged=cur.id;
  toast(t2('eeEmptyRec'),1);
  if(typeof setInvalid==='function')setInvalid('fEe',true);
}
/* 保存・やり直しの後：次の受験者名の欄を見える位置に出してフォーカス */
function focusNextExaminee(){
  const fe=document.getElementById('fEe');if(!fe)return;
  try{window.scrollTo({top:0,behavior:'instant'})}catch(e){window.scrollTo(0,0)}
  if(typeof inBand==='function'&&!inBand(fe)&&typeof scrollToBand==='function')scrollToBand(fe,'instant');
  try{fe.focus({preventScroll:true})}catch(e){fe.focus()}
}

/* ==============================================================
   起動時に復元した下書きの案内（共用端末で前の人の途中の試問に気づかず続けないように）
   ============================================================== */
let draftNoteOn=false;
function showDraftNote(on){
  draftNoteOn=!!on;
  let el=document.getElementById('draftNote');
  if(!on){if(el)el.remove();return}
  if(!cur)return;
  if(!el){
    const pg=document.getElementById('pgExam');if(!pg)return;
    el=document.createElement('div');el.id='draftNote';el.className='cd';el.setAttribute('role','status');
    el.style.cssText='border:2px solid var(--pri);font-size:.85rem;line-height:1.6';
    const first=pg.querySelector('.cd');pg.insertBefore(el,first||pg.firstChild);
  }
  const w=typeof curWork==='function'?curWork():{n:0,m:0};
  const ee=String(cur.examinee||'').trim()||t2('noName'),er=String(cur.examiner||'').trim()||t2('noName');
  const msg=t2(cur._resume?'draftNoteResume':'draftNote').replace('{e}',ee).replace('{n}',w.n).replace('{m}',w.m).replace('{r}',er);
  // 名前は利用者の入力＝ esc() して出す
  el.innerHTML=`<div style="font-weight:700">⟲ ${esc(msg)}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
    <button type="button" class="b b1" id="dnCont" style="flex:1 1 110px" onclick="showDraftNote(false)">${esc(t2('dnCont'))}</button>
    <button type="button" class="b b3" id="dnSave" style="flex:1 1 110px" onclick="saveSession()">${esc(t2('dnSave'))}</button>
    <button type="button" class="b b2" id="dnDrop" style="flex:1 1 110px" onclick="resetExam()">${esc(t2('dnDrop'))}</button></div>`;
}

/* ==============================================================
   保存済みの試問を続ける（途中で中断した試問に録音を足す）
   ============================================================== */
function unrecCount(r){return getItems().filter(it=>!(r.items[it.id]&&r.items[it.id].hasAudio)).length}
function canResume(r){return !!(r&&!active&&unrecCount(r)>0)}
function resumeBtnHtml(r,ctx){
  if(!canResume(r))return'';
  return `<button type="button" class="b b4" id="resume-${ctx}" style="flex:1 1 180px${ctx==='sc'?';padding:6px 12px;font-size:.78rem':''}" onclick="${ctx==='mo'?'closeMo();':''}resumeExam('${sanitizeId(r.id)}')">▶ ${esc(t2('resumeBtn').replace('{n}',unrecCount(r)))}</button>`;
}
async function resumeExam(id){
  if(active){toast(t2('recBusy'),1);return}
  if(!getAll().some(s=>s.id===id))return;
  // 採点途中の入力は先に保存（採点画面の古い写しで、後から続きを上書きしないよう画面も閉じる）
  if(curScore){persistScoreDraft(false);curScore=null;releaseScoreUrls();const d=document.getElementById('scDetail');if(d)d.style.display='none';syncScoringClass()}
  if(!(cur&&cur.id===id)){
    const w=curWork();
    const fill=s=>s.replace(/\{o\}/g,String(cur.examinee||'').trim()||t2('noName')).replace('{n}',w.n).replace('{m}',w.m);
    if(w.n){
      // 今の試問に未保存の録音がある：先に保存してから続きを開く
      if(!confirm(fill(t2('resumeSaveFirst'))))return;
      const ok=await saveSession({quiet:true});
      if(ok!==true)return;
    }else if(w.m&&!confirm(fill(t2('resumeDrop'))))return;
    const src=getAll().find(s=>s.id===id);if(!src)return;
    if(typeof hideUndoBar==='function')hideUndoBar();
    cur=JSON.parse(JSON.stringify(src));
    cur._resume=true;
    // 開いた時点の保存済みの版（下書きだけの印）。保存時に「続き」で変えた所だけを、その間に採点タブで保存された版へ重ねる
    cur._base=JSON.parse(JSON.stringify(src));
    cur._origBak=[]; // 録り直しで上書きした保存済みの録音（破棄したら元に戻す）
    // 採点済みの試問に録音を足す：採点待ちに戻す（保存時に、全問に○×があれば「採点も確定しますか」をもう一度聞く）
    if(cur.status==='scored')cur.status='rec';
    saveDraft();
  }
  document.getElementById('fDate').value=cur.date||todayStr();
  document.getElementById('fEr').value=cur.examiner||'';
  document.getElementById('fEe').value=cur.examinee||'';
  eeBefore=String(cur.examinee||'').trim();
  const tb=document.querySelector('.tabs button[data-pg="pgExam"]');if(tb)swTab(tb);
  buildExamCards();
  showDraftNote(false);
  toast(t2('resumed').replace('{e}',cur.examinee||''));
  const nx=getItems().find(it=>!(cur.items[it.id]&&cur.items[it.id].hasAudio));
  if(nx){const c=document.getElementById('q-'+sanitizeId(nx.id));if(c)setTimeout(()=>scrollToBand(c,'smooth'),60)}
}

/* 「続き」を保存するとき：開いてから今までに、採点タブなどで保存済みの版が変わっていても消さない（3方向マージ）。
   c＝続きの下書き（cur）・sv＝いま保存されている版・base＝続きを開いた時点の版（旧形式の下書きには無い）。
   各欄：続きで変えていなければ保存済みの版の値／変えていれば続きの値。base が無ければ、続きで空の欄だけ保存済みの値で埋める。
   状態：保存済みが採点済みでも、続きで録音を足した・録り直した問があれば採点待ちに戻す（全問に○×があれば保存時に確定を聞く） */
function mergeResumed(c,sv,base){
  if(!c||!sv)return;
  const hb=!!base;
  const same=(x,y)=>JSON.stringify(x===undefined?null:x)===JSON.stringify(y===undefined?null:y);
  const pick=(cv,bv,sv_)=>hb?(same(cv,bv)?sv_:cv):((cv==null||cv==='')?sv_:cv);
  const set=(o,f,v)=>{if(v===undefined)delete o[f];else o[f]=(v&&typeof v==='object')?JSON.parse(JSON.stringify(v)):v};
  ['overall','examinee','examiner','date','attempt'].forEach(f=>set(c,f,pick(c[f],hb?base[f]:undefined,sv[f])));
  c.meta=Object.assign({},sv.meta||{},c.meta||{});
  c.items=c.items||{};
  const bi=(hb&&base.items)||{},si=sv.items||{};
  Object.keys(si).forEach(k=>{
    const a=c.items[k],s=si[k],b=bi[k];
    if(!s)return;
    if(!a){c.items[k]=JSON.parse(JSON.stringify(s));return}
    const out={};
    new Set([...Object.keys(a),...Object.keys(s),...Object.keys(b||{})]).forEach(f=>set(out,f,pick(a[f],b?b[f]:undefined,s[f])));
    c.items[k]=out;
  });
  const bak=Array.isArray(c._origBak)?c._origBak:[];
  const added=Object.keys(c.items).filter(k=>c.items[k]&&c.items[k].hasAudio&&(bak.includes(k)||!((hb?bi[k]:si[k])&&(hb?bi[k]:si[k]).hasAudio)));
  if(sv.status==='scored')c.status=added.length?'rec':'scored';
  else c.status=sv.status||c.status||'rec';
}
/* 「続き」で保存済みの録音を上書きする直前に、元の録音を別キー（正式キー+'#orig'）へ退避する（putAudio から呼ぶ）。
   '#' は項目ID・試問IDに現れないので正式キーと重ならない。下書きの間は起動時の孤児整理でも消えない（試問IDで始まるため）。
   保存したら退避を消す／破棄したら元へ戻す（resetExam） */
async function resumeBackup(key){
  if(!cur||!cur._resume||typeof key!=='string'||key.indexOf('#')>=0||!key.startsWith(cur.id+'_'))return;
  const k=key.slice(cur.id.length+1);
  if(!safeKey(k))return;
  const bak=Array.isArray(cur._origBak)?cur._origBak:(cur._origBak=[]);
  if(bak.includes(k))return;
  const sv=getAll().find(s=>s.id===cur.id);
  if(!(sv&&sv.items&&sv.items[k]&&sv.items[k].hasAudio))return;
  const b=await getAudio(key);if(!b)return;
  await putAudio(key+'#orig',b);
  if(!bak.includes(k))bak.push(k);
  saveDraft();
}
/* 退避した元の録音を正式キーへ戻す（restore=true）／退避を片付ける。対象は sess._origBak の問 */
async function settleResumeBackups(sess,restore){
  const bak=sess&&Array.isArray(sess._origBak)?sess._origBak.slice():[];
  for(const k of bak){
    const key=sess.id+'_'+k;
    if(restore){const b=await getAudio(key+'#orig').catch(()=>null);if(b){try{await putAudio(key,b)}catch(e){toast(t2('storeFail'),1);continue}}}
    await delAudio(key+'#orig');
  }
}

/* ==============================================================
   履歴：名前を直す（1件だけ／同じ人の全件）
   ============================================================== */
function renameForm(id){
  const r=getAll().find(s=>s.id===id);if(!r)return;
  refreshNameLists();
  // 「同じ人の全件」＝表記が完全一致する試問だけ。表記ゆれ（声調記号・大小文字などが違う名前）は別の人のこともあるので、
  // 利用者が選んだものだけ含める（既定は選ばない）
  const ex=nameExact(r.examinee),k=nameKey(r.examinee);
  const grp=getAll().filter(s=>nameExact(s.examinee)===ex);
  const vcnt={};getAll().forEach(s=>{const n=String(s.examinee||'').trim();if(n&&nameExact(n)!==ex&&nameKey(n)===k)vcnt[n]=(vcnt[n]||0)+1});
  const vars=Object.keys(vcnt).sort((a,b)=>vcnt[b]-vcnt[a]||a.localeCompare(b));
  let h=`<div class="mh"><h2 id="moTitle">${esc(t2('rnTitle'))}</h2><button class="mx" aria-label="${esc(t('btnClose'))}" onclick="closeMo()">&times;</button></div>`;
  // 入力欄は試問タブと同じ見た目（.meta）。名前は利用者の入力＝ value も esc() して出す
  h+=`<div class="meta"><label for="rnEe">${esc(t('labelExaminee'))}</label><input type="text" id="rnEe" list="dlEe" autocomplete="off" value="${esc(r.examinee)}">`;
  h+=`<label for="rnEr">${esc(t('labelExaminer'))}</label><input type="text" id="rnEr" list="dlEr" autocomplete="off" value="${esc(r.examiner)}"></div>`;
  if(grp.length>1||vars.length){
    h+=`<fieldset style="border:1px solid var(--line,#ccc);border-radius:8px;margin-top:12px;padding:8px 10px;font-size:.85rem"><legend style="font-weight:700;padding:0 4px">${esc(t2('rnScope'))}</legend>
      <label style="display:block;padding:4px 0"><input type="radio" name="rnScope" value="one" checked> ${esc(t2('rnOne'))}</label>
      <label style="display:block;padding:4px 0"><input type="radio" name="rnScope" value="all"> ${esc(t2('rnAll').replace('{n}',grp.length).replace('{v}',nameExact(r.examinee)))}</label>`;
    if(vars.length){
      // 名前は利用者の入力＝ value も表示も esc() して出す。選んだら範囲は「全件」に切り替える
      h+=`<div style="margin:6px 0 0 22px;font-size:.8rem"><div style="color:var(--sub);line-height:1.5">${esc(t2('rnVars'))}</div>`
        +vars.map(v=>`<label style="display:block;padding:4px 0"><input type="checkbox" name="rnVar" value="${esc(v)}" onchange="if(this.checked){const a=document.querySelector('input[name=rnScope][value=all]');if(a)a.checked=true}"> ${esc(v)} (${vcnt[v]})</label>`).join('')+`</div>`;
    }
    h+=`</fieldset>`;
  }
  h+=`<div style="font-size:.75rem;color:var(--sub);margin-top:8px;line-height:1.6">${esc(t2('rnNote'))}</div>`;
  h+=`<div class="ma"><button type="button" class="b b1" id="rnOk" style="flex:1" onclick="applyRename('${sanitizeId(r.id)}')">${esc(t2('rnSave'))}</button><button type="button" class="b b3" style="flex:1" onclick="showDet('${sanitizeId(r.id)}')">${esc(t2('rnCancel'))}</button></div>`;
  document.getElementById('moBody').innerHTML=h;
  if(!document.getElementById('modal').classList.contains('show'))moShow();
  setTimeout(()=>{const i=document.getElementById('rnEe');if(i)i.focus()},80);
}
function applyRename(id){
  const ee=(document.getElementById('rnEe').value||'').trim(),er=(document.getElementById('rnEr').value||'').trim();
  if(!ee||!er){toast(t('eNm'),1);return}
  const sc=document.querySelector('input[name="rnScope"]:checked');
  const all=getAll();const r=all.find(s=>s.id===id);if(!r)return;
  // 全件＝表記が完全一致する試問＋利用者が「同じ人」として選んだ表記の試問だけ
  const same=new Set([nameExact(r.examinee)]);
  document.querySelectorAll('input[name="rnVar"]:checked').forEach(c=>same.add(nameExact(c.value)));
  const tg=(sc&&sc.value==='all')?all.filter(s=>same.has(nameExact(s.examinee))):[r];
  const changed=[];
  tg.forEach(s=>{if(s.examinee!==ee){s.examinee=ee;changed.push(s)}});
  if(r.examiner!==er){r.examiner=er;if(!changed.includes(r))changed.push(r)}
  if(!changed.length){showDet(id);return}
  if(!saveAll(all))return;
  // 開いている実体（再開中の試問・採点中）にも反映
  changed.forEach(s=>{
    if(cur&&cur.id===s.id){cur.examinee=s.examinee;cur.examiner=s.examiner;document.getElementById('fEe').value=cur.examinee;document.getElementById('fEr').value=cur.examiner;eeBefore=cur.examinee;saveDraft()}
    if(curScore&&curScore.id===s.id){curScore.examinee=s.examinee;curScore.examiner=s.examiner}
  });
  // ドライブへ送った録音は新しい名前のフォルダへ送り直す（旧名のフォルダに残る旧ファイルは driveOrphan として案内）
  if(typeof syncExamineeOnSave==='function')changed.forEach(s=>{const x=sessById(s.id)||s;syncExamineeOnSave(x,{onlySent:true})});
  toast(t2('rnDone').replace('{n}',changed.length));
  refreshSel();
  if(document.getElementById('pgHi').classList.contains('on'))drawHist();
  if(document.getElementById('pgScore').classList.contains('on')&&!curScore)drawScoreList();
  showDet(id);
}

/* ==============================================================
   ドライブに残った旧名のファイル（名前の訂正で送り直した録音の、前のフォルダ側）
   ============================================================== */
function orphanHtml(rec){
  const o=rec&&Array.isArray(rec.driveOrphan)?rec.driveOrphan:[];
  return o.map(x=>`<div class="orph" style="font-size:.75rem;font-weight:700;color:var(--s2,#c60);margin-top:6px;line-height:1.5">⚠ ${esc(t2('orphMsg').replace('{f}',x.folder||'').replace('{n}',x.name||''))}</div>`).join('');
}
function allOrphans(){
  const out=[];
  getAll().forEach(s=>Object.keys(s.items||{}).forEach(k=>{const r=s.items[k];if(r&&Array.isArray(r.driveOrphan))r.driveOrphan.forEach(x=>out.push({sid:s.id,k,x}))}));
  return out;
}
function renderDrvOrphans(){
  const st=document.getElementById('gStatus');if(!st)return;
  let el=document.getElementById('drvOrphans');
  const list=allOrphans();
  if(!list.length){if(el)el.remove();return}
  if(!el){el=document.createElement('div');el.id='drvOrphans';el.setAttribute('role','note');st.insertAdjacentElement('afterend',el)}
  el.style.cssText='border:1px solid var(--s2,#c60);border-radius:8px;padding:8px 10px;margin:8px 0;font-size:.78rem;line-height:1.6';
  el.innerHTML=`<div style="font-weight:700;color:var(--s2,#c60)">⚠ ${esc(t2('orphHead').replace('{n}',list.length))}</div><ul style="margin:4px 0 6px 18px;padding:0">`
    +list.slice(0,30).map(o=>`<li>${esc(o.x.folder||'')} / ${esc(o.x.name||'')}</li>`).join('')+(list.length>30?'<li>…</li>':'')
    +`</ul><button type="button" class="b b3" id="orphClr" style="padding:6px 10px;font-size:.74rem" onclick="clearDrvOrphans()">${esc(t2('orphClr'))}</button>`;
}
/* 手で消し終えたら案内を消す（消すのは案内の記録 driveOrphan だけ。録音・合否・送信先の情報は触らない） */
function clearDrvOrphans(){
  if(!confirm(t2('orphClrQ')))return;
  const all=getAll();
  all.forEach(s=>Object.keys(s.items||{}).forEach(k=>{if(s.items[k])delete s.items[k].driveOrphan}));
  if(!saveAll(all))return;
  [cur,curScore].forEach(o=>{if(o)Object.keys(o.items||{}).forEach(k=>{if(o.items[k])delete o.items[k].driveOrphan})});
  if(cur)saveDraft();
  renderDrvOrphans();
}
