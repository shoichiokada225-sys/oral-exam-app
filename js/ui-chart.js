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
  all.sort((a,b)=>(a.date||'').localeCompare(b.date||'')||(a.createdAt||'').localeCompare(b.createdAt||''));
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
  const items=getItems();
  const th=chartTheme();
  // スクリーンリーダー向けのテキスト代替（描画データの要約）
  document.getElementById('cvL').setAttribute('aria-label',t2('chRate')+': '+all.map(e=>e.date+' '+passRate(e)+'%').join(', '));
  if(cL)cL.destroy();
  // 塗りは上→下へ消えるグラデーション（面の主張を抑えて線を立てる）
  const g=document.getElementById('cvL').getContext('2d').createLinearGradient(0,0,0,280);
  g.addColorStop(0,th.acc+'4d');g.addColorStop(1,th.acc+'05');
  cL=new Chart(document.getElementById('cvL'),{type:'line',data:{labels:all.map(e=>e.date),datasets:[{label:t2('chRate'),data:all.map(e=>passRate(e)),borderColor:th.acc,borderWidth:2.5,backgroundColor:g,fill:true,tension:.3,pointRadius:5,pointHoverRadius:7,pointBackgroundColor:th.acc,pointBorderColor:'#fff',pointBorderWidth:1.5}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{min:0,max:100,ticks:{stepSize:25}}},plugins:{legend:{display:false}}}});
  const lat=all[all.length-1];
  // セクション別平均（直近の採点済み試問）
  const secLabels=[],secData=[];
  getSections().forEach(sec=>{
    const si=items.filter(it=>it.secId===sec.id);if(!si.length)return;
    const vs=si.map(it=>lat.items[it.id]&&lat.items[it.id].score).filter(isPF);
    if(vs.length){secLabels.push(loc(sec,'name'));secData.push(Math.round(vs.filter(x=>x==='pass').length/vs.length*100))}
  });
  document.getElementById('cvS').setAttribute('aria-label',t('chSec')+': '+secLabels.map((l,i)=>l+' '+secData[i]).join(', '));
  if(cS)cS.destroy();
  cS=new Chart(document.getElementById('cvS'),{type:'bar',data:{labels:secLabels,datasets:[{data:secData,backgroundColor:secData.map(v=>th.pick(v)+'cc'),borderRadius:6,barThickness:22}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,scales:{x:{min:0,max:100,ticks:{stepSize:25}}},plugins:{legend:{display:false}}}});
  // 合否の付いていない設問（質問しなかった・未採点・旧5段階）は0点=不合格と区別して欠損(null)で描く
  const pfv=(r,it)=>{const v=r&&r.items[it.id]&&r.items[it.id].score;return v==='pass'?100:v==='fail'?0:null};
  document.getElementById('cvR').setAttribute('aria-label',t('chRadar')+': '+items.map(it=>{const v=lat.items[it.id]&&lat.items[it.id].score;return qName(lat,it,itemNo(it))+' '+(isPF(v)?t2(v):t2('notAsked').trim())}).join(', '));
  if(cR)cR.destroy();
  // 前回試問のオーバーレイ（破線）＝成長が一目で見える
  const prev=all.length>1?all[all.length-2]:null;
  const rDatasets=[{label:lat.date,data:items.map(it=>pfv(lat,it)),spanGaps:true,borderColor:th.acc,backgroundColor:th.fill,pointBackgroundColor:th.acc}];
  if(prev)rDatasets.push({label:(t2('prevLbl'))+' '+prev.date,data:items.map(it=>pfv(prev,it)),spanGaps:true,borderColor:th.acc+'80',backgroundColor:'transparent',borderDash:[6,4],borderWidth:1.5,pointBackgroundColor:th.acc+'80',pointRadius:2});
  cR=new Chart(document.getElementById('cvR'),{type:'radar',data:{labels:items.map(it=>{const n0=qName(lat,it,itemNo(it));const n=n0.length>(lang==='ja'?6:14)?n0.slice(0,lang==='ja'?6:14)+'…':n0;return pfv(lat,it)==null?n+t2('notAsked'):n}),datasets:rDatasets},options:{responsive:true,maintainAspectRatio:false,scales:{r:{min:0,max:100,ticks:{stepSize:50,font:{size:10}},pointLabels:{font:{size:11}},grid:{color:th.grid},angleLines:{color:th.grid}}},plugins:{legend:{display:true,position:'bottom'}}}});
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
