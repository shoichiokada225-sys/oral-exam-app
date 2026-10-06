/* テナント設定（農場ごとの差し替え口）。この既定ファイルは「ヒラノ版の今の動作」そのまま。
   他農場の配布物は tools/build-tenant.mjs が dist/<id>/ にこのファイルを農場用の内容で書き出す（元のこのファイルは変えない）。
   ・gas = 録音の保存先（その農場の GAS の URL・合言葉・ドライブのフォルダ名）。url が空なら既定の保存先は入れない
   ・brand = 画面の題名（ビルド時に index.html / manifest も同じ題名にそろえる）
   ・copyright = 権利表記。このアプリには権利表記の画面表示はない（将来入れる場合は mode:'hide' の農場には出さない） */
window.TENANT = {
  id: 'default',
  gas: {
    url: 'https://script.google.com/macros/s/AKfycbxupXbLNCzUGtwr2D2sWQfozP0u4bFitbqyiIk_efuUdpPzE-EaVdCI4nJCOYIbUzBuLA/exec',
    token: 'OOIRI',
    folder: '口頭試問音声'
  },
  brand: { title: '口頭試問 評価システム' },
  copyright: { mode: 'show' }
};
