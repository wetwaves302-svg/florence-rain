/* =========================================================
   遊戲流程（接力模式）
   小隊的狀態存在資料庫的同一份文件裡，每一台手機都看著這份文件。
   輪到誰主責，作答畫面就出現在誰的手機上；其他人的手機同步顯示題目、手稿與結果。
   隊員沒有自己的手機時，輪到他的題目由隊長的手機代為操作。
   ========================================================= */

/* ---------- 計分（教師後台共用） ---------- */
window.Scoring = (function () {
  const D = window.GAME_DATA;
  const round1 = (v) => Math.round(v * 10) / 10;
  const allTasks = () => D.rooms.reduce((a, r) => a.concat(r.tasks.map((t) => Object.assign({ roomId: r.id, roomNo: r.no }, t))), []);
  const TOTAL = allTasks().reduce((s, t) => s + t.score, 0);
  const roomKey = (ch) => (ch >= 7 ? 'boss' : 'r' + ch);

  function compute(results) {
    const ab = {}, rooms = {};
    let earned = 0, wrongs = 0, hints = 0;
    Object.values(results || {}).forEach((r) => {
      ab[r.ability] = ab[r.ability] || { e: 0, m: 0 };
      ab[r.ability].e += r.earned; ab[r.ability].m += r.max;
      const k = roomKey(r.room);
      rooms[k] = rooms[k] || { earned: 0, max: 0 };
      rooms[k].earned = round1(rooms[k].earned + r.earned); rooms[k].max += r.max;
      earned += r.earned; wrongs += r.wrongs || 0; hints += r.hints || 0;
    });
    const abilities = {};
    D.abilities.forEach((a) => { abilities[a.id] = ab[a.id] && ab[a.id].m ? Math.round((ab[a.id].e / ab[a.id].m) * 100) : null; });
    return { abilities, rooms, earned: round1(earned), teamScore: round1((earned / TOTAL) * 100), wrongs, hints };
  }

  function final(team, evals) {
    const c = window.APP_CONFIG.scoring;
    const members = team.members || [];
    const n = members.length || 1;
    const teamScore = team.teamScore || compute(team.results).teamScore;
    const acks = team.roleAcks || {};
    const out = {};
    members.forEach((m) => {
      const vals = (evals || []).map((e) => e.shares && e.shares[m.id]).filter((v) => typeof v === 'number');
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 100 / n;
      const ackCount = D.rooms.filter((r) => acks[r.id] && acks[r.id][m.id]).length;
      const role = c.rolePart * (ackCount / D.rooms.length);
      const peer = n === 1 ? c.peerPart : c.peerPart * Math.max(c.peerFloor, Math.min(1, avg / (100 / n)));
      const ev = n === 1 || (evals || []).some((e) => e.evaluatorId === m.id) ? c.evalPart : 0;
      const personal = round1(role + peer + ev);
      const teamPart = round1(teamScore * c.teamWeight);
      out[m.id] = { peerAvg: round1(avg), role: round1(role), peer: round1(peer), eval: ev, personal, teamPart, total: round1(teamPart + personal), acks: ackCount };
    });
    return out;
  }

  function comment(ab) {
    const D2 = window.GAME_DATA.abilities;
    const strong = { retrieve: '從文章中找出明確資訊', keyword: '抓住承載主要訊息的關鍵詞', integrate: '把分散在各段的線索統整起來', visual: '用圖片與文字互相驗證', causal: '看出句子之間的因果關係', search: '把文章詞語轉成有效的搜尋關鍵詞' };
    const advice = {
      retrieve: '回到原文逐字比對數字、方位與主詞，再下判斷。',
      keyword: '先問自己：拿掉這個詞，讀者還知不知道發生了什麼事？',
      integrate: '遇到作者觀點與篇章結構時，需要多停一步問：作者為什麼要這樣安排？',
      visual: '看圖時先說出顏色、物件與位置，再回到文字找對應的條件。',
      causal: '留意「為此、因此、豈單只是、只好」這類連接詞，原因常藏在它的前面。',
      search: '搜尋前先把關鍵詞整理成「地點或人物＋對象＋要驗證的事」。'
    };
    const list = D2.filter((a) => ab[a.id] != null).map((a) => ({ id: a.id, v: ab[a.id] })).sort((a, b) => b.v - a.v);
    if (!list.length) return '';
    const top = list.slice(0, 2).map((x) => strong[x.id]);
    const low = list[list.length - 1];
    const head = list[0].v >= 85 && low.v >= 85 ? '六項能力都很穩定，尤其擅長' + top[0] + '。' : '你們很擅長' + top.join('，也能') + '。';
    return head + '接下來，' + advice[low.id];
  }

  return { compute, final, comment, TOTAL, allTasks, roomKey, round1 };
})();


(function () {
  const D = window.GAME_DATA, CFG = window.APP_CONFIG;
  const esc = Tasks.esc;
  const app = document.getElementById('app');
  const DEVICE_KEY = 'frg_device_v2';
  const ROLE_IDS = ['A', 'B', 'C', 'D'];
  let dev = null;          // 這台手機是誰：{ teamId, memberId }
  let T = null;            // 小隊文件的最新狀態
  let evals = [];
  let unsub = [], lastKey = '', timer = null, formOpen = false, heardResult = '';

  /* ---------- 小工具 ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const now = () => Date.now();
  const roleName = (id) => (D.roles.find((r) => r.id === id) || {}).name || '';
  const roleDuty = (id) => (D.roles.find((r) => r.id === id) || {}).duty || '';
  /* 角色分配：前 n 個角色每關輪替；人數少於 4 時，多出來的角色交給這一關題目最少的人，讓每個人主責的題數接近 */
  const roleMapCache = {};
  function roleMap(roomIdx, n) {
    const key = roomIdx + '|' + n;
    if (roleMapCache[key]) return roleMapCache[key];
    const tasks = (D.rooms[roomIdx] || D.rooms[0]).tasks;
    const count = (r) => tasks.filter((t) => t.role === r).length;
    const map = {}, load = new Array(n).fill(0);
    ROLE_IDS.forEach((r, i) => {
      let who;
      if (i < n) who = (i + roomIdx) % n;
      else who = load.indexOf(Math.min.apply(null, load));
      map[r] = who; load[who] += count(r);
    });
    return (roleMapCache[key] = map);
  }
  const ownerIdx = (roomIdx, roleId, n) => roleMap(roomIdx, n)[roleId];
  const rolesOf = (roomIdx, mi, n) => ROLE_IDS.filter((r) => ownerIdx(roomIdx, r, n) === mi);
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function fmtTime(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function paraRange(ps) { return ps.length ? (ps.length > 1 ? ps[0] + '–' + ps[ps.length - 1] : String(ps[0])) : ''; }
  function top() { document.body.classList.remove('on-landing'); window.scrollTo({ top: 0, behavior: 'auto' }); }
  function clearSubs() { unsub.forEach((f) => { try { f(); } catch (e) { /* 忽略 */ } }); unsub = []; lastKey = ''; formOpen = false; }
  const sfx = { right: (n) => Sound.right(n), wrong: () => Sound.wrong(), step: () => Sound.step(), place: () => Sound.place() };

  /* 身分同時存在分頁（sessionStorage）與裝置（localStorage）：同一台電腦開多個分頁測試時各自獨立，手機重開網頁也能回到小隊 */
  function saveDev() { const v = JSON.stringify(dev); try { sessionStorage.setItem(DEVICE_KEY, v); localStorage.setItem(DEVICE_KEY, v); } catch (e) { /* 忽略 */ } }
  function loadDev() {
    try { return JSON.parse(sessionStorage.getItem(DEVICE_KEY) || localStorage.getItem(DEVICE_KEY)); } catch (e) { return null; }
  }
  function clearDev() { try { sessionStorage.removeItem(DEVICE_KEY); localStorage.removeItem(DEVICE_KEY); } catch (e) { /* 忽略 */ } dev = null; }

  /* ---------- 小隊狀態的讀法 ---------- */
  const members = () => T.members || [];
  const member = (id) => members().find((m) => m.id === id);
  const me = () => member(dev.memberId);
  const isCaptain = () => dev.memberId === 'm1';
  const hasDevice = (id) => id === 'm1' || !!(T.joined && T.joined[id]);
  const room = () => D.rooms[T.roomIdx || 0];
  const curTask = () => (room() ? room().tasks[T.taskIdx || 0] : null);
  const ownerOf = (task) => members()[ownerIdx(T.roomIdx || 0, task.role, members().length)];
  function activeId() {
    const task = curTask();
    if (!task) return 'm1';
    if (T.takeover && T.takeover.taskId === task.id && member(T.takeover.memberId)) return T.takeover.memberId;
    const owner = ownerOf(task);
    return owner && hasDevice(owner.id) ? owner.id : 'm1';
  }
  /* 這台手機可以代為操作的成員：自己；隊長另外負責沒有加入手機的人 */
  const handledHere = () => members().filter((m) => m.id === dev.memberId || (isCaptain() && !hasDevice(m.id)));

  function write(patch) {
    return Store.saveTeam(T.id, patch).catch((e) => { console.warn(e); toast('同步暫時失敗，請檢查網路後再按一次。'); });
  }
  async function fresh() { try { const d = await Store.getTeam(T.id); if (d) T = d; } catch (e) { /* 用手上的資料 */ } return T; }

  /* ---------- 上方工具列 ---------- */
  function topbar(show) {
    const tb = $('#topbar');
    tb.hidden = !show;
    document.body.classList.toggle('has-topbar', !!show);
    if (!show) { clearInterval(timer); return; }
    const done = new Set();
    D.rooms.forEach((r) => { if ((T.roomsDone || []).includes(r.id)) r.paragraphs.forEach((p) => done.add(p)); });
    const r = room() || D.rooms[0];
    $('#tb-room').textContent = r.no + '　' + r.title;
    $('#tb-strip').innerHTML = Array.from({ length: 12 }, (_, i) => '<span class="frag-bit' + (done.has(i + 1) ? ' got' : '') + (r.paragraphs.includes(i + 1) ? ' here' : '') + '" title="第' + (i + 1) + '段">' + (i + 1) + '</span>').join('');
    $('#tb-score').textContent = Scoring.compute(T.results).earned + ' 分';
    const tick = () => { $('#tb-time').textContent = fmtTime((T.finishedAt || now()) - (T.startedAt || now())); };
    tick(); clearInterval(timer); timer = setInterval(tick, 1000);
  }
  function paintMute() {
    const b = $('#tb-mute');
    b.setAttribute('aria-pressed', Sound.isMuted() ? 'true' : 'false');
    b.innerHTML = Sound.isMuted() ? '<span aria-hidden="true">🔇</span> 靜音中' : '<span aria-hidden="true">🔈</span> 雨聲';
  }

  /* =========================================================
     首頁
     ========================================================= */
  function landing() {
    clearSubs(); topbar(false); document.body.classList.add('on-landing'); document.body.classList.remove('slow');
    const saved = loadDev();
    const modeText = Store.mode() === 'firebase'
      ? '雲端模式：成績會存到教師後台，每位隊員都可以用自己的手機加入，輪到誰主責，作答畫面就在誰的手機上。'
      : '單機模式：資料只存在這台裝置，全隊輪流用這台作答。要讓多台手機同步，請老師在 js/config.js 填入 Firebase 設定。' + (Store.error() ? '（Firebase 連線失敗：' + esc(Store.error()) + '）' : '');
    app.innerHTML =
      '<section class="landing">' + Art.scene('alley', 'hero') +
      '<div class="hero-text paper">' +
      '<p class="lesson">' + esc(D.meta.lesson) + '</p>' +
      '<h1>' + esc(D.meta.title) + '<span>' + esc(D.meta.subtitle) + '</span></h1>' +
      '<p class="en">' + esc(D.meta.english) + '</p>' +
      '<p class="hero-credit">國立花蓮高工　柯貞伊老師設計</p>' +
      '<p class="story">' + esc(D.meta.story) + '</p>' +
      '<div class="cta">' +
      '<button type="button" class="btn primary big" id="go">開始旅程（建立小隊）</button>' +
      '<button type="button" class="btn ghost" id="join">我是隊員，用自己的手機加入</button>' +
      (saved ? '<button type="button" class="btn soft" id="resume">回到剛才的小隊</button>' : '') +
      '</div><p class="mode small">' + modeText + '</p></div>' +
      '<footer class="foot"><a href="#teacher">教師後台</a></footer></section>';
    $('#go').addEventListener('click', () => { Sound.start(); Sound.step(); setup(); });
    $('#join').addEventListener('click', () => { Sound.start(); join(); });
    if (saved) $('#resume').addEventListener('click', async () => {
      Sound.start();
      const t = await Store.getTeam(saved.teamId);
      if (!t) { clearDev(); toast('找不到這個小隊的資料。'); landing(); return; }
      dev = saved; attach();
    });
  }

  /* =========================================================
     建立小隊（這台手機就是隊長 m1）
     ========================================================= */
  function setup() {
    top();
    const draft = { size: 1, name: D.teamNames[Math.floor(Math.random() * D.teamNames.length)], members: [{ cls: '', seat: '', name: '' }] };
    function render() {
      while (draft.members.length < draft.size) draft.members.push({ cls: draft.members[0].cls || '', seat: '', name: '' });
      draft.members.length = draft.size;
      app.innerHTML =
        '<section class="sheet paper setup">' +
        '<h2 class="sheet-title">組成旅行小隊</h2>' +
        '<p class="muted">每位隊員都要輸入班級、座號、姓名。建好小隊後，隊員再用自己的手機輸入隊伍代碼加入。</p>' +
        '<div class="size-pick" role="radiogroup" aria-label="人數">' + [1, 2, 3, 4].map((n) =>
          '<button type="button" class="size-btn' + (draft.size === n ? ' on' : '') + '" data-n="' + n + '" aria-pressed="' + (draft.size === n) + '">' + (n === 1 ? '單人' : n + ' 人') + '</button>').join('') + '</div>' +
        '<div class="member-forms">' + draft.members.map((m, i) =>
          '<fieldset class="member-f"><legend>隊員 ' + (i + 1) + (i === 0 ? '（隊長，拿這台手機的人）' : '') + '</legend>' +
          '<label><span>班級</span><input data-i="' + i + '" data-k="cls" value="' + esc(m.cls) + '" placeholder="電子三甲" autocomplete="off"></label>' +
          '<label class="seat"><span>座號</span><input data-i="' + i + '" data-k="seat" value="' + esc(m.seat) + '" inputmode="numeric" placeholder="05" autocomplete="off"></label>' +
          '<label><span>姓名</span><input data-i="' + i + '" data-k="name" value="' + esc(m.name) + '" placeholder="王小明" autocomplete="off"></label></fieldset>').join('') + '</div>' +
        '<label class="team-name"><span>小隊名稱</span><span class="row"><input id="tname" value="' + esc(draft.name) + '" maxlength="16"><button type="button" class="btn ghost" id="dice">換一個</button></span></label>' +
        '<p class="err" id="err" aria-live="polite"></p>' +
        '<div class="row end"><button type="button" class="btn ghost" id="back">返回</button><button type="button" class="btn primary" id="create">建立小隊</button></div></section>';
      app.querySelectorAll('.size-btn').forEach((b) => b.addEventListener('click', () => { draft.size = +b.dataset.n; render(); }));
      app.querySelectorAll('.member-f input').forEach((inp) => inp.addEventListener('input', () => { draft.members[+inp.dataset.i][inp.dataset.k] = inp.value.trim(); }));
      $('#tname').addEventListener('input', (e) => { draft.name = e.target.value.trim(); });
      $('#dice').addEventListener('click', () => { draft.name = D.teamNames[Math.floor(Math.random() * D.teamNames.length)]; $('#tname').value = draft.name; });
      $('#back').addEventListener('click', landing);
      $('#create').addEventListener('click', create);
    }
    async function create() {
      draft.members.forEach((m, i) => { if (!m.cls && i > 0) m.cls = draft.members[0].cls; });
      const bad = draft.members.findIndex((m) => !m.cls || !m.seat || !m.name);
      if (bad >= 0) { $('#err').textContent = '隊員 ' + (bad + 1) + ' 的資料還沒填完整。'; return; }
      const badSeat = draft.members.findIndex((m) => !/^\d{1,3}$/.test(m.seat));
      if (badSeat >= 0) { $('#err').textContent = '隊員 ' + (badSeat + 1) + ' 的座號請填數字。'; return; }
      $('#create').disabled = true;
      const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      const id = code + '-' + now().toString(36);
      const doc = {
        id, code, name: draft.name || D.teamNames[0], session: CFG.sessionTag || '', mode: Store.mode(),
        members: draft.members.map((m, i) => ({ id: 'm' + (i + 1), cls: m.cls, seat: m.seat.padStart(2, '0'), name: m.name })),
        size: draft.members.length, createdAt: now(), startedAt: null, finishedAt: null,
        stage: 'ready', phase: 'intro', roomIdx: 0, taskIdx: 0, roomsDone: [], results: {}, search: {}, roleAcks: {},
        joined: { m1: now() }, streak: 0, now: null, final: null, takeover: null
      };
      await Store.saveTeam(id, doc);
      dev = { teamId: id, memberId: 'm1' }; saveDev();
      attach();
    }
    render();
  }

  /* =========================================================
     隊員加入
     ========================================================= */
  function join() {
    top(); clearSubs(); topbar(false);
    app.innerHTML =
      '<section class="sheet paper join">' +
      '<h2 class="sheet-title">加入小隊</h2>' +
      (Store.mode() !== 'firebase' ? '<p class="warn-box">目前是單機模式，只有同一台裝置的其他分頁找得到小隊。要讓每個人用自己的手機，請老師先接上 Firebase。</p>' : '') +
      '<label class="code-in"><span>隊伍代碼（看隊長手機上的四個字）</span><input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="例如 K7QP"></label>' +
      '<p class="err" id="err" aria-live="polite"></p><div id="pick"></div>' +
      '<div class="row end"><button type="button" class="btn ghost" id="back">返回</button><button type="button" class="btn primary" id="find">找小隊</button></div></section>';
    $('#back').addEventListener('click', landing);
    $('#find').addEventListener('click', async () => {
      const t = await Store.findTeamByCode($('#code').value);
      if (!t) { $('#err').textContent = '找不到這組代碼，請確認四個字母數字是否正確。'; return; }
      $('#err').textContent = '';
      $('#pick').innerHTML = '<p>找到「' + esc(t.name) + '」。你是哪一位？</p><div class="pick-list">' +
        t.members.map((m) => m.id === 'm1'
          ? '<button type="button" class="btn ghost" disabled>' + esc(m.seat) + '　' + esc(m.name) + '（隊長手機）</button>'
          : '<button type="button" class="btn soft pickme" data-m="' + m.id + '">' + esc(m.seat) + '　' + esc(m.name) + (t.joined && t.joined[m.id] ? '（已加入過，可重新加入）' : '') + '</button>').join('') + '</div>';
      app.querySelectorAll('.pickme').forEach((b) => b.addEventListener('click', async () => {
        dev = { teamId: t.id, memberId: b.dataset.m }; saveDev();
        await Store.saveTeam(t.id, { joined: { [dev.memberId]: now() } });
        attach();
      }));
    });
  }

  /* =========================================================
     所有手機共用：看著小隊文件，依狀態畫出畫面
     ========================================================= */
  function attach() {
    clearSubs();
    app.innerHTML = '<section class="sheet paper"><p>正在連上小隊……</p></section>';
    unsub.push(Store.subscribeTeam(dev.teamId, (doc) => {
      if (!doc) return;
      T = doc;
      if (!me()) { clearDev(); toast('這台手機的身分已不在小隊名單中。'); landing(); return; }
      route();
    }));
    unsub.push(Store.subscribeEvals(dev.teamId, (list) => { evals = list; if (T) route(); }));
  }

  function viewKey() {
    const acks = (id) => JSON.stringify((T.roleAcks || {})[id] || {});
    const joinedKey = Object.keys(T.joined || {}).sort().join(',');
    if (T.stage === 'ready') return 'ready|' + joinedKey;
    if (T.stage === 'play') {
      const r = room();
      if (T.phase === 'roomDone') return 'done|' + T.roomIdx;
      if (T.phase === 'task') {
        const task = curTask(), a = activeId();
        return a === dev.memberId ? 'task|' + task.id + '|me' : 'task|' + task.id + '|watch|' + a + '|' + ((T.results || {})[task.id] ? 'r' : '');
      }
      return 'intro|' + T.roomIdx + '|' + acks(r.id) + '|' + joinedKey;
    }
    if (T.stage === 'peer') return 'peer|' + evals.map((e) => e.evaluatorId).sort().join(',');
    return T.stage + '|' + JSON.stringify(T.final || {});
  }

  function route() {
    if (location.hash === '#teacher') return;
    const key = viewKey();
    if (T.stage !== 'ready') topbar(true);
    if (key === lastKey) return;
    if (formOpen && T.stage === 'peer') return;
    lastKey = key;
    if (T.stage === 'ready') return ready();
    if (T.stage === 'play') {
      document.body.classList.toggle('slow', !!room().slow);
      if (T.phase === 'roomDone') return roomDone();
      if (T.phase === 'task') return activeId() === dev.memberId ? taskScreen() : watchScreen();
      return roomIntro();
    }
    document.body.classList.remove('slow');
    if (T.stage === 'results') return results();
    if (T.stage === 'peer') return peer();
    return finalScreen();
  }

  /* ---------- 等待出發 ---------- */
  function joinedList() {
    return '<ul class="joined-list">' + members().map((m) => '<li class="' + (hasDevice(m.id) ? 'ok' : '') + '"><span>' + esc(m.seat) + '　' + esc(m.name) + (m.id === dev.memberId ? '（這台手機）' : '') + '</span><b>' +
      (m.id === 'm1' ? '隊長手機' : (hasDevice(m.id) ? '已用自己的手機加入' : '還沒加入')) + '</b></li>').join('') + '</ul>';
  }
  function ready() {
    top(); topbar(false);
    app.innerHTML =
      '<section class="sheet paper ready">' +
      '<h2 class="sheet-title">' + esc(T.name) + '</h2>' +
      '<p class="code-box">隊伍代碼<b>' + esc(T.code) + '</b></p>' +
      (members().length > 1 ? '<p>其他隊員請打開同一個網址，按「我是隊員」，輸入這組代碼。輪到誰主責，作答畫面就會出現在誰的手機上；沒有手機的同學，輪到時由隊長的手機代為操作。</p>' + joinedList() : '') +
      '<h3>四種角色，每一關輪替</h3><ul class="role-list">' + D.roles.map((r) => '<li><b>' + r.id + '　' + esc(r.name) + '</b>' + esc(r.duty) + '</li>').join('') + '</ul>' +
      '<div class="row end"><button type="button" class="btn primary" id="depart">全員到齊，出發</button></div></section>';
    $('#depart').addEventListener('click', () => write({ stage: 'play', phase: 'intro', roomIdx: 0, taskIdx: 0, startedAt: T.startedAt || now() }));
  }

  /* ---------- 關卡入口 ---------- */
  function clocks() { return '<div class="clocks"><div><span>翡冷翠</span><b>17:30</b></div><div><span>臺北</span><b>23:30</b></div></div>'; }
  function roomIntro() {
    top();
    const r = room(), i = T.roomIdx, n = members().length;
    r.slow ? Sound.rainSoft() : Sound.rainNormal();
    if (i > 0) Sound.bellSmall(); else Sound.step();
    const acks = (T.roleAcks || {})[r.id] || {};
    const mine = handledHere().map((m) => m.id);
    app.innerHTML =
      '<section class="room-intro">' + Art.scene(r.scene, 'room-scene') +
      '<div class="sheet paper">' +
      '<p class="room-no">' + esc(r.no) + '　' + esc(r.place) + '</p>' +
      '<h2 class="room-title">' + esc(r.title) + '</h2>' + (r.slow ? clocks() : '') +
      '<p class="intro">' + esc(r.intro) + '</p>' +
      '<p class="skills">' + r.skills.map((s) => '<span>' + esc(s) + '</span>').join('') + '</p>' +
      (r.paragraphs.length ? '<div class="para-sum"><p class="ps-head">這一關的手稿：第 ' + paraRange(r.paragraphs) + ' 段（請翻開課本 ' + esc(D.paragraphs[r.paragraphs[0]].page) + '）</p>' +
        r.paragraphs.map((p) => '<p><b>' + p + '</b>' + esc(D.paragraphs[p].summary) + '</p>').join('') + '</div>' : '') +
      '<h3 class="duty-head">本關分工</h3><div class="duties">' + members().map((m, mi) => {
        const rs = rolesOf(i, mi, n);
        const count = r.tasks.filter((t) => rs.includes(t.role)).length;
        const btn = mine.includes(m.id)
          ? '<button type="button" class="btn ' + (acks[m.id] ? 'ghost' : 'soft') + ' ack" data-m="' + m.id + '">' + (acks[m.id] ? '已確認' : (m.id === dev.memberId ? '我知道了' : '代' + esc(m.name) + '確認')) + '</button>'
          : '<p class="muted small">' + (acks[m.id] ? '已確認' : '等他在自己的手機上確認') + '</p>';
        return '<div class="duty' + (acks[m.id] ? ' acked' : '') + (m.id === dev.memberId ? ' mine' : '') + '"><p class="duty-name">' + esc(m.name) + (m.id === dev.memberId ? '（你）' : '') + '</p>' +
          rs.map((x) => '<p class="duty-role"><b>' + x + '　' + esc(roleName(x)) + '</b>' + esc(roleDuty(x)) + '</p>').join('') +
          '<p class="duty-count">本關主責 ' + count + ' 題' + (m.id === dev.memberId ? '，作答畫面在你的手機' : hasDevice(m.id) ? '，作答畫面在' + (m.id === 'm1' ? '隊長手機' : '他自己的手機') : '，用隊長手機作答') + '</p>' + btn + '</div>';
      }).join('') + '</div>' +
      '<p class="muted small">角色確認會計入個人參與分數。</p>' +
      '<div class="row end"><button type="button" class="btn primary" id="startRoom">開始解謎</button></div></div></section>';
    app.querySelectorAll('.ack').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.m;
      Sound.bellSmall();
      write({ roleAcks: { [r.id]: { [id]: acks[id] ? null : now() } } });
    }));
    $('#startRoom').addEventListener('click', () => { if (T.phase === 'intro' && T.roomIdx === i) { Sound.step(); write({ phase: 'task', taskIdx: 0 }); } });
  }

  /* ---------- 手稿與題目共用 ---------- */
  function highlight(text, source) {
    let html = esc(text);
    (source || '').split(/……|｜|／|。/).map((s) => s.replace(/^[甲乙]、[^：]*：/, '').trim()).filter((s) => s.length >= 6).forEach((piece) => {
      const e = esc(piece);
      if (html.includes(e)) html = html.replace(e, '<mark>' + e + '</mark>');
    });
    return html;
  }
  function manuscript(r, task, open) {
    if (r.boss) {
      const b = D.bossText;
      return '<details class="manuscript boss" open><summary>陌生文本〈' + esc(b.title) + '〉</summary>' +
        b.paragraphs.map((p, i) => '<p><span class="pn">' + (i + 1) + '</span>' + highlight(p, task.sourceText) + '</p>').join('') +
        '<p class="muted small">' + esc(b.note) + '</p></details>';
    }
    return '<details class="manuscript"' + (open ? ' open' : '') + '><summary>手稿：第 ' + paraRange(r.paragraphs) + ' 段（課本 ' + esc(D.paragraphs[r.paragraphs[0]].page) + '）</summary>' +
      r.paragraphs.map((p) => {
        const d = D.paragraphs[p];
        return '<p><span class="pn">' + p + '</span>' + (d.text ? highlight(d.text, task.sourceText) : esc(d.summary)) + '</p>';
      }).join('') +
      (r.paragraphs.some((p) => !D.paragraphs[p].text) ? '<p class="muted small">以上是摘要。作答時請對照課本原文。</p>' : '') + '</details>';
  }
  function leadLabel(task) {
    const owner = ownerOf(task), a = member(activeId());
    return '本題主責　' + task.role + ' ' + roleName(task.role) + '｜' + (owner ? owner.name : '') +
      (a && owner && a.id !== owner.id ? '（由 ' + a.name + ' 的手機操作）' : '');
  }

  /* ---------- 作答畫面：只出現在主責者的手機 ---------- */
  function taskScreen() {
    top();
    const r = room(), ri = T.roomIdx, ti = T.taskIdx, task = curTask();
    if (!T.now || T.now.taskId !== task.id || T.now.byId !== dev.memberId) {
      write({ now: { room: r.id, taskId: task.id, role: task.role, at: now(), byId: dev.memberId, by: me().name } });
    }
    const last = ti === r.tasks.length - 1;
    app.innerHTML =
      '<section class="task-screen">' + Art.scene(r.scene, 'mini') +
      '<div class="sheet paper">' +
      '<p class="your-turn">輪到你了，' + esc(me().name) + '！大家把手機靠過來一起讀題、討論，由你按下答案。</p>' +
      '<p class="task-count">' + esc(r.no) + '　' + esc(r.title) + '　任務 ' + (ti + 1) + '／' + r.tasks.length + '</p>' +
      (r.slow ? clocks() : '') + manuscript(r, task, ti === 0) + '<div id="taskMount"></div></div></section>';
    Sound.bellSmall();
    Tasks.mount($('#taskMount'), task, {
      roleLabel: () => leadLabel(task), sfx,
      nextLabel: last ? '完成這一關' : '下一個任務',
      onSearch(entry) { write({ search: { [entry.at + '_' + dev.memberId]: Object.assign({ task: task.id, by: me().name }, entry) } }); },
      onFinish(res) {
        const owner = ownerOf(task);
        Object.assign(res, { byId: dev.memberId, by: me().name, ownerId: owner ? owner.id : '', role: task.role });
        const streak = res.wrongs === 0 && !res.revealed ? (T.streak || 0) + 1 : 0;
        const merged = Object.assign({}, T.results, { [task.id]: res });
        heardResult = task.id;
        write({ results: { [task.id]: res }, streak, teamScore: Scoring.compute(merged).teamScore });
        return { streak };
      },
      async onNext() {
        await fresh();
        if (T.roomIdx !== ri || T.taskIdx !== ti || T.phase !== 'task') return;
        if (last) write({ phase: 'roomDone', roomsDone: (T.roomsDone || []).filter((x) => x !== r.id).concat(r.id), takeover: null });
        else write({ taskIdx: ti + 1, takeover: null });
      }
    });
  }

  /* ---------- 觀看畫面：其他人的手機 ---------- */
  function watchScreen() {
    top();
    const r = room(), task = curTask(), a = member(activeId());
    const res = (T.results || {})[task.id];
    const myRoles = rolesOf(T.roomIdx, members().indexOf(me()), members().length);
    const note = myRoles.includes('C') && task.role === 'C' ? '這一題需要查證，你可以用自己的手機搜尋，再把結果告訴 ' + a.name + '。'
      : myRoles.includes(task.role) ? '這一題是你的角色，但作答畫面在 ' + a.name + ' 的手機。'
        : '你的角色：' + myRoles.map((x) => x + ' ' + roleName(x)).join('、') + '。' + myRoles.map(roleDuty).join('');
    let body = '';
    if (res) {
      if (heardResult !== task.id) { heardResult = task.id; if (!res.revealed) Sound.right(T.streak || 0); else Sound.wrong(); }
      body = '<div class="after-card' + (res.revealed ? ' revealed' : ' win') + '"><p class="verdict"><span class="v-main">' + (res.revealed ? '答案揭曉' : '答對了！') + '</span>' +
        '<span class="v-pts">本題得分 ' + res.earned + '／' + res.max + '</span></p><p class="exp">' + esc(task.explanation) + '</p>' +
        '<p class="strat">閱讀策略　' + esc(task.strategy) + '</p></div>' +
        (task.afterNote ? '<div class="name-card"><p class="nc-title">' + esc(task.afterNote.title) + '</p><p>' + esc(task.afterNote.body) + '</p></div>' : '') +
        '<p class="muted small">等 ' + esc(a.name) + ' 按下「' + (T.taskIdx === r.tasks.length - 1 ? '完成這一關' : '下一個任務') + '」。</p>';
    } else {
      body = '<h2 class="q">' + esc(task.question) + '</h2>' +
        (task.sourceText && task.sourceText.length > 6 ? '<blockquote class="src">' + esc(task.sourceText) + '</blockquote>' : '') +
        (task.clues ? '<ul class="clues">' + task.clues.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '') +
        (task.type === 'mcq' ? '<ol class="watch-opts">' + task.options.map((o) => '<li>' + esc(o.text) + '</li>').join('') + '</ol>' : '') +
        '<p class="muted small">題目和手稿都在你的手機上，可以一起讀、一起找證據，最後由 ' + esc(a.name) + ' 按下答案。</p>' +
        '<button type="button" class="btn link" id="takeover">' + esc(a.name) + ' 的手機沒反應？由我接手這一題</button>';
    }
    app.innerHTML =
      '<section class="task-screen watching">' + Art.scene(r.scene, 'mini') +
      '<div class="sheet paper">' +
      '<div class="watch-banner"><p class="watch-who">現在由 <b>' + esc(a.name) + '</b> 作答</p><p>' + esc(leadLabel(task)) + '</p></div>' +
      '<p class="task-count">' + esc(r.no) + '　' + esc(r.title) + '　任務 ' + (T.taskIdx + 1) + '／' + r.tasks.length + '</p>' +
      '<p class="watch-note">' + esc(note) + '</p>' +
      (r.slow ? clocks() : '') + manuscript(r, task, true) + body + '</div></section>';
    const tk = $('#takeover');
    if (tk) tk.addEventListener('click', () => {
      if (!confirm('由你的手機接手這一題？' + a.name + ' 的畫面會改成觀看。')) return;
      write({ takeover: { taskId: task.id, memberId: dev.memberId, at: now() } });
    });
  }

  /* ---------- 過關 ---------- */
  function roomDone() {
    top();
    const r = room(), i = T.roomIdx;
    const sc = Scoring.compute(T.results).rooms[r.boss ? 'boss' : r.id] || { earned: 0, max: 0 };
    const isLastStory = r.id === 'r6';
    if (isLastStory) Sound.bellsFull(); else Sound.paper();
    const nextRoom = D.rooms[i + 1];
    const who = {};
    Object.values(T.results || {}).filter((x) => r.tasks.some((t) => t.id === x.id)).forEach((x) => { who[x.by || '隊長'] = (who[x.by || '隊長'] || 0) + 1; });
    app.innerHTML =
      '<section class="room-done">' + Art.scene(r.scene, 'room-scene') +
      '<div class="sheet paper">' +
      (r.boss
        ? '<h2 class="room-title">挑戰完成</h2><p class="intro">你們把六關學到的方法，帶進了一篇沒讀過的文章。</p>'
        : '<div class="restored"><p class="restored-label">手稿拼回</p><p class="restored-paras">' + r.paragraphs.map((p) => '<span>第 ' + p + ' 段</span>').join('') + '</p></div>' +
          '<h2 class="room-title">' + esc(r.title) + '　完成</h2>' +
          (isLastStory ? '<p class="intro">遠方近方的鐘聲齊響。五點半，十二段手稿全部拼回；有一滴雨，落在錶面上。</p>' : '')) +
      '<p class="room-score">本關得分 <b>' + sc.earned + '</b>／' + sc.max + '</p>' +
      '<p class="muted small">本關作答：' + Object.keys(who).map((k) => esc(k) + ' ' + who[k] + ' 題').join('、') + '</p>' +
      '<div class="name-card"><p class="nc-title">這一關帶走的方法</p><p>' + esc(r.strategyCard) + '</p></div>' +
      '<div class="row end"><button type="button" class="btn primary" id="nextRoom">' +
      (nextRoom ? (nextRoom.boss ? '打開最後一道門：陌生文本挑戰' : '前往 ' + esc(nextRoom.no) + '　' + esc(nextRoom.title)) : '查看閱讀能力雷達') +
      '</button></div></div></section>';
    $('#nextRoom').addEventListener('click', async () => {
      await fresh();
      if (T.stage !== 'play' || T.phase !== 'roomDone' || T.roomIdx !== i) return;
      if (nextRoom) write({ roomIdx: i + 1, taskIdx: 0, phase: 'intro', takeover: null });
      else write({ stage: 'results', finishedAt: T.finishedAt || now() });
    });
  }

  /* ---------- 閱讀能力雷達 ---------- */
  function results() {
    top();
    const sc = Scoring.compute(T.results);
    app.innerHTML =
      '<section class="sheet paper results">' +
      '<h2 class="sheet-title">閱讀能力雷達</h2>' +
      '<p class="muted">' + esc(T.name) + '　遊戲時間 ' + fmtTime((T.finishedAt || now()) - T.startedAt) + '</p>' +
      '<div class="radar-wrap">' + Tasks.radar(sc.abilities, D.abilities) + '</div>' +
      '<p class="radar-comment">' + esc(Scoring.comment(sc.abilities)) + '</p>' +
      '<div class="score-line"><span>團隊遊戲得分</span><b>' + sc.teamScore + '</b><span>／100</span></div>' +
      '<p class="muted small">錯誤 ' + sc.wrongs + ' 次，使用提示 ' + sc.hints + ' 次。</p>' +
      '<div class="row end"><button type="button" class="btn primary" id="toPeer">' + (members().length > 1 ? '進行同儕評估' : '查看成績') + '</button></div></section>';
    $('#toPeer').addEventListener('click', async () => {
      if (members().length === 1) {
        await Store.saveEval(T.id, 'm1', { shares: { m1: 100 } });
        return settle();
      }
      write({ stage: 'peer' });
    });
  }

  /* ---------- 同儕評估：每個人在自己的手機上填 ---------- */
  function evalForm(container, evaluator, onDone) {
    const list = members(), n = list.length;
    const base = Math.floor(100 / n / 5) * 5;
    const val = {}; list.forEach((m, i) => { val[m.id] = i === n - 1 ? 100 - base * (n - 1) : base; });
    const total = () => Object.values(val).reduce((a, b) => a + b, 0);
    container.innerHTML =
      '<div class="eval">' +
      '<p class="eval-who">評估人：' + esc(evaluator.name) + '</p>' +
      '<p>本次任務中，你認為各成員實際貢獻的比例是多少？總和必須是 100%。</p>' +
      list.map((m) => '<label class="slider-row"><span class="s-name">' + esc(m.name) + (m.id === evaluator.id ? '（自己）' : '') + '</span>' +
        '<input type="range" min="0" max="100" step="5" value="' + val[m.id] + '" data-m="' + m.id + '" aria-label="' + esc(m.name) + '的貢獻比例">' +
        '<b class="s-val">' + val[m.id] + '%</b></label>').join('') +
      '<p class="eval-total ok">總和 100%</p>' +
      '<p class="muted small">你填的比例只用來計算全組平均，其他同學看不到你給的數字。</p>' +
      '<div class="row end"><button type="button" class="btn primary" id="sendEval">送出評估</button></div></div>';
    const paint = () => {
      const t = total(), tt = container.querySelector('.eval-total');
      tt.className = 'eval-total ' + (t === 100 ? 'ok' : 'bad');
      tt.textContent = '總和 ' + t + '%' + (t === 100 ? '' : '，請調整到 100%');
      container.querySelector('#sendEval').disabled = t !== 100;
    };
    container.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => {
      val[r.dataset.m] = +r.value; r.parentNode.querySelector('.s-val').textContent = r.value + '%'; paint();
    }));
    container.querySelector('#sendEval').addEventListener('click', async (e) => {
      e.target.disabled = true;
      try { await Store.saveEval(T.id, evaluator.id, { shares: Object.assign({}, val) }); onDone(); }
      catch (err) { e.target.disabled = false; toast('送出失敗，請再試一次。'); }
    });
  }

  function peer() {
    top();
    const done = new Set(evals.map((e) => e.evaluatorId));
    const all = members().every((m) => done.has(m.id));
    const here = handledHere().filter((m) => !done.has(m.id));
    app.innerHTML =
      '<section class="sheet paper peer">' +
      '<h2 class="sheet-title">同儕評估</h2>' +
      '<p>每一位隊員都在自己的手機上評估一次；沒有加入手機的同學，在隊長手機上填。</p>' +
      '<ul class="peer-status">' + members().map((m) => '<li class="' + (done.has(m.id) ? 'ok' : '') + '"><span>' + esc(m.name) + '</span><b>' + (done.has(m.id) ? '已送出' : '還沒填') + '</b></li>').join('') + '</ul>' +
      '<div id="evalArea"></div>' +
      '<div class="row end">' + (!all && isCaptain() && evals.length ? '<button type="button" class="btn link" id="forceSettle">有人無法填寫，先結算</button>' : '') +
      '<button type="button" class="btn primary" id="settle"' + (all ? '' : ' disabled') + '>' + (all ? '結算成績' : '等全員送出後結算') + '</button></div></section>';
    if (here.length) {
      formOpen = true;
      evalForm($('#evalArea'), here[0], () => { formOpen = false; toast(here[0].name + ' 的評估已送出'); lastKey = ''; route(); });
    }
    $('#settle').addEventListener('click', settle);
    const f = $('#forceSettle');
    if (f) f.addEventListener('click', () => { if (confirm('還有人沒填。未填者不會拿到「完成評估」的分數，確定先結算嗎？')) settle(); });
  }

  async function settle() {
    await fresh();
    const list = await Store.getEvals(T.id);
    const sc = Scoring.compute(T.results);
    const final = Scoring.final(Object.assign({}, T, { teamScore: sc.teamScore }), list);
    write({ final, stage: 'final', teamScore: sc.teamScore, finishedAt: T.finishedAt || now() });
  }

  /* ---------- 成績 ---------- */
  function finalScreen() {
    top();
    const sc = Scoring.compute(T.results), c = CFG.scoring, fin = T.final || {};
    const count = {}; Object.values(T.results || {}).forEach((r) => { if (r.byId) count[r.byId] = (count[r.byId] || 0) + 1; });
    const mine = fin[dev.memberId];
    app.innerHTML =
      '<section class="sheet paper final">' +
      '<h2 class="sheet-title">旅程成績</h2>' +
      (mine ? '<div class="score-line mine"><span>' + esc(me().name) + ' 的最後分數</span><b>' + mine.total + '</b></div>' : '') +
      '<div class="score-line"><span>團隊遊戲得分</span><b>' + sc.teamScore + '</b><span>× ' + c.teamWeight + ' ＝ ' + Scoring.round1(sc.teamScore * c.teamWeight) + '</span></div>' +
      '<h3>全組平均貢獻比例</h3><div class="share-bars">' + members().map((m) => {
        const f = fin[m.id] || { peerAvg: 0 };
        return '<div class="share"><span>' + esc(m.name) + '</span><i style="width:' + f.peerAvg + '%"></i><b>' + f.peerAvg + '%</b></div>';
      }).join('') + '</div>' +
      '<h3>個人成績</h3><div class="table-scroll"><table class="final-t"><thead><tr><th>姓名</th><th>親手作答</th><th>團隊 80%</th><th>角色確認</th><th>同儕貢獻</th><th>完成評估</th><th>個人參與</th><th>最後分數</th></tr></thead><tbody>' +
      members().map((m) => { const f = fin[m.id] || {}; return '<tr><td>' + esc(m.name) + '</td><td>' + (count[m.id] || 0) + ' 題</td><td>' + f.teamPart + '</td><td>' + f.role + '／' + c.rolePart + '</td><td>' + f.peer + '／' + c.peerPart + '</td><td>' + f.eval + '／' + c.evalPart + '</td><td>' + f.personal + '／' + c.personalMax + '</td><td class="big-n">' + f.total + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<p class="muted small">同儕貢獻有保底，最低仍可拿到 ' + Math.round(c.peerPart * c.peerFloor) + ' 分，避免彼此惡意扣分。只顯示全組平均，看不到個別同學給的比例。</p>' +
      '<div class="row end"><button type="button" class="btn ghost" id="radarAgain">再看一次雷達</button><button type="button" class="btn primary" id="endTrip">結束旅程</button></div></section>';
    $('#radarAgain').addEventListener('click', () => { lastKey = ''; results(); });
    $('#endTrip').addEventListener('click', () => {
      if (!confirm('結束後這台手機會回到首頁，成績已經存好。確定嗎？')) return;
      clearDev(); landing();
    });
  }

  /* =========================================================
     啟動與路由
     ========================================================= */
  function hashRoute() {
    if (location.hash === '#teacher') { clearSubs(); topbar(false); document.body.classList.remove('on-landing', 'slow'); return window.Teacher.mount(app); }
    landing();
  }
  async function boot() {
    $('#tb-mute').addEventListener('click', () => { Sound.start(); Sound.toggleMute(); paintMute(); });
    paintMute();
    app.innerHTML = '<section class="sheet paper"><p>雨正在落下……</p></section>';
    await Store.init();
    window.addEventListener('hashchange', hashRoute);
    hashRoute();
  }
  window.Game = { boot, _team: () => T, _dev: () => dev };
  document.addEventListener('DOMContentLoaded', boot);
})();
