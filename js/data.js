/* data.js — 静的データ層：デフォルト試問項目（作業カタログは works-qa.js） */
/* ==============================================================
   デフォルト試問項目（養豚 口頭試問）
   ============================================================== */
function defaultCfg(){return{sections:[
  {id:'A',name:'飼養・健康管理'},
  {id:'B',name:'衛生・防疫'},
  {id:'C',name:'繁殖・分娩'},
  {id:'D',name:'安全・コンプライアンス'}
],items:[
  {id:'q1',secId:'A',name:'母豚の健康観察',desc:'母豚の健康状態を確認する際、どこを見て何を判断しますか。異常を見つけたときの対応も説明してください。'},
  {id:'q2',secId:'A',name:'飼料・給餌管理',desc:'給餌量の決め方と、食い込み不良を見つけたときの対応を説明してください。'},
  {id:'q3',secId:'A',name:'飲水・環境管理',desc:'豚舎の温度・換気・飲水管理で日頃気をつけている点を説明してください。'},
  {id:'q4',secId:'B',name:'消毒・バイオセキュリティ',desc:'農場に病気を持ち込まないために実施している消毒・防疫対策を説明してください。'},
  {id:'q5',secId:'B',name:'異常の早期発見と報告',desc:'疾病や事故の兆候に気づいたとき、どのように判断し誰に報告しますか。'},
  {id:'q6',secId:'C',name:'分娩介助の判断',desc:'分娩時に介助が必要と判断する基準と、難産時の対応を説明してください。'},
  {id:'q7',secId:'C',name:'子豚のケア',desc:'生まれた子豚に対して行う処置と、その目的を順を追って説明してください。'},
  {id:'q8',secId:'D',name:'作業安全',desc:'作業中の事故を防ぐために気をつけていることを説明してください。'},
  {id:'q9',secId:'D',name:'記録・ルール遵守',desc:'記録や報告のルールを守ることがなぜ重要か、あなたの考えを説明してください。'}
]}}

/* ==============================================================
   作業カタログ（works-qa.js の WORKSQA）へのアクセサと質問生成
   大項目=作業（7カテゴリ44作業）、小項目=質問（目的/注意点/よくあるミス）
   pptx由来の箇条書きが模範解答（ans）になる
   ============================================================== */
function qaWorksInCat(catId){return WORKSQA.works.filter(w=>w.category===catId)}
function qaWorkById(id){return WORKSQA.works.find(w=>w.id===id)}
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
    desc:t(tplKey).replace(/\{work\}/g,work.name),
    ans:'・'+src.join('\n・'),
  });
  return[
    mk('purpose','qnPurpose','qtPurpose',work.purpose),
    mk('caution','qnCaution','qtCaution',work.caution),
    mk('mistakes','qnMistakes','qtMistakes',work.mistakes),
  ];
}
