/* util.js — 汎用ユーティリティ（toast/esc/Blob変換など） */
/* ==============================================================
   ユーティリティ
   ============================================================== */
/* エラーは5秒表示（現場で受験者へ視線を移した後でも気づけるように）。連続表示時は前のタイマーを破棄 */
function toast(msg,err){const el=document.getElementById('toast');el.textContent=msg;el.classList.toggle('err',!!err);el.setAttribute('role',err?'alert':'status');el.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>el.classList.remove('show'),err?5000:2600)}
function esc(s){if(s==null)return'';return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function blobToB64(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
function b64ToBlob(b64,mime){const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime||'audio/webm'})}

function safeName(s){return String(s||'').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').slice(0,80)}
/* onclick属性等に埋め込むIDの無害化（バックアップ由来の注入対策） */
function sanitizeId(s){return String(s).replace(/[^a-zA-Z0-9_\-]/g,'_')}
/* 端末の現地時刻での今日（YYYY-MM-DD）。toISOString()はUTC基準で、日本の0:00〜9:00は前日になるため使わない */
function todayStr(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
