/* ui.js — 描画層：試問カード/採点/履歴/詳細/グラフ/CSV/設定画面 */
/* ==============================================================
   ui.js内ローカル文言（i18n.jsはコンテンツ担当が編集中のため触らない。
   短いUIラベルは4言語、確認ダイアログ等の長文はja中心でenフォールバック）
   ============================================================== */
const TX2={
ja:{qsTitle:'試問セット',qsCur:'現在のセット',qsNone:'（セット未保存の構成）',qsSaveNew:'現在の項目を新しいセットとして保存',qsOver:'上書き保存',qsApply:'切替',qsRen:'名前変更',qsDel:'削除',
qsNamePrompt:'セット名を入力してください（例：新人向け／繁殖担当／棚倉農場）',
qsSwConfirm:'試問項目をセット「{n}」に切り替えます。現在の未保存の編集は失われます（過去の試問データは消えません）。よろしいですか？',
qsDelConfirm:'セット「{n}」を削除しますか？（過去の試問データは消えません）',
qsSaved:'セットを保存しました',qsApplied:'セットに切り替えました',qsDeleted:'セットを削除しました',
qbTitle:'プリセット試問セット（テンプレート）',qbReplace:'項目を置き換え',qbAppend:'項目に追記',
qbRepConfirm:'現在の試問項目をプリセット「{n}」で置き換えます（過去の試問データは消えません）。よろしいですか？',
qbApplied:'プリセットを適用しました',qbNone:'プリセット（qbank.js）が読み込まれていません',
dirty:'未保存の変更があります',dirtyLeave:'試問項目に未保存の変更があります。保存せずに移動しますか？（変更は破棄されます）',
delSecConfirm:'このセクションと全質問を削除しますか？',cfgNote:'※質問を削除・差し替えても、過去の試問の採点・録音・文字起こしは履歴とCSVに残ります',
storeFail:'保存に失敗しました（端末の空き容量不足の可能性）。設定タブからバックアップの書き出しをおすすめします',
gcConfirm:'どのセッションにも属さない録音データが{n}件見つかりました。削除して端末の容量を空けますか？',gcDone:'件の不要な録音を削除しました',
naLbl:'質問しなかった（採点対象外）',nextUnrec:'次の未録音へ',nextUnscored:'次の未採点へ',allRec:'すべて録音済みです',allScored:'未採点の項目はありません',
recBusy:'録音中です。先に「停止」を押してください',noRecGroup:'録音のない項目（{n}）',
spd:'速度',pauseAll:'再生を停止',sumTimes:'回受験',added:'追加済み',prevLbl:'前回',extraSec:'過去の項目（現在の設定にない質問）',
resetCnt:'（録音{n}件を削除します。元に戻せません）'},
en:{qsTitle:'Question set',qsCur:'Active set',qsNone:'(unsaved layout)',qsSaveNew:'Save current items as a new set',qsOver:'Overwrite',qsApply:'Switch',qsRen:'Rename',qsDel:'Delete',
qsNamePrompt:'Enter a set name',
qsSwConfirm:'Switch items to set "{n}"? Unsaved edits will be lost (past exam data is kept).',
qsDelConfirm:'Delete set "{n}"? (past exam data is kept)',
qsSaved:'Set saved',qsApplied:'Switched to set',qsDeleted:'Set deleted',
qbTitle:'Preset question sets (templates)',qbReplace:'Replace items',qbAppend:'Append items',
qbRepConfirm:'Replace current items with preset "{n}"? (past exam data is kept)',
qbApplied:'Preset applied',qbNone:'Presets (qbank.js) not loaded',
dirty:'Unsaved changes',dirtyLeave:'Exam items have unsaved changes. Leave without saving? (changes will be discarded)',
delSecConfirm:'Delete this section and all its questions?',cfgNote:'Deleting/replacing questions does not remove past scores, recordings or transcripts from history and CSV',
storeFail:'Save failed (device storage may be full). Export a backup from Settings',
gcConfirm:'{n} recording(s) belong to no session. Delete them to free space?',gcDone:' orphan recording(s) deleted',
naLbl:'Not asked (excluded from scoring)',nextUnrec:'Next unrecorded',nextUnscored:'Next unscored',allRec:'All items recorded',allScored:'Nothing left to score',
recBusy:'Recording in progress — press "Stop" first',noRecGroup:'Items without recording ({n})',
spd:'Speed',pauseAll:'Pause playback',sumTimes:' exams',sumTimes1:' exam',added:'Added',extraSec:'Past items (not in current settings)',prevLbl:'Prev',
resetCnt:'({n} recording(s) will be deleted. This cannot be undone)'},
vi:{qsTitle:'Bộ câu hỏi',qsCur:'Bộ hiện tại',qsNone:'(chưa lưu thành bộ)',qsSaveNew:'Lưu các mục hiện tại thành bộ mới',qsOver:'Ghi đè',qsApply:'Chuyển',qsRen:'Đổi tên',qsDel:'Xóa',
qsNamePrompt:'Nhập tên bộ',qbTitle:'Bộ câu hỏi mẫu',qbReplace:'Thay thế mục',qbAppend:'Thêm vào mục',
naLbl:'Không hỏi (không chấm)',nextUnrec:'Mục chưa ghi tiếp theo',nextUnscored:'Mục chưa chấm tiếp theo',allRec:'Đã ghi tất cả',allScored:'Không còn mục chưa chấm',
recBusy:'Đang ghi âm — hãy nhấn "Dừng" trước',noRecGroup:'Mục không có ghi âm ({n})',
spd:'Tốc độ',pauseAll:'Dừng phát',sumTimes:' lần thi',added:'Đã thêm',extraSec:'Mục cũ (không có trong cài đặt hiện tại)',prevLbl:'Lần trước',
resetCnt:'({n} bản ghi âm sẽ bị xóa. Không thể hoàn tác)'},
id:{qsTitle:'Set pertanyaan',qsCur:'Set aktif',qsNone:'(belum disimpan sebagai set)',qsSaveNew:'Simpan item saat ini sebagai set baru',qsOver:'Timpa',qsApply:'Ganti',qsRen:'Ubah nama',qsDel:'Hapus',
qsNamePrompt:'Masukkan nama set',qbTitle:'Set pertanyaan preset',qbReplace:'Ganti item',qbAppend:'Tambahkan item',
naLbl:'Tidak ditanya (tidak dinilai)',nextUnrec:'Item belum direkam berikutnya',nextUnscored:'Item belum dinilai berikutnya',allRec:'Semua sudah direkam',allScored:'Tidak ada yang belum dinilai',
recBusy:'Sedang merekam — tekan "Stop" dulu',noRecGroup:'Item tanpa rekaman ({n})',
spd:'Kecepatan',pauseAll:'Jeda pemutaran',sumTimes:' ujian',added:'Sudah ditambah',extraSec:'Item lama (tidak ada di pengaturan)',prevLbl:'Sebelumnya',
resetCnt:'({n} rekaman akan dihapus. Tidak dapat dibatalkan)'}
};
function t2(k){const d=TX2[lang]||TX2.ja;return d[k]||TX2.en[k]||TX2.ja[k]||k}

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
    const secName=loc(sec,'name'); // 多言語コンテンツ（name_en等があれば言語追従・無ければ原文）
    h+=`<h2 class="stit" id="sec-i${si}">${esc(secName)}</h2>`;
    secItems.forEach((it,ii)=>{
      const iid=sanitizeId(it.id); // 多層防御: onclick/DOM idへの埋め込みは描画側でも無害化（loadCfg/importBackup/applySetの上流無害化に一点依存しない）
      const rec=cur&&cur.items[it.id];
      const has=rec&&rec.hasAudio;
      const ansTxt=loc(it,'ans');
      h+=`<div class="cd qc${has?' done':''}" id="q-${iid}">
        <div class="en">${esc(secName.charAt(0))}-${ii+1}</div>
        <div class="enm">${esc(loc(it,'name'))}</div>
        <div class="ed">${esc(loc(it,'desc'))}</div>
        ${ansTxt?`<details class="ans"><summary>${t('ansLbl')}${lang!=='ja'&&ansTxt===it.ans?' '+esc(t('ansJaNote')):''}</summary><div class="ansb">${esc(ansTxt)}</div></details>`:''}
        <div class="recrow">
          <button class="recbtn" id="rb-${iid}" onclick="toggleRec('${iid}')"><span class="dot"></span><span class="rlab">${has?t('recRedo'):t('recStart')}</span></button>
          <span class="rectime" id="rt-${iid}"></span>
          <span class="recstat${has?' ok':''}" id="rs-${iid}">${has?'● '+t('recDone'):t('recReady')}</span>
          <button type="button" class="b b3" id="nx-${iid}" style="display:${has?'inline-block':'none'};flex:0 0 auto;padding:6px 10px;font-size:.74rem;margin-left:auto" onclick="gotoNextUnrec('${iid}')">${esc(t2('nextUnrec'))} ▾</button>
        </div>
        <audio id="au-${iid}" controls style="display:${has?'block':'none'}"></audio>
        <div class="live" id="lv-${iid}" style="display:${(rec&&rec.draft)?'block':'none'}"><span class="lbl">${t('liveLbl')}</span><span class="lvtxt">${esc(rec?rec.draft:'')}</span></div>
        <div class="cloud" id="cl-${iid}" style="font-size:.78rem;font-weight:700;margin-top:6px;display:${(rec&&rec.driveLink)?'block':'none'};color:var(--pri)">${(rec&&rec.driveLink)?t('clDone'):''}</div>
      </div>`;
    });
  });
  el.innerHTML=h;
  // 旧ObjectURLを解放してから既存録音の再生用URLを復元
  examUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});examUrls=[];
  if(cur)getItems().forEach(async it=>{
    if(cur.items[it.id]&&cur.items[it.id].hasAudio){
      const b=await getAudio(cur.id+'_'+it.id);
      if(b){const au=document.getElementById('au-'+sanitizeId(it.id));if(au){const u=URL.createObjectURL(b);examUrls.push(u);au.src=u;au.style.display='block'}}
    }
  });
  updateExamProg();
}

/* 試問タブ：録音進捗バー＋セクションジャンプ */
function updateExamProg(){
  const box=document.getElementById('examProg');if(!box)return;
  const items=getItems(),secs=getSections();
  const m=items.length;
  if(!m){box.style.display='none';box.classList.remove('complete');return}
  box.style.display='block';
  const done=it=>cur&&cur.items[it.id]&&cur.items[it.id].hasAudio;
  const n=items.filter(done).length;
  // 録音完了直後（media.jsのonstopから呼ばれる）に「次の未録音へ」ボタンを出す
  items.forEach(it=>{const b=document.getElementById('nx-'+sanitizeId(it.id));if(b)b.style.display=done(it)?'inline-block':'none'});
  document.getElementById('epLbl').textContent=t('progRec');
  document.getElementById('epCnt').textContent=n+' / '+m;
  document.getElementById('epBar').style.width=Math.round(n/m*100)+'%';
  box.classList.toggle('complete',n===m); // 全問録音でバーが完了色に
  const chips=document.getElementById('epChips');chips.innerHTML='';
  secs.forEach((sec,si)=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    if(!secItems.length)return;
    const d=secItems.filter(done).length;
    const b=document.createElement('button');
    b.type='button';b.className='chip'+(d===secItems.length?' done':'');
    b.textContent=loc(sec,'name')+' '+d+'/'+secItems.length;
    b.onclick=()=>{const a=document.getElementById('sec-i'+si);if(a)a.scrollIntoView({behavior:'smooth',block:'start'})};
    chips.appendChild(b);
  });
}

/* 録音完了後の導線：次の未録音項目へスクロール（末尾までいったら先頭へ折り返し） */
function gotoNextUnrec(fromId){
  const items=getItems();
  const i=items.findIndex(it=>it.id===fromId);
  const order=items.slice(i+1).concat(items.slice(0,Math.max(i,0)+1));
  const nxt=order.find(it=>!(cur&&cur.items[it.id]&&cur.items[it.id].hasAudio));
  if(!nxt){toast(t2('allRec'));return}
  const c=document.getElementById('q-'+sanitizeId(nxt.id));
  if(c)c.scrollIntoView({behavior:'smooth',block:'center'});
}

/* 平均点→評価色クラス（4.5+:優 3.5+:良 2.5+:可 1.5+:要改善 それ未満:不可） */
function avgCls(v){const n=parseFloat(v);if(isNaN(n))return'';return n>=4.5?'a5':n>=3.5?'a4':n>=2.5?'a3':n>=1.5?'a2':'a1'}

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
    return `<button type="button" class="hi" onclick="openScore('${sanitizeId(r.id)}')"><span class="hii"><span class="hid">${esc(r.date)} · ${t('erLbl')}: ${esc(r.examiner)}</span><span class="hin">${esc(r.examinee)}</span><span class="badge ${sc?'scored':'rec'}">${sc?t('stScored'):t('stRec')}</span></span><span class="hia ${sc?avgCls(avg(r)):''}">${sc?avg(r):'–'}</span></button>`;
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
  sessItemIds(curScore).forEach(id=>{
    const tr=document.getElementById('tr-'+id);
    const cm=document.getElementById('cm-'+id);
    const sel=document.querySelector('.sb[data-id="'+id+'"].sel');
    const na=document.querySelector('.nachk[data-id="'+id+'"]');
    if(tr||cm||sel||na){
      curScore.items[id]=curScore.items[id]||{};
      if(tr)curScore.items[id].transcript=tr.value;
      if(cm)curScore.items[id].comment=cm.value;
      if(sel)curScore.items[id].score=+sel.dataset.s;
      if(na)curScore.items[id].na=na.checked;
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
  // 採点対象=録音あり or 既に点が付いている項目（N/A=質問しなかった項目は除外。分子も同じ母集団で数える）
  const ids=sessItemIds(curScore).filter(id=>{
    const r=curScore.items[id];
    if(!r)return false;
    const naEl=document.querySelector('.nachk[data-id="'+id+'"]');
    if(naEl?naEl.checked:r.na)return false; // 画面が開いていればチェック状態、なければ保存値
    return r.hasAudio||r.score!=null;
  });
  const scorable=ids.length;
  const n=ids.filter(id=>document.querySelector('.sb[data-id="'+id+'"].sel')).length;
  const c=document.getElementById('spCnt'),b=document.getElementById('spBar');
  if(c)c.textContent=n+' / '+scorable;
  if(b){b.style.width=(scorable?Math.round(n/scorable*100):0)+'%';const card=b.closest('.cd');if(card)card.classList.toggle('complete',scorable>0&&n===scorable)}
  // 採点中のリアルタイム平均（1つ以上採点したら表示・評価色つき）
  const av=document.getElementById('spAvg');
  if(av){
    const vals=[...document.querySelectorAll('#scDetail .sb.sel')].map(el=>+el.dataset.s);
    if(vals.length){
      const m=(vals.reduce((a,b)=>a+b,0)/vals.length).toFixed(1);
      av.textContent=t('avgLbl')+' '+m;
      av.className='spavg '+avgCls(m);
    }else{av.textContent='';av.className='spavg'}
  }
  // savebar常時表示の進捗+平均（表示のみの複製・保存形式に影響なし）
  const sb2=document.getElementById('sbCnt');
  if(sb2){let txt=n+' / '+scorable;if(av&&av.textContent)txt+='　'+av.textContent;sb2.textContent=txt}
}
/* 採点カード1枚分のHTML（通常項目・過去項目で共用）。ansJa=表示中の模範解答が日本語フォールバックのとき言語注記を付ける */
function scoreCardHtml(r,id,en,name,desc,ans,ansJa){
  const rec=r.items[id]||{};
  const stt=getStt();const sttReady=!!(stt.key&&stt.endpoint); // STT未設定なら文字起こしボタン自体を出さない（押しても行き止まりのため）
  id=sanitizeId(id); // 多層防御: onclick/DOM id/data-id への埋め込みを描画側でも無害化（sessItemIdsのsafeKey・cfg無害化と同水準）
  const sc=rec.score;
  return `<div class="cd qc${sc?' scored':''}" id="sc-${id}">
    <div class="en">${esc(en)}</div>
    <div class="enm">${esc(name)}</div>
    ${desc?`<div class="ed">${esc(desc)}</div>`:''}
    ${ans?`<details class="ans"><summary>${t('ansLbl')}${ansJa&&lang!=='ja'?' '+esc(t('ansJaNote')):''}</summary><div class="ansb">${esc(ans)}</div></details>`:''}
    ${rec.hasAudio?`<audio id="sa-${id}" controls></audio>`:`<div class="recstat">${t('recReady')}</div>`}
    <div class="tlbl"><span>${t('trLbl')}</span>${rec.hasAudio&&sttReady?`<button class="aibtn" id="ai-${id}" onclick="aiTranscribe('${id}')">${t('aiBtn')}</button>`:''}</div>
    <textarea class="trta" id="tr-${id}" placeholder="${t('phTr')}">${esc(rec.transcript!=null?rec.transcript:(rec.draft||''))}</textarea>
    <div class="tlbl">${t('scoreLbl')}</div>
    <div class="sr" role="radiogroup" aria-label="${esc(name)} ${t('scoreLbl')}">${[1,2,3,4,5].map(s=>`<button class="sb${sc===s?' sel':''}" role="radio" aria-checked="${sc===s?'true':'false'}" data-id="${id}" data-s="${s}" onclick="pickScore('${id}',${s},this)">${s}<span class="sl">${t('s'+s)}</span></button>`).join('')}</div>
    <div class="spick" id="sp-${id}">${sc?sc+' — '+t('s'+sc):''}</div>
    ${rec.hasAudio?`<label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:.8rem;color:var(--sub);cursor:pointer"><input type="checkbox" class="nachk" data-id="${id}" ${rec.na?'checked':''} onchange="pickNA('${id}',this.checked)" style="width:auto"> ${esc(t2('naLbl'))}</label>`:''}
    <div class="clbl">${t('cmtLbl')}</div>
    <textarea id="cm-${id}" placeholder="${t('phCmt')}">${esc(rec.comment||'')}</textarea>
  </div>`;
}
async function renderScoreDetail(r){
  releaseScoreUrls();
  document.getElementById('scList').style.display='none';
  document.querySelector('#pgScore .hctrl').style.display='none';
  const det=document.getElementById('scDetail');det.style.display='block';
  const secs=getSections(),items=getItems();
  let h=`<div class="cd meta"><div style="font-size:.85rem;color:var(--sub)">${esc(r.date)} · ${t('erLbl')}: ${esc(r.examiner)}</div><div style="font-size:1.1rem;font-weight:700;margin-top:2px">${esc(r.examinee)}</div><div class="pmeta" style="margin-top:10px"><span>${t('progScore')}</span><span><span id="spAvg" class="spavg"></span><span id="spCnt"></span></span></div><div class="pbar"><i id="spBar"></i></div><button type="button" class="b b3" id="spdBtn" style="margin-top:10px;padding:6px 12px;font-size:.78rem" onclick="cycleSpeed()">${esc(t2('spd'))} ${playRate}x</button></div>`;
  // 録音も点も文字起こしも無い項目は折りたたみへ退避（採点すべきカードだけを本流に並べる）
  const noRec=[];
  secs.forEach(sec=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    if(!secItems.length)return;
    let sh='';
    const secName=loc(sec,'name');
    secItems.forEach((it,ii)=>{
      const ansTxt=loc(it,'ans');
      const card=scoreCardHtml(r,it.id,secName.charAt(0)+'-'+(ii+1),loc(it,'name'),loc(it,'desc'),ansTxt,ansTxt===it.ans);
      const rec=r.items[it.id];
      if(rec&&(rec.hasAudio||rec.score!=null||rec.transcript))sh+=card;
      else noRec.push(card);
    });
    if(sh)h+=`<h2 class="stit">${esc(secName)}</h2>`+sh;
  });
  // 現在の設定に無いが、このセッションに録音/採点/文字起こしが残っている過去項目（cfg変更後も採点できる）
  const extras=sessItemIds(r).filter(id=>{
    if(items.some(it=>it.id===id))return false;
    const rec=r.items[id];return rec&&(rec.hasAudio||rec.score!=null||rec.transcript);
  });
  if(extras.length){
    h+=`<h2 class="stit">${esc(t2('extraSec'))}</h2>`;
    extras.forEach((id,ii)=>{
      const m=itemMeta(r,id);
      h+=scoreCardHtml(r,id,'#-'+(ii+1),m.name+(m.sec?'（'+m.sec+'）':''),'',null);
    });
  }
  if(noRec.length){
    h+=`<details class="ans" style="margin-top:14px"><summary>${esc(t2('noRecGroup').replace('{n}',noRec.length))}</summary><div style="padding:0 10px 10px">${noRec.join('')}</div></details>`;
  }
  h+=`<div class="cd oasec"><h2>${t('overall')}</h2><textarea id="scOv" class="oata" rows="4" placeholder="${t('phOv')}">${esc(r.overall||'')}</textarea></div>`;
  // savebar: 進捗+平均の常時表示（sbCnt）と再生停止/速度（sbPause/sbSpd）— 長い採点画面のどこにいても操作・確認できる
  h+=`<div class="savebar"><div style="display:flex;justify-content:space-between;align-items:flex-end;gap:8px"><span id="sbCnt" style="font-size:.78rem;font-weight:700;color:var(--sub)"></span><span class="autost" id="scAutoSt" role="status" style="flex:1"></span></div><div class="bg" style="margin:0"><button type="button" class="b b3 sbico" id="sbPause" onclick="pauseAllAudio()" aria-label="${esc(t2('pauseAll'))}" title="${esc(t2('pauseAll'))}">⏸</button><button type="button" class="b b3 sbico" id="sbSpd" onclick="cycleSpeed()" aria-label="${esc(t2('spd'))}" title="${esc(t2('spd'))}">${playRate}x</button><button class="b b4" onclick="nextUnscored()">${esc(t2('nextUnscored'))}</button><button class="b b1" onclick="saveScore()">${t('btnSaveScore')}</button><button class="b b3" onclick="backToScoreList()">${t('btnBack')}</button></div></div>`;
  det.innerHTML=h;
  det.querySelectorAll('textarea').forEach(el=>el.addEventListener('input',queueScoreDraft));
  updateScoreProg();
  window.scrollTo({top:0,behavior:'smooth'});
  // 音声URL（セッション自身のキーで走査＝過去項目の録音も再生できる）
  for(const id of sessItemIds(r)){
    if(r.items[id]&&r.items[id].hasAudio){
      const b=await getAudio(r.id+'_'+id);
      if(b){const au=document.getElementById('sa-'+id);if(au){const u=URL.createObjectURL(b);curScoreUrls.push(u);au.src=u;au.playbackRate=playRate;
        // 排他制御: 1つ再生を始めたら他の音声を全て止める（二重再生で聞き取り不能になるのを防ぐ）
        au.addEventListener('play',()=>{document.querySelectorAll('#scDetail audio').forEach(o=>{if(o!==au)o.pause()})});}}
    }
  }
}
/* 音声の再生速度トグル（1x→1.25x→1.5x→2x）。トップのspdBtnとsavebarのsbSpdを同時更新 */
let playRate=1;
function cycleSpeed(){
  playRate={'1':1.25,'1.25':1.5,'1.5':2,'2':1}[String(playRate)]||1;
  document.querySelectorAll('#scDetail audio').forEach(a=>{a.playbackRate=playRate});
  const b=document.getElementById('spdBtn');if(b)b.textContent=t2('spd')+' '+playRate+'x';
  const sb=document.getElementById('sbSpd');if(sb)sb.textContent=playRate+'x';
}
/* savebarの⏸: 再生中の音声を全て止める（再生中のカードが画面外でも止められる） */
function pauseAllAudio(){document.querySelectorAll('#scDetail audio').forEach(a=>a.pause())}
/* 「質問しなかった」＝採点対象外（score=null維持なので集計・CSVは従来通り互換） */
function pickNA(id,checked){
  if(!curScore)return;
  curScore.items[id]=curScore.items[id]||{};
  curScore.items[id].na=checked;
  if(checked){
    document.querySelectorAll('.sb[data-id="'+id+'"]').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-checked','false')});
    curScore.items[id].score=null;
    const sp=document.getElementById('sp-'+id);if(sp)sp.textContent='';
    const c=document.getElementById('sc-'+id);if(c)c.classList.remove('scored');
  }
  updateScoreProg();queueScoreDraft();
}
/* 次の未採点項目のid（なければnull） */
function findUnscoredId(){
  if(!curScore)return null;
  return sessItemIds(curScore).find(id=>{
    const rec=curScore.items[id];
    if(!rec||!rec.hasAudio)return false;
    const na=document.querySelector('.nachk[data-id="'+id+'"]');
    if(na&&na.checked)return false;
    return !document.querySelector('.sb[data-id="'+id+'"].sel');
  })||null;
}
/* 次の未採点項目へジャンプ＋その音声を頭から自動再生（排他制御済み＝前の音声は止まる） */
function nextUnscored(){
  if(!curScore)return;
  const id=findUnscoredId();
  if(!id){toast(t2('allScored'));return}
  const c=document.getElementById('sc-'+id);
  if(c)c.scrollIntoView({behavior:'smooth',block:'center'});
  const au=document.getElementById('sa-'+id);
  if(au&&au.src){au.currentTime=0;au.play().catch(()=>{})}
}
/* 採点タップ後、未採点が残っていれば600ms後に自動で次へ（全採点済みトーストは出さない） */
let autoNextTimer=null;
function queueAutoNext(){
  clearTimeout(autoNextTimer);
  autoNextTimer=setTimeout(()=>{
    const det=document.getElementById('scDetail');
    if(!curScore||!det||det.style.display==='none')return;
    if(findUnscoredId())nextUnscored();
  },600);
}
function pickScore(id,s,btn){
  // 押した瞬間にcurScoreへ反映（進捗カウンタの分母・分子がDOM選択と一致する）
  if(curScore){curScore.items[id]=curScore.items[id]||{};curScore.items[id].score=s}
  btn.parentElement.querySelectorAll('.sb').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-checked','false')});btn.classList.add('sel');btn.setAttribute('aria-checked','true');const sp=document.getElementById('sp-'+id);if(sp)sp.textContent=s+' — '+t('s'+s);const c=document.getElementById('sc-'+id);if(c)c.classList.add('scored');const na=document.querySelector('.nachk[data-id="'+id+'"]');if(na&&na.checked){na.checked=false;if(curScore&&curScore.items[id])curScore.items[id].na=false}updateScoreProg();queueScoreDraft();queueAutoNext()}
function backToScoreList(){clearTimeout(autoNextTimer);persistScoreDraft(false);curScore=null;releaseScoreUrls();document.getElementById('scDetail').style.display='none';drawScoreList()}
function releaseScoreUrls(){curScoreUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});curScoreUrls=[]}


function saveScore(){
  clearTimeout(scSaveTimer);
  const r=curScore;if(!r)return;
  const ids=sessItemIds(r); // 現在のcfg ∪ セッション自身の項目（過去項目も採点対象）
  const isNA=id=>{const na=document.querySelector('.nachk[data-id="'+id+'"]');return na?na.checked:!!(r.items[id]&&r.items[id].na)};
  const miss=[];
  ids.forEach(id=>{
    const rec=r.items[id]||{};
    if(!rec.hasAudio)return; // 録音のない項目は採点対象外
    if(isNA(id))return;      // 「質問しなかった」は必須採点から除外
    const sel=document.querySelector('.sb[data-id="'+id+'"].sel');
    if(!sel)miss.push(id);
  });
  if(miss.length){
    miss.forEach(id=>{const c=document.getElementById('sc-'+id);if(c){c.classList.add('warn');setTimeout(()=>c.classList.remove('warn'),1000)}});
    toast(t('eScore')+'（'+miss.length+'）',1);
    const f=document.getElementById('sc-'+miss[0]);if(f)f.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  ids.forEach(id=>{
    if(!document.getElementById('sc-'+id))return; // 画面に無い項目は触らない
    r.items[id]=r.items[id]||{};
    const tr=document.getElementById('tr-'+id);if(tr)r.items[id].transcript=tr.value;
    const cm=document.getElementById('cm-'+id);if(cm)r.items[id].comment=cm.value;
    const na=isNA(id);r.items[id].na=na;
    const sel=document.querySelector('.sb[data-id="'+id+'"].sel');
    r.items[id].score=(!na&&sel)?+sel.dataset.s:null;
  });
  r.overall=document.getElementById('scOv').value;
  snapMeta(r); // 項目名スナップショットを追記（cfg変更後も履歴・CSVで名前が出る）
  r.status='scored';
  r.updatedAt=new Date().toISOString();
  const all=getAll();const idx=all.findIndex(s=>s.id===r.id);if(idx>=0)all[idx]=r;else all.push(r);
  saveAll(all);
  toast(t('tScored'));
  curScore=null;releaseScoreUrls();
  document.getElementById('scDetail').style.display='none';
  // 保存直後は「すべて」表示に切替＝いま採点した行が「採点済」バッジ付きで見え続ける（空画面の行き止まり防止）
  const sf=document.getElementById('scFil');if(sf)sf.value='all';
  drawScoreList();refreshSel();
}

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
    const last=parseFloat(avg(arr[arr.length-1]));
    const prev=arr.length>1?parseFloat(avg(arr[arr.length-2])):null;
    return{name:n,count:arr.length,last,prev};
  }).filter(s=>!isNaN(s.last));
}
function eeFilterIdx(i){const s=_eeSums[i];if(!s)return;const hf=document.getElementById('hFil');hf.value=s.name;drawHist()}
function eeSummaryHtml(filterName){
  _eeSums=eeSummary();
  let sums=_eeSums.map((s,i)=>({...s,idx:i}));
  if(filterName)sums=sums.filter(s=>s.name===filterName);
  if(!sums.length)return'';
  return `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">`+sums.map(s=>{
    const arrow=s.prev==null?'':s.last>s.prev+0.05?'▲':s.last<s.prev-0.05?'▼':'→';
    const col=arrow==='▲'?'var(--s4)':arrow==='▼'?'var(--s1)':'var(--sub)';
    return `<button type="button" class="cd" style="flex:1 1 150px;min-width:140px;text-align:left;cursor:pointer;padding:10px 12px;margin:0" onclick="eeFilterIdx(${s.idx})">
      <div style="font-weight:700;font-size:.9rem">${esc(s.name)}</div>
      <div style="font-size:.74rem;color:var(--sub)">${s.count}${esc((s.count===1&&(TX2[lang]||{}).sumTimes1)||t2('sumTimes'))}</div>
      <div style="font-size:1.1rem;font-weight:800;margin-top:2px"><span class="${avgCls(s.last)}">${s.last.toFixed(1)}</span>${arrow?` <span style="font-size:.8rem;font-weight:700;color:${col}">${arrow} ${esc(t2('prevLbl'))} ${s.prev.toFixed(1)}</span>`:''}</div>
    </button>`;
  }).join('')+'</div>';
}
function drawHist(){
  const f=document.getElementById('hFil').value;let all=getAll();if(f)all=all.filter(e=>e.examinee===f);
  const q=(document.getElementById('hQ').value||'').trim().toLowerCase();
  if(q)all=all.filter(e=>((e.examinee||'')+' '+(e.examiner||'')).toLowerCase().includes(q));
  all.sort((a,b)=>(b.date||'').localeCompare(a.date||'')||(b.createdAt||'').localeCompare(a.createdAt||''));
  const c=document.getElementById('hList');
  if(!all.length){c.innerHTML=`<div class="nd">${t('noData')}</div>`;return}
  let h=q?'':eeSummaryHtml(f),pm='';
  all.forEach(r=>{
    const ym=(r.date||'').slice(0,7);
    if(ym&&ym!==pm){h+=`<div class="mgrp">${esc(fmtMonth(ym))}</div>`;pm=ym}
    const sc=r.status==='scored';
    h+=`<button type="button" class="hi" onclick="showDet('${sanitizeId(r.id)}')"><span class="hii"><span class="hid">${esc(r.date)} · ${t('erLbl')}: ${esc(r.examiner)}</span><span class="hin">${esc(r.examinee)}</span><span class="badge ${sc?'scored':'rec'}">${sc?t('stScored'):t('stRec')}</span></span><span class="hia ${sc?avgCls(avg(r)):''}">${sc?avg(r):'–'}</span></button>`;
  });
  c.innerHTML=h;
}

async function showDet(id){
  const r=getAll().find(e=>e.id===id);if(!r)return;
  releaseScoreUrls();
  // cfg変更後も過去項目が消えないよう「cfg ∪ セッション自身のキー」で走査、名前はスナップショット優先
  const ids=sessItemIds(r);
  let h=`<div class="mh"><h2 id="moTitle">${esc(r.examinee)} - ${esc(r.date)}</h2><button class="mx" aria-label="${t('btnClose')}" onclick="closeMo()">&times;</button></div>`;
  h+=`<div style="font-size:.85rem;color:var(--sub);margin-bottom:12px">${t('erLbl')}: ${esc(r.examiner)} · ${t('avgLbl')}: ${r.status==='scored'?avg(r):'-'}</div>`;
  ids.forEach(iid=>{
    const rec=r.items[iid]||{};
    if(!rec.hasAudio&&rec.score==null&&!rec.transcript)return;
    const sc=rec.score;
    const m=itemMeta(r,iid);
    h+=`<div class="di"><div class="dih"><span class="din">${esc(m.name)}</span>${sc?`<span class="dis sb${sc}">${sc}</span>`:''}</div>`;
    if(rec.hasAudio)h+=`<audio id="da-${iid}" controls></audio>`;
    if(rec.transcript)h+=`<div class="ditr">${esc(rec.transcript)}</div>`;
    if(rec.comment)h+=`<div class="dic">${esc(rec.comment)}</div>`;
    h+=`</div>`;
  });
  if(r.overall)h+=`<div class="dov"><strong>${t('ovLbl')}:</strong><br>${esc(r.overall)}</div>`;
  h+=`<div class="ma"><button class="b b4" style="flex:1" onclick="closeMo();gotoScore('${sanitizeId(r.id)}')">${t('btnScore')}</button><button class="b b2" style="flex:1" onclick="doDel('${sanitizeId(r.id)}')">${t('btnDel')}</button><button class="b b3" style="flex:1" onclick="closeMo()">${t('btnClose')}</button></div>`;
  document.getElementById('moBody').innerHTML=h;
  moShow();
  for(const iid of ids){
    if(r.items[iid]&&r.items[iid].hasAudio){
      const b=await getAudio(r.id+'_'+iid);
      if(b){const au=document.getElementById('da-'+iid);if(au){const u=URL.createObjectURL(b);curScoreUrls.push(u);au.src=u}}
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
function moShow(){
  moOpener=document.activeElement;
  document.getElementById('modal').classList.add('show');
  const mx=document.querySelector('#moBody .mx');
  if(mx)setTimeout(()=>mx.focus(),60);
}
function closeMo(){
  document.getElementById('modal').classList.remove('show');
  releaseScoreUrls();
  if(moOpener&&moOpener.isConnected&&moOpener.focus)moOpener.focus();
  moOpener=null;
}
function doDel(id){
  if(!confirm(t('cDel')))return;
  // セッション自身のキーで削除（cfg変更後でも旧項目の音声がIndexedDBに孤児残留しない）
  const r=getAll().find(e=>e.id===id);
  if(r)Object.keys(r.items||{}).forEach(k=>delAudio(id+'_'+k));
  saveAll(getAll().filter(e=>e.id!==id));
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
  const hd=[t('labelDate'),t('labelExaminer'),t('labelExaminee'),t('csvStatus'),...cols.map(c=>c.name+'('+t('scoreLbl')+')'),...cols.map(c=>c.name+'('+t('trLbl')+')'),...cols.map(c=>c.name+'('+t('csvCmt')+')'),t('avgLbl'),t('overall'),t('csvCreated')];
  // 数式インジェクション対策：=,+,-,@ 等で始まる値は先頭に ' を付ける
  const cell=s=>{let v=String(s==null?'':s);if(/^[=+\-@\t\r]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"'};
  let csv='﻿'+hd.map(cell).join(',')+'\n';
  all.forEach(r=>{
    const row=[r.date,r.examiner,r.examinee,r.status==='scored'?t('stScored'):t('stRec'),
      ...cols.map(c=>(r.items[c.id]&&r.items[c.id].score)||''),
      ...cols.map(c=>(r.items[c.id]&&r.items[c.id].transcript)||''),
      ...cols.map(c=>(r.items[c.id]&&r.items[c.id].comment)||''),
      r.status==='scored'?avg(r):'',r.overall||'',r.createdAt||''];
    csv+=row.map(cell).join(',')+'\n';
  });
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
  a.download='oral_exam_'+new Date().toISOString().slice(0,10).replace(/-/g,'')+'.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000); // 書き出しの度にBlobが端末メモリへ残るのを防ぐ（exportBackupと同じ後始末）
}

/* ==============================================================
   グラフ
   ============================================================== */
let cL=null,cR=null,cS=null;
/* グラフ色はCSS変数から取得（ダークモードでも視認できる色に自動追従） */
function chartTheme(){
  const cs=getComputedStyle(document.documentElement);
  const acc=(cs.getPropertyValue('--chart')||'#2e5d7d').trim();
  const grid=(cs.getPropertyValue('--chart-grid')||'rgba(0,0,0,.08)').trim();
  const txt=(cs.getPropertyValue('--sub')||'#666').trim();
  Chart.defaults.color=txt;
  Chart.defaults.borderColor=grid;
  Chart.defaults.font.family=getComputedStyle(document.body).fontFamily;
  // 評価5段階の色（セクション別バーを点数で色分けするために使う）
  const sc=[1,2,3,4,5].map(i=>(cs.getPropertyValue('--s'+i)||'#888').trim());
  const pick=v=>v>=4.5?sc[4]:v>=3.5?sc[3]:v>=2.5?sc[2]:v>=1.5?sc[1]:sc[0];
  return{acc,fill:acc+'26',grid,txt,pick}; // fill=アクセントの15%透過（8桁hex）
}
function drawCharts(){
  const who=document.getElementById('chSel').value,area=document.getElementById('chArea'),none=document.getElementById('chNone');
  if(!who){area.style.display='none';none.style.display='block';none.textContent=t('selEe');return}
  const all=getAll().filter(e=>e.examinee===who&&e.status==='scored');
  if(!all.length){area.style.display='none';none.style.display='block';none.textContent=t('chNone');return}
  area.style.display='block';none.style.display='none';
  all.sort((a,b)=>(a.date||'').localeCompare(b.date||''));
  const items=getItems();
  const th=chartTheme();
  // スクリーンリーダー向けのテキスト代替（描画データの要約）
  document.getElementById('cvL').setAttribute('aria-label',t('chLine')+': '+all.map(e=>e.date+' '+avg(e)).join(', '));
  if(cL)cL.destroy();
  // 塗りは上→下へ消えるグラデーション（面の主張を抑えて線を立てる）
  const g=document.getElementById('cvL').getContext('2d').createLinearGradient(0,0,0,280);
  g.addColorStop(0,th.acc+'4d');g.addColorStop(1,th.acc+'05');
  cL=new Chart(document.getElementById('cvL'),{type:'line',data:{labels:all.map(e=>e.date),datasets:[{label:t('chAvg'),data:all.map(e=>parseFloat(avg(e))),borderColor:th.acc,borderWidth:2.5,backgroundColor:g,fill:true,tension:.3,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:th.acc,pointBorderColor:'#fff',pointBorderWidth:1.5}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:1,max:5,ticks:{stepSize:1}}},plugins:{legend:{display:false}}}});
  const lat=all[all.length-1];
  // セクション別平均（直近の採点済み試問）
  const secLabels=[],secData=[];
  getSections().forEach(sec=>{
    const si=items.filter(it=>it.secId===sec.id);if(!si.length)return;
    const vs=si.map(it=>lat.items[it.id]&&lat.items[it.id].score).filter(x=>x!=null);
    if(vs.length){secLabels.push(loc(sec,'name'));secData.push(+(vs.reduce((a,b)=>a+b,0)/vs.length).toFixed(2))}
  });
  document.getElementById('cvS').setAttribute('aria-label',t('chSec')+': '+secLabels.map((l,i)=>l+' '+secData[i]).join(', '));
  if(cS)cS.destroy();
  cS=new Chart(document.getElementById('cvS'),{type:'bar',data:{labels:secLabels,datasets:[{data:secData,backgroundColor:secData.map(v=>th.pick(v)+'cc'),borderRadius:6,barThickness:22}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,scales:{x:{min:0,max:5,ticks:{stepSize:1}}},plugins:{legend:{display:false}}}});
  document.getElementById('cvR').setAttribute('aria-label',t('chRadar')+': '+items.map(it=>loc(it,'name')+' '+((lat.items[it.id]&&lat.items[it.id].score)||'-')).join(', '));
  if(cR)cR.destroy();
  // 前回試問のオーバーレイ（破線）＝成長が一目で見える
  const prev=all.length>1?all[all.length-2]:null;
  const rDatasets=[{label:lat.date,data:items.map(it=>(lat.items[it.id]&&lat.items[it.id].score)||0),borderColor:th.acc,backgroundColor:th.fill,pointBackgroundColor:th.acc}];
  if(prev)rDatasets.push({label:(t2('prevLbl'))+' '+prev.date,data:items.map(it=>(prev.items[it.id]&&prev.items[it.id].score)||0),borderColor:th.acc+'80',backgroundColor:'transparent',borderDash:[6,4],borderWidth:1.5,pointBackgroundColor:th.acc+'80',pointRadius:2});
  cR=new Chart(document.getElementById('cvR'),{type:'radar',data:{labels:items.map(it=>{const n=loc(it,'name');return n.length>(lang==='ja'?6:14)?n.slice(0,lang==='ja'?6:14)+'…':n}),datasets:rDatasets},options:{responsive:true,maintainAspectRatio:false,scales:{r:{min:0,max:5,ticks:{stepSize:1,font:{size:10}},pointLabels:{font:{size:11}},grid:{color:th.grid},angleLines:{color:th.grid}}},plugins:{legend:{display:true,position:'bottom'}}}});
}

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
