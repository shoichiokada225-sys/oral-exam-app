/* verdict.js — 試問カードの合否（○合格/×不合格）トグル・送信状態表示・ドライブ名の合否ラベル
   media.js から分割（R2・挙動は不変）。読み込み順: drive.js の後、ui-core.js の前 */
// 合否ラベル（ドライブのファイル名用。受け取るのは社長側なので言語に関わらず日本語固定）
// 合否は採点と同じ score='pass'|'fail' を使う（旧5段階の数値や未採点は「未判定」）
function verdictTag(v){return v==='pass'?'合格':v==='fail'?'不合格':'未判定'}
// 合否ボタン（試問カード）：採点と同じ score に保存。同じボタンをもう一度押すと解除
const vdLast={};
function setVerdict(itemId,v){
  if(!cur)return;
  cur.items[itemId]=cur.items[itemId]||{};
  const rec=cur.items[itemId];
  // 「続ける」で開いた旧5段階の試問：旧点数を黙って合否で上書きしない（採点画面の pickScore と同じ確認）
  if(isOld(rec.score)&&!confirm(t2('oldReplace').replace('{v}',pfLabel(rec.score))))return;
  // 手袋のチャタリング・二度押し：同じボタンを500ms以内に続けて押したら2回目は無視（黙って合否が消えるのを防ぐ）
  const now=Date.now(),lp=vdLast[itemId];
  vdLast[itemId]={v,t:now};
  if(lp&&lp.v===v&&now-lp.t<500)return;
  const cleared=rec.score===v;
  rec.score=cleared?null:v;
  saveDraft();
  if(cleared)toast(t2('pfCleared')); // 解除は画面に出して知らせる（緑が消えるだけでは受験者を見ている試問者は気づかない）
  const vp=document.getElementById('vp-'+itemId),vf=document.getElementById('vf-'+itemId);
  if(vp){vp.classList.toggle('on',rec.score==='pass');vp.setAttribute('aria-pressed',rec.score==='pass'?'true':'false')}
  if(vf){vf.classList.toggle('on',rec.score==='fail');vf.setAttribute('aria-pressed',rec.score==='fail'?'true':'false')}
  const vo=document.getElementById('vo-'+itemId);if(vo)vo.remove(); // 旧点数は置き換え済み
  if(typeof updateExamProg==='function')updateExamProg(); // 合否の進捗・完了色を即時に反映
  if(!rec.hasAudio)return; // 録音前に判定した場合は、録音停止時のアップロードで名前に入る
  resyncDriveName(cur,itemId);
}
function setCloud(itemId,state){
  const el=document.getElementById('cl-'+itemId);if(!el)return;
  if(state==='up'){el.textContent=t('clUp');el.style.color='var(--sub)';el.onclick=null;el.style.cursor='default'}
  else if(state==='done'){el.textContent=t('clDone');el.style.color='var(--pri)';el.onclick=null;el.style.cursor='default'}
  else if(state==='fail'){el.textContent=t('clFail');el.style.color='var(--s1)';el.style.cursor='pointer';el.onclick=()=>{if(cur)resendDrive(cur.id,itemId)}}
  else{el.textContent='';el.onclick=null}
  el.style.display=state?'block':'none';
}
