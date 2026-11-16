// ===== 尾牙「真的還假的？」設定檔 =====
// 用記事本修改，存檔時編碼選 UTF-8。
window.TF_CONFIG = {
  // ① 從「手機賽馬」的 config.js 把 firebase 這一整段複製過來覆蓋
  firebase: {
    apiKey: "AIzaSyAONdwzgIzxjFT0-eDIoKekToNUh4bMcC0",
    authDomain: "weiya-2026-15529.firebaseapp.com",
    databaseURL: "https://weiya-2026-15529-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "weiya-2026-15529",
    appId: "1:925908014479:web:6218bf40ad3ee80162e7fa"
  },
  // ② 主持人 Email（跟手機賽馬一樣）
  hostEmail: "host@weiya2026.com",

  // ③ 遊戲預設值（大螢幕「⚙ 設定」也可以臨時改）
  answerSec: 10,          // 每題作答秒數
  readySec: 3,            // 題目出現後，幾秒後才開放作答（讓每支手機都收到題目）
  mode: "score",          // "score" 積分模式、"elim" 淘汰模式
  elimEndCount: 3,        // 淘汰模式：剩下 ≤ 幾人就結束
  questionOrder: "random",// "random" 隨機（真假穿插）、"sequence" 照 questions.js 的順序
  questionCount: 0,       // 積分模式要出幾題；0 = 全部
  basePoints: 500,        // 答對基本分
  speedPoints: 500,       // 速度加成最多幾分（0 秒答對拿滿，最後一刻答對拿 0）

  // 大螢幕題目顯示的語言：第一個是大字，其餘小字
  screenLangs: ["zh", "vi", "en"]
};
