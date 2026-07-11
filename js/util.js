/* util.js — 汎用ユーティリティ（toast/esc/Blob変換など） */
/* ==============================================================
   ユーティリティ
   ============================================================== */
function toast(msg,err){const el=document.getElementById('toast');el.textContent=msg;el.style.background=err?'#d32f2f':'#333';el.classList.add('show');setTimeout(()=>el.classList.remove('show'),2600)}
function esc(s){if(s==null)return'';return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function blobToB64(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(String(r.result).split(',')[1]||'');r.onerror=()=>rej(r.error);r.readAsDataURL(blob)})}
function b64ToBlob(b64,mime){const bin=atob(b64);const arr=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);return new Blob([arr],{type:mime||'audio/webm'})}

function safeName(s){return String(s||'').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,'_').slice(0,80)}
/* onclick属性等に埋め込むIDの無害化（バックアップ由来の注入対策） */
function sanitizeId(s){return String(s).replace(/[^a-zA-Z0-9_\-]/g,'_')}
