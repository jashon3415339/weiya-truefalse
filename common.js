// ===== 共用程式（不用改）=====
(function () {
  const C = window.TF_CONFIG || {};
  const fb = C.firebase || {};
  const DEMO = !fb.apiKey || /^PASTE/.test(fb.apiKey) || !fb.databaseURL || /PASTE/.test(fb.databaseURL);
  const ROOT = "trivia";
  const DBURL = (fb.databaseURL || "").replace(/\/+$/, "");
  const TS = { ".sv": "timestamp" };

  // ---------- 小工具 ----------
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rid = (n = 16) => { const a = "abcdefghijkmnpqrstuvwxyz23456789"; let s = ""; const r = crypto.getRandomValues(new Uint8Array(n)); for (const x of r) s += a[x % a.length]; return s; };
  const fmt = n => Number(n || 0).toLocaleString("en-US");
  const charLen = s => Array.from(s || "").length;

  function resolveSV(v) {
    if (v && typeof v === "object") {
      if (v[".sv"] === "timestamp") return Date.now();
      const o = Array.isArray(v) ? [] : {};
      for (const k in v) o[k] = resolveSV(v[k]);
      return o;
    }
    return v;
  }
  const clean = v => v === undefined ? null : v;

  // ---------- DEMO：用瀏覽器 localStorage 假裝資料庫（只能同一個瀏覽器的分頁互通） ----------
  const LKEY = "tf_demo_db_v1";
  const local = {
    load() { try { return JSON.parse(localStorage.getItem(LKEY)) || {}; } catch (e) { return {}; } },
    save(t) { localStorage.setItem(LKEY, JSON.stringify(t)); },
    getIn(t, path) { let cur = t; for (const p of path.split("/").filter(Boolean)) { if (cur == null || typeof cur !== "object") return null; cur = cur[p]; } return cur === undefined ? null : cur; },
    setIn(t, path, v) {
      const ps = path.split("/").filter(Boolean); let cur = t;
      for (let i = 0; i < ps.length - 1; i++) { if (cur[ps[i]] == null || typeof cur[ps[i]] !== "object") cur[ps[i]] = {}; cur = cur[ps[i]]; }
      const last = ps[ps.length - 1];
      if (v === null || v === undefined) delete cur[last]; else cur[last] = v;
    },
    get(path) { return this.getIn(this.load(), path); },
    multi(map) { const t = this.load(); for (const p in map) this.setIn(t, p, resolveSV(clean(map[p]))); this.save(t); localSubs.forEach(f => f()); },
  };
  const localSubs = new Set();
  window.addEventListener("storage", e => { if (e.key === LKEY) localSubs.forEach(f => f()); });

  // DEMO 模式下模擬資料庫規則（手機寫入時檢查）
  function demoRules(path, val) {
    const t = local.load(); const g = p => local.getIn(t, p); const now = Date.now();
    const ps = path.split("/");
    if (ps[1] === "clock") return true;
    if (ps[1] === "players" && ps.length === 3) return !g(path) && g(ROOT + "/state/phase") === "lobby";
    if (ps[1] === "answers" && ps.length === 4) {
      const st = g(ROOT + "/state") || {};
      const pl = g(ROOT + "/players/" + ps[3]);
      return !g(path) && st.phase === "answer" && st.rk === ps[2] && pl && pl.out !== true && now >= st.startAt - 500 && now <= st.deadline + 800;
    }
    return false;
  }

  // ---------- 手機用：一般網頁請求（不開即時連線，避開 100 連線上限） ----------
  const api = {
    async get(path) {
      if (DEMO) { await sleep(60); return local.get(path); }
      const r = await fetch(`${DBURL}/${path}.json`, { cache: "no-store" });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    },
    async put(path, val) {
      if (DEMO) {
        await sleep(80);
        if (!demoRules(path, val)) return { ok: false, status: 401 };
        local.multi({ [path]: val });
        return { ok: true, status: 200, data: local.get(path) };
      }
      const r = await fetch(`${DBURL}/${path}.json`, { method: "PUT", body: JSON.stringify(val), cache: "no-store" });
      let data = null; try { data = await r.json(); } catch (e) {}
      return { ok: r.ok, status: r.status, data };
    }
  };

  // ---------- 大螢幕用：即時連線（Firebase SDK）或 DEMO ----------
  function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("load " + src)); document.head.appendChild(s); }); }
  const FBV = "10.12.2";
  const host = {
    demo: DEMO, db: null, auth: null, offset: 0, TS,
    async init() {
      if (DEMO) return;
      await loadScript(`https://www.gstatic.com/firebasejs/${FBV}/firebase-app-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${FBV}/firebase-auth-compat.js`);
      await loadScript(`https://www.gstatic.com/firebasejs/${FBV}/firebase-database-compat.js`);
      firebase.initializeApp(fb);
      this.db = firebase.database(); this.auth = firebase.auth();
      this.TS = firebase.database.ServerValue.TIMESTAMP;
      this.db.ref(".info/serverTimeOffset").on("value", s => { this.offset = s.val() || 0; });
    },
    now() { return Date.now() + (DEMO ? 0 : this.offset); },
    on(path, cb) {
      if (DEMO) { let last; const f = () => { const v = local.get(path); const j = JSON.stringify(v); if (j !== last) { last = j; cb(v); } }; localSubs.add(f); f(); return () => localSubs.delete(f); }
      const ref = this.db.ref(path); const h = ref.on("value", s => cb(s.val())); return () => ref.off("value", h);
    },
    async get(path) { if (DEMO) return local.get(path); return (await this.db.ref(path).once("value")).val(); },
    async update(map) { if (DEMO) return local.multi(map); const m = {}; for (const k in map) m[k] = clean(map[k]); return this.db.ref().update(m); },
    async set(path, v) { return this.update({ [path]: v }); },
    async remove(path) { return this.update({ [path]: null }); },
  };

  // ---------- 文字（中／英／越） ----------
  const I18N = {
    zh: {
      nameSub: "排行榜會顯示這個名字", autoNext: "主持人開始後，手機會自動跳到題目", readyQ: "準備好了嗎？", modeScoreShort: "積分賽", modeElimShort: "淘汰賽", party: "尾牙互動遊戲", pickSub: "Choose language · Chọn ngôn ngữ", youIn: "You are in!", aliveNow: "目前還有 {n} 人", nextSoon: "下一題即將開始…", langZhSub: "中文介面", langEnSub: "English interface", langViSub: "Giao diện tiếng Việt", alsoT: "TRUE · ĐÚNG", alsoF: "FALSE · SAI", congrats: "恭喜！", 
      title: "真的還假的？", sub: "冷知識大挑戰", pick: "選擇語言",
      enterName: "輸入你的名字", namePh: "最多 10 個字", join: "加入",
      nameReq: "請輸入名字", nameLong: "名字最多 10 個字", joining: "加入中…", joinFail: "加入失敗，請再試一次",
      joined: "已加入，等待主持人開始", yourName: "你的名字", joinedCount: "目前加入人數",
      qn: "第 {n} 題", ready: "準備…", T: "真的", F: "假的",
      sent: "已送出", noChange: "送出後不能更改", sending: "送出中…", timeUp: "時間到！", tooLate: "時間已過，這次沒有送出",
      waitResult: "等待公布結果…", correct: "答對！", wrong: "答錯…", noAns: "沒有作答…",
      answerIs: "正確答案", score: "目前分數", rank: "名次", rankFmt: "第 {r} 名 / {n} 人",
      out: "你被淘汰了", outSub: "繼續觀戰，看看誰撐到最後！", spectate: "觀戰中", late: "遊戲已經開始，這一場只能觀戰",
      look: "請看大螢幕", over: "遊戲結束", finalRank: "最終名次", champ: "🏆 恭喜！你是第 {r} 名！",
      survive: "存活！", alive: "存活", voidR: "全部答錯，這題不淘汰！", waitNext: "等待下一題…",
      modeScore: "積分模式：答對越快分數越高", modeElim: "淘汰模式：答錯就淘汰！", lang: "語言",
      thanks: "謝謝參與！", youChose: "你選了", pts: "分",
    },
    en: {
      nameSub: "This name appears on the leaderboard", autoNext: "Your phone jumps to the question when the host starts", readyQ: "Get ready!", modeScoreShort: "Points", modeElimShort: "Elimination", party: "Year-end party game", pickSub: "選擇語言 · Chọn ngôn ngữ", youIn: "You are in!", aliveNow: "{n} players still in", nextSoon: "Next question coming up…", langZhSub: "中文介面", langEnSub: "English interface", langViSub: "Giao diện tiếng Việt", alsoT: "真的 · ĐÚNG", alsoF: "假的 · SAI", congrats: "Congrats!", 
      title: "True or False?", sub: "Weird Facts Challenge", pick: "Choose language",
      enterName: "Enter your name", namePh: "Up to 10 characters", join: "Join",
      nameReq: "Please enter your name", nameLong: "Name must be 10 characters or fewer", joining: "Joining…", joinFail: "Couldn't join. Please try again.",
      joined: "You're in! Waiting for the host to start", yourName: "Your name", joinedCount: "Players joined",
      qn: "Question {n}", ready: "Get ready…", T: "True", F: "False",
      sent: "Submitted", noChange: "Answers can't be changed", sending: "Sending…", timeUp: "Time's up!", tooLate: "Too late — your answer wasn't sent",
      waitResult: "Waiting for the result…", correct: "Correct!", wrong: "Wrong…", noAns: "No answer…",
      answerIs: "Answer", score: "Your score", rank: "Rank", rankFmt: "#{r} of {n}",
      out: "You're out", outSub: "Keep watching to see who lasts!", spectate: "Spectating", late: "The game has started. You can watch this round.",
      look: "Look at the big screen", over: "Game over", finalRank: "Final rank", champ: "🏆 Congrats! You placed #{r}!",
      survive: "Survived!", alive: "Alive", voidR: "Everyone got it wrong — nobody is out!", waitNext: "Waiting for the next question…",
      modeScore: "Points mode: faster correct answers score more", modeElim: "Elimination: one wrong answer and you're out!", lang: "Language",
      thanks: "Thanks for playing!", youChose: "You chose", pts: "pts",
    },
    vi: {
      nameSub: "Tên này sẽ hiện trên bảng xếp hạng", autoNext: "Điện thoại sẽ tự chuyển đến câu hỏi khi bắt đầu", readyQ: "Sẵn sàng chưa?", modeScoreShort: "Tính điểm", modeElimShort: "Loại trực tiếp", party: "Trò chơi tiệc tất niên", pickSub: "選擇語言 · Choose language", youIn: "Đã vào!", aliveNow: "Còn {n} người", nextSoon: "Câu tiếp theo sắp bắt đầu…", langZhSub: "中文介面", langEnSub: "English interface", langViSub: "Giao diện tiếng Việt", alsoT: "真的 · TRUE", alsoF: "假的 · FALSE", congrats: "Chúc mừng!", 
      title: "Thật hay Giả?", sub: "Thử thách kiến thức lạ", pick: "Chọn ngôn ngữ",
      enterName: "Nhập tên của bạn", namePh: "Tối đa 10 ký tự", join: "Tham gia",
      nameReq: "Vui lòng nhập tên", nameLong: "Tên tối đa 10 ký tự", joining: "Đang tham gia…", joinFail: "Không thể tham gia. Vui lòng thử lại.",
      joined: "Đã tham gia! Đang chờ người dẫn chương trình bắt đầu", yourName: "Tên của bạn", joinedCount: "Số người đã tham gia",
      qn: "Câu {n}", ready: "Chuẩn bị…", T: "Thật", F: "Giả",
      sent: "Đã gửi", noChange: "Không thể đổi câu trả lời", sending: "Đang gửi…", timeUp: "Hết giờ!", tooLate: "Quá giờ — câu trả lời chưa được gửi",
      waitResult: "Đang chờ kết quả…", correct: "Đúng rồi!", wrong: "Sai rồi…", noAns: "Không trả lời…",
      answerIs: "Đáp án", score: "Điểm của bạn", rank: "Hạng", rankFmt: "Hạng {r} / {n} người",
      out: "Bạn đã bị loại", outSub: "Tiếp tục xem ai trụ lại đến cuối nhé!", spectate: "Đang xem", late: "Trò chơi đã bắt đầu. Lượt này bạn chỉ có thể xem.",
      look: "Hãy nhìn màn hình lớn", over: "Kết thúc", finalRank: "Hạng chung cuộc", champ: "🏆 Chúc mừng! Bạn đạt hạng {r}!",
      survive: "Còn sống!", alive: "Còn lại", voidR: "Tất cả đều sai — không ai bị loại!", waitNext: "Đang chờ câu tiếp theo…",
      modeScore: "Chế độ tính điểm: trả lời đúng càng nhanh càng nhiều điểm", modeElim: "Chế độ loại: trả lời sai là bị loại!", lang: "Ngôn ngữ",
      thanks: "Cảm ơn bạn đã tham gia!", youChose: "Bạn đã chọn", pts: "điểm",
    }
  };
  function tr(lang, key, vars) {
    let s = (I18N[lang] && I18N[lang][key]) || I18N.zh[key] || key;
    if (vars) for (const k in vars) s = s.replace("{" + k + "}", vars[k]);
    return s;
  }

  // 分數：答對 base + 速度加成（startAt 開始算，用滿 durMs 拿 0）
  function calcPoints(ok, t, startAt, durMs) {
    if (!ok) return 0;
    const base = C.basePoints != null ? C.basePoints : 500, sp = C.speedPoints != null ? C.speedPoints : 500;
    const frac = Math.min(1, Math.max(0, (t - startAt) / durMs));
    return Math.round(base + sp * (1 - frac));
  }

  // 彩帶（手機答對、頒獎台用）
  function confetti(n = 120, el = document.body) {
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:999";
    el.appendChild(cv); const ctx = cv.getContext("2d");
    const W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
    const cols = ["#ffd23f", "#3bceac", "#ee4266", "#540d6e", "#0ead69", "#4cc9f0", "#ff8c42"];
    const ps = Array.from({ length: n }, () => ({ x: W / 2 + (Math.random() - .5) * W * .3, y: H * .45, vx: (Math.random() - .5) * W * .025, vy: -Math.random() * H * .03 - H * .008, r: Math.random() * 6 + 4, c: cols[Math.random() * cols.length | 0], a: Math.random() * 6, va: (Math.random() - .5) * .3 }));
    let f = 0;
    (function tick() {
      ctx.clearRect(0, 0, W, H);
      for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += H * .0009; p.vx *= .99; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillStyle = p.c; ctx.fillRect(-p.r * devicePixelRatio, -p.r * devicePixelRatio / 2, p.r * 2 * devicePixelRatio, p.r * devicePixelRatio); ctx.restore(); }
      if (++f < 220) requestAnimationFrame(tick); else cv.remove();
    })();
  }

  window.TF = { C, DEMO, ROOT, TS, api, host, local, $, $$, sleep, esc, rid, fmt, charLen, tr, I18N, calcPoints, confetti, loadScript };
})();
