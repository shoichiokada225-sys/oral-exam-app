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
  if(typeof renderStoWarn==='function'){renderStoWarn();renderPersistNote()} // 空き容量・永続化の案内も言語に追従
  if(document.getElementById('saveErr'))showSaveErr(true,true); // 保存失敗の常設案内も言語に追従（スクロールはしない）
  if(typeof renderExamSetSel==='function')renderExamSetSel(); // セット切替UIも言語に追従
  if(typeof draftNoteOn!=='undefined'&&draftNoteOn)showDraftNote(true); // 下書きの案内も言語に追従
  // 開いている採点画面・一覧を再描画（入力中の採点は退避してから再描画）
  if(document.getElementById('pgScore').classList.contains('on')){if(curScore){captureScoreForm();renderScoreDetail(curScore)}else{drawScoreList()}}
}
function applyT(){
  document.querySelectorAll('[data-t]').forEach(el=>{el.textContent=t(el.dataset.t)});
  document.querySelectorAll('[data-ph]').forEach(el=>{el.placeholder=t(el.dataset.ph)});
  // 言語に追従するアクセシブルネーム
  const nav=document.getElementById('mainNav');if(nav)nav.setAttribute('aria-label',t('navMain'));
  const bl=document.getElementById('beepLbl');if(bl)bl.textContent=t2('beepOpt');
  const ct=document.getElementById('cfgConnTitle');if(ct)ct.textContent=t2('cfgConnTitle');
  const hx=document.getElementById('howtoX');if(hx){hx.textContent='×';hx.setAttribute('aria-label',t2('howtoHide'));hx.title=t2('howtoHide')}
  const hs=document.getElementById('howtoS');if(hs)hs.textContent=t2('howtoS');
  if(typeof renderHowtoMore==='function')renderHowtoMore();
  const gl=document.getElementById('gSetupLink');if(gl)gl.textContent=t2('gSetupLink')+' ↗';
  if(typeof renderGShare==='function')renderGShare();
  const sh=document.getElementById('cfgSaveHint');if(sh)sh.textContent=t2('saveCfgHint');
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
  // 試問タブ：受験者名の下に「出題：〇〇（N問）［変更］」の1行（R4。中身は renderExamSetSel）
  const meta=document.querySelector('#pgExam .cd.meta');
  if(meta&&!document.getElementById('examSetBox')){
    const d=document.createElement('div');
    d.id='examSetBox';d.className='esbox';
    meta.appendChild(d); // 受験者名の欄と同じ面の最下段（スマホで最初の画面に1問目まで収める）
  }
  // 試問タブ上部：初回カード（R5b）＝手順1行（詳しくで全文）＋ドライブ未設定の1行＋閉じるボタン1つ。
  // 初回でもスマホ・タブレットの最初の画面に1問目の「録音」まで収める。閉じたら出題の行の「？」に畳む（R4）
  if(meta&&!document.getElementById('examHowto')){
    const d=document.createElement('div');
    d.id='examHowto';d.className='cd howto';
    d.innerHTML='<div class="hw-t"><span id="howtoS"></span> <button type="button" class="hw-link" id="howtoMore" aria-expanded="false" aria-controls="howtoLong" onclick="toggleHowtoMore()"></button></div>'
      +'<div id="howtoLong" class="hw-long" data-t="howto" hidden></div>'
      +'<button type="button" class="hw-x" id="howtoX" onclick="toggleHowto(false)"></button>';
    meta.parentElement.insertBefore(d,meta);
  }
  // ドライブ未設定の案内：初回カードが出ている間はその中の1行、閉じた後は単独の小さな案内（中身と置き場所は updateDriveUi）
  if(meta&&!document.getElementById('drvHint')){
    const d=document.createElement('div');
    d.id='drvHint';d.className='cd';d.setAttribute('role','note');d.style.display='none';
    meta.parentElement.insertBefore(d,meta);
  }
  // 設定タブのドライブ欄：設定手順へのリンク（gNote の別紙名だけでは開けない）と「この設定を他の端末へ」
  const gNote=document.querySelector('#pgCfg [data-t="gNote"]');
  if(gNote&&!document.getElementById('gSetupLink')){
    const a=document.createElement('a');
    a.id='gSetupLink';a.className='gsetup';a.target='_blank';a.rel='noopener';
    // 公開中の Pages では Markdown が HTML に変換されて読める（.html）。ローカル（file:）では .md をそのまま開く
    a.href=location.protocol==='file:'?'SETUP-GOOGLE-DRIVE.md':'SETUP-GOOGLE-DRIVE.html';
    gNote.insertAdjacentElement('afterend',a);
  }
  const gSt=document.getElementById('gStatus');
  if(gSt&&!document.getElementById('gShare')){
    const d=document.createElement('div');
    d.id='gShare';d.className='gshare';d.style.display='none';
    gSt.insertAdjacentElement('afterend',d);
  }
  // 設定タブ「接続とデータ」の先頭：録音の合図（開始・停止で短い音。振動は対応端末で常に）
  const cfgPg=document.getElementById('pgCfg');
  if(cfgPg&&!document.getElementById('recOptBox')){
    const d=document.createElement('div');d.id='recOptBox';d.className='cd';
    d.innerHTML='<label class="ckrow" style="margin-top:0"><input type="checkbox" id="beepChk"> <span id="beepLbl"></span></label>';
    const acc=cfgPg.querySelector('details.acc');
    cfgPg.insertBefore(d,acc||cfgPg.firstChild);
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
  // 名前の欄から直接「録音」を押した：確認ダイアログでそのタップが消えるので、切り替え後に押し直しを促す（L-2）
  document.addEventListener('pointerdown',e=>{const b=e.target&&e.target.closest&&e.target.closest('.recbtn');if(b)recTapAt=Date.now()},true);
  // 名前の入力中はドライブへ送らない（途中の名前のフォルダを作らない）。欄を離れた・確定したら待たせていた分を送る
  fEe.addEventListener('input',()=>{eeTyping=true});
  fEe.addEventListener('change',()=>{eeCommitted()});
  fEe.addEventListener('blur',()=>{eeCommitted()});
  // 初回（まだ1問も録音していない）に受験者名を入れ終えたら、1問目の「録音」が画面の外なら見える位置へ送る（R5b）。
  // 少しでも見えていれば動かさない（そのボタンを押そうとしている指の下で画面をずらさない）
  fEe.addEventListener('change',()=>{setTimeout(scrollFirstRecIntoView,60)});
  refreshNameLists();
  const s=getStt();
  document.getElementById('sttEndpoint').value=s.endpoint||'';
  document.getElementById('sttModel').value=s.model||'';
  document.getElementById('sttKey').value=s.key||'';
  applyDefaultDrive(); // 既定の保存先（未設定の端末だけ・一度だけ）
  const gImported=applyUrlConfig();
  setLang(lang);
  if(typeof stoInit==='function')stoInit(); // 端末ストレージの永続化状態・残り容量
  renderExamSetSel();
  // リンクで受け取った設定（R5b「この設定を他の端末へ」）：自動保存を一度も選んでいない（未設定）なら、
  // 手で「設定を保存」したとき（saveGoogleCfg）と同じく接続テストを走らせ、つながったら自動保存を既定ONにする。
  // 合言葉なしのリンクでは gauto が付かないため、これが無いと OFF のまま＝録音が端末にしか残らない（R5 検証NG）
  if(gImported){
    const gi=getGoogleCfg();
    const pend=!!(gi.url&&gi.auto===undefined&&!gi.autoSet);
    setTimeout(()=>{toast(t('gCfgSaved')+(pend?' · '+t2('gAutoWait'):''));if(pend)gasTest(true)},400);
  }
  if(draftRestored)showDraftNote(true); // 前回の途中の試問を黙って開かない（共用端末）
  // 孤児音声GC（どのセッションにも属さない録音を検出→件数確認のうえ削除）
  setTimeout(()=>gcOrphanAudio(),2500);
  // 前回、録音の途中で端末が落ちた・タブが閉じられた：一時保存から「中断された録音を復元」を出す
  //（ほかのタブが録音中なら、その一時保存を「中断された録音」と取り違えないよう見送る・M-3）
  setTimeout(()=>{if(typeof checkLiveTakes==='function')otherTabs(300).then(ps=>{if(!ps.some(p=>p.rec))checkLiveTakes()})},600);
  // 同じ試問（下書き）をほかのタブでも開いている：片方だけで操作するよう知らせる（保存時は上書きせず統合する）
  otherTabs(300).then(ps=>{if(cur&&ps.some(p=>p.curId===cur.id))toast(t('tabSame'),1)});
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
let draftRestored=false; // 起動時に前回の下書きを開いた（案内を出す）
function restoreDraftOrNew(){
  try{
    const d=JSON.parse(localStorage.getItem(DRAFTKEY));
    // 録音済み項目か○×を含む下書きを復元（保存済みセッションと重複しないもの。「続ける」で開いた保存済みの試問は _resume の印で復元）
    //（○×だけの途中経過もリロード・再起動で黙って失わない。形式は今と同じ cur）
    //（その場で出題の問題文だけ書いた段階も失わない）
    if(d&&d.id&&d.items&&Object.values(d.items).some(x=>x&&(x.hasAudio||isPF(x.score)||String(x.qText||'').trim()))&&(d._resume||!getAll().some(s=>s.id===d.id))){cur=d;draftRestored=true;return}
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
/* opt.switching＝受験者名の書き換えから（次の人の名前は入っている）／opt.quiet＝「続ける」の前の保存。どちらも保存後に名前欄へ移らない */
async function saveSession(opt){
  if(opt instanceof Event)opt=null; // onclick から直接呼ばれた場合
  // 録音の真っ最中の保存は回答を途中で切断してコミットするため、必ず確認を挟む（タブ/言語切替の保護と一貫させる）
  if(active){if(!confirm(t('saveWhileRec')))return;await stopRec()}
  cur.date=document.getElementById('fDate').value;
  cur.examiner=document.getElementById('fEr').value.trim();
  cur.examinee=document.getElementById('fEe').value.trim();
  // 名前・日付が空：トーストだけでなく、空の欄へスクロールしてフォーカスし赤枠を付ける（欄は画面外のことが多い）
  if(!cur.examinee){toast(t('eNm'),1);markInvalid('fEe');return} // 試問者名は不要（入力欄なし）
  if(!cur.date){toast(t('eDt'),1);markInvalid('fDate');return}
  // 録音の有無は今の試問の全部の問で見る（出題を切り替えて画面に出ていない問の録音も「無い」と言わない）
  const recd=Object.keys(cur.items||{}).some(k=>cur.items[k]&&cur.items[k].hasAudio);
  if(!getItems().length&&!recd){toast(t2('noItems'),1);return} // 質問が0件＝録音以前に設定が必要（「録音がありません」では次の手が分からない）
  if(!recd){toast(t('eNoRec'),1);return}
  // 端末に保存できていない録音（failedTakes＝メモリ上だけの唯一の写し）が残っていれば、黙って捨てない
  const pend=pendingTakes();
  if(pend.length&&!confirm(t2('pendTakeSave').replace('{n}',pend.length))){
    const box=document.getElementById('rf-'+pend[0].slice(cur.id.length+1));if(box)box.scrollIntoView({behavior:'smooth',block:'center'});
    return;
  }
  // 履歴にある名前と表記だけ違う（中黒と空白・大文字小文字・声調記号など）：同じ人か確かめて既存の表記にそろえる
  if(typeof alignNames==='function')alignNames(cur);
  // 「続ける」で開いた保存済みの試問：開いている間に採点タブなどで保存された合否・文字起こし・コメント・状態を
  // 古い写しで上書きしない（続きで変えた所だけを、いま保存されている版へ重ねる）
  let resumeSv=null,otherTab=false;
  // 同じ試問をほかのタブが先に保存していた（同じ下書きを2つのタブで開いた・M-3）：丸ごと上書きせず、
  // そのタブで録った問・付けた合否を残して統合する（こちらで空の欄だけ保存済みの値で埋める）
  if(!cur._resume&&typeof mergeResumed==='function'){
    const sv0=getAll().find(s=>s.id===cur.id);
    if(sv0){mergeResumed(cur,sv0,null);otherTab=true}
  }
  if(cur._resume&&typeof mergeResumed==='function'){
    const sv0=getAll().find(s=>s.id===cur.id);
    if(sv0){resumeSv=JSON.parse(JSON.stringify(sv0));mergeResumed(cur,sv0,cur._base||null)}
  }
  snapMeta(cur); // 項目名スナップショット（cfg変更後も履歴・CSVで名前が出る）
  // 出題（試問セット）を記録（R4・追加フィールド）。保存済みの試問の続き（_resume）は元の記録を変えない
  if(!cur._resume&&!getAll().some(s=>s.id===cur.id)&&typeof stampSet==='function')stampSet(cur);
  // 同じ受験者・同じ日の保存済み試問がほかにある（途中で分けた・その場で追試した・二重に保存しかけた）：
  // OK＝前回の続きにまとめる／キャンセル＝追試として別に保存（ドライブのファイル名に「_2回目」を付ける）
  let tgt=cur,merged=null,copied=[],retakeMsg='';
  const isNew=!getAll().some(s=>s.id===cur.id);
  if(isNew&&typeof sameDaySessions==='function'){
    const dup=sameDaySessions(cur);
    if(dup.length){
      const last=dup.slice().sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')).pop();
      const clash=recKeys(cur).some(k=>last.items[k]&&last.items[k].hasAudio);
      const nextN=Math.max(...dup.map(s=>+s.attempt||1))+1;
      const fillD=s=>s.replace(/\{e\}/g,last.examinee).replace('{d}',cur.date).replace('{n}',dup.length).replace('{k}',nextN);
      if(!clash&&confirm(fillD(t2('dupAsk')))){
        merged=JSON.parse(JSON.stringify(last));
        try{copied=await copySessInto(cur,merged)}catch(e){toast(t2('mergeSaveFail'),1);return}
        snapMeta(merged);
        tgt=merged;
      }else{
        cur.attempt=nextN;
        retakeMsg=fillD(t2('savedRetake'));
      }
    }
  }else if(isNew)delete cur.attempt;
  // 試問中に録音した全問へ○×が付いていれば、採点の確定も選べる（キャンセル＝従来どおり録音のみで保存）
  // 旧5段階の点が残る問も「判定済み」（「続ける」で開いた旧データの試問を、保存のたびに確定待ちへ落とさない）
  const judgedSc=v=>isPF(v)||isOld(v);
  const recIds=Object.keys(tgt.items).filter(k=>tgt.items[k]&&tgt.items[k].hasAudio);
  const prevStatus=tgt.status,prevUpd=tgt.updatedAt,wasResume=!!cur._resume;
  // 採点済みの試問に○×の無い録音を足した（まとめた）：採点待ちに戻す
  if(merged&&tgt.status==='scored'&&!recIds.every(k=>judgedSc(tgt.items[k].score)))tgt.status='rec';
  // 録音していない問に○×が付いている（試問画面は録音前でも押せる）ときは、ここでは確定を勧めない：
  // 確定すると未録音の○まで合格率に入るため。採点タブで全問を見てから確定してもらう
  const unrecPF=Object.keys(tgt.items).some(k=>tgt.items[k]&&!tgt.items[k].hasAudio&&isPF(tgt.items[k].score));
  // 出題のうち録音しなかった問があれば数を添える（「全問に合否」と言って未実施の問を隠さない）
  const unasked=getItems().filter(it=>!(tgt.items[it.id]&&tgt.items[it.id].hasAudio)).length;
  const askScored=()=>confirm(unasked?t2('confirmScoredPart').replace(/\{n\}/g,recIds.length).replace('{t}',recIds.length+unasked).replace('{u}',unasked):t2('confirmScored'));
  if(tgt.status!=='scored'&&recIds.length&&!unrecPF&&recIds.every(k=>judgedSc(tgt.items[k].score))&&askScored())tgt.status='scored';
  const bakKeep={base:cur._base,bak:cur._origBak};
  delete tgt._resume; // 下書きだけの印（「続ける」で開いた試問）。保存済みの試問には残さない
  delete tgt._base;delete tgt._origBak;
  const all=getAll();
  const idx=all.findIndex(s=>s.id===tgt.id);
  tgt.updatedAt=new Date().toISOString();
  if(idx>=0)all[idx]=tgt;else all.push(tgt);
  // 保存に失敗したら（容量不足等）下書きを消さず・新しい試問にもせず、入力と録音をそのまま残す
  //（storeFailのトーストを「保存しました」で上書きしない。画面内に退避の案内を常設する）
  if(!saveAll(all)){
    if(merged){for(const k of copied)await delAudio(merged.id+'_'+k)} // まとめ先へ写した録音は取り消す（今の試問の録音は無傷）
    else{cur.status=prevStatus;cur.updatedAt=prevUpd}
    if(wasResume){
      cur._resume=true;
      // 重ねた後の値は cur に入っている＝次の保存では「いま保存されている版」を起点に比べる
      cur._base=resumeSv||bakKeep.base;if(bakKeep.bak)cur._origBak=bakKeep.bak;
    }
    saveDraft();showSaveErr(true);return;
  }
  // まとめた：今の試問のキーの録音は、まとめ先へ写し終えたので片付ける
  if(merged)for(const k of copied)await delAudio(cur.id+'_'+k);
  // 続きで録り直した問：保存した＝新しい録音に決めた。退避しておいた元の録音を片付ける
  if(wasResume&&bakKeep.bak&&bakKeep.bak.length&&typeof settleResumeBackups==='function')await settleResumeBackups({id:tgt.id,_origBak:bakKeep.bak},false);
  showSaveErr(false);
  dropPendingTakes(); // 確認のうえで保存した＝取り戻さないと決めた録音はメモリからも手放す
  localStorage.removeItem(DRAFTKEY);
  try{localStorage.setItem(EKEY,cur.examiner)}catch(e){} // 試問者名を次回の初期値に
  if(typeof showDraftNote==='function')showDraftNote(false);
  // 成果物の行き先へ視覚誘導（保存直後の「消えた」誤解を防ぐ）。
  // 採点まで確定した試問は採点タブの既定表示（採点待ち）に出ないため、履歴タブへ案内する
  const scored=tgt.status==='scored';
  const quiet=opt&&(opt.switching||opt.quiet);
  toast((otherTab?t('tabMerged')+' · ':'')+(merged?t2('savedMerged').replace('{e}',tgt.examinee):retakeMsg||(scored?t2('savedScored'):t('tSaved')))+(quiet?'':' · '+t2('nextEe')));
  const sb=document.querySelector('.tabs button[data-pg="'+(scored?'pgHi':'pgScore')+'"]');
  if(sb){sb.classList.add('attn');setTimeout(()=>sb.classList.remove('attn'),5000)}
  const saved=tgt;
  newSession();
  document.getElementById('fEr').value=cur.examiner=(localStorage.getItem(EKEY)||'');
  document.getElementById('fEe').value='';eeBefore='';
  document.getElementById('fDate').value=todayStr();
  buildExamCards();refreshSel();
  // 次の受験者名の欄を見える位置に出してフォーカス（連続試問で名前の無いまま次の人を録音し始めない）
  if(!quiet&&typeof focusNextExaminee==='function')focusNextExaminee();
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
let eeBefore='',recTapAt=0;
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
  const recTap=Date.now()-recTapAt<1500; // 「録音」を押したはずみで名前の欄を離れた
  const fill=s=>s.replace(/\{o\}/g,prev).replace(/\{e\}/g,next||'—').replace('{n}',w.n).replace('{m}',w.m);
  if(!confirm(fill(t2('eeSwitch'))))return; // 名前の訂正だけ（保存時にドライブの名前も付け直す）
  // 元の名前に戻して保存 → 成功したら新しい名前で次の試問を始める
  el.value=prev;cur.examinee=prev;saveDraft();
  const ok=await saveSession({switching:true});
  if(ok===true){
    el.value=next;eeBefore=next;
    if(cur){cur.examinee=next}
    toast(fill(t2('eeSwitched'))+(recTap?' · '+t2('recTapAgain'):''));
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
  // 「続ける」で開いた保存済みの試問は、保存済みの録音を消さない＝消えるのはこの続きで足した録音だけ
  const savedS=cur?getAll().find(s=>s.id===cur.id):null;
  const addedK=cur?Object.keys(cur.items||{}).filter(k=>cur.items[k]&&cur.items[k].hasAudio&&!(savedS&&savedS.items[k]&&savedS.items[k].hasAudio)):[];
  // 続きで録り直した保存済みの問：破棄したら元の録音へ戻す（退避は resumeBackup）
  const bakK=(cur&&cur._resume&&savedS&&Array.isArray(cur._origBak))?cur._origBak.slice():[];
  const n=addedK.length+bakK.length;
  const pf=pendingTakes().length; // 端末に保存できていない録音も消える（件数に含めて先に知らせる）
  if(!confirm(t('cReset')+(n?'\n'+t2('resetCnt').replace('{n}',n):'')+(pf?'\n'+t2('pendTakeReset').replace('{n}',pf):'')))return;
  if(active)await stopRec();
  // 未保存セッションの音声を破棄（セッション自身のキーで走査＝cfg変更後も取り残さない）
  addedK.forEach(k=>delAudio(cur.id+'_'+k));
  if(bakK.length&&typeof settleResumeBackups==='function')await settleResumeBackups(cur,true);
  dropPendingTakes();
  newSession();
  document.getElementById('fEr').value='';document.getElementById('fEe').value='';eeBefore='';
  document.getElementById('fDate').value=todayStr();
  localStorage.removeItem(DRAFTKEY);
  showSaveErr(false);
  buildExamCards();
  if(typeof showDraftNote==='function')showDraftNote(false);
  toast(t('tReset')+' · '+t2('nextEe'));
  if(typeof focusNextExaminee==='function')focusNextExaminee(); // 次の受験者名の欄へ
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
  // 「続ける」で開いている試問：採点タブで同じ試問が保存されていたら、その合否などを試問画面にも映す（古い写しのまま見せない）
  if(btn.dataset.pg==='pgExam'&&cur&&cur._resume&&typeof mergeResumed==='function'){
    const sv=getAll().find(s=>s.id===cur.id);
    if(sv&&JSON.stringify(sv)!==JSON.stringify(cur._base||null)){mergeResumed(cur,sv,cur._base||null);cur._base=JSON.parse(JSON.stringify(sv));saveDraft();buildExamCards()}
  }
  if(btn.dataset.pg==='pgHi'){refreshSel();drawHist()}
  if(btn.dataset.pg==='pgCh'){refreshSel();drawCharts()}
  if(btn.dataset.pg==='pgCfg'){buildCfgUI();const s=getStt();document.getElementById('sttEndpoint').value=s.endpoint||'';document.getElementById('sttModel').value=s.model||'';document.getElementById('sttKey').value=s.key||'';const g=getGoogleCfg();document.getElementById('gUrl').value=g.url||'';document.getElementById('gToken').value=g.token||'';document.getElementById('gFolder').value=g.folder||'';document.getElementById('gAuto').checked=!!g.auto;updateGoogleStatus()}
}
function refreshSel(){
  if(typeof refreshNameLists==='function')refreshNameLists(); // 受験者名・試問者名の候補も最新に
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
/* 受験者名を入れた直後：まだ録音が無く、1問目の録音ボタンが見えていなければ見える位置へ */
function scrollFirstRecIntoView(){
  if(!cur||active||!String(cur.examinee||'').trim())return;
  const items=getItems();if(!items.length)return;
  if(items.some(it=>cur.items[it.id]&&cur.items[it.id].hasAudio))return;
  const rb=document.getElementById('rb-'+sanitizeId(items[0].id));if(!rb)return;
  const tb=document.querySelector('.tabs'),lim=tb&&getComputedStyle(tb).display!=='none'?tb.getBoundingClientRect().top:innerHeight;
  const r=rb.getBoundingClientRect();
  if(r.top<lim&&r.bottom>0)return; // 見えている
  rb.scrollIntoView({behavior:'smooth',block:'center'});
}
