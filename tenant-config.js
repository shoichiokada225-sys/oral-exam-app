/* テナント設定（農場ごとの差し替え口）。この既定ファイルは「ヒラノ版の今の動作」そのまま。
   他農場の配布物は tools/build-tenant.mjs が dist/<id>/ にこのファイルを農場用の内容で書き出す（元のこのファイルは変えない）。
   ・gas = 録音の保存先（その農場の GAS の URL・合言葉・ドライブのフォルダ名）。url が空なら既定の保存先は入れない
   ・brand = 画面の題名（ビルド時に index.html / manifest も同じ題名にそろえる）
   ・copyright = 権利表記。このアプリには権利表記の画面表示はない（将来入れる場合は mode:'hide' の農場には出さない） */
window.TENANT = {
  id: 'default',
  gas: {
    url: 'https://script.google.com/macros/s/AKfycbxupXbLNCzUGtwr2D2sWQfozP0u4bFitbqyiIk_efuUdpPzE-EaVdCI4nJCOYIbUzBuLA/exec',
    token: '',   // 合言葉なし運用（2026-10-07 社長指示：みなで改善案を出し合うためログインの手間を省く）。GAS 側も TOKEN='' で v8 デプロイ済み
    folder: '口頭試問音声'
  },
  examples: { setName: '棚倉農場' },   // 画面の入力例の農場名（セット名の例文）
  brand: { title: '口頭試問 評価システム' },
  copyright: { mode: 'show' }
};
