/* data.js — 静的データ層：デフォルト試問項目（作業カタログは works-qa.js） */
/* ==============================================================
   デフォルト試問項目（養豚 口頭試問）
   ============================================================== */
/* デフォルト項目の模範解答: works-qa.js（睦沢pptx由来）に既存出典がある作業のみ再利用する。
   出典のない質問（q1/q3/q5/q7〜q9）には新規執筆しない＝捏造禁止。ansは任意フィールド＝後方互換 */
function defaultAns(workId){
  try{
    const w=WORKSQA.works.find(x=>x.id===workId);
    if(!w)return undefined;
    return '・'+w.purpose.concat(w.caution,w.mistakes).join('\n・');
  }catch(e){return undefined}
}
/* デフォルト項目q2/q4/q6の模範解答 英訳（defaultAns=works-qa.jsの純粋な翻訳。書き足しなし）
   vi/idの模範解答訳は未整備＝loc()がenへフォールバック（表示側で言語注記つき） */
const DEFAULT_ANS_EN={
'feeding-daily':'・Keep growth and reproduction stable\n・Make sure every pig can eat evenly\n・Avoid wasting feed\n・Follow the specified feed amounts\n・Adjust for the pigs’ condition and the season\n・Always check for equipment trouble and leftover feed\n・Feed loss from overlooked leftovers\n・Lower intake from forgetting seasonal adjustment\n・Not checking drinker flow → too little water → poor feed intake\n・Overlooking spoiled or moldy feed in troughs in hot weather',
'disinfect':'・Keep pathogens from entering, spreading in, or leaving the farm\n・Protect pig health and production performance\n・Maintain the farm’s biosecurity level\n・Remove dirt first, then disinfect\n・Follow the specified concentration, volume and contact time\n・Dry thoroughly after washing and disinfecting\n・Diluting disinfectant by eye → off the specified concentration\n・Chemical exposure from not wearing a protective mask and goggles\n・Spraying surfaces still covered with organic matter → disinfectant is inactivated',
'farrow-assist':'・Protect the lives of the sow and piglets\n・Reduce stillbirths and deaths right after farrowing\n・Make sure piglets drink enough colostrum\n・Assist only when no piglet has come out for a long time\n・Always keep clean and use lubrication when assisting\n・Dry, warm and check the breathing of newborn piglets right away\n・Leaving birth intervals over 45 min → hypoxia and more stillbirths\n・Oxytocin overdose (over 10 IU) → excessive contractions and more stillbirths\n・Mistaking a weak (asphyxiated) piglet for a stillbirth → skipping resuscitation'
};
/* name_en等はloc()（i18n.js）用の任意フィールド＝localStorage/バックアップJSONと完全後方互換（未知キーは従来コードに無視される） */
function defaultCfg(){return{sections:[
  {id:'A',name:'飼養・健康管理',name_en:'Feeding & Health',name_vi:'Nuôi dưỡng・Sức khỏe',name_id:'Pemeliharaan & Kesehatan'},
  {id:'B',name:'衛生・防疫',name_en:'Hygiene & Biosecurity',name_vi:'Vệ sinh・Phòng dịch',name_id:'Kebersihan & Biosekuriti'},
  {id:'C',name:'繁殖・分娩',name_en:'Breeding & Farrowing',name_vi:'Sinh sản・Đẻ',name_id:'Reproduksi & Kelahiran'},
  {id:'D',name:'安全・コンプライアンス',name_en:'Safety & Compliance',name_vi:'An toàn・Tuân thủ',name_id:'Keselamatan & Kepatuhan'}
],items:[
  {id:'q1',secId:'A',name:'母豚の健康観察',desc:'母豚の健康状態を確認する際、どこを見て何を判断しますか。異常を見つけたときの対応も説明してください。',
   name_en:'Sow health observation',desc_en:'When checking a sow’s health, what do you look at and how do you judge her condition? Also explain what you do when you find something abnormal.',
   name_vi:'Quan sát sức khỏe heo nái',desc_vi:'Khi kiểm tra sức khỏe heo nái, bạn nhìn vào đâu và đánh giá điều gì? Hãy giải thích cả cách xử lý khi phát hiện bất thường.',
   name_id:'Pengamatan kesehatan induk babi',desc_id:'Saat memeriksa kesehatan induk babi, apa yang Anda lihat dan bagaimana menilainya? Jelaskan juga tindakan Anda bila menemukan kelainan.'},
  {id:'q2',secId:'A',name:'飼料・給餌管理',desc:'給餌量の決め方と、食い込み不良を見つけたときの対応を説明してください。',ans:defaultAns('feeding-daily'),ans_en:DEFAULT_ANS_EN['feeding-daily'],
   name_en:'Feed & feeding management',desc_en:'Explain how you decide the feed amount, and what you do when you find a pig eating poorly.',
   name_vi:'Quản lý thức ăn・cho ăn',desc_vi:'Hãy giải thích cách quyết định lượng thức ăn và cách xử lý khi phát hiện heo ăn kém.',
   name_id:'Manajemen pakan & pemberian pakan',desc_id:'Jelaskan cara menentukan jumlah pakan dan tindakan Anda bila menemukan babi yang nafsu makannya menurun.'},
  {id:'q3',secId:'A',name:'飲水・環境管理',desc:'豚舎の温度・換気・飲水管理で日頃気をつけている点を説明してください。',
   name_en:'Water & environment management',desc_en:'Explain what you pay attention to every day regarding barn temperature, ventilation and drinking water.',
   name_vi:'Quản lý nước uống・môi trường',desc_vi:'Hãy giải thích những điểm bạn chú ý hằng ngày về nhiệt độ, thông gió và nước uống trong chuồng heo.',
   name_id:'Manajemen air minum & lingkungan',desc_id:'Jelaskan hal-hal yang Anda perhatikan sehari-hari tentang suhu kandang, ventilasi, dan air minum.'},
  {id:'q4',secId:'B',name:'消毒・バイオセキュリティ',desc:'農場に病気を持ち込まないために実施している消毒・防疫対策を説明してください。',ans:defaultAns('disinfect'),ans_en:DEFAULT_ANS_EN['disinfect'],
   name_en:'Disinfection & biosecurity',desc_en:'Explain the disinfection and biosecurity measures you follow to keep diseases out of the farm.',
   name_vi:'Khử trùng・an toàn sinh học',desc_vi:'Hãy giải thích các biện pháp khử trùng, phòng dịch bạn thực hiện để không mang mầm bệnh vào trại.',
   name_id:'Desinfeksi & biosekuriti',desc_id:'Jelaskan langkah desinfeksi dan biosekuriti yang Anda lakukan agar penyakit tidak masuk ke peternakan.'},
  {id:'q5',secId:'B',name:'異常の早期発見と報告',desc:'疾病や事故の兆候に気づいたとき、どのように判断し誰に報告しますか。',
   name_en:'Early detection & reporting',desc_en:'When you notice signs of disease or an accident, how do you judge the situation and who do you report to?',
   name_vi:'Phát hiện sớm và báo cáo bất thường',desc_vi:'Khi nhận thấy dấu hiệu bệnh hoặc tai nạn, bạn đánh giá thế nào và báo cáo cho ai?',
   name_id:'Deteksi dini & pelaporan',desc_id:'Bila Anda melihat tanda penyakit atau kecelakaan, bagaimana Anda menilainya dan kepada siapa Anda melapor?'},
  {id:'q6',secId:'C',name:'分娩介助の判断',desc:'分娩時に介助が必要と判断する基準と、難産時の対応を説明してください。',ans:defaultAns('farrow-assist'),ans_en:DEFAULT_ANS_EN['farrow-assist'],
   name_en:'Farrowing assistance decisions',desc_en:'Explain the criteria for deciding that a sow needs assistance during farrowing, and what you do in a difficult birth.',
   name_vi:'Quyết định hỗ trợ khi heo đẻ',desc_vi:'Hãy giải thích tiêu chí để quyết định cần hỗ trợ khi heo nái đẻ và cách xử lý khi đẻ khó.',
   name_id:'Keputusan membantu kelahiran',desc_id:'Jelaskan kriteria untuk memutuskan bahwa induk perlu dibantu saat melahirkan, dan tindakan Anda saat kelahiran sulit.'},
  {id:'q7',secId:'C',name:'子豚のケア',desc:'生まれた子豚に対して行う処置と、その目的を順を追って説明してください。',
   name_en:'Piglet care',desc_en:'Explain, step by step, the procedures you perform on newborn piglets and the purpose of each.',
   name_vi:'Chăm sóc heo con',desc_vi:'Hãy giải thích theo thứ tự các thao tác bạn làm với heo con mới sinh và mục đích của từng thao tác.',
   name_id:'Perawatan anak babi',desc_id:'Jelaskan secara berurutan perlakuan yang Anda lakukan pada anak babi yang baru lahir beserta tujuannya.'},
  {id:'q8',secId:'D',name:'作業安全',desc:'作業中の事故を防ぐために気をつけていることを説明してください。',
   name_en:'Work safety',desc_en:'Explain what you do to prevent accidents during work.',
   name_vi:'An toàn lao động',desc_vi:'Hãy giải thích những điều bạn chú ý để phòng tránh tai nạn trong khi làm việc.',
   name_id:'Keselamatan kerja',desc_id:'Jelaskan hal-hal yang Anda perhatikan untuk mencegah kecelakaan saat bekerja.'},
  {id:'q9',secId:'D',name:'記録・ルール遵守',desc:'記録や報告のルールを守ることがなぜ重要か、あなたの考えを説明してください。',
   name_en:'Records & rule compliance',desc_en:'Explain in your own words why it is important to follow the rules for records and reporting.',
   name_vi:'Ghi chép・tuân thủ quy định',desc_vi:'Hãy nêu suy nghĩ của bạn vì sao việc tuân thủ quy định ghi chép, báo cáo lại quan trọng.',
   name_id:'Pencatatan & kepatuhan aturan',desc_id:'Jelaskan menurut pendapat Anda mengapa penting mematuhi aturan pencatatan dan pelaporan.'}
]}}

/* ==============================================================
   質問バンク（qbank.js の QBANK）へのアクセサ【契約・変更禁止】
   UI側はこの2関数だけを使ってプリセット選択UIを作る
   ============================================================== */
function qbankPresets(){return QBANK.presets}
function qbankPreset(id){return QBANK.presets.find(p=>p.id===id)}

/* 英語プリセット「既定9問（英語版）」を質問バンクへ追加登録。
   内容はdefaultCfg()の *_en フィールド＝既定9問の純粋な英訳（新規執筆なし＝捏造禁止を維持）。
   EN切替時に「英語で試問するならこのセット」への導線になる */
(function(){
  try{
    if(typeof QBANK==='undefined'||QBANK.presets.some(p=>p.id==='default-9-en'))return;
    const c=defaultCfg();
    QBANK.presets.push({
      id:'default-9-en',
      name:'既定9問・英語版 / Default 9 Questions (English)',
      desc:'The built-in 9 questions translated into English. Use this set to run the oral exam in English.',
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
function qaQuestions(work){
  const mk=(key,nameKey,tplKey,src)=>({
    key,
    name:t(nameKey),
    desc:t(tplKey).replace(/\{work\}/g,qaWorkLabel(work)),
    ans:'・'+src.join('\n・'),
  });
  return[
    mk('purpose','qnPurpose','qtPurpose',work.purpose),
    mk('caution','qnCaution','qtCaution',work.caution),
    mk('mistakes','qnMistakes','qtMistakes',work.mistakes),
  ];
}
