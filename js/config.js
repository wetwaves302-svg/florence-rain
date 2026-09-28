/* =========================================================
   《翡冷翠雨夜：失落的十二段手稿》設定檔
   只要改這一個檔案，就能接上 Firebase 或調整計分。
   ========================================================= */
window.APP_CONFIG = {
  /* 1. Firebase 設定
     到 Firebase 主控台 → 專案設定 → 一般 → 你的應用程式（網頁）→ 複製 firebaseConfig 貼進來。
     apiKey 留空時，遊戲會自動改用「單機模式」（資料存在這台裝置的瀏覽器裡）。 */
  firebaseConfig: {
    apiKey: 'AIzaSyCAMu9KKFqByq03HLFHu-kRTS6mPOpsMfM',
    authDomain: 'florence-rain-202609.firebaseapp.com',
    projectId: 'florence-rain-202609',
    storageBucket: 'florence-rain-202609.firebasestorage.app',
    messagingSenderId: '201069470608',
    appId: '1:201069470608:web:78088d9a9f0e6423cb8915'
  },

  /* 2. 教師後台密碼（前端簡易門檻，防學生誤入；正式防護請見 README 的 Firestore 規則） */
  teacherPasscode: 'florence2026',

  /* 3. 本次課堂場次代碼（可留空）。例如改成 '電子三甲-0930'，教師後台可以用它篩選。 */
  sessionTag: '',

  /* 4. 計分設定 */
  scoring: {
    teamWeight: 0.8,        // 團隊任務占比
    personalMax: 20,        // 個人參與滿分
    rolePart: 6,            // 個人參與：角色簽到
    peerPart: 10,           // 個人參與：同儕貢獻（有保底，避免惡意扣分）
    evalPart: 4,            // 個人參與：完成同儕評估
    peerFloor: 0.6,         // 同儕貢獻保底比例
    hint1Penalty: 0.1,      // 使用提示一扣該題 10%
    hint2Penalty: 0.2,      // 使用提示二再扣 20%
    mcqRetry: [1, 0.6, 0.35], // 單選題：一次答對、錯一次、錯兩次後答對的得分比例
    revealCap: 0.3,         // 三次都沒過、系統揭曉答案時的得分上限
    floor: 0.1,             // 每題最低得分比例（完成就有分，不會卡死）
    maxSubmit: 3            // 最多送出次數，超過就揭曉答案並繼續
  },

  /* 5. 是否嘗試載入 images/ 資料夾中的正式照片（找不到會自動顯示水彩示意圖） */
  useImageFiles: true,

  /* 6. 搜尋引擎（學生按「開啟搜尋」時使用） */
  searchUrl: 'https://www.google.com/search?q=',
  imageSearchUrl: 'https://www.google.com/search?tbm=isch&q='
};
