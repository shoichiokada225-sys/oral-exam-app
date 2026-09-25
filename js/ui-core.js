/* ui-core.js — 描画層の共通部：ui内ローカル文言(TX2)・t2・合否ラベル・一覧行の状態表示
   ※ js/ui.js を機械的に分割したもの（プレーンスクリプト・グローバル名は不変）。読み込み順は ui-core → ui-exam → ui-score → ui-hist → ui-chart → ui-cfg */
/* ==============================================================
   ui.js内ローカル文言（i18n.jsはコンテンツ担当が編集中のため触らない。
   ja/en/vi/id の4言語すべてに入れる。欠けは tests/i18n.test.js で検出。sumTimes1 は英語の単数形専用）
   ============================================================== */
const TX2={
ja:{rnVars:"表記の違う名前（別の人のこともあります。同じ人のときだけ選んでください）",rnCancel:"やめる",nameSame:"{f}「{b}」は、履歴にある「{a}」と同じ人ですか？\n\nOK＝同じ人（表記を「{a}」にそろえて保存）\nキャンセル＝別の人（「{b}」のまま保存）",dupAsk:"{d} の{e}さんの試問がすでに{n}件保存されています。\n\nOK＝前回の続きにまとめる（1件の試問にする）\nキャンセル＝追試として別に保存（{k}回目）",savedRetake:"追試（{k}回目）として保存しました",savedMerged:"{e}さんの前回の試問にまとめて保存しました",mergeSaveFail:"前回の試問にまとめられませんでした（録音を読めません）。もう一度保存してください",nextEe:"次の受験者名を入力してください",eeEmptyRec:"受験者名が未入力です。録音は続けます。あとで名前を入れてください",noName:"（未入力）",draftNote:"前回の途中の試問を開いています：受験者 {e}・録音{n}問・合否{m}問",draftNoteResume:"保存済みの試問の続きを開いています：受験者 {e}・録音{n}問・合否{m}問",dnCont:"続ける",dnSave:"保存して新規",dnDrop:"破棄して新規",resumeBtn:"この試問を続ける（未録音{n}問）",resumeSaveFirst:"{o}さんの録音{n}問・合否{m}問がまだ保存されていません。\n\nOK＝保存してから、選んだ試問の続きを開く\nキャンセル＝やめる",resumeDrop:"{o}さんの合否{m}問（録音なし）は保存されません。選んだ試問の続きを開きますか？",resumed:"{e}さんの試問の続きを開きました。録音のない問から続けてください",rnBtn:"名前を直す",rnTitle:"名前を直す",rnScope:"直す範囲（受験者名）",rnOne:"この試問だけ",rnAll:"同じ人の全{n}件（{v}）",rnNote:"試問者名はこの試問だけ直します。ドライブへ送った録音は新しい名前で送り直します（前の名前のフォルダのファイルは残るので手で削除してください）",rnSave:"名前を保存",rnDone:"{n}件の名前を直しました",orphMsg:"ドライブの「{f}」に古い録音「{n}」が残っています（手で削除してください）",orphHead:"ドライブに古い録音が{n}件残っています（名前を直して送り直した前のフォルダ）。手で削除してください",orphClr:"削除しました（案内を消す）",orphClrQ:"ドライブで古い録音を削除しましたか？\nOK＝この案内を消す（録音や合否は消えません）",
drvErrOffline:"圏外または通信不良です。電波が戻ったら自動で再送します",drvErrTimeout:"応答がありません（通信が遅いか途中で切れました）。電波の良い所で再送してください",drvErrHtml:"GASの公開範囲が「全員」になっていません。GASで「アクセスできるユーザー：全員」にして再デプロイしてください",drvErrToken:"合言葉が一致しません。設定の合言葉をGASと同じにしてください",drvErrHttp:"ウェブアプリURLを確認してください（{s}）",drvErrGas:"GAS側でエラーが起きました。GASの設定を確認してください",drvErrReach:"GASに届きません。ウェブアプリURLが正しいか、GASの「アクセスできるユーザー」が「全員」になっているかを確認してください（電波が弱い時は電波の良い所で再送）",drvErrMaybe:"送信は終わりましたが応答が途中で切れました。ドライブに保存されている可能性があります。ドライブを確認し、無い時だけタップで再送してください",drvErrNoAudio:"この端末に録音が見つかりません（バックアップから復元できます）",chLibErr:"グラフの部品を読み込めません（通信を確認して再読み込みしてください）。録音・採点はこのまま使えます",chLibWait:"グラフの部品を読み込み中です…（通信が遅いと時間がかかります）",reloadBtn:"再読み込み",emptyHint:"試問タブで録音して保存すると、ここに表示されます",goExam:"試問タブへ",goRestore:"別の端末のデータ→バックアップから復元",stoNotPersist:"この端末では、空き容量が少なくなるとブラウザがデータを消すことがあります。定期的にバックアップを書き出してください",stoLowT:"端末の空き容量が少なくなっています",stoLow:"録音を保存できなくなるおそれがあります。先にバックアップを書き出し、端末の不要なファイルや古い録音を整理してください（このアプリのデータは自動では消しません）",stoBackup:"バックアップを書き出す",
liveOtherEe:'この中断された録音は「{a}」のものです。今の試問（受験者「{b}」）には入れません。今の試問を保存してから復元するか、ダウンロードしてください',liveNoNameQ:'この中断された録音には受験者名がありません。今の試問（受験者「{b}」）の録音として入れますか？',liveMixQ:'今の試問には受験者名がないまま合否や下書きが入っています。中断された録音（{a}）と同じ試問にまとめますか？',wakeNote:'録音中は画面を消さないでください（消えると録音はそこで止まります）',recCut:'録音が途中で止まりました（{s}秒まで保存）。マイクを他のアプリや通話に取られた可能性があります。続きは「続きを録音」で録ってください',recCutStat:'途中で停止（{s}秒まで保存）',recHidStop:'画面が消えたため録音を止めました（{s}秒まで保存）。続きは「続きを録音」で録ってください',recPause:'一時停止',recResume:'再開',recPaused:'一時停止中',pauseNA:'この端末では一時停止できません',recCont:'続きを録音',recAppended:'続きを前の録音の後ろに追加しました',mergeFail:'続きを前の録音につなげませんでした。前の録音はそのまま残っています（続きの部分はダウンロードできます）',mergeFailStat:'続きをつなげませんでした（前の録音は無事）',liveFound:'中断された録音があります：{e}／{q}（約{s}秒・{t}）',liveMore:'ほか{n}件',liveRestore:'中断された録音を復元',liveDiscard:'破棄',liveDiscardQ:'中断された録音を削除します。元に戻せません。よろしいですか？',liveRestored:'中断された録音を復元しました',liveNoSess:'戻し先の試問がありません。先に今の試問を保存してから復元するか、ダウンロードしてください',liveReplace:'この問にはすでに録音があります。中断された録音で置き換えますか？',undoClose:'閉じる',pfCleared:'合否を取り消しました（未判定）',beepOpt:'録音の開始・停止を短い音で知らせる（振動は対応端末で常に）',
noItems:'質問がありません。設定タブで質問を追加するか、試問セットを選んでください',noItemsT:'質問がありません',goCfg:'設定タブで質問を追加',pickSet:'試問セットを選ぶ',
drvConnNoAuto:'● 接続OK・ただし自動保存はOFF（録音はこの端末だけ。下のチェックでONにできます）',gAutoOn:'録音の自動保存をONにしました',gAutoWait:'接続を確認しています。つながれば録音の自動保存をONにします',gAutoPend:'自動保存は接続を確認できてからONになります（URLと合言葉を確かめて「接続テスト」）',drvOn:'☁ ドライブ自動保存：ON',drvOff:'☁ ドライブ自動保存：OFF（録音は端末のみ）',drvNone:'☁ ドライブ：未設定（録音は端末のみ）',drvHint:'録音はこの端末だけに保存されます（ドライブ保存は「設定」タブ）',drvHintGo:'ドライブを設定',needEe:'先に受験者名を入力してください（ドライブではこの名前のフォルダに保存されます）',eeSwitch:'{o}さんの録音{n}問・合否{m}問がまだ保存されていません。\n\nOK＝{o}さんの分を保存してから、{e}さんの試問を始める\nキャンセル＝名前の訂正だけ（今の録音と合否は{e}さんのものになります）',eeSwitched:'{o}さんの試問を保存しました。{e}さんの試問を始めます',eeSwitchFail:'{o}さんの試問を保存できなかったため、名前を元に戻しました',
saveErrMsg:'試問を保存できませんでした（端末の空き容量不足の可能性）。入力と録音はこの画面に残っています。先にバックアップを書き出してから、不要なデータを消して「もう一度保存」を押してください',retrySave:'もう一度保存',
recSaveFail:'録音を端末に保存できませんでした',recKeptOld:'（前の録音が残っています）',recRetryStore:'保存し直す',recDl:'この録音をダウンロード',pendTakeSave:'端末に保存できていない録音が{n}件あります。このまま保存するとその録音は失われます。\n先に各問の「保存し直す」か「この録音をダウンロード」で取り出してください。\n\nそれでも保存しますか？（キャンセル＝保存しないで戻る）',pendTakeReset:'（端末に保存できていない録音{n}件も失われます。先にダウンロードしてください）',
micInsecure:'この画面ではマイクを使えません。https:// のアドレスで開いてください',micInsecureS:'マイク不可—httpsで開く',
micNotFound:'マイクが見つかりません。イヤホン・マイクの接続を確認してください',micNotFoundS:'マイクが見つかりません',
micBusy:'他のアプリがマイクを使用中です。通話やBluetoothイヤホンを終了してから録音してください',micBusyS:'マイク使用中（通話を終了）',
drvFailToast:'Googleドライブへ送れませんでした。電波が戻ったら自動で再送します（各問の「☁未送信」をタップでも再送）',drvUnsent:'☁ 未送信（タップで再送）',
oldN:'旧評価{n}問',oldAvg:'旧評価 平均',oldTag:'旧',unconf:'（未確定）',stPending:'判定済み・確定待ち',notAsked:'（未実施）',
oldReplace:'旧5段階評価（{v}）を合否に置き換えますか？（元の点数は消えます）',oldNA:'旧5段階評価（{v}）を消して「質問しなかった」にしますか？',
confirmScored:'録音した全問に合否が付いています。採点も確定しますか？\n（キャンセルすると録音のみで保存し、あとで採点タブから確定できます）',
oldOnly:'旧5段階評価の記録のみです（合格率の対象外）。履歴タブで点数を確認できます',
mixNote:'※旧5段階評価が混ざる試問は、合否を付けた設問だけで合格率を計算しています（旧評価の設問は含みません）',
chPending:'判定済み・確定待ちの試問があります。「採点」タブで開いて「採点を保存して確定する」を押すとグラフに表示されます',
stPartial:'採点途中',partLbl:'合格{p}・判定{j}/録音{m}',chPartial:'○×が途中までの試問（採点途中）があります。「採点」タブで残りの合否を付けて「採点を保存して確定する」を押すとグラフに表示されます',
pfProg:'合否 {j} / 録音 {n}',pfMiss:'○×未入力 {n}問',nextUnjudged:'次の未判定へ',allJudged:'録音した問はすべて○×済みです',
savedScored:'試問と採点を保存しました。結果は「履歴」タブで確認できます',cfgSavedSet:'項目を保存しました（セット「{n}」にも反映）',
qsTitle:'試問セット',qsCur:'現在のセット',qsNone:'（セット未保存の構成）',qsSaveNew:'名前を付けて別のセットに保存',qsApply:'切替',qsRen:'名前変更',qsDel:'削除',
qsNamePrompt:'セット名を入力してください（例：新人向け／繁殖担当／棚倉農場）',
qsSwConfirm:'セット「{n}」の保存済みの内容に切り替えます。「項目を保存」していない編集は失われます（保存済みの試問は消えません）。よろしいですか？',
qsDelConfirm:'セット「{n}」を削除しますか？（保存済みの試問は消えません）',
qsSaved:'セットを保存しました',qsApplied:'セットに切り替えました',qsDeleted:'セットを削除しました',
qbTitle:'テンプレートから選ぶ',qbReplace:'このテンプレートに切り替える',qbAppend:'今の質問に追加する',
qbRepConfirm:'出題をテンプレート「{n}」に切り替えます（今の質問はこのテンプレートの質問に置き換わります。保存済みの試問は消えません）。よろしいですか？',
qbApplied:'テンプレートに切り替えました',qbNone:'テンプレート（qbank.js）が読み込まれていません',
dirty:'未保存の変更があります',dirtyLeave:'試問項目に未保存の変更があります。保存せずに移動しますか？（変更は破棄されます）',
delSecConfirm:'このセクションと全質問を削除しますか？',cfgNote:'※質問を削除・差し替えても、過去の試問の採点・録音・文字起こしは履歴とCSVに残ります',
storeFail:'保存に失敗しました（端末の空き容量不足の可能性）。設定タブからバックアップの書き出しをおすすめします',
gcConfirm:'どのセッションにも属さない録音データが{n}件見つかりました。削除して端末の容量を空けますか？',gcDone:'件の不要な録音を削除しました',
naLbl:'質問しなかった（採点対象外）',nextUnrec:'次の未録音へ',nextUnscored:'次の未採点へ',nextUnscoredS:'次の未採点',backS:'一覧へ',allRec:'すべて録音済みです',allScored:'未採点の項目はありません',
recBusy:'録音中です。先に「停止」を押してください',noRecGroup:'録音のない項目（{n}）',
spd:'速度',pauseAll:'再生を停止',sumTimes:'回受験',added:'追加済み',prevLbl:'前回',extraSec:'過去の項目（現在の設定にない質問）',
resetCnt:'（録音{n}件を削除します。元に戻せません）',
pass:'合格',fail:'不合格',pfLbl:'合否',passCnt:'合格',oldScore:'旧5段階評価',csvPass:'合格数（合格/採点）',chRate:'合格率の推移（%）',chSecRate:'分野別の合格率（%）',chItem:'設問別の合否（直近）'},
en:{rnVars:"Names spelled differently (may be a different person; select only if it is the same person)",rnCancel:"Cancel",nameSame:"{f} \"{b}\" — is this the same person as \"{a}\" in the history?\n\nOK = same person (save with the spelling \"{a}\")\nCancel = a different person (save as \"{b}\")",dupAsk:"{n} exam(s) of {e} on {d} are already saved.\n\nOK = add to the previous exam (make it one exam)\nCancel = save separately as a retake (attempt {k})",savedRetake:"Saved as a retake (attempt {k})",savedMerged:"Saved into {e}'s previous exam",mergeSaveFail:"Could not add to the previous exam (a recording could not be read). Please save again",nextEe:"Enter the next examinee name",eeEmptyRec:"No examinee name yet. Recording continues; enter the name later",noName:"(not entered)",draftNote:"An unfinished exam from last time is open: examinee {e}, {n} recorded, {m} marked",draftNoteResume:"Continuing a saved exam: examinee {e}, {n} recorded, {m} marked",dnCont:"Continue",dnSave:"Save and start new",dnDrop:"Discard and start new",resumeBtn:"Continue this exam ({n} not recorded)",resumeSaveFirst:"{n} recording(s) and {m} pass/fail mark(s) for {o} are not saved yet.\n\nOK = save them first, then open the selected exam\nCancel = do nothing",resumeDrop:"{m} pass/fail mark(s) for {o} (no recordings) will not be saved. Open the selected exam?",resumed:"Continuing {e}'s exam. Go on from the questions without a recording",rnBtn:"Fix name",rnTitle:"Fix name",rnScope:"What to fix (examinee name)",rnOne:"This exam only",rnAll:"All {n} exams of the same person ({v})",rnNote:"The examiner name is fixed for this exam only. Recordings already sent to Drive are sent again under the new name (the files in the old-name folder stay; delete them by hand)",rnSave:"Save name",rnDone:"Fixed the name in {n} exam(s)",orphMsg:"An old recording \"{n}\" is left in \"{f}\" on Drive (delete it by hand)",orphHead:"{n} old recording(s) are left on Drive (in the folder of the name before it was fixed). Delete them by hand",orphClr:"Deleted (hide this notice)",orphClrQ:"Did you delete the old recordings on Drive?\nOK = hide this notice (recordings and marks are not deleted)",
drvErrOffline:"No signal or poor connection. It will resend automatically when online",drvErrTimeout:"No response (slow or dropped connection). Resend where the signal is good",drvErrHtml:"The GAS web app is not shared with \"Anyone\". In GAS set \"Who has access: Anyone\" and deploy again",drvErrToken:"The passphrase does not match. Set the same passphrase as in GAS",drvErrHttp:"Check the web app URL ({s})",drvErrGas:"An error occurred in GAS. Check the GAS settings",drvErrReach:"Cannot reach GAS. Check that the web app URL is correct and that GAS \"Who has access\" is set to \"Anyone\" (if the signal is weak, resend where it is good)",drvErrMaybe:"The upload finished but the reply was cut off. It may already be saved in Drive. Check Drive and tap to resend only if it is missing",drvErrNoAudio:"The recording is not on this device (it can be restored from a backup)",chLibErr:"Cannot load the chart component (check the connection and reload). Recording and scoring still work",chLibWait:"Loading the chart component… (may take time on a slow connection)",reloadBtn:"Reload",emptyHint:"Record and save an exam on the Exam tab and it will appear here",goExam:"Go to Exam tab",goRestore:"Data from another device → restore a backup",stoNotPersist:"On this device the browser may delete data when storage runs low. Export a backup regularly",stoLowT:"Device storage is running low",stoLow:"Recordings may fail to save. Export a backup first, then free up space on the device or tidy old recordings (this app never deletes data automatically)",stoBackup:"Export backup",
liveOtherEe:'This interrupted recording belongs to "{a}". It will not be put into the current exam (examinee "{b}"). Save the current exam first and then restore, or download the recording',liveNoNameQ:'This interrupted recording has no examinee name. Put it into the current exam (examinee "{b}")?',liveMixQ:'The current exam has pass/fail or notes but no examinee name. Combine it with the interrupted recording ({a}) into one exam?',wakeNote:'Keep the screen on while recording (recording stops if the screen turns off)',recCut:'Recording stopped unexpectedly (saved up to {s}s). Another app or a call may have taken the microphone. Use "Continue recording" for the rest',recCutStat:'Stopped early (saved up to {s}s)',recHidStop:'Recording stopped because the screen turned off (saved up to {s}s). Use "Continue recording" for the rest',recPause:'Pause',recResume:'Resume',recPaused:'Paused',pauseNA:'Pause is not supported on this device',recCont:'Continue recording',recAppended:'Added the continuation after the previous take',mergeFail:'Could not join the continuation to the previous take. The previous take is unchanged (you can download the continuation)',mergeFailStat:'Could not join the continuation (previous take is safe)',liveFound:'Interrupted recording found: {e} / {q} (about {s}s, {t})',liveMore:'+{n} more',liveRestore:'Restore interrupted recording',liveDiscard:'Discard',liveDiscardQ:'Delete the interrupted recording? This cannot be undone.',liveRestored:'Interrupted recording restored',liveNoSess:'No exam to restore into. Save the current exam first, or download the recording',liveReplace:'This question already has a recording. Replace it with the interrupted recording?',undoClose:'Close',pfCleared:'Pass/fail cleared (not judged)',beepOpt:'Play a short sound when recording starts/stops (vibration is always on where supported)',
noItems:'No questions. Add questions in Settings or choose an exam set',noItemsT:'No questions',goCfg:'Add questions in Settings',pickSet:'Choose an exam set',
drvConnNoAuto:'● Connected, but auto-save is OFF (recordings stay on this device only; turn it on with the checkbox below)',gAutoOn:'Auto-save of recordings turned ON',gAutoWait:'Checking the connection. Auto-save of recordings will turn ON once it connects',gAutoPend:'Auto-save turns ON after the connection is confirmed (check the URL and passphrase, then tap "Test connection")',drvOn:'☁ Drive auto-save: ON',drvOff:'☁ Drive auto-save: OFF (recordings on this device only)',drvNone:'☁ Drive: not set up (recordings on this device only)',drvHint:'Recordings are saved on this device only (set up Drive saving in the "Settings" tab)',drvHintGo:'Set up Drive',needEe:'Enter the examinee name first (Drive saves into a folder with this name)',eeSwitch:'{n} recording(s) and {m} pass/fail mark(s) for {o} are not saved yet.\n\nOK = save {o}\'s exam first, then start {e}\'s exam\nCancel = just correct the name (the current recordings and marks will belong to {e})',eeSwitched:'Saved {o}\'s exam. Starting {e}\'s exam',eeSwitchFail:'Could not save {o}\'s exam, so the name was changed back',
saveErrMsg:'The exam could not be saved (device storage may be full). Your entries and recordings are still on this screen. Export a backup first, free up space, then press "Save again"',retrySave:'Save again',
recSaveFail:'Recording could not be saved on this device',recKeptOld:'(previous recording kept)',recRetryStore:'Save again',recDl:'Download this recording',pendTakeSave:'{n} recording(s) could not be saved on this device. If you save now, they will be lost.\nFirst use "Save again" or "Download this recording" on each question.\n\nSave anyway? (Cancel = go back without saving)',pendTakeReset:'({n} recording(s) not saved on this device will also be lost. Download them first)',
micInsecure:'The microphone cannot be used on this page. Open it with an https:// address',micInsecureS:'No mic – open via https',
micNotFound:'No microphone found. Check the earphone/microphone connection',micNotFoundS:'No microphone found',
micBusy:'Another app is using the microphone. End the call or disconnect the Bluetooth earphones, then record',micBusyS:'Mic in use (end the call)',
drvFailToast:'Could not send to Google Drive. It will resend automatically when online (or tap "☁ Not sent" on the question)',drvUnsent:'☁ Not sent (tap to resend)',
oldN:'{n} old-scale',oldAvg:'Old avg ',oldTag:'old',unconf:' (unconfirmed)',stPending:'Judged – to confirm',notAsked:' (not asked)',
oldReplace:'Replace the old 5-level score ({v}) with Pass/Fail? (the old score will be lost)',oldNA:'Remove the old 5-level score ({v}) and mark as "Not asked"?',
confirmScored:'Every recorded question has Pass/Fail. Confirm the scoring too?\n(Cancel = save as recorded only; you can confirm later in the "Score" tab)',
oldOnly:'Only old 5-level scores (not included in pass rate). See the History tab for the scores',
mixNote:'* For exams that include old 5-level scores, the pass rate uses only the Pass/Fail questions',
chPending:'There are judged exams waiting for confirmation. Open them in the "Score" tab and press "Save and confirm score" to show them here',
stPartial:'Partly judged',partLbl:'Pass {p} · judged {j}/rec {m}',chPartial:'Some exams are only partly judged. Open them in the "Score" tab, judge the rest and press "Save and confirm score" to show them here',
pfProg:'Pass/Fail {j} / Rec {n}',pfMiss:'{n} without ○/×',nextUnjudged:'Next unjudged',allJudged:'Every recorded question has ○/×',
savedScored:'Exam and scores saved. See the result in the "History" tab',cfgSavedSet:'Items saved (also to set "{n}")',
qsTitle:'Exam set',qsCur:'Active set',qsNone:'(unsaved layout)',qsSaveNew:'Save as a new set (name it)',qsApply:'Switch',qsRen:'Rename',qsDel:'Delete',
qsNamePrompt:'Enter a set name',
qsSwConfirm:'Switch to the saved contents of set "{n}"? Edits not saved with "Save Items" will be lost (saved exams are kept).',
qsDelConfirm:'Delete set "{n}"? (saved exams are kept)',
qsSaved:'Set saved',qsApplied:'Switched to set',qsDeleted:'Set deleted',
qbTitle:'Choose from templates',qbReplace:'Switch to this template',qbAppend:'Add to current questions',
qbRepConfirm:'Switch the questions to template "{n}"? (the current questions are replaced by this template; saved exams are kept)',
qbApplied:'Switched to the template',qbNone:'Templates (qbank.js) not loaded',
dirty:'Unsaved changes',dirtyLeave:'Exam items have unsaved changes. Leave without saving? (changes will be discarded)',
delSecConfirm:'Delete this section and all its questions?',cfgNote:'Deleting/replacing questions does not remove past scores, recordings or transcripts from history and CSV',
storeFail:'Save failed (device storage may be full). Export a backup from Settings',
gcConfirm:'{n} recording(s) belong to no session. Delete them to free space?',gcDone:' orphan recording(s) deleted',
naLbl:'Not asked (excluded from scoring)',nextUnrec:'Next unrecorded',nextUnscored:'Next unscored',nextUnscoredS:'Next',backS:'List',allRec:'All items recorded',allScored:'Nothing left to score',
recBusy:'Recording in progress — press "Stop" first',noRecGroup:'Items without recording ({n})',
spd:'Speed',pauseAll:'Pause playback',sumTimes:' exams',sumTimes1:' exam',added:'Added',extraSec:'Past items (not in current settings)',prevLbl:'Prev',
resetCnt:'({n} recording(s) will be deleted. This cannot be undone)',
pass:'Pass',fail:'Fail',pfLbl:'Pass/Fail',passCnt:'Passed',oldScore:'Old 5-level score',csvPass:'Passed (pass/scored)',chRate:'Pass rate trend (%)',chSecRate:'Pass rate by section (%)',chItem:'Pass/Fail by question (latest)'},
vi:{rnVars:"Tên viết khác (có thể là người khác; chỉ chọn nếu là cùng một người)",rnCancel:"Hủy",nameSame:"{f} \"{b}\" có phải là cùng một người với \"{a}\" trong lịch sử không?\n\nOK = cùng một người (lưu theo cách viết \"{a}\")\nHủy = người khác (lưu là \"{b}\")",dupAsk:"Đã lưu {n} bài của {e} ngày {d}.\n\nOK = gộp vào bài lần trước (thành một bài)\nHủy = lưu riêng như thi lại (lần {k})",savedRetake:"Đã lưu như thi lại (lần {k})",savedMerged:"Đã gộp và lưu vào bài lần trước của {e}",mergeSaveFail:"Không gộp được vào bài lần trước (không đọc được bản ghi). Hãy lưu lại",nextEe:"Hãy nhập tên thí sinh tiếp theo",eeEmptyRec:"Chưa nhập tên thí sinh. Vẫn tiếp tục ghi âm; hãy nhập tên sau",noName:"(chưa nhập)",draftNote:"Đang mở bài dang dở lần trước: thí sinh {e}, ghi âm {n} câu, đạt/không đạt {m} câu",draftNoteResume:"Đang tiếp tục bài đã lưu: thí sinh {e}, ghi âm {n} câu, đạt/không đạt {m} câu",dnCont:"Tiếp tục",dnSave:"Lưu và bắt đầu mới",dnDrop:"Bỏ và bắt đầu mới",resumeBtn:"Tiếp tục bài này ({n} câu chưa ghi âm)",resumeSaveFirst:"{n} bản ghi âm và {m} kết quả đạt/không đạt của {o} chưa được lưu.\n\nOK = lưu trước, rồi mở bài đã chọn\nHủy = không làm gì",resumeDrop:"{m} kết quả đạt/không đạt của {o} (không có ghi âm) sẽ không được lưu. Mở bài đã chọn?",resumed:"Đang tiếp tục bài của {e}. Hãy làm tiếp từ các câu chưa ghi âm",rnBtn:"Sửa tên",rnTitle:"Sửa tên",rnScope:"Phạm vi sửa (tên thí sinh)",rnOne:"Chỉ bài này",rnAll:"Tất cả {n} bài của cùng người ({v})",rnNote:"Tên người hỏi chỉ sửa cho bài này. Bản ghi đã gửi lên Drive sẽ được gửi lại với tên mới (tệp trong thư mục tên cũ vẫn còn; hãy tự xóa)",rnSave:"Lưu tên",rnDone:"Đã sửa tên ở {n} bài",orphMsg:"Bản ghi cũ \"{n}\" vẫn còn trong \"{f}\" trên Drive (hãy tự xóa)",orphHead:"Còn {n} bản ghi cũ trên Drive (trong thư mục tên trước khi sửa). Hãy tự xóa",orphClr:"Đã xóa (ẩn thông báo)",orphClrQ:"Bạn đã xóa các bản ghi cũ trên Drive chưa?\nOK = ẩn thông báo này (bản ghi và kết quả không bị xóa)",
drvErrOffline:"Không có sóng hoặc mạng yếu. Sẽ tự gửi lại khi có mạng",drvErrTimeout:"Không có phản hồi (mạng chậm hoặc bị ngắt). Hãy gửi lại ở nơi sóng tốt",drvErrHtml:"Ứng dụng web GAS chưa chia sẻ cho \"Bất kỳ ai\". Trong GAS chọn \"Người có quyền truy cập: Bất kỳ ai\" rồi triển khai lại",drvErrToken:"Mật khẩu chung không khớp. Hãy đặt giống với GAS",drvErrHttp:"Hãy kiểm tra URL ứng dụng web ({s})",drvErrGas:"Có lỗi ở phía GAS. Hãy kiểm tra cài đặt GAS",drvErrReach:"Không kết nối được tới GAS. Hãy kiểm tra URL ứng dụng web có đúng không và mục \"Người có quyền truy cập\" của GAS đã là \"Bất kỳ ai\" chưa (nếu sóng yếu, hãy gửi lại ở nơi sóng tốt)",drvErrMaybe:"Đã gửi xong nhưng phản hồi bị ngắt giữa chừng. Có thể tệp đã được lưu trên Drive. Hãy kiểm tra Drive, chỉ khi không có mới chạm để gửi lại",drvErrNoAudio:"Không tìm thấy bản ghi âm trên thiết bị này (có thể khôi phục từ bản sao lưu)",chLibErr:"Không tải được thành phần biểu đồ (kiểm tra mạng rồi tải lại). Vẫn có thể ghi âm và chấm điểm",chLibWait:"Đang tải thành phần biểu đồ… (mạng chậm có thể mất thời gian)",reloadBtn:"Tải lại",emptyHint:"Ghi âm và lưu bài ở tab Thi thì sẽ hiện ở đây",goExam:"Đến tab Thi",goRestore:"Dữ liệu từ thiết bị khác → khôi phục bản sao lưu",stoNotPersist:"Trên thiết bị này, trình duyệt có thể xóa dữ liệu khi bộ nhớ sắp đầy. Hãy xuất bản sao lưu thường xuyên",stoLowT:"Bộ nhớ thiết bị sắp đầy",stoLow:"Có thể không lưu được bản ghi âm. Hãy xuất bản sao lưu trước, rồi dọn tệp không cần hoặc bản ghi cũ trên thiết bị (ứng dụng không tự xóa dữ liệu)",stoBackup:"Xuất bản sao lưu",
liveOtherEe:'Bản ghi bị gián đoạn này là của "{a}". Không thể đưa vào bài thi hiện tại (thí sinh "{b}"). Hãy lưu bài thi hiện tại rồi khôi phục, hoặc tải bản ghi xuống',liveNoNameQ:'Bản ghi bị gián đoạn này không có tên thí sinh. Đưa vào bài thi hiện tại (thí sinh "{b}")?',liveMixQ:'Bài thi hiện tại đã có đạt/không đạt hoặc ghi chú nhưng chưa có tên thí sinh. Gộp với bản ghi bị gián đoạn ({a}) thành một bài thi?',wakeNote:'Đừng tắt màn hình khi đang ghi âm (màn hình tắt thì ghi âm sẽ dừng)',recCut:'Ghi âm bị dừng giữa chừng (đã lưu đến {s} giây). Có thể ứng dụng khác hoặc cuộc gọi đã chiếm micro. Hãy dùng "Ghi tiếp" để ghi phần còn lại',recCutStat:'Dừng giữa chừng (đã lưu đến {s} giây)',recHidStop:'Đã dừng ghi âm vì màn hình tắt (đã lưu đến {s} giây). Hãy dùng "Ghi tiếp" để ghi phần còn lại',recPause:'Tạm dừng',recResume:'Tiếp tục',recPaused:'Đang tạm dừng',pauseNA:'Thiết bị này không hỗ trợ tạm dừng',recCont:'Ghi tiếp',recAppended:'Đã thêm phần ghi tiếp vào sau bản ghi trước',mergeFail:'Không thể nối phần ghi tiếp vào bản ghi trước. Bản ghi trước vẫn còn nguyên (có thể tải phần ghi tiếp)',mergeFailStat:'Không nối được phần ghi tiếp (bản ghi trước vẫn an toàn)',liveFound:'Có bản ghi bị gián đoạn: {e} / {q} (khoảng {s} giây, {t})',liveMore:'và {n} bản khác',liveRestore:'Khôi phục bản ghi bị gián đoạn',liveDiscard:'Bỏ',liveDiscardQ:'Xóa bản ghi bị gián đoạn? Không thể hoàn tác.',liveRestored:'Đã khôi phục bản ghi bị gián đoạn',liveNoSess:'Không có bài thi để khôi phục vào. Hãy lưu bài thi hiện tại trước, hoặc tải bản ghi xuống',liveReplace:'Câu này đã có bản ghi. Thay bằng bản ghi bị gián đoạn?',undoClose:'Đóng',pfCleared:'Đã hủy đạt/không đạt (chưa đánh giá)',beepOpt:'Phát âm ngắn khi bắt đầu/dừng ghi âm (rung luôn bật trên thiết bị hỗ trợ)',
noItems:'Chưa có câu hỏi. Hãy thêm câu hỏi ở tab Cài đặt hoặc chọn bộ đề thi',noItemsT:'Chưa có câu hỏi',goCfg:'Thêm câu hỏi ở tab Cài đặt',pickSet:'Chọn bộ đề thi',
drvConnNoAuto:'● Kết nối OK, nhưng tự động lưu đang TẮT (bản ghi chỉ ở máy này; bật bằng ô đánh dấu bên dưới)',gAutoOn:'Đã BẬT tự động lưu bản ghi âm',gAutoWait:'Đang kiểm tra kết nối. Khi kết nối được, tự động lưu bản ghi âm sẽ BẬT',gAutoPend:'Tự động lưu sẽ BẬT sau khi kết nối được xác nhận (kiểm tra URL và mật khẩu, rồi bấm "Kiểm tra kết nối")',drvOn:'☁ Tự động lưu Drive: BẬT',drvOff:'☁ Tự động lưu Drive: TẮT (bản ghi chỉ ở máy này)',drvNone:'☁ Drive: chưa cài đặt (bản ghi chỉ ở máy này)',drvHint:'Bản ghi âm chỉ được lưu trên máy này (cài đặt lưu Drive ở tab "Cài đặt")',drvHintGo:'Cài đặt Drive',needEe:'Hãy nhập tên thí sinh trước (Drive lưu vào thư mục mang tên này)',eeSwitch:'{n} bản ghi âm và {m} kết quả đạt/không đạt của {o} chưa được lưu.\n\nOK = lưu bài của {o} trước, rồi bắt đầu bài của {e}\nHủy = chỉ sửa tên (bản ghi và kết quả hiện tại sẽ thuộc về {e})',eeSwitched:'Đã lưu bài của {o}. Bắt đầu bài của {e}',eeSwitchFail:'Không lưu được bài của {o}, nên tên đã được trả lại như cũ',
saveErrMsg:'Không lưu được bài thi (có thể bộ nhớ thiết bị đã đầy). Thông tin và ghi âm vẫn còn trên màn hình này. Hãy xuất bản sao lưu trước, giải phóng bộ nhớ rồi nhấn "Lưu lại"',retrySave:'Lưu lại',
recSaveFail:'Không lưu được ghi âm vào thiết bị',recKeptOld:'(bản ghi trước vẫn còn)',recRetryStore:'Lưu lại',recDl:'Tải bản ghi âm này',pendTakeSave:'Có {n} bản ghi âm chưa lưu được vào thiết bị. Nếu lưu bây giờ, các bản ghi đó sẽ bị mất.\nHãy nhấn "Lưu lại" hoặc "Tải bản ghi âm này" ở từng câu trước.\n\nVẫn lưu? (Hủy = quay lại, không lưu)',pendTakeReset:'(Cả {n} bản ghi âm chưa lưu được vào thiết bị cũng sẽ bị mất. Hãy tải xuống trước)',
micInsecure:'Không dùng được micro trên trang này. Hãy mở bằng địa chỉ https://',micInsecureS:'Không có micro – mở bằng https',
micNotFound:'Không tìm thấy micro. Hãy kiểm tra kết nối tai nghe/micro',micNotFoundS:'Không tìm thấy micro',
micBusy:'Ứng dụng khác đang dùng micro. Hãy kết thúc cuộc gọi hoặc ngắt tai nghe Bluetooth rồi ghi âm',micBusyS:'Micro đang bận (kết thúc cuộc gọi)',
drvFailToast:'Không gửi được lên Google Drive. Sẽ tự gửi lại khi có mạng (hoặc chạm "☁ Chưa gửi" ở câu hỏi)',drvUnsent:'☁ Chưa gửi (chạm để gửi lại)',
oldN:'{n} câu điểm cũ',oldAvg:'Điểm cũ TB ',oldTag:'cũ',unconf:' (chưa xác nhận)',stPending:'Đã đánh giá – chờ xác nhận',notAsked:' (không hỏi)',
oldReplace:'Thay điểm cũ 5 mức ({v}) bằng Đạt/Không đạt? (điểm cũ sẽ mất)',oldNA:'Xóa điểm cũ 5 mức ({v}) và đánh dấu "Không hỏi"?',
confirmScored:'Tất cả câu đã ghi âm đều có Đạt/Không đạt. Xác nhận chấm điểm luôn?\n(Hủy = chỉ lưu ghi âm, có thể xác nhận sau ở thẻ "Chấm")',
oldOnly:'Chỉ có điểm cũ 5 mức (không tính tỷ lệ đạt). Xem điểm ở tab Lịch sử',
mixNote:'* Bài thi có điểm cũ 5 mức: tỷ lệ đạt chỉ tính các câu Đạt/Không đạt',
chPending:'Có bài thi đã đánh giá đang chờ xác nhận. Mở ở thẻ "Chấm" và nhấn "Lưu và xác nhận điểm" để hiển thị',
stPartial:'Đang chấm dở',partLbl:'Đạt {p} · đã đánh giá {j}/ghi âm {m}',chPartial:'Có bài thi mới đánh giá một phần. Mở ở thẻ "Chấm", đánh giá các câu còn lại và nhấn "Lưu và xác nhận điểm" để hiển thị',
pfProg:'Đạt/Không {j} / Ghi âm {n}',pfMiss:'{n} câu chưa chọn ○/×',nextUnjudged:'Câu chưa đánh giá tiếp theo',allJudged:'Tất cả câu đã ghi âm đều đã có ○/×',
savedScored:'Đã lưu bài thi và điểm. Xem kết quả ở thẻ "Lịch sử"',cfgSavedSet:'Đã lưu (cũng lưu vào bộ "{n}")',
qsTitle:'Bộ đề thi',qsCur:'Bộ hiện tại',qsNone:'(chưa lưu thành bộ)',qsSaveNew:'Lưu thành bộ mới (đặt tên)',qsApply:'Chuyển',qsRen:'Đổi tên',qsDel:'Xóa',
qsNamePrompt:'Nhập tên bộ',qbTitle:'Chọn từ bộ mẫu',qbReplace:'Chuyển sang bộ mẫu này',qbAppend:'Thêm vào câu hỏi hiện tại',
naLbl:'Không hỏi (không chấm)',nextUnrec:'Mục chưa ghi tiếp theo',nextUnscored:'Mục chưa chấm tiếp theo',nextUnscoredS:'Mục tiếp',backS:'Danh sách',allRec:'Đã ghi tất cả',allScored:'Không còn mục chưa chấm',
recBusy:'Đang ghi âm — hãy nhấn "Dừng" trước',noRecGroup:'Mục không có ghi âm ({n})',
spd:'Tốc độ',pauseAll:'Dừng phát',sumTimes:' lần thi',added:'Đã thêm',extraSec:'Mục cũ (không có trong cài đặt hiện tại)',prevLbl:'Lần trước',
resetCnt:'({n} bản ghi âm sẽ bị xóa. Không thể hoàn tác)',
pass:'Đạt',fail:'Không đạt',pfLbl:'Đạt/Không đạt',passCnt:'Đạt',oldScore:'Điểm cũ (5 mức)',
qsSwConfirm:'Chuyển sang nội dung đã lưu của bộ "{n}"? Các chỉnh sửa chưa nhấn "Lưu" sẽ bị mất (các bài thi đã lưu vẫn giữ nguyên).',
qsDelConfirm:'Xóa bộ "{n}"? (các bài thi đã lưu vẫn giữ nguyên)',
qsSaved:'Đã lưu bộ',qsApplied:'Đã chuyển bộ',qsDeleted:'Đã xóa bộ',
qbRepConfirm:'Chuyển câu hỏi sang bộ mẫu "{n}"? (câu hỏi hiện tại sẽ được thay bằng bộ mẫu này; các bài thi đã lưu vẫn giữ nguyên)',
qbApplied:'Đã chuyển sang bộ mẫu',qbNone:'Chưa tải được bộ mẫu (qbank.js)',
dirty:'Có thay đổi chưa lưu',dirtyLeave:'Các mục thi có thay đổi chưa lưu. Rời đi mà không lưu? (thay đổi sẽ bị hủy)',
delSecConfirm:'Xóa phần này và tất cả câu hỏi trong đó?',cfgNote:'* Xóa hoặc thay câu hỏi thì điểm, ghi âm và bản ghi lời của các bài thi trước vẫn còn trong lịch sử và CSV',
storeFail:'Lưu thất bại (có thể bộ nhớ thiết bị đã đầy). Hãy xuất bản sao lưu ở tab Cài đặt',
gcConfirm:'Có {n} bản ghi âm không thuộc bài thi nào. Xóa để giải phóng bộ nhớ?',gcDone:' bản ghi âm thừa đã được xóa',
csvPass:'Số câu đạt (đạt/đã chấm)',chRate:'Xu hướng tỷ lệ đạt (%)',chSecRate:'Tỷ lệ đạt theo lĩnh vực (%)',chItem:'Đạt/Không đạt theo câu hỏi (gần nhất)'},
id:{rnVars:"Nama dengan ejaan berbeda (bisa orang lain; pilih hanya jika orang yang sama)",rnCancel:"Batal",nameSame:"{f} \"{b}\" — apakah orang yang sama dengan \"{a}\" di riwayat?\n\nOK = orang yang sama (simpan dengan ejaan \"{a}\")\nBatal = orang lain (simpan sebagai \"{b}\")",dupAsk:"Sudah ada {n} ujian {e} pada {d}.\n\nOK = gabungkan ke ujian sebelumnya (jadi satu ujian)\nBatal = simpan terpisah sebagai ujian ulang (ke-{k})",savedRetake:"Disimpan sebagai ujian ulang (ke-{k})",savedMerged:"Digabungkan ke ujian sebelumnya milik {e}",mergeSaveFail:"Tidak dapat digabungkan ke ujian sebelumnya (rekaman tidak terbaca). Simpan lagi",nextEe:"Masukkan nama peserta berikutnya",eeEmptyRec:"Nama peserta belum diisi. Rekaman tetap berjalan; isi nama nanti",noName:"(belum diisi)",draftNote:"Ujian yang belum selesai dari sebelumnya terbuka: peserta {e}, {n} direkam, {m} dinilai lulus/tidak",draftNoteResume:"Melanjutkan ujian yang tersimpan: peserta {e}, {n} direkam, {m} dinilai lulus/tidak",dnCont:"Lanjutkan",dnSave:"Simpan dan mulai baru",dnDrop:"Buang dan mulai baru",resumeBtn:"Lanjutkan ujian ini ({n} belum direkam)",resumeSaveFirst:"{n} rekaman dan {m} hasil lulus/tidak milik {o} belum disimpan.\n\nOK = simpan dulu, lalu buka ujian yang dipilih\nBatal = tidak jadi",resumeDrop:"{m} hasil lulus/tidak milik {o} (tanpa rekaman) tidak akan disimpan. Buka ujian yang dipilih?",resumed:"Melanjutkan ujian {e}. Lanjutkan dari pertanyaan yang belum direkam",rnBtn:"Perbaiki nama",rnTitle:"Perbaiki nama",rnScope:"Yang diperbaiki (nama peserta)",rnOne:"Hanya ujian ini",rnAll:"Semua {n} ujian orang yang sama ({v})",rnNote:"Nama penguji hanya diperbaiki untuk ujian ini. Rekaman yang sudah dikirim ke Drive dikirim ulang dengan nama baru (file di folder nama lama tetap ada; hapus secara manual)",rnSave:"Simpan nama",rnDone:"Nama di {n} ujian diperbaiki",orphMsg:"Rekaman lama \"{n}\" masih ada di \"{f}\" di Drive (hapus secara manual)",orphHead:"Masih ada {n} rekaman lama di Drive (di folder nama sebelum diperbaiki). Hapus secara manual",orphClr:"Sudah dihapus (sembunyikan)",orphClrQ:"Sudah menghapus rekaman lama di Drive?\nOK = sembunyikan pemberitahuan ini (rekaman dan hasil tidak dihapus)",
drvErrOffline:"Tidak ada sinyal atau koneksi buruk. Akan dikirim ulang otomatis saat online",drvErrTimeout:"Tidak ada respons (koneksi lambat atau terputus). Kirim ulang di tempat bersinyal baik",drvErrHtml:"Aplikasi web GAS belum dibagikan ke \"Siapa saja\". Di GAS pilih \"Yang memiliki akses: Siapa saja\" lalu deploy ulang",drvErrToken:"Kata sandi bersama tidak cocok. Samakan dengan yang di GAS",drvErrHttp:"Periksa URL aplikasi web ({s})",drvErrGas:"Terjadi kesalahan di GAS. Periksa pengaturan GAS",drvErrReach:"Tidak dapat terhubung ke GAS. Periksa apakah URL aplikasi web benar dan \"Yang memiliki akses\" di GAS sudah \"Siapa saja\" (jika sinyal lemah, kirim ulang di tempat bersinyal baik)",drvErrMaybe:"Pengiriman selesai tetapi balasan terputus. File mungkin sudah tersimpan di Drive. Periksa Drive, dan ketuk untuk kirim ulang hanya jika tidak ada",drvErrNoAudio:"Rekaman tidak ada di perangkat ini (dapat dipulihkan dari cadangan)",chLibErr:"Komponen grafik tidak dapat dimuat (periksa koneksi lalu muat ulang). Rekam dan penilaian tetap bisa dipakai",chLibWait:"Memuat komponen grafik… (bisa lama jika koneksi lambat)",reloadBtn:"Muat ulang",emptyHint:"Rekam dan simpan ujian di tab Ujian, lalu akan tampil di sini",goExam:"Ke tab Ujian",goRestore:"Data dari perangkat lain → pulihkan cadangan",stoNotPersist:"Di perangkat ini, browser bisa menghapus data saat penyimpanan hampir penuh. Ekspor cadangan secara rutin",stoLowT:"Penyimpanan perangkat hampir penuh",stoLow:"Rekaman mungkin gagal disimpan. Ekspor cadangan dulu, lalu kosongkan ruang di perangkat atau rapikan rekaman lama (aplikasi ini tidak menghapus data otomatis)",stoBackup:"Ekspor cadangan",
liveOtherEe:'Rekaman terputus ini milik "{a}". Tidak dimasukkan ke ujian sekarang (peserta "{b}"). Simpan ujian sekarang dulu lalu pulihkan, atau unduh rekamannya',liveNoNameQ:'Rekaman terputus ini tidak punya nama peserta. Masukkan ke ujian sekarang (peserta "{b}")?',liveMixQ:'Ujian sekarang sudah berisi lulus/tidak lulus atau catatan tetapi belum ada nama peserta. Gabungkan dengan rekaman terputus ({a}) menjadi satu ujian?',wakeNote:'Jangan matikan layar saat merekam (rekaman berhenti jika layar mati)',recCut:'Rekaman berhenti di tengah jalan (tersimpan sampai {s} detik). Mungkin mikrofon diambil aplikasi lain atau panggilan. Gunakan "Lanjutkan rekaman" untuk sisanya',recCutStat:'Berhenti di tengah (tersimpan sampai {s} detik)',recHidStop:'Rekaman dihentikan karena layar mati (tersimpan sampai {s} detik). Gunakan "Lanjutkan rekaman" untuk sisanya',recPause:'Jeda',recResume:'Lanjut',recPaused:'Dijeda',pauseNA:'Perangkat ini tidak mendukung jeda',recCont:'Lanjutkan rekaman',recAppended:'Lanjutan ditambahkan setelah rekaman sebelumnya',mergeFail:'Lanjutan tidak dapat digabung ke rekaman sebelumnya. Rekaman sebelumnya tetap utuh (lanjutan bisa diunduh)',mergeFailStat:'Lanjutan tidak tergabung (rekaman sebelumnya aman)',liveFound:'Ada rekaman yang terputus: {e} / {q} (sekitar {s} detik, {t})',liveMore:'dan {n} lainnya',liveRestore:'Pulihkan rekaman yang terputus',liveDiscard:'Buang',liveDiscardQ:'Hapus rekaman yang terputus? Tidak bisa dibatalkan.',liveRestored:'Rekaman yang terputus sudah dipulihkan',liveNoSess:'Tidak ada ujian tujuan pemulihan. Simpan ujian sekarang dulu, atau unduh rekamannya',liveReplace:'Soal ini sudah punya rekaman. Ganti dengan rekaman yang terputus?',undoClose:'Tutup',pfCleared:'Lulus/tidak lulus dibatalkan (belum dinilai)',beepOpt:'Bunyikan suara pendek saat mulai/berhenti merekam (getar selalu aktif di perangkat yang mendukung)',
noItems:'Belum ada pertanyaan. Tambahkan pertanyaan di tab Pengaturan atau pilih set ujian',noItemsT:'Belum ada pertanyaan',goCfg:'Tambah pertanyaan di Pengaturan',pickSet:'Pilih set ujian',
drvConnNoAuto:'● Terhubung, tetapi simpan otomatis MATI (rekaman hanya di perangkat ini; nyalakan dengan kotak centang di bawah)',gAutoOn:'Simpan otomatis rekaman DINYALAKAN',gAutoWait:'Memeriksa koneksi. Simpan otomatis rekaman akan NYALA setelah terhubung',gAutoPend:'Simpan otomatis NYALA setelah koneksi dipastikan (periksa URL dan kata sandi, lalu ketuk "Tes koneksi")',drvOn:'☁ Simpan otomatis Drive: NYALA',drvOff:'☁ Simpan otomatis Drive: MATI (rekaman hanya di perangkat ini)',drvNone:'☁ Drive: belum diatur (rekaman hanya di perangkat ini)',drvHint:'Rekaman hanya disimpan di perangkat ini (atur penyimpanan Drive di tab "Pengaturan")',drvHintGo:'Atur Drive',needEe:'Masukkan nama peserta dulu (Drive menyimpan ke folder dengan nama ini)',eeSwitch:'{n} rekaman dan {m} hasil lulus/tidak milik {o} belum disimpan.\n\nOK = simpan ujian {o} dulu, lalu mulai ujian {e}\nBatal = hanya perbaiki nama (rekaman dan hasil saat ini menjadi milik {e})',eeSwitched:'Ujian {o} disimpan. Memulai ujian {e}',eeSwitchFail:'Ujian {o} tidak dapat disimpan, jadi nama dikembalikan',
saveErrMsg:'Ujian tidak dapat disimpan (penyimpanan perangkat mungkin penuh). Isian dan rekaman masih ada di layar ini. Ekspor cadangan dulu, kosongkan ruang, lalu tekan "Simpan lagi"',retrySave:'Simpan lagi',
recSaveFail:'Rekaman tidak dapat disimpan di perangkat',recKeptOld:'(rekaman sebelumnya masih ada)',recRetryStore:'Simpan lagi',recDl:'Unduh rekaman ini',pendTakeSave:'Ada {n} rekaman yang belum tersimpan di perangkat. Jika disimpan sekarang, rekaman itu akan hilang.\nGunakan "Simpan lagi" atau "Unduh rekaman ini" pada setiap soal terlebih dahulu.\n\nTetap simpan? (Batal = kembali tanpa menyimpan)',pendTakeReset:'({n} rekaman yang belum tersimpan di perangkat juga akan hilang. Unduh dulu)',
micInsecure:'Mikrofon tidak dapat dipakai di halaman ini. Buka dengan alamat https://',micInsecureS:'Mik tidak bisa – buka via https',
micNotFound:'Mikrofon tidak ditemukan. Periksa sambungan earphone/mikrofon',micNotFoundS:'Mikrofon tidak ditemukan',
micBusy:'Aplikasi lain sedang memakai mikrofon. Akhiri panggilan atau putuskan earphone Bluetooth, lalu rekam',micBusyS:'Mik sedang dipakai (akhiri panggilan)',
drvFailToast:'Gagal mengirim ke Google Drive. Akan dikirim ulang otomatis saat online (atau ketuk "☁ Belum terkirim" di pertanyaan)',drvUnsent:'☁ Belum terkirim (ketuk untuk kirim ulang)',
oldN:'{n} nilai lama',oldAvg:'Rata nilai lama ',oldTag:'lama',unconf:' (belum final)',stPending:'Sudah dinilai – tunggu konfirmasi',notAsked:' (tidak ditanya)',
oldReplace:'Ganti nilai lama 5 tingkat ({v}) dengan Lulus/Tidak lulus? (nilai lama akan hilang)',oldNA:'Hapus nilai lama 5 tingkat ({v}) dan tandai "Tidak ditanya"?',
confirmScored:'Semua pertanyaan yang direkam sudah Lulus/Tidak lulus. Konfirmasi penilaian juga?\n(Batal = simpan rekaman saja; bisa dikonfirmasi nanti di tab "Nilai")',
oldOnly:'Hanya nilai lama 5 tingkat (tidak dihitung tingkat lulus). Lihat nilai di tab Riwayat',
mixNote:'* Untuk ujian dengan nilai lama 5 tingkat, tingkat lulus hanya dari pertanyaan Lulus/Tidak lulus',
chPending:'Ada ujian yang sudah dinilai dan menunggu konfirmasi. Buka di tab "Nilai" lalu tekan "Simpan & konfirmasi nilai"',
stPartial:'Penilaian belum selesai',partLbl:'Lulus {p} · dinilai {j}/rekam {m}',chPartial:'Ada ujian yang baru sebagian dinilai. Buka di tab "Nilai", nilai sisanya, lalu tekan "Simpan & konfirmasi nilai" agar tampil di sini',
pfProg:'Lulus/Tidak {j} / Rekam {n}',pfMiss:'{n} belum ○/×',nextUnjudged:'Belum dinilai berikutnya',allJudged:'Semua yang direkam sudah ○/×',
savedScored:'Ujian dan nilai tersimpan. Lihat hasil di tab "Riwayat"',cfgSavedSet:'Tersimpan (juga ke set "{n}")',
qsTitle:'Set ujian',qsCur:'Set aktif',qsNone:'(belum disimpan sebagai set)',qsSaveNew:'Simpan sebagai set baru (beri nama)',qsApply:'Ganti',qsRen:'Ubah nama',qsDel:'Hapus',
qsNamePrompt:'Masukkan nama set',qbTitle:'Pilih dari templat',qbReplace:'Ganti ke templat ini',qbAppend:'Tambahkan ke pertanyaan sekarang',
naLbl:'Tidak ditanya (tidak dinilai)',nextUnrec:'Item belum direkam berikutnya',nextUnscored:'Item belum dinilai berikutnya',nextUnscoredS:'Berikutnya',backS:'Daftar',allRec:'Semua sudah direkam',allScored:'Tidak ada yang belum dinilai',
recBusy:'Sedang merekam — tekan "Stop" dulu',noRecGroup:'Item tanpa rekaman ({n})',
spd:'Kecepatan',pauseAll:'Jeda pemutaran',sumTimes:' ujian',added:'Sudah ditambah',extraSec:'Item lama (tidak ada di pengaturan)',prevLbl:'Sebelumnya',
resetCnt:'({n} rekaman akan dihapus. Tidak dapat dibatalkan)',
pass:'Lulus',fail:'Tidak lulus',pfLbl:'Lulus/Tidak',passCnt:'Lulus',oldScore:'Nilai lama (5 tingkat)',
qsSwConfirm:'Ganti ke isi tersimpan set "{n}"? Perubahan yang belum di-"Simpan" akan hilang (ujian yang sudah disimpan tetap ada).',
qsDelConfirm:'Hapus set "{n}"? (ujian yang sudah disimpan tetap ada)',
qsSaved:'Set disimpan',qsApplied:'Set diganti',qsDeleted:'Set dihapus',
qbRepConfirm:'Ganti pertanyaan ke templat "{n}"? (pertanyaan sekarang diganti dengan templat ini; ujian yang sudah disimpan tetap ada)',
qbApplied:'Sudah diganti ke templat',qbNone:'Templat (qbank.js) belum dimuat',
dirty:'Ada perubahan yang belum disimpan',dirtyLeave:'Item ujian memiliki perubahan yang belum disimpan. Keluar tanpa menyimpan? (perubahan akan dibuang)',
delSecConfirm:'Hapus bagian ini beserta semua pertanyaannya?',cfgNote:'* Menghapus/mengganti pertanyaan tidak menghapus nilai, rekaman, dan transkrip ujian sebelumnya dari riwayat dan CSV',
storeFail:'Gagal menyimpan (penyimpanan perangkat mungkin penuh). Ekspor cadangan dari tab Pengaturan',
gcConfirm:'Ada {n} rekaman yang tidak termasuk ujian mana pun. Hapus untuk mengosongkan ruang?',gcDone:' rekaman tak terpakai dihapus',
csvPass:'Jumlah lulus (lulus/dinilai)',chRate:'Tren tingkat lulus (%)',chSecRate:'Tingkat lulus per bidang (%)',chItem:'Lulus/Tidak lulus per pertanyaan (terbaru)'}
};
/* R4 情報設計：試問セット（出題）の表示・切替の保護・記録／確定の言葉（4言語） */
Object.assign(TX2.ja,{
swGuard:'{e}さんの試問（録音{n}問・合否{m}問）がまだ保存されていません。出題を切り替えると、この試問の問は画面から見えなくなり保存もできなくなります。\n\nOK＝先にこの試問を保存してから切り替える\nキャンセル＝切り替えない（試問タブで続けられます）',
swGuardPf:'まだ保存されていない合否{m}問（録音なし）は、出題を切り替えると画面から見えなくなります。切り替えますか？',
swSaveFail:'試問を保存できなかったため、出題は切り替えていません',
qsMine:'自分のセット',setDefault:'初期設定の質問',setEdited:'（変更あり）',setUnknown:'（セット不明）',
examSetLbl:'出題',qCnt:'{n}問',setChange:'変更',setPickTitle:'出題する試問セットを選ぶ',setPickTpl:'テンプレートから選ぶ',setPickCur:'使用中',setPickNoMine:'自分のセットはまだありません（設定タブで今の質問を名前を付けて保存できます）',
howtoShow:'使い方',howtoHide:'使い方を閉じる',saveCfgHint:'質問の文言を書き換えたときだけ押します（テンプレートやセットの切り替え・質問の追加はその場で保存されます）',cfgConnTitle:'接続とデータ',
chSetAll:'すべてのセット（問題が違うので比べられません）',setMixNote:'※ この受験者は違う試問セットで受けています。合格率はセットごとに表示しています（上で切り替え）',setMixAllNote:'※ 違う試問セットの結果が混ざっています。問題が違うため、合格率の上下は成績の変化とは限りません',
progJudge:'判定した問',stToConfirm:'確定待ち',btnConfirmScore:'採点を保存して確定する',btnSaveConfirmed:'採点を保存（確定済み）',
confirmScoredPart:'{t}問中{n}問を録音・判定しました（{u}問は未実施）。この{n}問で採点も確定しますか？\n（キャンセルすると録音のみで保存し、あとで採点タブから確定できます）',
pfBrief:'○{p} ×{f}（{t}問中）',unaskedN:'{u}問未実施'});
Object.assign(TX2.en,{
swGuard:'The exam of {e} ({n} recorded, {m} pass/fail) is not saved yet. If you switch the questions, these questions disappear from the screen and cannot be saved.\n\nOK = save this exam first, then switch\nCancel = do not switch (you can go on in the Exam tab)',
swGuardPf:'{m} unsaved pass/fail mark(s) (no recording) will disappear from the screen if you switch the questions. Switch anyway?',
swSaveFail:'The exam could not be saved, so the questions were not switched',
qsMine:'My sets',setDefault:'Default questions',setEdited:' (edited)',setUnknown:'(set unknown)',
examSetLbl:'Questions',qCnt:'{n} Q',setChange:'Change',setPickTitle:'Choose the exam set to ask',setPickTpl:'Choose from templates',setPickCur:'In use',setPickNoMine:'No sets of your own yet (in Settings you can save the current questions under a name)',
howtoShow:'How to use',howtoHide:'Close how to use',saveCfgHint:'Press only after rewording questions (switching templates or sets and adding questions are saved at once)',cfgConnTitle:'Connections and data',
chSetAll:'All sets (different questions, not comparable)',setMixNote:'* This examinee took different exam sets. The pass rate is shown per set (switch above)',setMixAllNote:'* Results from different exam sets are mixed. The questions differ, so ups and downs are not necessarily changes in ability',
progJudge:'Judged',stToConfirm:'To confirm',btnConfirmScore:'Save and confirm score',btnSaveConfirmed:'Save score (confirmed)',
confirmScoredPart:'{n} of {t} questions were recorded and judged ({u} not asked). Confirm the scoring with these {n} questions?\n(Cancel = save as recorded only; you can confirm later in the "Score" tab)',
pfBrief:'○{p} ×{f} (of {t})',unaskedN:'{u} not asked'});
Object.assign(TX2.vi,{
swGuard:'Bài thi của {e} (ghi âm {n} câu, đạt/không đạt {m} câu) chưa được lưu. Nếu đổi câu hỏi, các câu này sẽ không còn hiện trên màn hình và không lưu được.\n\nOK = lưu bài thi này trước rồi mới đổi\nHủy = không đổi (có thể tiếp tục ở tab Thi)',
swGuardPf:'{m} kết quả đạt/không đạt chưa lưu (không có ghi âm) sẽ không còn hiện nếu đổi câu hỏi. Vẫn đổi?',
swSaveFail:'Không lưu được bài thi nên chưa đổi câu hỏi',
qsMine:'Bộ của tôi',setDefault:'Câu hỏi mặc định',setEdited:' (đã sửa)',setUnknown:'(không rõ bộ)',
examSetLbl:'Đề',qCnt:'{n} câu',setChange:'Đổi',setPickTitle:'Chọn bộ đề thi để hỏi',setPickTpl:'Chọn từ bộ mẫu',setPickCur:'Đang dùng',setPickNoMine:'Chưa có bộ của riêng bạn (ở Cài đặt có thể đặt tên và lưu câu hỏi hiện tại)',
howtoShow:'Cách dùng',howtoHide:'Đóng cách dùng',saveCfgHint:'Chỉ nhấn sau khi sửa lời câu hỏi (đổi bộ mẫu, đổi bộ và thêm câu hỏi được lưu ngay)',cfgConnTitle:'Kết nối và dữ liệu',
chSetAll:'Tất cả các bộ (câu hỏi khác nhau, không so sánh được)',setMixNote:'* Thí sinh này đã thi các bộ đề khác nhau. Tỷ lệ đạt được hiển thị theo từng bộ (đổi ở trên)',setMixAllNote:'* Kết quả của các bộ đề khác nhau bị trộn. Câu hỏi khác nhau nên tăng giảm không hẳn là thay đổi năng lực',
progJudge:'Đã đánh giá',stToConfirm:'Chờ xác nhận',btnConfirmScore:'Lưu và xác nhận điểm',btnSaveConfirmed:'Lưu điểm (đã xác nhận)',
confirmScoredPart:'Đã ghi âm và đánh giá {n}/{t} câu ({u} câu không hỏi). Xác nhận chấm điểm với {n} câu này?\n(Hủy = chỉ lưu ghi âm, có thể xác nhận sau ở thẻ "Chấm")',
pfBrief:'○{p} ×{f} (trên {t} câu)',unaskedN:'{u} câu không hỏi'});
Object.assign(TX2.id,{
swGuard:'Ujian {e} ({n} direkam, {m} lulus/tidak) belum disimpan. Jika pertanyaan diganti, pertanyaan ini hilang dari layar dan tidak bisa disimpan.\n\nOK = simpan ujian ini dulu, lalu ganti\nBatal = jangan ganti (bisa dilanjutkan di tab Ujian)',
swGuardPf:'{m} hasil lulus/tidak yang belum disimpan (tanpa rekaman) akan hilang dari layar jika pertanyaan diganti. Tetap ganti?',
swSaveFail:'Ujian tidak dapat disimpan, jadi pertanyaan tidak diganti',
qsMine:'Set saya',setDefault:'Pertanyaan bawaan',setEdited:' (diubah)',setUnknown:'(set tidak diketahui)',
examSetLbl:'Soal',qCnt:'{n} soal',setChange:'Ganti',setPickTitle:'Pilih set ujian yang ditanyakan',setPickTpl:'Pilih dari templat',setPickCur:'Dipakai',setPickNoMine:'Belum ada set sendiri (di Pengaturan pertanyaan sekarang bisa disimpan dengan nama)',
howtoShow:'Cara pakai',howtoHide:'Tutup cara pakai',saveCfgHint:'Tekan hanya setelah mengubah kata-kata pertanyaan (ganti templat atau set dan tambah pertanyaan langsung tersimpan)',cfgConnTitle:'Koneksi dan data',
chSetAll:'Semua set (pertanyaan berbeda, tidak bisa dibandingkan)',setMixNote:'* Peserta ini mengikuti set ujian yang berbeda. Tingkat lulus ditampilkan per set (ganti di atas)',setMixAllNote:'* Hasil dari set ujian yang berbeda tercampur. Pertanyaannya berbeda, jadi naik turunnya belum tentu perubahan kemampuan',
progJudge:'Dinilai',stToConfirm:'Tunggu konfirmasi',btnConfirmScore:'Simpan & konfirmasi nilai',btnSaveConfirmed:'Simpan nilai (sudah final)',
confirmScoredPart:'{n} dari {t} pertanyaan sudah direkam dan dinilai ({u} tidak ditanya). Konfirmasi penilaian dengan {n} pertanyaan ini?\n(Batal = simpan rekaman saja; bisa dikonfirmasi nanti di tab "Nilai")',
pfBrief:'○{p} ×{f} (dari {t})',unaskedN:'{u} tidak ditanya'});
/* その場で出題（空欄3問）＝既定。従来の3問は「標準の3問」 */
Object.assign(TX2.ja,{setFree:'その場で出題（空欄3問）',setDefault:'標準の3問（母豚の健康観察ほか）',freeQ:'質問{n}',freePh:'問題をその場で入力（例：分娩舎で最初に確認することは？）',qTextLbl:'問題文'});
Object.assign(TX2.en,{setFree:'Ask on the spot (3 blank questions)',setDefault:'Standard 3 questions (sow health etc.)',freeQ:'Question {n}',freePh:'Type the question you ask on the spot',qTextLbl:'Question text'});
Object.assign(TX2.vi,{setFree:'Hỏi tại chỗ (3 câu trống)',setDefault:'3 câu tiêu chuẩn (sức khỏe heo nái…)',freeQ:'Câu hỏi {n}',freePh:'Nhập câu hỏi đặt ra tại chỗ',qTextLbl:'Nội dung câu hỏi'});
Object.assign(TX2.id,{setFree:'Tanya langsung (3 pertanyaan kosong)',setDefault:'3 pertanyaan standar (kesehatan induk dll.)',freeQ:'Pertanyaan {n}',freePh:'Ketik pertanyaan yang diajukan langsung',qTextLbl:'Isi pertanyaan'});
/* R5b 初回利用の導線：初回カード（手順1行＋ドライブ未設定1行）・他の端末へ設定を渡すリンク・設定手順へのリンク */
Object.assign(TX2.ja,{howtoS:'質問を読む →「録音」→「停止」→「○/×」を選ぶ → 1人ごとに「試問を保存」',howtoMore:'詳しく',howtoLess:'短く',drvHintS:'録音はこの端末だけに保存されます',
gShareT:'この設定を他の端末へ',gShareNote:'このリンクを他のスマホ・タブレットで開くと、URLと保存先フォルダが入ります（受け取った端末で確認が出ます）',gShareTok:'合言葉もリンクに含める（リンクを見た人は誰でも送信できるようになります）',gShareNoTok:'受け取った端末では、合言葉を入れて「設定を保存」を押すと接続テストが走ります',gShareCopy:'リンクをコピー',gShareSend:'共有',gShareCopied:'リンクをコピーしました。他の端末で開いてください',gShareCopyFail:'コピーできませんでした。上の欄を長押ししてコピーしてください',gSetupLink:'設定手順（SETUP-GOOGLE-DRIVE）を開く'});
Object.assign(TX2.en,{howtoS:'Read the question → "Record" → "Stop" → ○/× → "Save Exam" per person',howtoMore:'More',howtoLess:'Less',drvHintS:'Recordings stay on this device only',
gShareT:'Send this setup to another device',gShareNote:'Open this link on another phone or tablet to fill in the URL and folder (that device asks for confirmation)',gShareTok:'Include the passphrase in the link (anyone who sees the link can send files)',gShareNoTok:'On the receiving device, enter the passphrase and tap "Save settings"; the connection test runs then',gShareCopy:'Copy link',gShareSend:'Share',gShareCopied:'Link copied. Open it on the other device',gShareCopyFail:'Could not copy. Long-press the box above and copy it',gSetupLink:'Open the setup guide (SETUP-GOOGLE-DRIVE)'});
Object.assign(TX2.vi,{howtoS:'Đọc câu hỏi → "Ghi âm" → "Dừng" → ○/× → xong mỗi người: "Lưu vấn đáp"',howtoMore:'Chi tiết',howtoLess:'Thu gọn',drvHintS:'Bản ghi chỉ lưu trên máy này',
gShareT:'Chuyển cài đặt này sang máy khác',gShareNote:'Mở liên kết này trên điện thoại hoặc máy tính bảng khác để điền URL và thư mục (máy đó sẽ hỏi xác nhận)',gShareTok:'Đưa cả mật khẩu vào liên kết (ai thấy liên kết cũng gửi được tệp)',gShareNoTok:'Trên máy nhận, nhập mật khẩu rồi bấm "Lưu cài đặt"; khi đó sẽ kiểm tra kết nối',gShareCopy:'Sao chép liên kết',gShareSend:'Chia sẻ',gShareCopied:'Đã sao chép liên kết. Hãy mở trên máy kia',gShareCopyFail:'Không sao chép được. Hãy nhấn giữ ô ở trên để sao chép',gSetupLink:'Mở hướng dẫn cài đặt (SETUP-GOOGLE-DRIVE)'});
Object.assign(TX2.id,{howtoS:'Bacakan soal → "Rekam" → "Stop" → ○/× → "Simpan Ujian" per orang',howtoMore:'Detail',howtoLess:'Ringkas',drvHintS:'Rekaman hanya di perangkat ini',
gShareT:'Kirim pengaturan ini ke perangkat lain',gShareNote:'Buka tautan ini di ponsel atau tablet lain untuk mengisi URL dan folder (perangkat itu akan meminta konfirmasi)',gShareTok:'Sertakan kata sandi di tautan (siapa pun yang melihat tautan bisa mengirim file)',gShareNoTok:'Di perangkat penerima, masukkan kata sandi lalu ketuk "Simpan pengaturan"; tes koneksi berjalan saat itu',gShareCopy:'Salin tautan',gShareSend:'Bagikan',gShareCopied:'Tautan disalin. Buka di perangkat lain',gShareCopyFail:'Tidak bisa menyalin. Tekan lama kotak di atas lalu salin',gSetupLink:'Buka panduan pengaturan (SETUP-GOOGLE-DRIVE)'});
function t2(k){const d=TX2[lang]||TX2.ja;return d[k]||TX2.en[k]||TX2.ja[k]||k}
/* 採点値→表示ラベル（合格/不合格。旧5段階の数値は「4 — 良好」形式） */
function pfLabel(v){return isPF(v)?t2(v):(isOld(v)?Number(v)+' — '+t('s'+Number(v)):(v!=null?String(v):''))}
/* 各問の採点表示（旧5段階は「旧 4 — 良好」と明示＝合否と取り違えない） */
function scoreTxt(v){return isOld(v)?t2('oldTag')+' '+pfLabel(v):pfLabel(v)}
/* 一覧行の状態バッジ・結果（採点済／録音した全問に○×が付いた確定待ち／○×が途中までの採点途中／録音のみ） */
function rowRes(r){
  const sc=r.status==='scored',pf=!sc&&hasPF(r),full=pf&&judgeState(r).full;
  const nU=typeof unsentCount==='function'?unsentCount(r):0; // ドライブ未送信の録音数（一覧でも分かるように）
  const badge=(sc?`<span class="badge scored">${t('stScored')}</span>`:full?`<span class="badge pend">${esc(t2('stPending'))}</span>`:pf?`<span class="badge part">${esc(t2('stPartial'))}</span>`:`<span class="badge rec">${t('stRec')}</span>`)
    +(nU?`<span class="badge unsent" title="${esc(t2('drvUnsent'))}" style="background:transparent;color:var(--s1);border:1px solid var(--s1)">☁ ${nU}</span>`:'');
  if(!sc&&!pf)return{badge,cls:'',lbl:'–'};
  const lbl=sc?resLbl(r):pendLbl(r);
  // 採点途中は合否の色を付けない（判定した問だけ全問合格＝緑に見せない）
  return{badge,cls:(sc?resCls(r):full?resCls(r,true):'old')+(lbl.length>5?' lng':''),lbl};
}
/* 試問の記録に残した出題（試問セット）。setId/setName は R4 で足した追加フィールド（旧データは未設定＝「セット不明」）
   setId: 'set:<自分のセットid>' / 'tpl:<テンプレートid>'（編集後は末尾に '+'）/ 'def'（初期設定）/ ''（セットに入っていない構成） */
function setLbl(r){
  if(!r||(r.setId==null&&r.setName==null))return t2('setUnknown');
  const id=String(r.setId||'');
  if(id==='def')return t2('setDefault');
  if(id==='free')return t2('setFree');
  if(!r.setName)return t2('qsNone');
  return String(r.setName)+(id.startsWith('tpl:')&&id.endsWith('+')?t2('setEdited'):'');
}
/* グラフ・前回比の比較単位（同じ出題どうしだけを比べる） */
function setKey(r){
  if(!r||(r.setId==null&&r.setName==null))return'?';
  return String(r.setId||'')+'|'+(r.setId?'':String(r.setName||''));
}
/* 「○1 ×1（2問中）」＋出題数が分かる試問は「1問未実施」を添える（「合格 1/2」を全体の合格と読ませない） */
function pfBrief(r){
  const c=pfCount(r);
  let s=t2('pfBrief').replace('{p}',c.pass).replace('{f}',c.total-c.pass).replace('{t}',c.total);
  const u=unaskedCount(r);
  if(u>0)s+=' · '+t2('unaskedN').replace('{u}',u);
  return s;
}
/* 出題数（setN・保存時の問数）のうち、録音も合否も無い問の数。出題数の分からない旧データは0 */
function unaskedCount(r){
  if(!r||!(+r.setN>0))return 0;
  const done=Object.keys(r.items||{}).filter(k=>{const x=r.items[k];return x&&(x.hasAudio||isPF(x.score)||isOld(x.score))}).length;
  return Math.max(0,+r.setN-done);
}
/* 録音の実体を読んで再生欄に付ける。無い／読めない（端末の保存領域が開けない）ときは
   0:00 の空の再生欄を出さずに隠し、「この端末に録音が見つかりません」を出す（例外で残りの問の読み込みを止めない）。
   urls: 後で解放する ObjectURL の配列。戻り値: 付けられたか */
async function attachAudio(key,au,urls){
  if(!au)return false;
  let b=null;try{b=await getAudio(key)}catch(e){b=null}
  if(!au.isConnected)return false;
  const mid=au.id+'-miss';const old=document.getElementById(mid);
  if(!b){
    au.removeAttribute('src');au.style.display='none';
    if(!old)au.insertAdjacentHTML('afterend',`<div class="recmiss" id="${esc(mid)}" role="status" style="font-size:.8rem;color:var(--s1);font-weight:700;margin:6px 0">${esc('⚠ '+t2('drvErrNoAudio'))}</div>`);
    return false;
  }
  if(old)old.remove();
  const u=URL.createObjectURL(b);if(urls)urls.push(u);au.src=u;if(au.style.display==='none')au.style.display='block';return true;
}
/* 履歴・グラフ・採点が空（データ0件）のときの次の手：試問タブへ／別の端末のデータをバックアップから復元 */
function gotoExamTab(){const tb=document.querySelector('.tabs [data-pg="pgExam"]');if(tb)swTab(tb)}
function emptyGuideHtml(restore){
  return `<div class="emptyg" role="status" style="white-space:normal;line-height:1.6">
    <div style="font-weight:700;margin-bottom:4px">${esc(t('noData'))}</div>
    <div style="font-size:.85rem">${esc(t2('emptyHint'))}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:12px">
      <button type="button" class="b b1 egExam" style="flex:1 1 160px" onclick="gotoExamTab()">${esc(t2('goExam'))}</button>
      ${restore?`<button type="button" class="b b3 egRestore" style="flex:1 1 160px" onclick="gotoCfgPart('bkImportBtn')">${esc(t2('goRestore'))}</button>`:''}
    </div></div>`;
}
