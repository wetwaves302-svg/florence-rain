/* =========================================================
   遊戲流程
   隊長裝置：建立小隊 → 六關＋FINAL → 能力雷達 → 同儕評估 → 成績
   隊員裝置：輸入隊伍代碼加入 → 看本關任務、確認角色 → 在自己的裝置做同儕評估
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
  const HOST_KEY = 'frg_host_v1', MEMBER_KEY = 'frg_member_v1';
  const ROLE_IDS = ['A', 'B', 'C', 'D'];
  let S = null, M = null, timer = null, syncTimer = null, unsub = [], onRemote = null;

  /* ---------- 小工具 ---------- */
  const $ = (s, r) => (r || document).querySelector(s);
  const now = () => Date.now();
  const roleName = (id) => (D.roles.find((r) => r.id === id) || {}).name || '';
  const ownerIdx = (roomIdx, roleId, n) => (ROLE_IDS.indexOf(roleId) + roomIdx) % n;
  const rolesOf = (roomIdx, mi, n) => ROLE_IDS.filter((r) => ownerIdx(roomIdx, r, n) === mi);
  const memberName = (m) => m.name;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function fmtTime(ms) { const s = Math.max(0, Math.floor(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function paraRange(ps) { return ps.length ? (ps.length > 1 ? ps[0] + '–' + ps[ps.length - 1] : String(ps[0])) : ''; }
  function clearSubs() { unsub.forEach((f) => { try { f(); } catch (e) { /* 忽略 */ } }); unsub = []; onRemote = null; }
  function top() { document.body.classList.remove('on-landing'); window.scrollTo({ top: 0, behavior: 'auto' }); }
  const sfx = { right: (n) => Sound.right(n), wrong: () => Sound.wrong(), step: () => Sound.step(), place: () => Sound.place() };

  function saveHost() { try { localStorage.setItem(HOST_KEY, JSON.stringify(S)); } catch (e) { /* 忽略 */ } }
  function loadHost() { try { const s = JSON.parse(localStorage.getItem(HOST_KEY)); return s && s.stage !== 'done' ? s : null; } catch (e) { return null; } }
  function loadMember() { try { return JSON.parse(localStorage.getItem(MEMBER_KEY)); } catch (e) { return null; } }

  function teamDoc() {
    const sc = Scoring.compute(S.results);
    return {
      id: S.teamId, code: S.code, name: S.name, size: S.members.length, members: S.members, session: S.session, mode: Store.mode(),
      createdAt: S.createdAt, startedAt: S.startedAt || null, finishedAt: S.finishedAt || null, stage: S.stage,
      roomIdx: S.roomIdx, taskIdx: S.taskIdx, roomsDone: S.roomsDone, results: S.results, searchLog: S.searchLog,
      roleAcks: S.roleAcks, now: S.now || null, abilities: sc.abilities, roomScores: sc.rooms, teamScore: sc.teamScore,
      earned: sc.earned, totals: { wrongs: sc.wrongs, hints: sc.hints, hintClicks: S.hintClicks || 0 }, final: S.final || null
    };
  }
  function sync(immediate) {
    saveHost();
    clearTimeout(syncTimer);
    const go = () => Store.saveTeam(S.teamId, teamDoc()).catch((e) => { console.warn(e); toast('雲端同步暫時失敗，進度已先存在這台裝置。'); });
    if (immediate) return go();
    syncTimer = setTimeout(go, 250);
  }

  /* ---------- 上方工具列：手稿條、時間、分數、靜音 ---------- */
  function topbar(show) {
    const tb = $('#topbar');
    tb.hidden = !show;
    document.body.classList.toggle('has-topbar', !!show);
    if (!show) { clearInterval(timer); return; }
    const doneParas = new Set();
    D.rooms.forEach((r) => { if ((S.roomsDone || []).includes(r.id)) r.paragraphs.forEach((p) => doneParas.add(p)); });
    const room = D.rooms[S.roomIdx] || D.rooms[0];
    $('#tb-room').textContent = room.no + '　' + room.title;
    $('#tb-strip').innerHTML = Array.from({ length: 12 }, (_, i) => '<span class="frag-bit' + (doneParas.has(i + 1) ? ' got' : '') + (room.paragraphs.includes(i + 1) ? ' here' : '') + '" title="第' + (i + 1) + '段">' + (i + 1) + '</span>').join('');
    $('#tb-score').textContent = Scoring.compute(S.results).earned + ' 分';
    const tick = () => { $('#tb-time').textContent = fmtTime((S.finishedAt || now()) - (S.startedAt || now())); };
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
    clearSubs(); topbar(false); document.body.classList.add('on-landing');
    const saved = loadHost(), mem = loadMember();
    const modeText = Store.mode() === 'firebase'
      ? '雲端模式：成績會存到教師後台，隊員可以用自己的裝置加入。'
      : '單機模式：資料只存在這台裝置。要讓多台裝置同步，請老師在 js/config.js 填入 Firebase 設定。' + (Store.error() ? '（Firebase 連線失敗：' + esc(Store.error()) + '）' : '');
    app.innerHTML =
      '<section class="landing">' + Art.scene('alley', 'hero') +
      '<div class="hero-text paper">' +
      '<p class="lesson">' + esc(D.meta.lesson) + '</p>' +
      '<h1>' + esc(D.meta.title) + '<span>' + esc(D.meta.subtitle) + '</span></h1>' +
      '<p class="en">' + esc(D.meta.english) + '</p>' +
      '<p class="hero-credit">國立花蓮高工　柯貞伊老師設計</p>' +
      '<p class="story">' + esc(D.meta.story) + '</p>' +
      '<div class="cta">' +
      '<button type="button" class="btn primary big" id="go">開始旅程</button>' +
      (saved ? '<button type="button" class="btn ghost" id="resume">繼續「' + esc(saved.name) + '」的旅程</button>' : '') +
      '<button type="button" class="btn ghost" id="join">我是隊員，用自己的裝置加入</button>' +
      (mem ? '<button type="button" class="btn link" id="rejoin">回到隊員畫面</button>' : '') +
      '</div><p class="mode small">' + modeText + '</p></div>' +
      '<footer class="foot"><a href="#teacher">教師後台</a></footer></section>';
    $('#go').addEventListener('click', () => { Sound.start(); Sound.step(); setup(); });
    if (saved) $('#resume').addEventListener('click', () => { Sound.start(); S = saved; resume(); });
    $('#join').addEventListener('click', join);
    if (mem) $('#rejoin').addEventListener('click', () => { M = mem; memberLive(); });
  }

  /* =========================================================
     組隊
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
        '<p class="muted">每位隊員都要輸入班級、座號、姓名。</p>' +
        '<div class="size-pick" role="radiogroup" aria-label="人數">' + [1, 2, 3, 4].map((n) =>
          '<button type="button" class="size-btn' + (draft.size === n ? ' on' : '') + '" data-n="' + n + '" aria-pressed="' + (draft.size === n) + '">' + (n === 1 ? '單人' : n + ' 人') + '</button>').join('') + '</div>' +
        '<div class="member-forms">' + draft.members.map((m, i) =>
          '<fieldset class="member-f"><legend>隊員 ' + (i + 1) + (i === 0 ? '（拿這台裝置的人）' : '') + '</legend>' +
          '<label><span>班級</span><input data-i="' + i + '" data-k="cls" value="' + esc(m.cls) + '" placeholder="電子三甲" autocomplete="off"></label>' +
          '<label class="seat"><span>座號</span><input data-i="' + i + '" data-k="seat" value="' + esc(m.seat) + '" inputmode="numeric" placeholder="05" autocomplete="off"></label>' +
          '<label><span>姓名</span><input data-i="' + i + '" data-k="name" value="' + esc(m.name) + '" placeholder="王小明" autocomplete="off"></label></fieldset>').join('') + '</div>' +
        '<label class="team-name"><span>小隊名稱</span><span class="row"><input id="tname" value="' + esc(draft.name) + '" maxlength="16"><button type="button" class="btn ghost" id="dice">換一個</button></span></label>' +
        '<p class="err" id="err" aria-live="polite"></p>' +
        '<div class="row end"><button type="button" class="btn ghost" id="back">返回</button><button type="button" class="btn primary" id="create">建立小隊</button></div></section>';
      app.querySelectorAll('.size-btn').forEach((b) => b.addEventListener('click', () => { draft.size = +b.dataset.n; render(); }));
      app.querySelectorAll('.member-f input').forEach((inp) => inp.addEventListener('input', () => {
        draft.members[+inp.dataset.i][inp.dataset.k] = inp.value.trim();
        if (inp.dataset.k === 'cls' && inp.dataset.i === '0') {
          app.querySelectorAll('input[data-k="cls"]').forEach((o) => { if (o !== inp && !o.value) { o.placeholder = inp.value || '電子三甲'; } });
        }
      }));
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
      const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
      S = {
        teamId: code + '-' + now().toString(36), code, name: draft.name || D.teamNames[0], session: CFG.sessionTag || '',
        members: draft.members.map((m, i) => ({ id: 'm' + (i + 1), cls: m.cls, seat: m.seat.padStart(2, '0'), name: m.name })),
        createdAt: now(), stage: 'ready', roomIdx: 0, taskIdx: 0, roomsDone: [], results: {}, searchLog: [], roleAcks: {}, hintClicks: 0
      };
      $('#create').disabled = true;
      await sync(true);
      ready();
    }
    render();
  }

  function ready() {
    top(); topbar(false); listenRemote();
    const cloud = Store.mode() === 'firebase';
    app.innerHTML =
      '<section class="sheet paper ready">' +
      '<h2 class="sheet-title">' + esc(S.name) + '</h2>' +
      '<p class="code-box">隊伍代碼<b>' + esc(S.code) + '</b></p>' +
      (cloud
        ? '<p>其他隊員請用自己的手機打開同一個網址，按「我是隊員」，輸入這組代碼。自己的裝置會顯示每一關的角色，最後也在自己的裝置上做同儕評估。</p>'
        : '<p>目前是單機模式：全隊在這台裝置上輪流操作，同儕評估也在這台裝置依序填寫。</p>') +
      '<h3>四種角色，每一關輪替</h3><ul class="role-list">' + D.roles.map((r) => '<li><b>' + r.id + '　' + esc(r.name) + '</b>' + esc(r.duty) + '</li>').join('') + '</ul>' +
      '<p class="muted small">1 人全部包辦；2 人各兼兩種；3 人時有一人兼任；4 人一人一職。每題上方會寫出「本題主責」是誰。</p>' +
      '<div class="row end"><button type="button" class="btn primary" id="depart">出發</button></div></section>';
    $('#depart').addEventListener('click', () => {
      S.stage = 'play'; S.startedAt = S.startedAt || now(); sync();
      roomIntro(0);
    });
  }

  function listenRemote() {
    clearSubs();
    if (Store.mode() !== 'firebase') return;
    unsub.push(Store.subscribeTeam(S.teamId, (doc) => {
      if (!doc) return;
      let changed = false;
      Object.keys(doc.roleAcks || {}).forEach((rid) => {
        S.roleAcks[rid] = S.roleAcks[rid] || {};
        Object.keys(doc.roleAcks[rid]).forEach((mid) => { if (!S.roleAcks[rid][mid]) { S.roleAcks[rid][mid] = doc.roleAcks[rid][mid]; changed = true; } });
      });
      if (changed) { saveHost(); onRemote && onRemote(); }
    }));
  }

  function resume() {
    listenRemote();
    if (S.stage === 'ready') return ready();
    if (S.stage === 'results') return results();
    if (S.stage === 'peer') return peer();
    if (S.stage === 'final') return finalScreen();
    const room = D.rooms[S.roomIdx];
    while (room && S.taskIdx < room.tasks.length && S.results[room.tasks[S.taskIdx].id]) S.taskIdx++;
    if (!room) return results();
    if (S.taskIdx >= room.tasks.length) return roomDone();
    if (S.taskIdx === 0) return roomIntro(S.roomIdx);
    return taskScreen();
  }

  /* =========================================================
     關卡入口：場景、手稿摘要、本關分工
     ========================================================= */
  function clocks() {
    return '<div class="clocks"><div><span>翡冷翠</span><b>17:30</b></div><div><span>臺北</span><b>23:30</b></div></div>';
  }
  function roomIntro(i) {
    top();
    S.roomIdx = i; S.taskIdx = 0; sync();
    const room = D.rooms[i];
    document.body.classList.toggle('slow', !!room.slow);
    room.slow ? Sound.rainSoft() : Sound.rainNormal();
    if (i > 0) Sound.bellSmall(); else Sound.step();
    topbar(true);
    const n = S.members.length;
    S.roleAcks[room.id] = S.roleAcks[room.id] || {};
    function render() {
      const acks = S.roleAcks[room.id];
      app.innerHTML =
        '<section class="room-intro">' + Art.scene(room.scene, 'room-scene') +
        '<div class="sheet paper">' +
        '<p class="room-no">' + esc(room.no) + '　' + esc(room.place) + '</p>' +
        '<h2 class="room-title">' + esc(room.title) + '</h2>' + (room.slow ? clocks() : '') +
        '<p class="intro">' + esc(room.intro) + '</p>' +
        '<p class="skills">' + room.skills.map((s) => '<span>' + esc(s) + '</span>').join('') + '</p>' +
        (room.paragraphs.length ? '<div class="para-sum"><p class="ps-head">這一關的手稿：第 ' + paraRange(room.paragraphs) + ' 段（請翻開課本 ' + esc(D.paragraphs[room.paragraphs[0]].page) + '）</p>' +
          room.paragraphs.map((p) => '<p><b>' + p + '</b>' + esc(D.paragraphs[p].summary) + '</p>').join('') + '</div>' : '') +
        '<h3 class="duty-head">本關分工</h3><div class="duties">' + S.members.map((m, mi) => {
          const rs = rolesOf(i, mi, n);
          return '<div class="duty' + (acks[m.id] ? ' acked' : '') + '"><p class="duty-name">' + esc(m.name) + '</p>' +
            rs.map((r) => '<p class="duty-role"><b>' + r + '　' + esc(roleName(r)) + '</b>' + esc(D.roles.find((x) => x.id === r).duty) + '</p>').join('') +
            '<button type="button" class="btn ' + (acks[m.id] ? 'ghost' : 'soft') + ' ack" data-m="' + m.id + '">' + (acks[m.id] ? '已確認' : '我是' + esc(m.name) + '，我知道了') + '</button></div>';
        }).join('') + '</div>' +
        '<p class="muted small">角色確認會計入個人參與分數。隊員也可以在自己的裝置上確認。</p>' +
        '<div class="row end"><button type="button" class="btn primary" id="startRoom">開始解謎</button></div></div></section>';
      app.querySelectorAll('.ack').forEach((b) => b.addEventListener('click', () => {
        const id = b.dataset.m;
        if (acks[id]) delete acks[id]; else acks[id] = now();
        Sound.bellSmall(); sync(); render();
      }));
      $('#startRoom').addEventListener('click', () => { Sound.step(); taskScreen(); });
    }
    onRemote = () => { if ($('#startRoom')) render(); };
    render();
  }

  /* =========================================================
     任務畫面
     ========================================================= */
  function highlight(text, source) {
    let html = esc(text);
    (source || '').split(/……|｜|／|。/).map((s) => s.replace(/^[甲乙]、[^：]*：/, '').trim()).filter((s) => s.length >= 6).forEach((piece) => {
      const e = esc(piece);
      if (html.includes(e)) html = html.replace(e, '<mark>' + e + '</mark>');
    });
    return html;
  }
  function manuscript(room, task) {
    if (room.boss) {
      const b = D.bossText;
      return '<details class="manuscript boss" open><summary>陌生文本〈' + esc(b.title) + '〉</summary>' +
        b.paragraphs.map((p, i) => '<p><span class="pn">' + (i + 1) + '</span>' + highlight(p, task.sourceText) + '</p>').join('') +
        '<p class="muted small">' + esc(b.note) + '</p></details>';
    }
    const open = S.taskIdx === 0 ? ' open' : '';
    return '<details class="manuscript"' + open + '><summary>手稿：第 ' + paraRange(room.paragraphs) + ' 段（課本 ' + esc(D.paragraphs[room.paragraphs[0]].page) + '）</summary>' +
      room.paragraphs.map((p) => {
        const d = D.paragraphs[p];
        return d.text ? '<p><span class="pn">' + p + '</span>' + highlight(d.text, task.sourceText) + '</p>'
          : '<p><span class="pn">' + p + '</span>' + esc(d.summary) + '</p>';
      }).join('') +
      (room.paragraphs.some((p) => !D.paragraphs[p].text) ? '<p class="muted small">以上是摘要。作答時請對照課本原文。</p>' : '') + '</details>';
  }
  function roleLabel(roleId) {
    const n = S.members.length;
    const m = S.members[ownerIdx(S.roomIdx, roleId, n)];
    return '本題主責　' + roleId + ' ' + roleName(roleId) + '｜' + (m ? memberName(m) : '');
  }
  function taskScreen() {
    top();
    const room = D.rooms[S.roomIdx];
    const task = room.tasks[S.taskIdx];
    S.now = { room: room.id, taskId: task.id, role: task.role, at: now() };
    sync(); topbar(true);
    const last = S.taskIdx === room.tasks.length - 1;
    app.innerHTML =
      '<section class="task-screen">' + Art.scene(room.scene, 'mini') +
      '<div class="sheet paper">' +
      '<p class="task-count">' + esc(room.no) + '　' + esc(room.title) + '　任務 ' + (S.taskIdx + 1) + '／' + room.tasks.length + '</p>' +
      (room.slow ? clocks() : '') + manuscript(room, task) + '<div id="taskMount"></div></div></section>';
    Tasks.mount($('#taskMount'), task, {
      roleLabel, sfx,
      nextLabel: last ? '完成這一關' : '下一個任務',
      onHint() { S.hintClicks = (S.hintClicks || 0) + 1; saveHost(); },
      onSearch(entry) { S.searchLog.push(Object.assign({ task: task.id }, entry)); saveHost(); },
      onFinish(res) {
        S.results[task.id] = res;
        S.streak = res.wrongs === 0 && !res.revealed ? (S.streak || 0) + 1 : 0;
        sync(); topbar(true);
        return { streak: S.streak };
      },
      onNext() {
        S.taskIdx++;
        if (S.taskIdx >= room.tasks.length) roomDone(); else { Sound.step(); taskScreen(); }
      }
    });
  }

  /* =========================================================
     過關：手稿拼回
     ========================================================= */
  function roomDone() {
    top();
    const room = D.rooms[S.roomIdx];
    if (!S.roomsDone.includes(room.id)) S.roomsDone.push(room.id);
    sync(); topbar(true);
    const sc = Scoring.compute(S.results).rooms[room.boss ? 'boss' : room.id] || { earned: 0, max: 0 };
    const isLastStory = room.id === 'r6';
    if (isLastStory) Sound.bellsFull(); else Sound.paper();
    const nextRoom = D.rooms[S.roomIdx + 1];
    app.innerHTML =
      '<section class="room-done">' + Art.scene(room.scene, 'room-scene') +
      '<div class="sheet paper">' +
      (room.boss
        ? '<h2 class="room-title">挑戰完成</h2><p class="intro">你們把六關學到的方法，帶進了一篇沒讀過的文章。</p>'
        : '<div class="restored"><p class="restored-label">手稿拼回</p><p class="restored-paras">' + room.paragraphs.map((p) => '<span>第 ' + p + ' 段</span>').join('') + '</p></div>' +
          '<h2 class="room-title">' + esc(room.title) + '　完成</h2>' +
          (isLastStory ? '<p class="intro">遠方近方的鐘聲齊響。五點半，十二段手稿全部拼回；有一滴雨，落在錶面上。</p>' : '')) +
      '<p class="room-score">本關得分 <b>' + sc.earned + '</b>／' + sc.max + '</p>' +
      '<div class="name-card"><p class="nc-title">這一關帶走的方法</p><p>' + esc(room.strategyCard) + '</p></div>' +
      '<div class="row end"><button type="button" class="btn primary" id="nextRoom">' +
      (nextRoom ? (nextRoom.boss ? '打開最後一道門：陌生文本挑戰' : '前往 ' + esc(nextRoom.no) + '　' + esc(nextRoom.title)) : '查看閱讀能力雷達') +
      '</button></div></div></section>';
    $('#nextRoom').addEventListener('click', () => {
      if (nextRoom) roomIntro(S.roomIdx + 1); else { S.stage = 'results'; S.finishedAt = S.finishedAt || now(); sync(true); results(); }
    });
  }

  /* =========================================================
     閱讀能力雷達
     ========================================================= */
  function results() {
    top(); topbar(true); document.body.classList.remove('slow');
    const sc = Scoring.compute(S.results);
    app.innerHTML =
      '<section class="sheet paper results">' +
      '<h2 class="sheet-title">閱讀能力雷達</h2>' +
      '<p class="muted">' + esc(S.name) + '　遊戲時間 ' + fmtTime((S.finishedAt || now()) - S.startedAt) + '</p>' +
      '<div class="radar-wrap">' + Tasks.radar(sc.abilities, D.abilities) + '</div>' +
      '<p class="radar-comment">' + esc(Scoring.comment(sc.abilities)) + '</p>' +
      '<div class="score-line"><span>團隊遊戲得分</span><b>' + sc.teamScore + '</b><span>／100</span></div>' +
      '<p class="muted small">錯誤 ' + sc.wrongs + ' 次，使用提示 ' + sc.hints + ' 次。</p>' +
      '<div class="row end"><button type="button" class="btn primary" id="toPeer">' + (S.members.length > 1 ? '進行同儕評估' : '查看成績') + '</button></div></section>';
    $('#toPeer').addEventListener('click', async () => {
      if (S.members.length === 1) {
        await Store.saveEval(S.teamId, S.members[0].id, { shares: { [S.members[0].id]: 100 } });
        return settle();
      }
      S.stage = 'peer'; sync(true); peer();
    });
  }

  /* =========================================================
     同儕評估
     ========================================================= */
  function evalForm(container, evaluator, members, onDone) {
    const n = members.length;
    const base = Math.floor(100 / n / 5) * 5;
    const val = {}; members.forEach((m, i) => { val[m.id] = i === n - 1 ? 100 - base * (n - 1) : base; });
    function render() {
      const total = Object.values(val).reduce((a, b) => a + b, 0);
      container.innerHTML =
        '<div class="eval">' +
        '<p class="eval-who">評估人：' + esc(evaluator.name) + '</p>' +
        '<p>本次任務中，你認為各成員實際貢獻的比例是多少？總和必須是 100%。</p>' +
        members.map((m) => '<label class="slider-row"><span class="s-name">' + esc(m.name) + (m.id === evaluator.id ? '（自己）' : '') + '</span>' +
          '<input type="range" min="0" max="100" step="5" value="' + val[m.id] + '" data-m="' + m.id + '" aria-label="' + esc(m.name) + '的貢獻比例">' +
          '<b class="s-val">' + val[m.id] + '%</b></label>').join('') +
        '<p class="eval-total ' + (total === 100 ? 'ok' : 'bad') + '">總和 ' + total + '%' + (total === 100 ? '' : '，請調整到 100%') + '</p>' +
        '<p class="muted small">你填的比例只用來計算全組平均，其他同學看不到你給的數字。</p>' +
        '<div class="row end"><button type="button" class="btn ghost" id="even">平均分配</button>' +
        '<button type="button" class="btn primary" id="sendEval"' + (total === 100 ? '' : ' disabled') + '>送出評估</button></div></div>';
      container.querySelectorAll('input[type=range]').forEach((r) => r.addEventListener('input', () => {
        val[r.dataset.m] = +r.value;
        r.parentNode.querySelector('.s-val').textContent = r.value + '%';
        const t = Object.values(val).reduce((a, b) => a + b, 0);
        const tt = container.querySelector('.eval-total');
        tt.className = 'eval-total ' + (t === 100 ? 'ok' : 'bad');
        tt.textContent = '總和 ' + t + '%' + (t === 100 ? '' : '，請調整到 100%');
        container.querySelector('#sendEval').disabled = t !== 100;
      }));
      container.querySelector('#even').addEventListener('click', () => {
        members.forEach((m, i) => { val[m.id] = i === n - 1 ? 100 - base * (n - 1) : base; }); render();
      });
      container.querySelector('#sendEval').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try { await Store.saveEval(S ? S.teamId : M.teamId, evaluator.id, { shares: Object.assign({}, val) }); onDone(); }
        catch (err) { e.target.disabled = false; toast('送出失敗，請再試一次。'); }
      });
    }
    render();
  }

  function peer() {
    top(); topbar(true); clearSubs(); listenRemote();
    let evals = [];
    function render() {
      const done = new Set(evals.map((e) => e.evaluatorId));
      const all = S.members.every((m) => done.has(m.id));
      app.innerHTML =
        '<section class="sheet paper peer">' +
        '<h2 class="sheet-title">同儕評估</h2>' +
        '<p>每一位隊員都要各自評估一次。' + (Store.mode() === 'firebase' ? '請在自己的裝置上填寫；沒有裝置的人可以在這台填。' : '請依序在這台裝置上填寫，填的時候請其他人先轉過頭。') + '</p>' +
        '<ul class="peer-status">' + S.members.map((m) => '<li class="' + (done.has(m.id) ? 'ok' : '') + '"><span>' + esc(m.name) + '</span>' +
          (done.has(m.id) ? '<b>已送出</b>' : '<button type="button" class="btn soft fillHere" data-m="' + m.id + '">在這台裝置填寫</button>') + '</li>').join('') + '</ul>' +
        '<div id="evalArea"></div>' +
        '<div class="row end">' + (!all && evals.length ? '<button type="button" class="btn link" id="forceSettle">有人無法填寫，先結算</button>' : '') +
        '<button type="button" class="btn primary" id="settle"' + (all ? '' : ' disabled') + '>結算成績</button></div></section>';
      app.querySelectorAll('.fillHere').forEach((b) => b.addEventListener('click', () => {
        const m = S.members.find((x) => x.id === b.dataset.m);
        app.querySelectorAll('.fillHere').forEach((x) => { x.disabled = true; });
        evalForm($('#evalArea'), m, S.members, () => { toast(m.name + ' 的評估已送出'); refresh(); });
        $('#evalArea').scrollIntoView({ behavior: 'smooth' });
      }));
      $('#settle').addEventListener('click', settle);
      const f = $('#forceSettle');
      if (f) f.addEventListener('click', () => { if (confirm('還有人沒填。未填者不會拿到「完成評估」的分數，確定先結算嗎？')) settle(); });
    }
    async function refresh() { evals = await Store.getEvals(S.teamId); render(); }
    unsub.push(Store.subscribeEvals(S.teamId, (list) => { evals = list; if (!$('#evalArea') || !$('#evalArea').innerHTML) render(); }));
    refresh();
  }

  async function settle() {
    const evals = await Store.getEvals(S.teamId);
    const doc = await Store.getTeam(S.teamId);
    if (doc && doc.roleAcks) { S.roleAcks = Object.assign({}, doc.roleAcks, S.roleAcks); }
    const sc = Scoring.compute(S.results);
    S.final = Scoring.final(Object.assign({}, teamDoc(), { teamScore: sc.teamScore, roleAcks: S.roleAcks }), evals);
    S.stage = 'final'; S.finishedAt = S.finishedAt || now();
    await sync(true);
    finalScreen();
  }

  function finalScreen() {
    top(); topbar(true);
    const sc = Scoring.compute(S.results);
    const c = CFG.scoring;
    const fin = S.final || {};
    app.innerHTML =
      '<section class="sheet paper final">' +
      '<h2 class="sheet-title">旅程成績</h2>' +
      '<div class="score-line"><span>團隊遊戲得分</span><b>' + sc.teamScore + '</b><span>× ' + c.teamWeight + ' ＝ ' + Scoring.round1(sc.teamScore * c.teamWeight) + '</span></div>' +
      '<h3>全組平均貢獻比例</h3><div class="share-bars">' + S.members.map((m) => {
        const f = fin[m.id] || { peerAvg: 0 };
        return '<div class="share"><span>' + esc(m.name) + '</span><i style="width:' + f.peerAvg + '%"></i><b>' + f.peerAvg + '%</b></div>';
      }).join('') + '</div>' +
      '<h3>個人成績</h3><div class="table-scroll"><table class="final-t"><thead><tr><th>姓名</th><th>團隊 80%</th><th>角色確認</th><th>同儕貢獻</th><th>完成評估</th><th>個人參與</th><th>最後分數</th></tr></thead><tbody>' +
      S.members.map((m) => { const f = fin[m.id] || {}; return '<tr><td>' + esc(m.name) + '</td><td>' + f.teamPart + '</td><td>' + f.role + '／' + c.rolePart + '</td><td>' + f.peer + '／' + c.peerPart + '</td><td>' + f.eval + '／' + c.evalPart + '</td><td>' + f.personal + '／' + c.personalMax + '</td><td class="big-n">' + f.total + '</td></tr>'; }).join('') +
      '</tbody></table></div>' +
      '<p class="muted small">同儕貢獻有保底，最低仍可拿到 ' + Math.round(c.peerPart * c.peerFloor) + ' 分，避免彼此惡意扣分。只顯示全組平均，看不到個別同學給的比例。</p>' +
      '<div class="row end"><button type="button" class="btn ghost" id="radarAgain">再看一次雷達</button><button type="button" class="btn primary" id="endTrip">結束旅程，換下一組</button></div></section>';
    $('#radarAgain').addEventListener('click', results);
    $('#endTrip').addEventListener('click', () => {
      if (!confirm('結束後這台裝置會回到首頁，成績已經存好。確定嗎？')) return;
      S.stage = 'done'; sync(true); try { localStorage.removeItem(HOST_KEY); } catch (e) { /* 忽略 */ }
      S = null; landing();
    });
  }

  /* =========================================================
     隊員裝置
     ========================================================= */
  function join() {
    top(); clearSubs(); topbar(false);
    app.innerHTML =
      '<section class="sheet paper join">' +
      '<h2 class="sheet-title">加入小隊</h2>' +
      (Store.mode() !== 'firebase' ? '<p class="warn-box">目前是單機模式，沒辦法跨裝置加入。請全隊使用隊長的裝置；同儕評估也在隊長裝置上依序填寫。</p>' : '') +
      '<label class="code-in"><span>隊伍代碼</span><input id="code" maxlength="4" autocapitalize="characters" autocomplete="off" placeholder="例如 K7QP"></label>' +
      '<p class="err" id="err" aria-live="polite"></p><div id="pick"></div>' +
      '<div class="row end"><button type="button" class="btn ghost" id="back">返回</button><button type="button" class="btn primary" id="find">找小隊</button></div></section>';
    $('#back').addEventListener('click', landing);
    $('#find').addEventListener('click', async () => {
      const t = await Store.findTeamByCode($('#code').value);
      if (!t) { $('#err').textContent = '找不到這組代碼，請確認四個字母數字是否正確。'; return; }
      $('#err').textContent = '';
      $('#pick').innerHTML = '<p>找到「' + esc(t.name) + '」。你是哪一位？</p><div class="pick-list">' +
        t.members.map((m) => '<button type="button" class="btn soft pickme" data-m="' + m.id + '">' + esc(m.cls) + '　' + esc(m.seat) + '　' + esc(m.name) + '</button>').join('') + '</div>';
      app.querySelectorAll('.pickme').forEach((b) => b.addEventListener('click', async () => {
        M = { teamId: t.id, memberId: b.dataset.m };
        try { localStorage.setItem(MEMBER_KEY, JSON.stringify(M)); } catch (e) { /* 忽略 */ }
        await Store.saveTeam(t.id, { joined: { [M.memberId]: now() } });
        memberLive();
      }));
    });
  }

  function memberLive() {
    top(); clearSubs(); topbar(false);
    let team = null, evals = [], formOpen = false;
    function render() {
      if (!team) { app.innerHTML = '<section class="sheet paper"><p>正在讀取小隊資料……</p></section>'; return; }
      const me = team.members.find((m) => m.id === M.memberId);
      const mi = team.members.indexOf(me), n = team.members.length;
      const room = D.rooms[team.roomIdx || 0];
      const acked = team.roleAcks && team.roleAcks[room.id] && team.roleAcks[room.id][me.id];
      const myRoles = rolesOf(team.roomIdx || 0, mi, n);
      let body = '';
      if (team.stage === 'play' || team.stage === 'ready') {
        const task = team.now ? Scoring.allTasks().find((t) => t.id === team.now.taskId) : null;
        const leader = task ? team.members[ownerIdx(team.roomIdx, task.role, n)] : null;
        body = '<p class="room-no">' + esc(room.no) + '　' + esc(room.title) + '</p>' +
          '<h3>本關你的任務</h3>' + myRoles.map((r) => '<p class="duty-role"><b>' + r + '　' + esc(roleName(r)) + '</b>' + esc(D.roles.find((x) => x.id === r).duty) + '</p>').join('') +
          '<button type="button" class="btn ' + (acked ? 'ghost' : 'primary') + '" id="ack"' + (acked ? ' disabled' : '') + '>' + (acked ? '本關角色已確認' : '確認我的角色') + '</button>' +
          (task ? '<div class="now-task"><p class="muted small">隊長裝置目前的任務</p><p>' + esc(task.question) + '</p>' +
            '<p class="role-badge">本題主責　' + task.role + ' ' + esc(roleName(task.role)) + '｜' + esc(leader ? leader.name : '') + (leader && leader.id === me.id ? '（就是你）' : '') + '</p>' +
            (myRoles.includes('C') ? '<p class="muted small">你是搜尋驗證員，可以用這支手機查資料，再把結果告訴大家。</p>' : '') + '</div>' : '');
      } else if (team.stage === 'results') {
        body = '<p>團隊已完成六關與陌生文本挑戰，等隊長按下「進行同儕評估」。</p>';
      } else if (team.stage === 'peer') {
        const mine = evals.some((e) => e.evaluatorId === me.id);
        body = mine ? '<p>你的評估已送出，等其他隊員完成。</p>' : '<div id="evalArea"></div>';
      } else if (team.stage === 'final' || team.stage === 'done') {
        const f = (team.final || {})[me.id];
        body = f ? '<div class="score-line"><span>你的最後分數</span><b>' + f.total + '</b></div><p class="muted">團隊 ' + f.teamPart + '＋個人參與 ' + f.personal + '／' + CFG.scoring.personalMax + '</p>'
          : '<p>成績結算中。</p>';
      }
      app.innerHTML = '<section class="sheet paper member">' +
        '<p class="muted small">小隊「' + esc(team.name) + '」　代碼 ' + esc(team.code) + '</p>' +
        '<h2 class="sheet-title">' + esc(me.name) + '</h2>' + body +
        '<div class="row end"><button type="button" class="btn link" id="leave">離開隊員畫面</button></div></section>';
      const ack = $('#ack');
      if (ack) ack.addEventListener('click', async () => {
        ack.disabled = true;
        await Store.saveTeam(team.id, { roleAcks: { [room.id]: { [me.id]: now() } } });
        toast('已確認角色');
      });
      const area = $('#evalArea');
      if (area) { formOpen = true; evalForm(area, me, team.members, () => { formOpen = false; toast('評估已送出'); }); }
      $('#leave').addEventListener('click', () => { try { localStorage.removeItem(MEMBER_KEY); } catch (e) { /* 忽略 */ } landing(); });
    }
    unsub.push(Store.subscribeTeam(M.teamId, (doc) => { team = doc; if (!formOpen) render(); }));
    unsub.push(Store.subscribeEvals(M.teamId, (list) => { evals = list; if (!formOpen) render(); }));
    render();
  }

  /* =========================================================
     啟動與路由
     ========================================================= */
  async function route() {
    if (location.hash === '#teacher') { clearSubs(); topbar(false); document.body.classList.remove('on-landing'); document.body.classList.remove('slow'); return window.Teacher.mount(app); }
    landing();
  }
  async function boot() {
    $('#tb-mute').addEventListener('click', () => { Sound.start(); Sound.toggleMute(); paintMute(); });
    paintMute();
    app.innerHTML = '<section class="sheet paper"><p>雨正在落下……</p></section>';
    await Store.init();
    window.addEventListener('hashchange', route);
    route();
  }
  window.Game = { boot, _state: () => S };
  document.addEventListener('DOMContentLoaded', boot);
})();
