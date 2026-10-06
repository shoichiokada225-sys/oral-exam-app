/* ui-score.js — 採点タブ：一覧と詳細（再生＋文字起こし＋合否）
   ※ js/ui.js を機械的に分割したもの（プレーンスクリプト・グローバル名は不変）。読み込み順は ui-core → ui-exam → ui-score → ui-hist → ui-chart → ui-cfg */
/* ==============================================================
   採点タブ：一覧
   ============================================================== */
function drawScoreList(){
  const fil=document.getElementById('scFil').value;
  let all=getAll();
  if(fil!=='all')all=all.filter(s=>s.status!=='scored');
  all.sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  const c=document.getElementById('scList');
  document.getElementById('scDetail').style.display='none';
  syncScoringClass();
  c.style.display='flex';
  document.querySelector('#pgScore .hctrl').style.display='flex';
  // 試問が1件も無い：採点待ち／すべてのどちらでも試問タブへの導線を出す
  if(!getAll().length){c.innerHTML=`<div class="nd">${esc(fil==='all'?t('noData'):t('noUnscored'))}<div style="font-size:.85rem;margin-top:6px">${esc(t2('emptyHint'))}</div><button type="button" class="b b1 egExam mt12" onclick="gotoExamTab()">${esc(t2('goExam'))}</button></div>`;return}
  if(!all.length){c.innerHTML=`<div class="nd">${fil==='all'?t('noData'):t('noUnscored')}</div>`;return}
  c.innerHTML=all.map(r=>{
    const x=rowRes(r);
    return `<button type="button" class="hi" data-sid="${sanitizeId(r.id)}" onclick="openScore('${sanitizeId(r.id)}')"><span class="hii"><span class="hid">${esc(r.date)} · <span class="hset">${esc(setLbl(r))}</span></span><span class="hin">${esc(r.examinee)}</span>${x.badge}</span><span class="hia ${x.cls}">${esc(x.lbl)}</span></button>`;
  }).join('');
}

/* ==============================================================
   採点タブ：詳細（再生＋文字起こし＋採点）
   ============================================================== */
async function openScore(id){
  const r=getAll().find(s=>s.id===id);if(!r)return;
  curScore=r;scBase=JSON.stringify(r);
  await renderScoreDetail(r,{focus:true});
}
/* 採点画面を開いている間だけ html.scoring（scroll-padding で保存バー・タブ・ヘッダーの下にフォーカスを隠さない） */
function syncScoringClass(){
  const det=document.getElementById('scDetail'),pg=document.getElementById('pgScore');
  document.documentElement.classList.toggle('scoring',!!(det&&pg&&pg.classList.contains('on')&&det.style.display!=='none'));
}
/* 一覧へ戻ったとき、直前に開いていた受験者の行へフォーカスを戻す（無ければ絞り込み→先頭行の順に代替） */
function focusScoreRow(id){
  const rows=[...document.querySelectorAll('#scList .hi')];
  const el=(id&&rows.find(b=>b.dataset.sid===sanitizeId(id)))||document.getElementById('scFil')||rows[0];
  if(el&&el.focus)el.focus();
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
      if(sel)curScore.items[id].score=sel.dataset.s;
      if(na)curScore.items[id].na=na.checked;
    }
  });
  const ov=document.getElementById('scOv');if(ov)curScore.overall=ov.value;
}
/* 採点の途中経過を自動保存（statusは変えない＝タブ移動・中断・誤操作で入力が消えない） */
let scSaveTimer=null;
let scBase=null; // 採点画面を開いた（または最後に保存した）時点の保存済みの版（JSON）。ほかのタブの変更を見分ける（M-3）
function queueScoreDraft(){clearTimeout(scSaveTimer);scSaveTimer=setTimeout(()=>persistScoreDraft(true),800)}
/* 保存済みの版が、この画面で開いた後にほかのタブで変わっていたら、こちらで変えた欄だけを重ねる（丸ごと上書きしない）。
   戻り値: 画面の内容が変わった（＝描き直しが要る）か */
function mergeScoreOther(stored){
  if(!curScore||!stored||scBase==null||JSON.stringify(stored)===scBase||typeof mergeResumed!=='function')return false;
  const before=JSON.stringify(curScore);
  mergeResumed(curScore,stored,JSON.parse(scBase));
  return JSON.stringify(curScore)!==before;
}
function persistScoreDraft(showHint,hiding){
  clearTimeout(scSaveTimer);
  if(!curScore)return;
  captureScoreForm();
  const all=getAll();const idx=all.findIndex(s=>s.id===curScore.id);
  if(idx<0)return;
  const other=mergeScoreOther(all[idx]);
  all[idx]=curScore;
  if(!saveAll(all))return; // 保存失敗（storeFail表示済み）＝「下書き保存」の表示を出さない
  scBase=JSON.stringify(curScore);
  if(other){toast(t('tabMerged'));if(!hiding)renderScoreDetail(curScore);return}
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
  // 旧5段階の点が残る項目は「旧評価で採点済み」（合否ボタンは未選択でも分子に数える）
  const n=ids.filter(id=>document.querySelector('.sb[data-id="'+id+'"].sel')||isOld(curScore.items[id].score)).length;
  const nOld=ids.filter(id=>!document.querySelector('.sb[data-id="'+id+'"].sel')&&isOld(curScore.items[id].score)).length;
  const c=document.getElementById('spCnt'),b=document.getElementById('spBar');
  if(c)c.textContent=n+' / '+scorable;
  const card=b?b.closest('.cd'):null;
  if(b){b.style.width=(scorable?Math.round(n/scorable*100):0)+'%';if(card)card.classList.toggle('complete',scorable>0&&n===scorable)}
  // 採点中のリアルタイム平均（1つ以上採点したら表示・評価色つき）
  const av=document.getElementById('spAvg');
  if(av){
    const vals=[...document.querySelectorAll('#scDetail .sb.sel')].map(el=>el.dataset.s);
    if(vals.length){
      const p=vals.filter(v=>v==='pass').length;
      av.textContent=t2('passCnt')+' '+p+'/'+vals.length+(nOld?'＋'+t2('oldN').replace('{n}',nOld):'');
      av.className='spavg '+(nOld?'old':p===vals.length?'a5':p===0?'a1':'a3');
    }else if(nOld){av.textContent=t2('oldN').replace('{n}',nOld);av.className='spavg old'}
    else{av.textContent='';av.className='spavg'}
  }
  // 完了ヒーローの色は合否に連動（全問合格=緑・全問不合格=赤・混在/旧評価=中立の濃紺）。「完了」だけで緑にしない
  const rc=av?(av.className.match(/\b(a5|a1|a3)\b/)||[])[1]||'':'';
  if(card)['res-a5','res-a1','res-a3'].forEach(k=>card.classList.toggle(k,k==='res-'+rc));
  // savebar常時表示の進捗+合否（表示のみの複製・保存形式に影響なし）。合否の数は評価色（spavgと同じ a5/a1/a3）
  const sb2=document.getElementById('sbCnt');
  if(sb2){
    sb2.textContent=n+' / '+scorable;
    if(av&&av.textContent){const r=document.createElement('span');r.className='sbres '+av.className.replace(/\bspavg\b/,'').trim();r.textContent=av.textContent;sb2.appendChild(r)}
  }
}
/* 採点カード1枚分のHTML（通常項目・過去項目で共用）。ansJa=表示中の模範解答が日本語フォールバックのとき言語注記を付ける */
function scoreCardHtml(r,id,en,name,desc,ans,ansJa){
  const rec=r.items[id]||{};
  const stt=getStt();const sttReady=!!(stt.key&&stt.endpoint); // STT未設定なら文字起こしボタン自体を出さない（押しても行き止まりのため）
  id=sanitizeId(id); // 多層防御: onclick/DOM id/data-id への埋め込みを描画側でも無害化（sessItemIdsのsafeKey・cfg無害化と同水準）
  const sc=rec.score;
  return `<div class="cd qc${sc?' scored':''}${isPF(sc)?' v-'+sc:''}" id="sc-${id}">
    <div class="en">${esc(en)}</div>
    <div class="enm">${esc(name)}</div>
    ${desc?`<div class="ed">${esc(desc)}</div>`:''}
    ${ans?`<details class="ans"><summary>${t('ansLbl')}${ansJa&&lang!=='ja'?' '+esc(t('ansJaNote')):''}</summary><div class="ansb">${esc(ans)}</div></details>`:''}
    ${rec.hasAudio?`<audio id="sa-${id}" controls></audio>`:`<div class="recstat">${t('recReady')}</div>`}
    <div class="tlbl"><span>${t('trLbl')}</span>${rec.hasAudio&&sttReady?`<button class="aibtn" id="ai-${id}" onclick="aiTranscribe('${id}')">${t('aiBtn')}</button>`:''}</div>
    <textarea class="trta" id="tr-${id}" aria-label="${esc(name)} ${esc(t('trLbl'))}" placeholder="${t('phTr')}">${esc(rec.transcript!=null?rec.transcript:(rec.draft||''))}</textarea>
    <div class="tlbl">${t('scoreLbl')}</div>
    <div class="sr" role="radiogroup" aria-label="${esc(name)} ${esc(t2('pfLbl'))}">${['pass','fail'].map(s=>`<button class="sb pf${sc===s?' sel':''}" role="radio" aria-checked="${sc===s?'true':'false'}" data-id="${id}" data-s="${s}" onclick="pickScore('${id}','${s}',this)">${s==='pass'?'○':'×'}<span class="sl">${esc(t2(s))}</span></button>`).join('')}</div>
    <div class="spick" id="sp-${id}">${isPF(sc)?esc(t2(sc)):(sc!=null?esc(t2('oldScore'))+': '+esc(pfLabel(sc)):'')}</div>
    ${rec.hasAudio?`<div class="cloud" id="scl-${id}" role="status" style="font-size:.78rem;font-weight:700;margin-top:6px;display:none"></div>`:''}
    ${rec.hasAudio?`<label class="nalbl"><input type="checkbox" class="nachk" data-id="${id}" ${rec.na?'checked':''} onchange="pickNA('${id}',this.checked)"> ${esc(t2('naLbl'))}</label>`:''}
    <div class="clbl">${t('cmtLbl')}</div>
    <textarea id="cm-${id}" aria-label="${esc(name)} ${esc(t('cmtLbl'))}" placeholder="${t('phCmt')}">${esc(rec.comment||'')}</textarea>
  </div>`;
}
async function renderScoreDetail(r,opt){
  releaseScoreUrls();
  document.getElementById('scList').style.display='none';
  document.querySelector('#pgScore .hctrl').style.display='none';
  const det=document.getElementById('scDetail');det.style.display='block';
  const secs=getSections(),items=getItems();
  let h=`<div class="cd meta"><div style="font-size:.85rem;color:var(--sub)">${esc(r.date)}</div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:2px"><div id="scHead" role="heading" aria-level="2" tabindex="-1" style="font-size:1.1rem;font-weight:700">${esc(r.examinee)}</div>${r.status==='scored'?`<span class="badge scored" id="scStBadge">${esc(t('stScored'))}</span>`:`<span class="badge pend" id="scStBadge">${esc(t2('stToConfirm'))}</span>`}</div><div style="font-size:.78rem;color:var(--sub);margin-top:2px" id="scSetLine">${esc(t2('examSetLbl'))}: ${esc(setLbl(r))}</div><div class="pmeta" style="margin-top:10px"><span>${esc(t2('progJudge'))}</span><span><span id="spAvg" class="spavg"></span><span id="spCnt"></span></span></div><div class="pbar"><i id="spBar"></i></div><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px"><button type="button" class="b b3" id="spdBtn" style="padding:6px 12px;font-size:.78rem;flex:0 0 auto" onclick="cycleSpeed()">${esc(t2('spd'))} ${playRate}x</button>${typeof resumeBtnHtml==='function'?resumeBtnHtml(r,'sc'):''}</div></div>`;
  // 録音も点も文字起こしも無い項目は折りたたみへ退避（採点すべきカードだけを本流に並べる）
  const noRec=[];
  secs.forEach(sec=>{
    const secItems=items.filter(it=>it.secId===sec.id);
    if(!secItems.length)return;
    let sh='';
    const secName=loc(sec,'name');
    secItems.forEach((it,ii)=>{
      const ansTxt=loc(it,'ans');
      const card=scoreCardHtml(r,it.id,secName.charAt(0)+'-'+(ii+1),qName(r,it,ii+1),it.free?'':loc(it,'desc'),ansTxt,ansTxt===it.ans);
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
  h+=`<div class="savebar"><div class="sbhead"><span id="sbCnt"></span><span class="autost" id="scAutoSt" role="status" style="flex:1"></span></div><div class="bg" style="margin:0"><button type="button" class="b b3 sbico" id="sbPause" onclick="pauseAllAudio()" aria-label="${esc(t2('pauseAll'))}" title="${esc(t2('pauseAll'))}">⏸</button><button type="button" class="b b3 sbico" id="sbSpd" onclick="cycleSpeed()" aria-label="${esc(t2('spd'))}" title="${esc(t2('spd'))}">${playRate}x</button><button class="b b4 sbsub" onclick="nextUnscored()" title="${esc(t2('nextUnscored'))}"><span class="lbl-l">${esc(t2('nextUnscored'))}</span><span class="lbl-s" aria-hidden="true">${esc(t2('nextUnscoredS'))}</span></button><button class="b b1 sbsave" onclick="saveScore()">${esc(t2(r.status==='scored'?'btnSaveConfirmed':'btnConfirmScore'))}</button><button class="b b3 sbsub" onclick="backToScoreList()" title="${esc(t('btnBack'))}"><span class="lbl-l">${t('btnBack')}</span><span class="lbl-s" aria-hidden="true">${esc(t2('backS'))}</span></button></div></div>`;
  det.innerHTML=h;
  det.querySelectorAll('textarea').forEach(el=>el.addEventListener('input',queueScoreDraft));
  // ドライブへ届いていない録音に「☁未送信（タップで再送）」を出す
  if(typeof isUnsent==='function')sessItemIds(r).forEach(id=>{if(isUnsent(r,id))setScoreCloud(r,id,'fail')});
  updateScoreProg();
  syncScoringClass();
  // 開いた直後は受験者名の見出しへフォーカス（bodyに落とさない＝読み上げ・キーボードで現在位置を見失わない）。言語切替の再描画では動かさない
  if(opt&&opt.focus){const hd=document.getElementById('scHead');if(hd)hd.focus({preventScroll:true})}
  window.scrollTo({top:0,behavior:'smooth'});
  // 音声URL（セッション自身のキーで走査＝過去項目の録音も再生できる）
  for(const id of sessItemIds(r)){
    if(r.items[id]&&r.items[id].hasAudio){
      const au=document.getElementById('sa-'+id);
      if(await attachAudio(r.id+'_'+id,au,curScoreUrls)){au.playbackRate=playRate;
        // 排他制御: 1つ再生を始めたら他の音声を全て止める（二重再生で聞き取り不能になるのを防ぐ）
        au.addEventListener('play',()=>{document.querySelectorAll('#scDetail audio').forEach(o=>{if(o!==au)o.pause()})});}
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
  const prevSc=curScore.items[id].score;
  if(checked&&isOld(prevSc)&&!confirm(t2('oldNA').replace('{v}',pfLabel(prevSc)))){
    const el=document.querySelector('.nachk[data-id="'+id+'"]');if(el)el.checked=false;return;
  }
  curScore.items[id].na=checked;
  if(checked){
    document.querySelectorAll('.sb[data-id="'+id+'"]').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-checked','false')});
    curScore.items[id].score=null;
    const sp=document.getElementById('sp-'+id);if(sp)sp.textContent='';
    const c=document.getElementById('sc-'+id);if(c)c.classList.remove('scored','v-pass','v-fail');
    // ドライブ上の名前（合格/不合格）も「未判定」に付け直す（合否があった時だけ）
    if(prevSc!=null&&typeof resyncDriveName==='function')resyncDriveName(curScore,id);
  }
  updateScoreProg();persistScoreDraft(true);
}
/* 次の未採点項目のid（なければnull） */
function findUnscoredId(){
  if(!curScore)return null;
  return sessItemIds(curScore).find(id=>{
    const rec=curScore.items[id];
    if(!rec||!rec.hasAudio)return false;
    const na=document.querySelector('.nachk[data-id="'+id+'"]');
    if(na&&na.checked)return false;
    if(isOld(rec.score))return false; // 旧5段階で採点済み
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
/* 同じボタンをもう一度押したら合否を外す（試問画面の setVerdict と同じ。録音のない問の誤タップの○×も外せる・M-4）。
   手袋のチャタリング・二度押し：同じボタンを500ms以内に続けて押した2回目は無視 */
const scLast={};
function clearScore(id){
  const rec=curScore&&curScore.items[id];if(!rec)return;
  rec.score=null;
  if(typeof resyncDriveName==='function'&&rec.hasAudio)resyncDriveName(curScore,id);
  document.querySelectorAll('.sb[data-id="'+id+'"]').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-checked','false')});
  const sp=document.getElementById('sp-'+id);if(sp)sp.textContent='';
  const c=document.getElementById('sc-'+id);if(c)c.classList.remove('scored','v-pass','v-fail');
  clearTimeout(autoNextTimer);
  updateScoreProg();persistScoreDraft(true);
  toast(t2('pfCleared'));
}
function pickScore(id,s,btn){
  const now=Date.now(),lp=scLast[id];
  scLast[id]={s,t:now};
  if(lp&&lp.s===s&&now-lp.t<500)return;
  if(curScore&&curScore.items[id]&&curScore.items[id].score===s&&btn&&btn.classList.contains('sel'))return clearScore(id);
  // 旧5段階の点を合否で上書きする時は確認（1タップ＋自動保存で旧点数が黙って消えないように）
  const prevSc=curScore&&curScore.items[id]&&curScore.items[id].score;
  if(isOld(prevSc)&&!confirm(t2('oldReplace').replace('{v}',pfLabel(prevSc))))return;
  // 押した瞬間にcurScoreへ反映（進捗カウンタの分母・分子がDOM選択と一致する）
  if(curScore){curScore.items[id]=curScore.items[id]||{};curScore.items[id].score=s}
  if(curScore&&typeof resyncDriveName==='function')resyncDriveName(curScore,id); // ドライブのファイル名の合否も付け直す
  btn.parentElement.querySelectorAll('.sb').forEach(b=>{b.classList.remove('sel');b.setAttribute('aria-checked','false')});btn.classList.add('sel');btn.setAttribute('aria-checked','true');const sp=document.getElementById('sp-'+id);if(sp)sp.textContent=pfLabel(s);const c=document.getElementById('sc-'+id);if(c){c.classList.add('scored');c.classList.toggle('v-pass',s==='pass');c.classList.toggle('v-fail',s==='fail')}const na=document.querySelector('.nachk[data-id="'+id+'"]');if(na&&na.checked){na.checked=false;if(curScore&&curScore.items[id])curScore.items[id].na=false}updateScoreProg();persistScoreDraft(true);queueAutoNext()} // 合否は押した時点で保存（直後にアプリを閉じても残す・M-18）
function backToScoreList(){clearTimeout(autoNextTimer);persistScoreDraft(false);const sid=curScore&&curScore.id;curScore=null;releaseScoreUrls();document.getElementById('scDetail').style.display='none';drawScoreList();focusScoreRow(sid)}
function releaseScoreUrls(){curScoreUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(e){}});curScoreUrls=[]}


function saveScore(){
  clearTimeout(scSaveTimer);
  const r=curScore;if(!r)return;
  // ほかのタブで同じ試問が変わっていた：上書きせず、統合した内容を描き直して知らせる（確かめてからもう一度保存）
  {const sv=getAll().find(s=>s.id===r.id);captureScoreForm();if(mergeScoreOther(sv)){scBase=JSON.stringify(sv);toast(t('tabMerged'),1);renderScoreDetail(r);return}}
  const ids=sessItemIds(r); // 現在のcfg ∪ セッション自身の項目（過去項目も採点対象）
  const isNA=id=>{const na=document.querySelector('.nachk[data-id="'+id+'"]');return na?na.checked:!!(r.items[id]&&r.items[id].na)};
  const miss=[];
  ids.forEach(id=>{
    const rec=r.items[id]||{};
    if(!rec.hasAudio)return; // 録音のない項目は採点対象外
    if(isNA(id))return;      // 「質問しなかった」は必須採点から除外
    const sel=document.querySelector('.sb[data-id="'+id+'"].sel');
    if(!sel&&!isOld(rec.score))miss.push(id); // 旧5段階の点が残る項目は採点済み扱い（旧データのまま保存できる）
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
    r.items[id].score=(!na&&sel)?sel.dataset.s:(na?null:r.items[id].score);
  });
  r.overall=document.getElementById('scOv').value;
  snapMeta(r); // 項目名スナップショットを追記（cfg変更後も履歴・CSVで名前が出る）
  const prevStatus=r.status;
  r.status='scored';
  r.updatedAt=new Date().toISOString();
  const all=getAll();const idx=all.findIndex(s=>s.id===r.id);if(idx>=0)all[idx]=r;else all.push(r);
  // 保存に失敗したら（容量不足等）採点画面を閉じない＝入力した合否・文字起こし・コメントを画面に残す
  if(!saveAll(all)){r.status=prevStatus;return}
  scBase=null;
  toast(t('tScored'));
  curScore=null;releaseScoreUrls();
  document.getElementById('scDetail').style.display='none';
  // 保存直後は「すべて」表示に切替＝いま採点した行が「採点済」バッジ付きで見え続ける（空画面の行き止まり防止）
  const sf=document.getElementById('scFil');if(sf)sf.value='all';
  drawScoreList();refreshSel();
  focusScoreRow(r.id); // 保存して一覧へ戻ったら、いま採点した行へフォーカスを戻す
}

/* 画面が隠れる・閉じる直前に、採点の途中経過をすぐ保存する（自動保存の0.8秒待ちの間に閉じても失わない・M-18） */
function flushScoreDraft(){const d=document.getElementById('scDetail');if(curScore&&d&&d.style.display!=='none')persistScoreDraft(false,true)}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushScoreDraft()});
addEventListener('pagehide',flushScoreDraft);
