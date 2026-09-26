# 翡冷翠雨夜：失落的十二段手稿

林文月〈翡冷翠在下雨〉閱讀策略遊戲。技高三年級，兩到三節課，手機、平板、電腦都能玩。

## 檔案結構

```
index.html            學生遊戲與教師後台（網址加 #teacher 進後台）
teacher.html          只是轉址到 index.html#teacher，方便記
css/style.css         版面與視覺
js/config.js          ★ Firebase 設定、教師密碼、計分比例（最常改的檔案）
js/gameData.js        ★ 全部題目、課文段落摘要、陌生文本（第二常改）
js/art.js             水彩示意圖（找不到照片時顯示）
js/audio.js           雨聲、腳步、紙張、鈴聲、鐘聲（即時合成，不需音檔）
js/store.js           資料儲存：Firebase 或單機模式
js/tasks.js           七種題型的操作與判分
js/game.js            遊戲流程、組隊、同儕評估、成績
js/teacher.js         教師後台、錯誤分析、CSV／Excel 匯出
firestore.rules       Firestore 安全規則
images/README.md      圖片檔名與授權來源建議
docs/課文遊戲對照表.md  十二段課文 × 閱讀策略 × 遊戲任務
```

## 一、先試玩（單機模式，不用任何設定）

`config.js` 的 `apiKey` 留空時，遊戲自動使用單機模式：資料存在這台裝置的瀏覽器裡，教師後台也只看得到這台裝置的紀錄。適合老師自己先走一遍。

直接雙擊 `index.html` 在某些瀏覽器會擋掉本機儲存，建議用 GitHub Pages（見第三節），或在資料夾內執行 `python3 -m http.server` 後開 `http://localhost:8000`。

## 二、接上 Firebase（多裝置、全班紀錄）

1. 到 <https://console.firebase.google.com> 建立專案（不必開 Google Analytics）。
2. 左側「Build → Authentication → Sign-in method」，啟用「匿名（Anonymous）」。
3. 「Build → Firestore Database → 建立資料庫」，位置建議 `asia-east1`（臺灣），選正式模式。
4. Firestore 的「規則」分頁，貼上本資料夾 `firestore.rules` 的內容並發布。
5. 「專案設定 → 一般 → 你的應用程式」新增網頁應用程式，複製 `firebaseConfig` 的六個欄位，貼進 `js/config.js`。
6. 「Authentication → Settings → 授權網域」加入你部署的網域，例如 `laisurjan.github.io`。
7. 改掉 `config.js` 的 `teacherPasscode`。

設定成功後，首頁最下方會顯示「雲端模式」。失敗時會顯示錯誤原因並自動退回單機模式，遊戲不會因此不能玩。

學生不需要帳號：系統以匿名登入取得身分，紀錄識別用「班級＋座號＋姓名＋系統產生的隊伍 ID」。

## 三、部署到 GitHub Pages

把整個資料夾放進一個 repository（或放在 `laisurjan.github.io` 底下的子資料夾），到 Settings → Pages 選擇分支即可。網址會是 `https://laisurjan.github.io/資料夾名/`。全部是靜態檔案，不需要建置步驟。

## 四、課堂流程建議

| 時段 | 內容 |
|---|---|
| 第一節前 5 分鐘 | 老師說明規則，學生 1～4 人一組，隊長裝置按「開始旅程」建立小隊；其他人按「我是隊員」輸入代碼 |
| 第一節 | ROOM 01～03 |
| 第二節 | ROOM 04～06 |
| 第三節前 30 分鐘 | FINAL 陌生文本、雷達、同儕評估 |
| 第三節後 20 分鐘 | 老師開後台「全班最常出錯的題目」講評 |

只有兩節課時，可在 `gameData.js` 刪掉 FINAL 的統測型第 3～5 題，或把較慢的班級留到回家完成（進度會自動保存，按「繼續旅程」即可接續）。

## 五、修改題目

所有題目都在 `js/gameData.js`，每題都有 id、chapter、paragraph、type、question、sourceText、options、correctAnswer、explanation、strategy、difficulty、score、hint1、hint2、image、abilityTag、role、feedback。改完存檔、重新整理即可。

`correctAnswer` 的格式依題型不同：

| type | correctAnswer 範例 | 說明 |
|---|---|---|
| mcq 單選 | `'b'` | 選項 id |
| mcq 複選（加 `multi: true`） | `['a','b']` | 全部正確選項 |
| slots 關鍵詞槽位 | `{ s1: { fl: 1 }, s2: { rain: 1, cold: 0.5 } }` | 每個槽位可接受的詞與得分權重，1 為滿分 |
| sort 分類 | `{ e1: 'old', e4: ['desc','fact'] }` | 卡片 → 箱子 id，可接受多個箱子 |
| order 排序 | `['o1','o2','o3','o4']` | 由上到下的正確順序 |
| connect 連線 | `['dante-sc','mich-md']` | 「人物-節點」；不計分的線放 `optionalEdges` |
| reveal 點選線索 | `['k3','k4']` | 需要找到的碎片 |
| search 搜尋 | `{ groups: [...] }` | 三組關鍵詞類別，各組列出可接受的詞 |

`feedback` 是答錯回饋。單選題以選項 id 為鍵；分類題用 `'卡片>箱子'`；槽位題用 `'詞@槽位'`；連線題用 `'人物-節點'` 與 `'missing:人物-節點'`。寫回饋時請說明「錯在哪一種閱讀方式」，這是這個遊戲的教學核心。

`abilityTag` 決定題目計入雷達圖哪一項：retrieve、keyword、integrate、visual、causal、search。

改題目後，舊的作答紀錄仍保留；若改了題目 `id`，後台錯誤分析就對不上舊紀錄，請盡量只改內容、不改 id。

## 六、課文原文

課文全文受著作權保護，程式內只放每段的摘要，學生作答時對照課本。若老師想在遊戲的「手稿」區顯示原文，請依自己合法持有的課本，把原文貼進 `gameData.js` 的 `paragraphs[n].text`；貼上後，遊戲會自動在原文中標出題目引用的句子。

## 七、圖片

目前使用內建水彩示意圖，每張圖右下角都標出對應檔名。把照片依 `images/README.md` 的檔名放進 `images/`，遊戲會自動換成照片，不必改程式。

## 八、計分

- 團隊遊戲分數：各題得分總和換算成 100 分。單選題一次答對 100%，錯一次 60%，錯兩次 35%；多項操作題以第一次送出的正確比例計分；提示一扣 10%、提示二再扣 20%；三次都沒過會揭曉答案並讓遊戲繼續，該題最多 30%。
- 個人成績＝團隊分數 × 0.8＋個人參與（20 分）。
- 個人參與＝角色確認 6 分（每關確認一次）＋同儕貢獻 10 分（全組平均比例 ÷ 平均分配比例，最低 60%，避免惡意扣分）＋完成同儕評估 4 分。
- 比例都在 `config.js` 的 `scoring` 調整。

## 九、已知限制

- 單機模式無法跨裝置加入小隊，同儕評估改在隊長裝置依序填寫。
- 教師密碼只是前端門檻。Firestore 規則允許已登入（含匿名）的使用者讀取小隊資料，這是為了讓隊員能用代碼加入；學生若懂得直接呼叫資料庫，理論上能讀到同儕評估原始數字。需要更嚴格時，可把 `evals` 的讀取限定為教師 Google 帳號，並改由教師後台結算（需另行調整程式）。
- 搜尋按鈕開新分頁使用 Google，學校若封鎖可在 `config.js` 換成其他搜尋引擎網址。
