/* data.js — 静的データ層：デフォルト試問項目（作業カタログは works-qa.js） */
/* ==============================================================
   デフォルト試問項目（養豚 口頭試問）
   ============================================================== */
/* デフォルト項目の模範解答: works-qa.js（睦沢pptx由来）に既存出典がある作業のみ再利用する。
   出典のない質問（q1/q5）には新規執筆しない＝捏造禁止。ansは任意フィールド＝後方互換 */
function defaultAns(workId){
  try{
    const w=WORKSQA.works.find(x=>x.id===workId);
    if(!w)return undefined;
    return '・'+w.purpose.concat(w.caution,w.mistakes).join('\n・');
  }catch(e){return undefined}
}
/* デフォルト項目の模範解答 英訳（defaultAns=works-qa.jsの純粋な翻訳。書き足しなし）
   vi/idの模範解答訳は未整備＝loc()がenへフォールバック（表示側で言語注記つき） */
const DEFAULT_ANS_EN={
'feeding-daily':'・Keep growth and reproduction stable\n・Make sure every pig can eat evenly\n・Avoid wasting feed\n・Follow the specified feed amounts\n・Adjust for the pigs’ condition and the season\n・Always check for equipment trouble and leftover feed\n・Feed loss from overlooked leftovers\n・Lower intake from forgetting seasonal adjustment\n・Not checking drinker flow → too little water → poor feed intake\n・Overlooking spoiled or moldy feed in troughs in hot weather',
'disinfect':'・Keep pathogens from entering, spreading in, or leaving the farm\n・Protect pig health and production performance\n・Maintain the farm’s biosecurity level\n・Remove dirt first, then disinfect\n・Follow the specified concentration, volume and contact time\n・Dry thoroughly after washing and disinfecting\n・Diluting disinfectant by eye → off the specified concentration\n・Chemical exposure from not wearing a protective mask and goggles\n・Spraying surfaces still covered with organic matter → disinfectant is inactivated',
'farrow-assist':'・Protect the lives of the sow and piglets\n・Reduce stillbirths and deaths right after farrowing\n・Make sure piglets drink enough colostrum\n・Assist only when no piglet has come out for a long time\n・Always keep clean and use lubrication when assisting\n・Dry, warm and check the breathing of newborn piglets right away\n・Leaving birth intervals over 45 min → hypoxia and more stillbirths\n・Oxytocin overdose (over 10 IU) → excessive contractions and more stillbirths\n・Mistaking a weak (asphyxiated) piglet for a stillbirth → skipping resuscitation'
};
/* name_en等はloc()（i18n.js）用の任意フィールド＝localStorage/バックアップJSONと完全後方互換（未知キーは従来コードに無視される） */
function defaultCfg(){return{sections:[
  {id:'A',name:'飼養・健康管理',name_en:'Feeding & Health',name_vi:'Nuôi dưỡng・Sức khỏe',name_id:'Pemeliharaan & Kesehatan'},
  {id:'B',name:'衛生・防疫',name_en:'Hygiene & Biosecurity',name_vi:'Vệ sinh・Phòng dịch',name_id:'Kebersihan & Biosekuriti'}
],items:[
  {id:'q1',secId:'A',name:'母豚の健康観察',desc:'母豚の健康状態を確認する際、どこを見て何を判断しますか。異常を見つけたときの対応も説明してください。',
   name_en:'Sow health observation',desc_en:'When checking a sow’s health, what do you look at and how do you judge her condition? Also explain what you do when you find something abnormal.',
   name_vi:'Quan sát sức khỏe heo nái',desc_vi:'Khi kiểm tra sức khỏe heo nái, bạn nhìn vào đâu và đánh giá điều gì? Hãy giải thích cả cách xử lý khi phát hiện bất thường.',
   name_id:'Pengamatan kesehatan induk babi',desc_id:'Saat memeriksa kesehatan induk babi, apa yang Anda lihat dan bagaimana menilainya? Jelaskan juga tindakan Anda bila menemukan kelainan.'},
  {id:'q4',secId:'B',name:'消毒・バイオセキュリティ',desc:'農場に病気を持ち込まないために実施している消毒・防疫対策を説明してください。',ans:defaultAns('disinfect'),ans_en:DEFAULT_ANS_EN['disinfect'],
   name_en:'Disinfection & biosecurity',desc_en:'Explain the disinfection and biosecurity measures you follow to keep diseases out of the farm.',
   name_vi:'Khử trùng・an toàn sinh học',desc_vi:'Hãy giải thích các biện pháp khử trùng, phòng dịch bạn thực hiện để không mang mầm bệnh vào trại.',
   name_id:'Desinfeksi & biosekuriti',desc_id:'Jelaskan langkah desinfeksi dan biosekuriti yang Anda lakukan agar penyakit tidak masuk ke peternakan.'},
  {id:'q5',secId:'B',name:'異常の早期発見と報告',desc:'疾病や事故の兆候に気づいたとき、どのように判断し誰に報告しますか。',
   name_en:'Early detection & reporting',desc_en:'When you notice signs of disease or an accident, how do you judge the situation and who do you report to?',
   name_vi:'Phát hiện sớm và báo cáo bất thường',desc_vi:'Khi nhận thấy dấu hiệu bệnh hoặc tai nạn, bạn đánh giá thế nào và báo cáo cho ai?',
   name_id:'Deteksi dini & pelaporan',desc_id:'Bila Anda melihat tanda penyakit atau kecelakaan, bagaimana Anda menilainya dan kepada siapa Anda melapor?'}
]}}
/* その場で出題（2026-09-25 社長判断：問題はその場で考える）。空欄3問・問題文は試問ごとに
   cur.items[id].qText へ保存（cfg の name/desc は空）。free:true の問はカードに入力欄を出す。
   従来の3問（defaultCfg＝記録上の setId 'def'）は「変更」から選べる */
function freeCfg(){return{sections:[
  {id:'F',name:'出題',name_en:'Questions',name_vi:'Câu hỏi',name_id:'Pertanyaan'}
],items:[1,2,3].map(n=>({id:'f'+n,secId:'F',name:'',desc:'',free:true}))}}
function isFreeCfg(c){c=c||cfg;try{const d=freeCfg();return c.items.length===d.items.length&&c.items.every((it,i)=>it.id===d.items[i].id&&!!it.free&&!it.name)}catch(e){return false}}

/* ==============================================================
   質問バンク（qbank.js の QBANK）へのアクセサ【契約・変更禁止】
   UI側はこの2関数だけを使ってプリセット選択UIを作る
   ============================================================== */
function qbankPresets(){return QBANK.presets}
function qbankPreset(id){return QBANK.presets.find(p=>p.id===id)}

/* 英語プリセット「既定3問（英語版）」を質問バンクへ追加登録。
   内容はdefaultCfg()の *_en フィールド＝既定3問の純粋な英訳（新規執筆なし＝捏造禁止を維持）。
   EN切替時に「英語で試問するならこのセット」への導線になる */
(function(){
  try{
    if(typeof QBANK==='undefined'||QBANK.presets.some(p=>p.id==='default-3-en'))return;
    const c=defaultCfg();
    QBANK.presets.push({
      id:'default-3-en',
      name:'既定3問・英語版 / Default 3 Questions (English)',
      desc:'The built-in 3 questions translated into English. Use this set to run the oral exam in English.',
      sections:c.sections.map(s=>({id:s.id,name:s.name_en||s.name})),
      items:c.items.map(it=>{
        const o={id:it.id,secId:it.secId,name:it.name_en||it.name,desc:it.desc_en||it.desc};
        if(it.ans_en){o.ans=it.ans_en;o.src='works-qa.js（睦沢pptx由来）English translation'}
        return o;
      })
    });
  }catch(e){}
})();

/* ==============================================================
   作業カタログ（works-qa.js の WORKSQA）へのアクセサと質問生成
   大項目=作業（7カテゴリ44作業）、小項目=質問（目的/注意点/よくあるミス）
   pptx由来の箇条書きが模範解答（ans）になる
   ============================================================== */
function qaWorksInCat(catId){return WORKSQA.works.filter(w=>w.category===catId)}
function qaWorkById(id){return WORKSQA.works.find(w=>w.id===id)}
/* 作業名の表示用ラベル：非日本語UIでは name_en（works-qa.js末尾で付与）を優先。未整備は日本語のまま */
function qaWorkLabel(w){return(lang!=='ja'&&w&&w.name_en)?w.name_en:(w?w.name:'')}
function qaCatLabel(catId){
  const k='cat'+catId.charAt(0).toUpperCase()+catId.slice(1);
  const tx=(TX[lang]||TX.ja)[k];
  if(tx)return tx;
  const c=WORKSQA.categories.find(c=>c.id===catId);return c?c.name:catId;
}
/* 1作業から出題できる質問（小項目）3種。key はチェックボックスの識別・項目IDの一部 */
const QA_KEYS={purpose:['qnPurpose','qtPurpose'],caution:['qnCaution','qtCaution'],mistakes:['qnMistakes','qtMistakes']};
/* 指定した言語の質問文（日本語＝原文。他の言語の作業名は name_en＝従来の qaWorkLabel と同じ） */
function qaText(work,key,L){
  const k=QA_KEYS[key],tx=TX[L]||TX.ja,wl=L==='ja'?work.name:(work.name_en||work.name);
  return{name:tx[k[0]]||TX.ja[k[0]],desc:(tx[k[1]]||TX.ja[k[1]]).replace(/\{work\}/g,wl)};
}
/* カタログの質問を設定の項目にする形：原文=日本語＋name_en/vi/id・desc_en/vi/id（表示時に loc() で言語を選ぶ・M-14） */
function qaLocFields(work,key){
  const ja=qaText(work,key,'ja'),o={name:ja.name,desc:ja.desc};
  ['en','vi','id'].forEach(L=>{const x=qaText(work,key,L);o['name_'+L]=x.name;o['desc_'+L]=x.desc});
  return o;
}
function qaQuestions(work){
  const mk=(key,src)=>{const x=qaText(work,key,lang);return{key,name:x.name,desc:x.desc,nameJa:qaText(work,key,'ja').name,ans:'・'+src.join('\n・')}};
  return[mk('purpose',work.purpose),mk('caution',work.caution),mk('mistakes',work.mistakes)];
}
/* 旧版でカタログから足した質問（その時の画面の言語の文だけを原文に保存・訳なし）を、日本語の原文＋各言語の訳に直す。
   項目IDの作業・質問の種類（qa_<作業>_<purpose|caution|mistakes>_<時刻>）と、どれかの言語で生成した文と名前・説明が
   そのまま一致するときだけ直す（書き換えた質問・模範解答は変えない）。直したら true */
function qaUpgradeItem(it){
  try{
    if(!it||it.name_en||typeof WORKSQA==='undefined'||typeof TX==='undefined')return false;
    const m=/^qa_(.+)_(purpose|caution|mistakes)_\d+$/.exec(String(it.id||''));if(!m)return false;
    const w=qaWorkById(m[1]);if(!w)return false;
    if(!['ja','en','vi','id'].some(L=>{const x=qaText(w,m[2],L);return x.name===it.name&&x.desc===it.desc}))return false;
    Object.assign(it,qaLocFields(w,m[2]));
    return true;
  }catch(e){return false}
}
