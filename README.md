# 口頭試問 評価システム（oral-exam-app）

各質問項目を **録音 → 後から文字起こし → 採点** する流れを単一HTMLで実現する評価アプリ。

> ## HSS認定制度の2アプリ（両輪）
>
> 同じ業務を「行動」と「理解」の両面から評価する。両方そろって初めて「わかっていて、できる」と言える。
>
> | | 問うこと | リポジトリ |
> |---|---|---|
> | **実技試験** | 実際の業務が正しく**できているか** | [pig-farm-evaluation](https://github.com/shoichiokada225-sys/pig-farm-evaluation)（本番: https://shoichiokada225-sys.github.io/pig-farm-evaluation/ ） |
> | **口頭試問**（本アプリ） | 業務を理解し**言葉にできるか** | oral-exam-app ← ここ |
>
> - **作業カタログを共有**: 設定タブ「作業カタログから質問を追加」の44作業は、実技アプリと同じ睦沢農場「業務の目的と注意点」由来で、**work ID を統一**（本アプリ `js/works-qa.js` ↔ 実技 `works-data.json`）。片方を直したらもう片方も揃える。
> - **配布用の案内資料**: 実技リポジトリの `docs/hss-guide/`（実技・口頭を1枚で紹介するA4画像）。
> - **今後の構想**: work ID が揃っているので、将来は同一作業・同一人物の「実技スコア」と「口頭スコア」を突き合わせた総合評価が可能。現状は各端末 localStorage / IndexedDB 保存のみ。

> 2026-09-23：採点を5段階から**合格／不合格**に変更、既定の設問を**3問**（母豚の健康観察・消毒/バイオセキュリティ・異常の早期発見と報告）に削減。使用中の端末も起動時に一度だけ3問へ切替（過去の試問データ・録音は保持、旧5段階の点は「旧5段階評価」として表示）。

## 特徴
- **静的ファイルのみ**。ビルド不要、GitHub Pages / Vercel で静的公開可能（file://直開きでも動作）
- **作業カタログから出題**：設定タブ「📚 作業カタログから質問を追加」で、カテゴリ（7分類）→ 作業（大項目・44作業）→ 質問（小項目：目的/注意点/よくあるミス）を選んで試問項目に追加できる。出典は睦沢農場「業務の目的と注意点」pptx。各質問には**模範解答**が付き、試問・採点画面で折りたたみ表示（採点者の照合用。データは `js/works-qa.js`）
- **5タブ構成**：試問（録音）／採点／履歴／グラフ／設定
- **多言語**：日本語・英語・ベトナム語・インドネシア語
- データは端末内に保存（メタ・文字起こし・採点 = localStorage、音声 = IndexedDB）
- **PWA対応**（`manifest.webmanifest` + `sw.js`）：ホーム画面にインストール可、一度開けば圏外でも起動（録音・採点は元々オフライン動作）
- **進捗ナビ**：試問タブに録音進捗バー＋セクションジャンプ、採点画面に採点進捗バー
- **採点の自動下書き保存**：採点中の入力（合否・文字起こし・コメント）は自動保存され、タブ移動や中断でも消えない
- **履歴の検索・月別表示**：受験者名／試問者名で絞り込み、月ごとにグループ表示

## 使い方の流れ
1. **試問タブ**：試問日・試問者・受験者を入力。質問ごとに「録音」ボタンで回答を録音する。
   対応ブラウザ（Chrome等）では録音中に自動文字起こしの下書きも取得（ベストエフォート）。
   全項目の録音が終わったら「試問を保存」。
2. **採点タブ**：採点待ちの試問を開き、各項目の音声を再生しながら文字起こしを確認・修正。
   設問ごとに「合格／不合格」を選びコメントを入力。全体所感を書いて「採点を保存」。
3. **履歴タブ**：保存済みの試問を一覧・詳細表示、CSV出力、削除。
4. **グラフタブ**：受験者ごとの合格率の推移・分野別の合格率・設問別の合否（合否採点済みのみ）。
5. **設定タブ**：試問項目（セクション・質問）の編集、データの引き継ぎ（バックアップ／復元）、AI文字起こしAPIの登録。

## 録音音声をGoogleドライブに自動保存（任意・GAS方式）
設定タブの **「Googleドライブに自動保存」** で、録音するたびに自分のGoogleドライブへ自動保存できる。
- **Google Apps Script（GAS）のウェブアプリ経由**。Google Cloud Console も OAuth も不要、接続は切れない
- GAS（`gas/Code.gs`）を「自分として実行／全員アクセス」でデプロイ → URLと合言葉(token)をアプリ設定に入れるだけ
- 保存先：`（フォルダ名）/（受験者_日付）/A-1_見出し.webm`
- **設定手順は `SETUP-GOOGLE-DRIVE.md`**（GASにコード貼付 → デプロイ → URL＋合言葉をアプリに入力 → 接続テスト → 自動保存ON）
- 用途：どの端末で録音しても音声が社長のドライブ1か所に集約 → PCでまとめて文字起こし
- 公開エンドポイントは合言葉(token)でガード。URL・合言葉は端末内localStorageのみ保存（コードに秘密情報なし）
- 送信はプリフライト回避のため `Content-Type: text/plain` でPOST（GASがJSONを返す）

## 別のPC・スマホへの引き継ぎ
データは端末ごとに保存されるため、設定タブの **「バックアップ／復元」** で端末間を引き継ぐ：
- **書き出し**：この端末の全データ（試問項目・録音音声・文字起こし・採点）を1つの `.json` ファイルに保存（音声はbase64で同梱、APIキーは含めない）
- **読み込み**：別のPC/スマホでそのファイルを選ぶと取り込み。既存データと **統合**（同じ試問IDは `updatedAt` が新しい方を採用）し、試問項目は読み込み側を採用
- 用途例：現場のスマホで録音 → バックアップ書き出し → 事務所のPCで読み込んで採点
- ※ リアルタイム同期ではなくファイル受け渡し方式。常時自動共有が必要になったらサーバーDB化（Neon＋音声ストレージ）の追加開発が必要。

## 文字起こしの方式（重要）
たたき台では、APIキー不要で以下が使える：
- **録音中の自動文字起こし（ブラウザ内蔵 Web Speech API）** … Chrome系のみ。下書きとして保存
- **手入力／修正** … 採点画面で音声を再生しながらテキストを確定

さらに任意で、**外部の文字起こしAPI**（OpenAI Whisper 互換）を設定タブに登録すると、
採点画面の「AI文字起こし」ボタンで録音音声を自動文字起こしできる。
- 既定エンドポイント：`https://api.openai.com/v1/audio/transcriptions`、モデル：`whisper-1`
- **APIキーはこの端末の localStorage にのみ保存**（コードに直書きしない設計）

## ファイル構成（レイヤ）

```
index.html      マークアップのみ
styles.css      スタイル一式
js/util.js      汎用ユーティリティ（toast/esc/Blob変換/sanitizeId）
js/i18n.js      UI文言辞書（ja/en/vi/id）・t()・音声認識言語
js/works-qa.js  作業カタログ（睦沢pptx由来44作業。修正時は pig-farm-evaluation 側と揃える）
js/qbank.js     質問バンク（プリセット試問集。実在ソース採録のみ・模範解答つき）
js/data.js      静的データ層：デフォルト試問項目・カタログのアクセサ/質問生成
js/store.js     永続化層：localStorage/IndexedDB・セッション・バックアップ
js/media.js     録音（MediaRecorder/WebSpeech）・一時保存と復元・AI文字起こし
js/drive.js     Googleドライブ送信（GAS）・合否変更時の付け直し・未送信の再送・URLからの設定取り込み
js/verdict.js   試問カードの合否トグル（setVerdict）・送信状態表示・ドライブ名の合否ラベル
js/ui-core.js   描画層・共通：ui内文言TX2（4言語）・t2・合否ラベル・一覧行の状態
js/ui-exam.js   描画層・試問タブ：カード生成・録音進捗
js/ui-score.js  描画層・採点タブ：一覧/詳細（再生・文字起こし・合否）
js/ui-hist.js   描画層・履歴（サマリ/詳細モーダル）とCSV
js/ui-chart.js  描画層・グラフ（Chart.js）
js/ui-cfg.js    描画層・設定：試問項目/カタログモーダル/プリセット・質問セット
js/app.js       アプリ層：初期化・タブ・セッションフロー
```

読み込みは util → i18n → works-qa → qbank → data → store → media → drive → verdict → ui-core → ui-exam → ui-score → ui-hist → ui-chart → ui-cfg → app の順（後のレイヤほど前に依存する）。
ui-*.js はプレーンスクリプトで、関数はグローバルのまま（テストと onclick が直接呼ぶ）。ファイルを増やしたら index.html・`sw.js` の ASSETS・VER を揃えて更新する（`tests/sw-assets.test.js` が検査）。

## テスト実行

```bash
node tests/run.js            # 全テスト（tests/*.test.js を並列 min(4,CPU数) で実行し名前順に表示・集計。1本でもNGなら exit 1）
node tests/run.js -j 1       # 直列（-j N で並列数を指定）
node tests/run.js verdict    # ファイル名で絞り込み
node tests/run.js --all      # 書きかけ（tests/wip/*.test.js・*.wip.js）も含める。既定では含めない
node smoke.js                # 旧来の入口（tests/smoke.test.js の互換ラッパー）
```

| ファイル | 内容 |
|---|---|
| `tests/smoke.test.js` | 録音→採点→履歴→グラフ→カタログ→バックアップ→言語切替（フェイクマイク） |
| `tests/verdict.test.js` | 合否トグルとドライブ送信名・付け直し（GAS送信はモック） |
| `tests/pf-ripple.test.js` | 旧5段階データ・合否混在・未確定・未実施 |
| `tests/i18n.test.js` | TX/TX2 の ja/en/vi/id キー集合の一致 |
| `tests/sw-assets.test.js` | sw.js の ASSETS 実在・index.html 参照の網羅・VER 上げ忘れ（origin/main 以降のコミット済み変更も含めて NG） |
| `tests/verguard.test.js` | VER 上げ忘れ検査そのものの回帰（使い捨て git リポジトリで検証） |
| `tests/runner.test.js` | run.js の並列・名前順表示・wip 除外・タイムアウト |
| `tests/globals.test.js` | 分割前（ui.js 分割・media.js 分割）のグローバル関数/変数名がすべて残っているか |

完了判定は `node tests/run.js` が exit 0 であること。リポジトリの外に置いたテストの写しは正本にしない。
未完成機能のテストは `tests/wip/` に置く（例: R10 聞き返しの書きかけ＝ブランチ `r10-listen`）。

環境（`tests/_env.js`）:
- Playwright は `PLAYWRIGHT_PATH` → `~/anpi-kakunin` → `~/farm-shift-app` → `C:/Users/so/farm-shift-app` の順に探す（npm install 不要）
- ブラウザは `PW_CHANNEL`（Mac 既定 `chrome`、他OSは同梱 Chromium。`PW_CHANNEL=` で同梱 Chromium）
- Chart.js CDN はローカルの写し（`CHART_JS_PATH` → `tests/fixtures/chart.umd.min.js` → `~/.cache/oral-exam-app/`）で応答。初回オンライン時に SRI 一致を確かめて `~/.cache` に保存。写しも回線も無ければスタブで代用し、run.js が「グラフ検査はスタブ（オフライン）」と表示する（`OFFLINE=1` で取得を試さない／`CHART_STUB=1` でスタブ強制）

## 技術メモ
- 音声は `MediaRecorder`（webm/opus、非対応時 mp4）で録音し、`IndexedDB` に `セッションID_項目ID` で保存
- `MediaRecorder.onstop` は非同期発火のため、保存・リセットは録音停止の完了を `await` してから実行
- Chart.js は CDN（SRI付き）。Service Worker がキャッシュするためオフラインでもグラフ表示可
- Service Worker（`sw.js`）はページ＝ネットワーク優先／アセット＝キャッシュ優先。GAS・外部APIへの通信には関与しない。更新時は `sw.js` の `VER` を上げる
- マイクは **https または localhost** でのみ動作（GitHub Pages はhttpsなのでOK）

## 動作要件
- 推奨：Google Chrome（録音＋自動文字起こしの両方が使える）
- Safari/Firefox：録音・採点・グラフは可。録音中の自動文字起こしは非対応（手入力 or 外部APIで対応）

## 公開
- **本番URL**：https://shoichiokada225-sys.github.io/oral-exam-app/ （GitHub Pages）
- リポジトリ：https://github.com/shoichiokada225-sys/oral-exam-app
- 再デプロイ：`main` に push するだけ（GitHub Pagesが自動ビルド）。push は `! git push` で実行。
