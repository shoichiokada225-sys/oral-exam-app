/* ui-chart.js — グラフタブ（Chart.js）
   ※ js/ui.js を機械的に分割したもの（プレーンスクリプト・グローバル名は不変）。読み込み順は ui-core → ui-exam → ui-score → ui-hist → ui-chart → ui-cfg */
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
  const pick=v=>v>=100?sc[4]:v>=50?sc[2]:sc[0]; // 合格率(%)→色：全問合格=緑/半分以上=黄/それ未満=赤
  return{acc,fill:acc+'26',grid,txt,pick}; // fill=アクセントの15%透過（8桁hex）
}
/* Chart.js の読み込みが終わった（成功・失敗とも）：グラフタブを開いていれば描き直す */
function chartReady(){const pg=document.getElementById('pgCh');if(pg&&pg.classList.contains('on')&&typeof drawCharts==='function')drawCharts()}
function drawCharts(){
  const who=document.getElementById('chSel').value,area=document.getElementById('chArea'),none=document.getElementById('chNone');
  // データが1件も無い（新しい端末など）：次の手（試問タブ／バックアップから復元）を示す
  if(!getAll().length){area.style.display='none';none.style.display='block';none.style.whiteSpace='normal';none.innerHTML=emptyGuideHtml(true);return}
  if(!who){area.style.display='none';none.style.display='block';none.textContent=t('selEe');return}
  // グラフ部品（Chart.js・CDN）がまだ／読めない：白紙のカードを並べず理由を出す（録音・採点は使える）
  if(typeof Chart==='undefined'){
    area.style.display='none';none.style.display='block';none.style.whiteSpace='normal';
    none.innerHTML=`<div id="chLibErr" role="status">${esc(t2(window.__chartSt==='err'?'chLibErr':'chLibWait'))}</div>`+(window.__chartSt==='err'?`<button type="button" class="b b3 mt12" onclick="location.reload()">${esc(t2('reloadBtn'))}</button>`:'');
    return;
  }
  const mine=getAll().filter(e=>e.examinee===who);
  let all=mine.filter(e=>e.status==='scored'&&!isNaN(passRate(e))); // 合否採点のある試問のみ
  all.sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
  // 注記：旧5段階が混ざる試問／確定待ち（試問中の○×のみ）の試問があれば明示（黙って除外しない）
  const notes=[];
  // 出題（試問セット）で絞る（R4）：問題の違う試問を1本の線で比べない。既定は直近の試問のセット
  const sk=chartSetFilter(who,all);
  if(sk.keys.length>1)notes.push(t2(sk.key==='*'?'setMixAllNote':'setMixNote'));
  if(sk.key!=='*')all=all.filter(e=>setKey(e)===sk.key);
  if(all.some(e=>oldCount(e)))notes.push(t2('mixNote'));
  // 未確定：録音した全問に○×済み（確定待ち）と、途中まで（採点途中）を分けて案内
  const unc=mine.filter(e=>e.status!=='scored'&&hasPF(e));
  const pendMsg=[unc.some(e=>judgeState(e).full)?t2('chPending'):'',unc.some(e=>!judgeState(e).full)?t2('chPartial'):''].filter(Boolean);
  notes.push(...pendMsg);
  if(!all.length){
    area.style.display='none';none.style.display='block';
    const oldOnly=mine.some(e=>e.status==='scored'&&oldCount(e));
    none.textContent=oldOnly?t2('oldOnly'):t('chNone');
    if(pendMsg.length)none.textContent+='\n'+pendMsg.join('\n');
    none.style.whiteSpace='pre-line';
    return;
  }
  area.style.display='block';none.style.display='none';
  let nt=document.getElementById('chNote');
  if(!nt){nt=document.createElement('div');nt.id='chNote';nt.className='eenote';area.insertBefore(nt,area.firstChild)}
  nt.textContent=notes.join('\n');nt.style.whiteSpace='pre-line';nt.style.display=notes.length?'block':'none';
  const th=chartTheme();
  // スクリーンリーダー向けのテキスト代替（描画データの要約）
  document.getElementById('cvL').setAttribute('aria-label',t2('chRate')+': '+all.map(e=>e.date+' '+passRate(e)+'%').join(', '));
  if(cL)cL.destroy();
  // 塗りは上→下へ消えるグラデーション（面の主張を抑えて線を立てる）
  const g=document.getElementById('cvL').getContext('2d').createLinearGradient(0,0,0,280);
  g.addColorStop(0,th.acc+'4d');g.addColorStop(1,th.acc+'05');
  // x.offset：点が1つでも左の軸に重ならないよう両端に余白（L-19）
  cL=new Chart(document.getElementById('cvL'),{type:'line',data:{labels:all.map(e=>e.date),datasets:[{label:t2('chRate'),data:all.map(e=>passRate(e)),borderColor:th.acc,borderWidth:2.5,backgroundColor:g,fill:true,tension:.3,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:th.acc,pointBorderColor:'#fff',pointBorderWidth:1.5}]},options:{responsive:true,maintainAspectRatio:false,scales:{x:{offset:true},y:{min:0,max:100,ticks:{stepSize:25}}},plugins:{legend:{display:false}}}});
  const lat=all[all.length-1];
  // 軸・分野は「その試問が受けた出題と問題文」で作る（今の出題を切り替えても過去の試問のグラフは変わらない・M-10）
  const axes=sessAxes(lat);
  const pfOf=r=>a=>{const v=r&&r.items[a.id]&&r.items[a.id].score;return v==='pass'?100:v==='fail'?0:null};
  // セクション別平均（直近の採点済み試問）
  const secMap=new Map();
  axes.forEach(a=>{const v=lat.items[a.id]&&lat.items[a.id].score;if(!isPF(v))return;const k=a.sec||'–';if(!secMap.has(k))secMap.set(k,[]);secMap.get(k).push(v)});
  const secLabels=[...secMap.keys()],secData=secLabels.map(k=>{const vs=secMap.get(k);return Math.round(vs.filter(x=>x==='pass').length/vs.length*100)});
  document.getElementById('cvS').setAttribute('aria-label',t('chSec')+': '+secLabels.map((l,i)=>l+' '+secData[i]).join(', '));
  if(cS)cS.destroy();
  cS=new Chart(document.getElementById('cvS'),{type:'bar',data:{labels:secLabels,datasets:[{data:secData,backgroundColor:secData.map(v=>th.pick(v)+'cc'),borderRadius:6,barThickness:22}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,scales:{x:{min:0,max:100,ticks:{stepSize:25}}},plugins:{legend:{display:false}}}});
  // 合否の付いていない設問（質問しなかった・未採点・旧5段階）は0点=不合格と区別して欠損(null)で描く
  const latV=axes.map(pfOf(lat));
  document.getElementById('cvR').setAttribute('aria-label',t('chRadar')+': '+axes.map((a,i)=>a.name+' '+(latV[i]!=null?t2(lat.items[a.id].score):t2('notAsked').trim())).join(', '));
  if(cR)cR.destroy();
  // 前回試問のオーバーレイ（破線）＝成長が一目で見える。同じ質問どうしだけ重ねる（その場で出題は問題文が同じ問だけ・M-11）
  const prev=all.length>1?all[all.length-2]:null;
  const pm=new Map();
  if(prev)sessAxes(prev).forEach(a=>{const v=pfOf(prev)(a);if(a.qk&&v!=null&&!pm.has(a.qk))pm.set(a.qk,v)});
  const prevV=axes.map(a=>a.qk&&pm.has(a.qk)?pm.get(a.qk):null);
  const rDatasets=[{label:lat.date,data:latV,spanGaps:true,borderColor:th.acc,backgroundColor:th.fill,pointBackgroundColor:th.acc}];
  if(prevV.some(v=>v!=null))rDatasets.push({label:(t2('prevLbl'))+' '+prev.date,data:prevV,spanGaps:true,borderColor:th.acc+'80',backgroundColor:'transparent',borderDash:[6,4],borderWidth:1.5,pointBackgroundColor:th.acc+'80',pointRadius:2});
  // ラベル：長い問題文は省略し、「未実施」は2行目に。スマホ幅で左右にはみ出すなら短くする（L-18）
  let max=lang==='ja'?6:14,fs=11;
  const mkLabels=()=>axes.map((a,i)=>{const n=a.name.length>max?a.name.slice(0,max)+'…':a.name;return latV[i]==null?[n,t2('notAsked').trim()]:n});
  cR=new Chart(document.getElementById('cvR'),{type:'radar',data:{labels:mkLabels(),datasets:rDatasets},options:{responsive:true,maintainAspectRatio:false,scales:{r:{min:0,max:100,ticks:{stepSize:50,font:{size:10}},pointLabels:{font:{size:fs}},grid:{color:th.grid},angleLines:{color:th.grid}}},plugins:{legend:{display:true,position:'bottom'}}}});
  fitRadarLabels(cR,()=>{if(max>3){max=Math.max(3,max-(lang==='ja'?1:3));cR.data.labels=mkLabels();return true}if(fs>9){fs--;cR.options.scales.r.pointLabels.font.size=fs;return true}return false});
}
/* レーダーの軸ラベルが描画領域の左右からはみ出していれば shrink() で短くして描き直す（shrink が false＝これ以上縮めない） */
function fitRadarLabels(ch,shrink){
  for(let k=0;k<16;k++){
    const sc=ch&&ch.scales&&ch.scales.r,its=sc&&sc._pointLabelItems;
    if(!its||!its.length)return;
    if(its.every(p=>p.left>=0&&p.right<=ch.width))return;
    if(!shrink())return;
    ch.update('none');
  }
}
/* 試問が受けた出題の実体（cfg 形状）。今の出題と同じなら今の cfg、初期設定・その場で出題・自分のセット・テンプレートは作り直す。
   作れない（セット未保存の構成・変更ありのテンプレート・消したセット・記録のない旧データ）は null */
function sessSetCfg(r){
  const id=r&&r.setId!=null?String(r.setId):'';
  try{
    if(id&&typeof curSetInfo==='function'&&id===curSetInfo().id)return cfg;
    if(id==='def')return defaultCfg();
    if(id==='free')return freeCfg();
    if(id.startsWith('set:')){const p=getQuestionSets().presets.find(x=>x.id===id.slice(4));return p&&p.cfg?presetCfg(p):null}
    if(id.startsWith('tpl:')&&!id.endsWith('+')&&qbankAvailable()){const p=qbankPresets().find(x=>x.id===id.slice(4));return p?qbankCfg(p):null}
  }catch(e){}
  return null;
}
/* グラフの軸＝その試問の出題の問（出題の順）＋その試問にだけ残る問（録音か合否のあるもの）。[{id,name,sec,qk}]
   出題が分からない試問は、問が今の出題に全部あれば今の出題で描く（従来どおり）。
   qk＝前回と重ねるときの「同じ質問」の印：その場で出題は問題文（空なら重ねない）、それ以外は項目IDと名前 */
function sessAxes(r){
  const items=(r&&r.items)||{};
  let c=sessSetCfg(r);
  if(!c){const ks=Object.keys(items);if(ks.every(k=>getItems().some(it=>it.id===k)))c={sections:getSections(),items:getItems()}}
  const out=[],seen=new Set();
  if(c)c.items.forEach(it=>{
    seen.add(it.id);
    const n=c.items.filter(x=>x.secId===it.secId).findIndex(x=>x.id===it.id)+1;
    const rec=items[it.id],m=r.meta&&r.meta[it.id],s=c.sections.find(x=>x.id===it.secId);
    const sec=(s?loc(s,'name'):'')||(m&&m.sec)||'';
    if(it.free){const q=String(rec&&rec.qText||'').trim();out.push({id:it.id,name:q||freeLbl(n),sec,qk:q?'q:'+q:''});return}
    const snap=m&&m.name&&m.name!==it.name?m.name:''; // 試問の後に名前を書き換えた問は、その試問の時の名前
    out.push({id:it.id,name:snap||qName(r,it,n),sec,qk:'i:'+it.id+'|'+(snap||it.name)});
  });
  Object.keys(items).forEach(id=>{
    const rec=items[id];
    if(seen.has(id)||!safeKey(id)||!rec||!(rec.hasAudio||rec.score!=null))return;
    const q=String(rec.qText||'').trim(),mm=itemMeta(r,id);
    out.push({id,name:q||mm.name,sec:mm.sec||'',qk:q?'q:'+q:'i:'+id+'|'+mm.name});
  });
  return out;
}
/* グラフの「試問セット」セレクト（受験者の採点済み試問に2種類以上の出題があるときだけ出す）。
   受験者を変えたら直近の試問のセットに戻す。戻り値 {keys, key}（key='*' はすべてのセット） */
let chSetWho=null;
function chartSetFilter(who,all){
  const keys=[...new Set(all.map(setKey))];
  const wrap=document.getElementById('chSetWrap');
  const chc=document.querySelector('#pgCh .chc');
  let w=wrap;
  if(!w&&chc){
    w=document.createElement('div');w.id='chSetWrap';w.style.marginTop='12px';
    w.innerHTML='<label for="chSet" class="flabel" id="chSetLbl"></label><select id="chSet" onchange="drawCharts()"></select>';
    chc.appendChild(w);
  }
  const sel=document.getElementById('chSet');
  const latest=all.length?setKey(all[all.length-1]):'';
  let key=sel?sel.value:'';
  if(chSetWho!==who){key='';chSetWho=who}
  if(key!=='*'&&!keys.includes(key))key=latest;
  if(keys.length<2)key=keys[0]||'';
  if(w){
    w.style.display=keys.length>1?'':'none';
    const lb=document.getElementById('chSetLbl');if(lb)lb.textContent=t2('qsTitle');
    if(sel){
      const cnt=k=>all.filter(e=>setKey(e)===k).length;
      sel.innerHTML=keys.map(k=>{const r=all.find(e=>setKey(e)===k);return `<option value="${esc(k)}">${esc(setLbl(r))}（${cnt(k)}）</option>`}).join('')+(keys.length>1?`<option value="*">${esc(t2('chSetAll'))}</option>`:'');
      sel.value=key;
    }
  }
  return{keys,key};
}
