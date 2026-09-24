/* app.js — アプリ層：初期化・タブ・セッションフロー・項目設定の保存 */
/* ==============================================================
   言語
   ============================================================== */
function setLang(l){
  if(active){toast(t2('recBusy'),1);return} // 録音中は切替不可（カード再描画でUIが壊れるため）
  lang=l;localStorage.setItem(LKEY,l);document.documentElement.lang=l;
  document.title=t('appTitle'); // ブラウザタブ名も言語に追従
  document.querySelectorAll('.lsw button').forEach(b=>{const on=b.textContent.trim()==={ja:'JP',en:'EN',vi:'VI',id:'ID'}[l];b.classList.toggle('on',on);b.setAttribute('aria-pressed',on?'true':'false')});
  applyT();buildExamCards();buildCfgUI();
  if(document.getElementById('saveErr'))showSaveErr(true,true); // 保存失敗の常設案内も言語に追従（スクロールはしない）
  if(typeof renderExamSetSel==='function')renderExamSetSel(); // セット切替UIも言語に追従
  // 開いている採点画面・一覧を再描画（入力中の採点は退避してから再描画）
  if(document.getElementById('pgScore').classList.contains('on')){if(curScore){captureScoreForm();renderScoreDetail(curScore)}else{drawScoreList()}}
}
function applyT(){
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t)});
  document.querySelectorAll('[data-ph]').forEach(el=>{el.placeholder=t(el.dataset.ph)});
  // 言語に追従するアクセシブルネーム
  const nav=document.getElementById('mainNav');if(nav)nav.setAttribute('aria-label',t('navMain'));
  const bl=document.getElementById('beepLbl');if(bl)bl.textContent=t2('beepOpt');
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
/* index.htmlはデザイン担当が編集中のため、追加DOMはJSで生成して既存コンテナに挿入する */
function injectDynamicContainers(){
  // 試問タブ上部：質問セット切替
  const meta=document.querySelector('#pgExam .cd.meta');
  if(meta&&!document.getElementById('examSetBox')){
    const d=document.createElement('div');
    d.id='examSetBox';d.className='cd';d.style.display='none';
    meta.parentElement.insertBefore(d,meta);
  }
  // 試問タブ上部：1行の使い方ガイド（初見の試問者向け。文言はi18n howto・applyTで言語追従）
  if(meta&&!document.getElementById('examHowto')){
    const d=document.createElement('div');
    d.id='examHowto';d.className='cd';d.dataset.t='howto';
    d.style.cssText='font-size:.8rem;color:var(--sub);line-height:1.7';
    meta.parentElement.insertBefore(d,meta);
  }
  // 試問タブ：ドライブ未設定の案内（使い方の下・閉じたら出さない。中身は updateDriveUi）
  if(meta&&!document.getElementById('drvHint')){
    const d=document.createElement('div');
    d.id='drvHint';d.className='cd';d.setAttribute('role','note');d.style.display='none';
    meta.parentElement.insertBefore(d,meta);
  }
  // 設定タブ最上部：録音の合図（開始・停止で短い音。振動は対応端末で常に）
  const cfgPg=document.getElementById('pgCfg');
  if(cfgPg&&!document.getElementById('recOptBox')){
    const d=document.createElement('div');d.id='recOptBox';d.className='cd';
    d.innerHTML='<label class="ckrow" style="margin-top:0"><input type="checkbox" id="beepChk"> <span id="beepLbl"></span></label>';
    cfgPg.insertBefore(d,cfgPg.firstChild);
    const c=d.querySelector('#beepChk');c.checked=typeof beepOn==='function'&&beepOn();
    c.addEventListener('change',()=>{setBeep(c.checked);if(c.checked)recCue('start')});
  }
  // 設定タブ：プリセット/質問セットUI（作業カタログボタンの上）
  const catBtn=document.getElementById('btnCatAdd');
  if(catBtn&&!document.getElementById('qsetArea')){
    const d=document.createElement('div');
    d.id='qsetArea';
    catBtn.parentElement.insertBefore(d,catBtn);
  }
  // 設定タブ：未保存バッジ（「項目を保存」ボタンの直上）
  const saveBtn=document.querySelector('#pgCfg button[onclick="saveCfg()"]');
  if(saveBtn&&!document.getElementById('cfgDirtyBadge')){
    const b=document.createElement('div');
    b.id='cfgDirtyBadge';
    b.style.cssText='display:none;color:var(--s2,#c60);font-size:.8rem;font-weight:700;text-align:center;margin-bottom:6px';
    saveBtn.parentElement.insertBefore(b,saveBtn);
  }
}

document.addEventListener('DOMContentLoaded',()=>{
  injectDynamicContainers();
  restoreDraftOrNew();
  document.getElementById('fDate').value=cur.date||todayStr();
  // 試問者名は前回値を初期表示（毎回の手入力を省く）
  let lastEr='';try{lastEr=localStorage.getItem(EKEY)||''}catch(e){}
  document.getElementById('fEr').value=cur.examiner||lastEr;
  document.getElementById('fEe').value=cur.examinee||'';
  ['fDate','fEr','fEe'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{clearInvalid(id);if(cur){cur.date=document.getElementById('fDate').value;cur.examiner=document.getElementById('fEr').value;cur.examinee=document.getElementById('fEe').value;saveDraft()}}));
  // 受験者名を書き換えたとき：前の人の未保存の録音・合否を黙って次の人に付け替えない
  const fEe=document.getElementById('fEe');
  // 名前が空の間は、消す前の名前を覚えたままにする（A→空→B でも A からの書き換えとして確認する）
  fEe.addEventListener('focus',()=>{const v=cur?String(cur.examinee||'').trim():'';if(v||!cur)eeBefore=v});
  fEe.addEventListener('change',()=>{onExamineeChange()});
  const s=getStt();
  document.getElementById('sttEndpoint').value=s.endpoint||'';
  document.getElementById('sttModel').value=s.model||'';
  document.getElementById('sttKey').value=s.key||'';
  const gImported=applyUrlConfig();
  setLang(lang);
  renderExamSetSel();
  if(gImported)setTimeout(()=>toast(t('gCfgSaved')),400);
  // 孤児音声GC（どのセッションにも属さない録音を検出→件数確認のうえ削除）
  setTimeout(()=>gcOrphanAudio(),2500);
  // 前回、録音の途中で端末が落ちた・タブが閉じられた：一時保存から「中断された録音を復元」を出す
  setTimeout(()=>{if(typeof checkLiveTakes==='function')checkLiveTakes()},600);
  // 前回ドライブへ届かなかった録音（送信失敗・送信中に終了）を、電波があれば起動時にまとめて再送
  setTimeout(()=>{if(navigator.onLine!==false&&typeof resendAllUnsent==='function')resendAllUnsent()},4000);
  // 録音中、または端末に保存できていない録音（メモリ上だけの唯一の写し）がある間は、閉じる・再読み込みを止める
  window.addEventListener('beforeunload',e=>{if(active||pendingTakes().length){e.preventDefault();e.returnValue=''}});
  // スクロール中はsticky進捗ヒーローを小型化して可視窓を広げる（先頭へ戻るとchips付きフル表示に自動復帰）
  addEventListener('scroll',()=>{const p=document.getElementById('examProg');if(p)p.classList.toggle('mini',window.scrollY>240)},{passive:true});
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
  // キーボード移動の先が固定表示（ヘッダー・試問ヒーロー・採点保存バー・タブ）に隠れたら押し上げる。
  // 指で触った時は動かさない（タップ中にスクロールすると押し間違いになるため、直前の入力がキーの時だけ）
  let kbdNav=false;
  document.addEventListener('keydown',e=>{if(e.key==='Tab'||e.key.startsWith('Arrow'))kbdNav=true},true);
  document.addEventListener('pointerdown',()=>{kbdNav=false},true);
  document.addEventListener('focusin',e=>{if(kbdNav)requestAnimationFrame(()=>revealFocused(e.target))});
  applyTheme(theme);
  // OSのライト/ダーク切替に合わせてメタ色・グラフ配色を引き直す（自動モード時）
  try{matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>applyTheme(theme))}catch(e){}
  // オフライン/復帰の通知（現場の電波切れでも記録は端末内に残ることを伝える）
  window.addEventListener('offline',()=>toast(t('tOffline'),1));
  window.addEventListener('online',()=>{toast(t('tOnline'));setTimeout(()=>{if(typeof resendAllUnsent==='function')resendAllUnsent()},1500)});
  // PWA: オフライン利用・ホーム画面インストール（https/localhostのみ。file://直開きでは何もしない）
  if('serviceWorker' in navigator&&(location.protocol==='https:'||['localhost','127.0.0.1'].includes(location.hostname))){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
});

/* 要素が上下の固定表示に重なっていれば、見える位置までスクロールする（モーダル内・固定表示そのものは対象外） */
function revealFocused(el){
  if(!el||el!==document.activeElement||!el.getBoundingClientRect)return;
  if(el.closest('.hdr,.tabs,.savebar,.prog,#modal,.toast'))return;
  const r=el.getBoundingClientRect();if(!r.height&&!r.width)return;
  const vis=x=>x&&x.offsetParent!==null&&getComputedStyle(x).position!=='static';
  let top=0;const hd=document.querySelector('.hdr');if(vis(hd))top=Math.max(top,hd.getBoundingClientRect().bottom);
  const pg=document.querySelector('.pg.on .prog');if(vis(pg)&&!pg.contains(el))top=Math.max(top,pg.getBoundingClientRect().bottom);
  let bot=window.innerHeight;const tb=document.querySelector('.tabs');if(vis(tb))bot=Math.min(bot,tb.getBoundingClientRect().top);
  const sb=document.querySelector('#scDetail .savebar');
  if(vis(sb)){const s=sb.getBoundingClientRect();if(s.top<bot&&s.bottom>top&&s.top>r.top-1)bot=Math.min(bot,s.top-14)} // ::before のぼかし14pxぶんも避ける
  const pad=8;let dy=0;
  if(r.bottom>bot-pad)dy=r.bottom-(bot-pad);
  if(r.top-dy<top+pad)dy=r.top-(top+pad); // 画面より高い要素は上端を優先
  if(dy)window.scrollBy({top:dy,behavior:'instant'});
}
function newSession(){
  if(typeof hideUndoBar==='function')hideUndoBar(); // 別の試問になったら前の試問の「元に戻す」は閉じる
  cur={id:crypto.randomUUID(),date:todayStr(),examiner:'',examinee:'',items:{},overall:'',status:'rec',createdAt:new Date().toISOString()};
}
function restoreDraftOrNew(){
  try{
    const d=JSON.parse(localStorage.getItem(DRAFTKEY));
    // 録音済み項目を含む下書きのみ復元（保存済みセッションと重複しないもの）
    if(d&&d.id&&d.items&&Object.values(d.items).some(x=>x&&x.hasAudio)&&!getAll().some(s=>s.id===d.id)){cur=d;return}
  }catch(e){}
  newSession();
}
function saveDraft(){if(!cur)return;try{localStorage.setItem(DRAFTKEY,JSON.stringify(cur))}catch(e){toast(t2('storeFail'),1)}}

/* ==============================================================
   試問の保存・リセット
   ============================================================== */
/* 録音中固定ピル（media.jsが生成）から呼ばれる：
   録音中カードの停止ボタンが見えていればその場で停止、見えていなければカードへスクロール。
   scrollOnly=true はスクロールのみ（他カードの録音ボタン誤タップ時＝勝手に停止しない） */
function jumpToActiveRec(scrollOnly){
  if(!active)return;
  const iid=sanitizeId(active.itemId);
  const card=document.getElementById('q-'+iid);
  const btn=document.getElementById('rb-'+iid);
  const tgt=btn||card;
  if(!tgt){if(!scrollOnly)stopRec();return}
  // 見えている＝ヘッダー・ヒーローの下端からタブの上端まで（横向きでタブの裏に隠れたボタンを「見えている」と判定しない）
  const inView=inBand(tgt);
  if(inView&&!scrollOnly){stopRec();return}
  const row=card&&card.querySelector('.recrow');
  scrollToBand(row||tgt,'smooth');
  // スクロール到着後に停止ボタンを強調（「ここで停止」を明示。ピルの1タップ目で止まらない驚きを補う）
  if(btn){btn.classList.add('attn');setTimeout(()=>btn.classList.remove('attn'),2200)}
}
/* 固定表示（stickyのヘッダー・試問ヒーロー／固定のタブ）を除いた「実際に見えている縦の範囲」 */
function recBand(){
  const vh=window.innerHeight||document.documentElement.clientHeight;
  let top=0,bot=vh;
  const fx=x=>x&&x.offsetParent!==null&&/sticky|fixed/.test(getComputedStyle(x).position);
  const hd=document.querySelector('.hdr');if(fx(hd)){const r=hd.getBoundingClientRect();if(r.bottom>0)top=Math.max(top,r.bottom)}
  const pg=document.querySelector('.pg.on .prog');if(fx(pg)){const r=pg.getBoundingClientRect();if(r.top<vh/2)top=Math.max(top,r.bottom)}
  const tb=document.querySelector('.tabs');if(tb&&tb.offsetParent!==null){const r=tb.getBoundingClientRect();if(r.top>0)bot=Math.min(bot,r.top)}
  return{top,bot};
}
function inBand(el){
  if(!el||!el.getBoundingClientRect)return false;
  const r=el.getBoundingClientRect();if(!r.width&&!r.height)return false;
  const b=recBand();return r.top>=b.top-1&&r.bottom<=b.bot+1;
}
/* 要素を見えている範囲の中央へ（範囲より高い要素は上端をそろえる） */
function scrollToBand(el,behavior){
  if(!el||!el.getBoundingClientRect)return;
  const r=el.getBoundingClientRect(),b=recBand();
  const dy=(r.height>b.bot-b.top-16)?r.top-(b.top+8):(r.top+r.height/2)-(b.top+b.bot)/2;
  if(Math.abs(dy)>1)window.scrollBy({top:dy,behavior:behavior||'instant'});
}
async function saveSession(){
  // 録音の真っ最中の保存は回答を途中で切断してコミットするため、必ず確認を挟む（タブ/言語切替の保護と一貫させる）
  if(active){if(!confirm(t('saveWhileRec')))return;await stopRec()}
  cur.date=document.getElementById('fDate').value;
  cur.examiner=document.getElementById('fEr').value.trim();
  cur.examinee=document.getElementById('fEe').value.trim();
  // 名前・日付が空：トーストだけでなく、空の欄へスクロールしてフォーカスし赤枠を付ける（欄は画面外のことが多い）
  if(!cur.examiner||!cur.examinee){toast(t('eNm'),1);markInvalid(!cur.examiner?'fEr':'fEe');if(!cur.examiner&&!cur.examinee)setInvalid('fEe',true);return}
  if(!cur.date){toast(t('eDt'),1);markInvalid('fDate');return}
  if(!getItems().length){toast(t2('noItems'),1);return} // 質問が0件＝録音以前に設定が必要（「録音がありません」では次の手が分からない）
  const recd=getItems().some(it=>cur.items[it.id]&&cur.items[it.id].hasAudio);
  if(!recd){toast(t('eNoRec'),1);return}
  // 端末に保存できていない録音（failedTakes＝メモリ上だけの唯一の写し）が残っていれば、黙って捨てない
  const pend=pendingTakes();
  if(pend.length&&!confirm(t2('pendTakeSave').replace('{n}',pend.length))){
    const box=document.getElementById('rf-'+pend[0].slice(cur.id.length+1));if(box)box.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  snapMeta(cur); // 項目名スナップショット（cfg変更後も履歴・CSVで名前が出る）
  // 試問中に録音した全問へ○×が付いていれば、採点の確定も選べる（キャンセル＝従来どおり録音のみで保存）
  const recIds=Object.keys(cur.items).filter(k=>cur.items[k]&&cur.items[k].hasAudio);
  const prevStatus=cur.status,prevUpd=cur.updatedAt;
  // 録音していない問に○×が付いている（試問画面は録音前でも押せる）ときは、ここでは確定を勧めない：
  // 確定すると未録音の○まで合格率に入るため。採点タブで全問を見てから確定してもらう
  const unrecPF=Object.keys(cur.items).some(k=>cur.items[k]&&!cur.items[k].hasAudio&&isPF(cur.items[k].score));
  if(cur.status!=='scored'&&recIds.length&&!unrecPF&&recIds.every(k=>isPF(cur.items[k].score))&&confirm(t2('confirmScored')))cur.status='scored';
  const all=getAll();
  const idx=all.findIndex(s=>s.id===cur.id);
  cur.updatedAt=new Date().toISOString();
  if(idx>=0)all[idx]=cur;else all.push(cur);
  // 保存に失敗したら（容量不足等）下書きを消さず・新しい試問にもせず、入力と録音をそのまま残す
  //（storeFailのトーストを「保存しました」で上書きしない。画面内に退避の案内を常設する）
  if(!saveAll(all)){cur.status=prevStatus;cur.updatedAt=prevUpd;saveDraft();showSaveErr(true);return}
  showSaveErr(false);
  dropPendingTakes(); // 確認のうえで保存した＝取り戻さないと決めた録音はメモリからも手放す
  localStorage.removeItem(DRAFTKEY);
  try{localStorage.setItem(EKEY,cur.examiner)}catch(e){} // 試問者名を次回の初期値に
  // 成果物の行き先へ視覚誘導（保存直後の「消えた」誤解を防ぐ）。
  // 採点まで確定した試問は採点タブの既定表示（採点待ち）に出ないため、履歴タブへ案内する
  const scored=cur.status==='scored';
  toast(scored?t2('savedScored'):t('tSaved'));
  const sb=document.querySelector('.tabs button[data-pg="'+(scored?'pgHi':'pgScore')+'"]');
  if(sb){sb.classList.add('attn');setTimeout(()=>sb.classList.remove('attn'),5000)}
  const saved=cur;
  newSession();
  document.getElementById('fEr').value=cur.examiner=(localStorage.getItem(EKEY)||'');
  document.getElementById('fEe').value='';eeBefore='';
  document.getElementById('fDate').value=todayStr();
  buildExamCards();refreshSel();
  // ドライブへ送った受験者名が確定した名前と違う録音（名前の訂正など）を付け直す
  if(typeof syncExamineeOnSave==='function')syncExamineeOnSave(saved);
  return true;
}
/* 入力欄の赤枠（aria-invalid）。markInvalid はスクロール＋フォーカスも行う */
function setInvalid(id,on){const el=document.getElementById(id);if(!el)return;if(on)el.setAttribute('aria-invalid','true');else el.removeAttribute('aria-invalid')}
function clearInvalid(id){setInvalid(id,false)}
function markInvalid(id){
  const el=document.getElementById(id);if(!el)return;
  setInvalid(id,true);
  // 試問タブ以外にいるときは試問タブへ戻す（録音は試問タブからしか始まらないが念のため）
  const pg=document.getElementById('pgExam');
  if(pg&&!pg.classList.contains('on')){const tb=document.querySelector('.tabs [data-pg="pgExam"]');if(tb)swTab(tb)}
  try{el.scrollIntoView({behavior:'smooth',block:'center'})}catch(e){el.scrollIntoView()}
  try{el.focus({preventScroll:true})}catch(e){el.focus()}
}
/* 受験者名の書き換え：元の名前が空でなく、名前が変わり、未保存の録音か○×があるときは確認する。
   OK＝元の名前で保存してから新しい名前で試問を始める／キャンセル＝名前の訂正だけ（従来どおり） */
let eeBefore='';
function curWork(){
  const it=cur&&cur.items?Object.values(cur.items):[];
  return{n:it.filter(x=>x&&x.hasAudio).length,m:it.filter(x=>x&&isPF(x.score)).length};
}
async function onExamineeChange(){
  const el=document.getElementById('fEe');
  const prev=eeBefore,next=el.value.trim();
  // 名前を消しただけ（空）は確認しない。元の名前を覚えておき、次に別の名前を入れた時に確認する
  //（A→空→B で確認を素通りしない。A→空→A なら訂正なし）
  if(!next)return;
  eeBefore=next;
  if(!cur||!prev||prev===next)return;
  const w=curWork();
  // 録音が無ければ「保存してから次の人へ」は保存できない（録音のない試問は保存しない）→確認せず名前の訂正として扱う
  //（○×だけなら新しい名前にそのまま付く）
  if(!w.n)return;
  const fill=s=>s.replace(/\{o\}/g,prev).replace(/\{e\}/g,next||'—').replace('{n}',w.n).replace('{m}',w.m);
  if(!confirm(fill(t2('eeSwitch'))))return; // 名前の訂正だけ（保存時にドライブの名前も付け直す）
  // 元の名前に戻して保存 → 成功したら新しい名前で次の試問を始める
  el.value=prev;cur.examinee=prev;saveDraft();
  const ok=await saveSession();
  if(ok===true){
    el.value=next;eeBefore=next;
    if(cur){cur.examinee=next}
    toast(fill(t2('eeSwitched')));
  }else{
    eeBefore=prev; // 保存できなかった：前の人の録音を新しい名前に付け替えないよう、名前は元のまま
    if(!document.getElementById('saveErr'))setTimeout(()=>toast(fill(t2('eeSwitchFail')),1),5200);
  }
}
/* 試問の保存に失敗した時の常設案内（トーストは5秒で消えるため）。バックアップ書き出しは未保存の試問も同梱する */
function showSaveErr(on,noScroll){
  let el=document.getElementById('saveErr');
  if(!on){if(el)el.remove();return}
  if(!el){
    el=document.createElement('div');el.id='saveErr';el.className='cd';el.setAttribute('role','alert');
    el.style.cssText='border:2px solid var(--s1);color:var(--s1);font-size:.85rem;font-weight:700;line-height:1.6';
    const bg=document.querySelector('#pgExam > .bg');
    if(bg&&bg.parentElement)bg.parentElement.insertBefore(el,bg);else return;
  }
  el.innerHTML=`<div>⚠ ${esc(t2('saveErrMsg'))}</div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px"><button type="button" class="b b1" style="flex:1 1 140px" onclick="exportBackup()">${esc(t('bkExport'))}</button><button type="button" class="b b3" style="flex:1 1 140px" onclick="saveSession()">${esc(t2('retrySave'))}</button></div>`;
  if(!noScroll)el.scrollIntoView({behavior:'smooth',block:'center'});
}
/* 現在の試問で、端末(IndexedDB)に書けずメモリ上にだけ残っている録音のキー（failedTakesはmedia.js） */
function pendingTakes(){
  if(!cur||!cur.id||typeof failedTakes==='undefined')return[];
  return Object.keys(failedTakes).filter(k=>k.startsWith(cur.id+'_'));
}
function dropPendingTakes(){pendingTakes().forEach(k=>{delete failedTakes[k]})}
async function resetExam(){
  // 消える録音の件数を明示（confirm一発で試問1回分が消える事故の抑止）
  const n=cur?Object.keys(cur.items||{}).filter(k=>cur.items[k]&&cur.items[k].hasAudio).length:0;
  const pf=pendingTakes().length; // 端末に保存できていない録音も消える（件数に含めて先に知らせる）
  if(!confirm(t('cReset')+(n?'\n'+t2('resetCnt').replace('{n}',n):'')+(pf?'\n'+t2('pendTakeReset').replace('{n}',pf):'')))return;
  if(active)await stopRec();
  // 未保存セッションの音声を破棄（セッション自身のキーで走査＝cfg変更後も取り残さない）
  const saved=getAll().some(s=>s.id===cur.id);
  if(!saved)Object.keys(cur.items||{}).forEach(k=>{if(cur.items[k]&&cur.items[k].hasAudio)delAudio(cur.id+'_'+k)});
  dropPendingTakes();
  newSession();
  document.getElementById('fEr').value='';document.getElementById('fEe').value='';eeBefore='';
  document.getElementById('fDate').value=todayStr();
  localStorage.removeItem(DRAFTKEY);
  showSaveErr(false);
  buildExamCards();
  toast(t('tReset'));
}

/* ==============================================================
   タブ切替
   ============================================================== */
function swTab(btn){
  if(active){toast(t2('recBusy'),1);return}
  if(typeof hideUndoBar==='function')hideUndoBar(); // 画面を移ったら「元に戻す」は閉じる（次の操作まで出し続ける）
  // 設定タブで未保存の項目編集がある場合は確認し、離脱時は保存済み状態に戻す
  //（試問カードが未保存cfgで描画されて見た目と保存状態が乖離する事故を防ぐ）
  const curPg=document.querySelector('.pg.on');
  if(curPg&&curPg.id==='pgCfg'&&btn.dataset.pg!=='pgCfg'&&typeof cfgDirty!=='undefined'&&cfgDirty){
    if(!confirm(t2('dirtyLeave')))return;
    cfg=loadCfg();cfgDirty=false;updateDirtyBadge();buildExamCards();
  }
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
