/* =========================================================
   教師後台：index.html#teacher
   分頁：總覽｜即時進度｜答題紀錄｜成績登記｜完整紀錄
   ========================================================= */
window.Teacher = (function () {
  const D = window.GAME_DATA, CFG = window.APP_CONFIG;
  const esc = Tasks.esc;
  const TASKS = Scoring.allTasks();
  const byId = {}; TASKS.forEach((t) => { byId[t.id] = t; });
  const STAGE = { ready: '已組隊', play: '遊戲中', results: '已完成關卡', peer: '同儕評估中', final: '已結算', done: '已結算' };
  const STUCK_MS = 5 * 60 * 1000;
  let teams = [], evalsBy = {}, autoTimer = null;
  const ui = { tab: 'overview', cls: '', session: '', day: 'all', done: 'all', team: '' };

  /* ---------- 時間格式 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (ms) => { if (!ms) return ''; const d = new Date(ms); return pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtS = (ms) => (ms ? fmt(ms) + ':' + pad(new Date(ms).getSeconds()) : '');
  const clock = (ms) => { if (!ms) return ''; const d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()); };
  const dur = (sec) => (sec == null || isNaN(sec) ? '' : Math.floor(sec / 60) + ':' + pad(Math.round(sec % 60)));
  const mins = (a, b) => (a && b ? Math.round((b - a) / 6000) / 10 : '');
  function ago(ms) {
    if (!ms) return '';
    const s = Math.round((Date.now() - ms) / 1000);
    if (s < 60) return '剛剛';
    if (s < 3600) return Math.floor(s / 60) + ' 分鐘前';
    return Math.floor(s / 3600) + ' 小時前';
  }
  const stamp = () => { const d = new Date(); return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()); };
  const roomLabel = (ch) => (ch >= 7 ? 'FINAL' : '第' + ch + '關');
  const seatNum = (s) => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
  const settled = (t) => (t.stage === 'final' || t.stage === 'done') && !!t.final;

  /* ---------- 資料整理 ---------- */
  function lastActivity(t) {
    let m = Math.max(t.updatedAt || 0, (t.now && t.now.at) || 0);
    Object.values(t.results || {}).forEach((r) => { m = Math.max(m, r.at || 0); });
    return m;
  }
  function position(t) {
    if (t.stage !== 'play') return STAGE[t.stage] || t.stage || '';
    const room = D.rooms[t.roomIdx || 0];
    if (!room) return '遊戲中';
    if (t.phase === 'intro') return room.no + '　' + room.title + '　關卡入口';
    if (t.phase === 'roomDone') return room.no + '　' + room.title + '　過關';
    return room.no + '　' + room.title + '　任務 ' + ((t.taskIdx || 0) + 1) + '／' + room.tasks.length;
  }
  const searchLog = (t) => (t.searchLog || []).concat(Object.values(t.search || {})).sort((a, b) => (a.at || 0) - (b.at || 0));
  function finalOf(t) {
    const sc = Scoring.compute(t.results);
    return t.final || Scoring.final(Object.assign({}, t, { teamScore: sc.teamScore }), evalsBy[t.id] || []);
  }

  function describe(task, key) {
    const opt = (id) => ((task.options || []).find((o) => o.id === id) || {}).text || id;
    if (task.type === 'mcq') return key.startsWith('missing:') ? '漏選「' + opt(key.slice(8)) + '」' : '選了「' + opt(key) + '」';
    if (task.type === 'sort') { const [i, b] = key.split('>'); return '把「' + opt(i) + '」放進「' + ((task.buckets.find((x) => x.id === b) || {}).label || b) + '」'; }
    if (task.type === 'slots') { const [s, t] = key.split(':'); return '在「' + ((task.slots.find((x) => x.id === s) || {}).label || s) + '」放了「' + opt(t) + '」'; }
    if (task.type === 'order') return '把「' + opt(key.replace('pos:', '')) + '」排錯位置';
    if (task.type === 'reveal') return '點了「' + opt(key) + '」';
    if (task.type === 'search') { const g = task.correctAnswer.groups.find((x) => x.id === key); return '搜尋詞缺少「' + (g ? g.name : key) + '」'; }
    if (task.type === 'connect') {
      const miss = key.startsWith('missing:'); const [p, h] = key.replace('missing:', '').split('-');
      const pn = (task.people.find((x) => x.id === p) || {}).text || p, hn = (task.hubs.find((x) => x.id === h) || {}).text || h;
      return miss ? '漏連「' + pn + '」與「' + hn + '」' : '把「' + pn + '」連到「' + hn + '」';
    }
    return key;
  }

  function filtered() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return teams.filter((t) => {
      if (ui.cls && !(t.members || []).some((m) => (m.cls || '').includes(ui.cls))) return false;
      if (ui.session && !(t.session || '').includes(ui.session)) return false;
      if (ui.day === 'today' && (t.createdAt || 0) < today.getTime()) return false;
      if (ui.done === 'done' && !settled(t)) return false;
      return true;
    });
  }

  /* 完整紀錄：每位學生一列 */
  function studentRows(list) {
    const out = [];
    list.forEach((t) => {
      const sc = Scoring.compute(t.results);
      const fin = finalOf(t);
      const search = searchLog(t).map((s) => clock(s.at) + (s.by ? ' ' + s.by : '') + ' ' + (s.words || []).join('+')).join('｜');
      (t.members || []).forEach((m) => {
        const f = fin[m.id] || {};
        const r = {
          班級: m.cls, 座號: m.seat, 姓名: m.name, 組別: t.name, 隊伍代碼: t.code, 場次: t.session || '',
          開始時間: fmt(t.startedAt), 完成時間: fmt(t.finishedAt), '總遊戲時間(分)': mins(t.startedAt, t.finishedAt), 最後動作: fmt(lastActivity(t))
        };
        D.rooms.forEach((room) => { const x = sc.rooms[room.boss ? 'boss' : room.id]; r[room.no + ' 得分'] = x ? x.earned + '/' + x.max : ''; });
        Object.assign(r, { 親手作答題數: Object.values(t.results || {}).filter((x) => x.byId === m.id).length, 錯誤次數: sc.wrongs, 提示使用次數: sc.hints, 搜尋驗證紀錄: search });
        D.abilities.forEach((a) => { r[a.name] = sc.abilities[a.id] == null ? '' : sc.abilities[a.id]; });
        Object.assign(r, {
          團隊分數: sc.teamScore, 同儕貢獻平均: f.peerAvg == null ? '' : f.peerAvg + '%', 個人參與: f.personal == null ? '' : f.personal,
          個人最後分數: settled(t) ? f.total : '', 狀態: position(t)
        });
        out.push(r);
      });
    });
    return out;
  }

  /* 答題紀錄：每隊每題一列（含時間戳記） */
  function answerRows(list) {
    const out = [];
    list.forEach((t) => {
      const names = (t.members || []).map((m) => m.name).join('、');
      TASKS.forEach((task) => {
        const r = (t.results || {})[task.id];
        const current = t.stage === 'play' && t.phase === 'task' && t.now && t.now.taskId === task.id && !r;
        if (!r && !current) return;
        out.push({
          隊伍代碼: t.code, 組別: t.name, 成員: names, 關卡: task.roomNo, 題目代碼: task.id, 題目: task.question,
          作答者: r ? (r.by || '') : ((t.now && t.now.by) || ''),
          開始時間: fmtS(r ? r.startedAt : t.now.at),
          完成時間: r ? fmtS(r.at) : '作答中',
          用時: r ? dur(r.seconds) : dur((Date.now() - t.now.at) / 1000),
          送出次數: r ? r.submits : '', 錯誤次數: r ? r.wrongs : '', 提示: r ? r.hints : '',
          得分: r ? r.earned : '', 滿分: task.score, 答案揭曉: r && r.revealed ? '是' : '',
          第一次的錯誤: r ? (r.firstWrong || []).map((k) => describe(task, k)).join('；') : ''
        });
      });
    });
    return out;
  }

  function analysis(list) {
    const stat = {};
    list.forEach((t) => Object.values(t.results || {}).forEach((r) => {
      const s = stat[r.id] = stat[r.id] || { n: 0, wrong: 0, picks: {}, hints: 0, secs: [] };
      s.n++; if ((r.firstWrong || []).length) s.wrong++;
      s.hints += r.hints ? 1 : 0;
      if (r.seconds) s.secs.push(r.seconds);
      (r.firstWrong || []).forEach((k) => { s.picks[k] = (s.picks[k] || 0) + 1; });
    }));
    return Object.keys(stat).filter((id) => byId[id]).map((id) => {
      const s = stat[id]; const task = byId[id];
      const topPick = Object.entries(s.picks).sort((a, b) => b[1] - a[1])[0];
      const secs = s.secs.sort((a, b) => a - b);
      return { id, task, n: s.n, rate: Math.round((s.wrong / s.n) * 100), hintRate: Math.round((s.hints / s.n) * 100),
        median: secs.length ? secs[Math.floor(secs.length / 2)] : null,
        top: topPick ? { text: describe(task, topPick[0]), pct: Math.round((topPick[1] / s.n) * 100) } : null };
    });
  }

  /* 成績登記：依座號排好，一人一列 */
  const rosterKey = () => 'frg_roster_' + (ui.cls || '全部');
  function readRoster() { try { return localStorage.getItem(rosterKey()) || ''; } catch (e) { return ''; } }
  function saveRoster(v) { try { localStorage.setItem(rosterKey(), v); } catch (e) { /* 忽略 */ } }
  function parseRoster(text) {
    return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) => {
      const m = l.match(/^(\d{1,3})[\s,，、\t]*(.*)$/);
      return m ? { seat: parseInt(m[1], 10), name: m[2].trim() } : null;
    }).filter(Boolean);
  }
  function gradeRows(list, rosterText) {
    const recs = {};
    list.forEach((t) => {
      const fin = finalOf(t);
      (t.members || []).forEach((m) => {
        if (ui.cls && !(m.cls || '').includes(ui.cls)) return;
        const key = (m.cls || '') + '|' + seatNum(m.seat);
        (recs[key] = recs[key] || []).push({
          cls: m.cls, seat: seatNum(m.seat), name: m.name, done: settled(t),
          score: settled(t) && fin[m.id] ? Math.round(fin[m.id].total) : null,
          time: t.finishedAt || lastActivity(t), pos: position(t)
        });
      });
    });
    const pick = (list2) => {
      const done = list2.filter((x) => x.done).sort((a, b) => b.time - a.time);
      const chosen = done[0] || list2.slice().sort((a, b) => b.time - a.time)[0];
      const notes = [];
      if (!chosen.done) notes.push('未結算（' + chosen.pos + '）');
      if (list2.length > 1) notes.push('玩了 ' + list2.length + ' 次，採計最新一次' + (chosen.done ? '結算' : '紀錄'));
      return { chosen, notes };
    };
    const rows = [];
    const roster = parseRoster(rosterText || '');
    if (roster.length) {
      const used = new Set();
      roster.forEach((s) => {
        const key = Object.keys(recs).find((k) => seatNum(k.split('|')[1]) === s.seat && !used.has(k));
        if (!key) { rows.push({ 班級: ui.cls, 座號: pad(s.seat), 姓名: s.name, 成績: '', 完成時間: '', 備註: '未參加' }); return; }
        used.add(key);
        const { chosen, notes } = pick(recs[key]);
        if (s.name && chosen.name !== s.name) notes.push('遊戲中填的姓名是「' + chosen.name + '」');
        rows.push({ 班級: chosen.cls, 座號: pad(s.seat), 姓名: s.name || chosen.name, 成績: chosen.score == null ? '' : chosen.score, 完成時間: chosen.done ? fmt(chosen.time) : '', 備註: notes.join('；') });
      });
      Object.keys(recs).filter((k) => !used.has(k)).forEach((k) => {
        const { chosen, notes } = pick(recs[k]);
        notes.push('不在名單中，請確認班級或座號');
        rows.push({ 班級: chosen.cls, 座號: pad(chosen.seat), 姓名: chosen.name, 成績: chosen.score == null ? '' : chosen.score, 完成時間: chosen.done ? fmt(chosen.time) : '', 備註: notes.join('；') });
      });
      return rows;
    }
    Object.keys(recs).map((k) => pick(recs[k])).sort((a, b) => (a.chosen.cls || '').localeCompare(b.chosen.cls || '') || a.chosen.seat - b.chosen.seat)
      .forEach(({ chosen, notes }) => rows.push({ 班級: chosen.cls, 座號: pad(chosen.seat), 姓名: chosen.name, 成績: chosen.score == null ? '' : chosen.score, 完成時間: chosen.done ? fmt(chosen.time) : '', 備註: notes.join('；') }));
    return rows;
  }

  /* ---------- 畫面 ---------- */
  function table(rows, cls) {
    if (!rows.length) return '<p class="muted">目前沒有符合條件的資料。</p>';
    const cols = Object.keys(rows[0]).filter((c) => c !== '_cls');
    return '<div class="table-scroll"><table class="t-table ' + (cls || '') + '"><thead><tr>' + cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
      rows.map((r) => '<tr' + (r._cls ? ' class="' + r._cls + '"' : '') + '>' + cols.map((c) => '<td>' + esc(r[c]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>';
  }

  function viewOverview(list) {
    const rs = studentRows(list);
    const ana = analysis(list).filter((a) => a.rate > 0).sort((a, b) => b.rate - a.rate || b.n - a.n);
    const finished = list.filter(settled).length;
    const avgTeam = list.length ? Math.round(list.reduce((s, t) => s + Scoring.compute(t.results).teamScore, 0) / list.length * 10) / 10 : 0;
    const abAvg = {};
    D.abilities.forEach((a) => {
      const v = list.map((t) => Scoring.compute(t.results).abilities[a.id]).filter((x) => x != null);
      abAvg[a.id] = v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null;
    });
    return '<div class="t-stats"><div><b>' + list.length + '</b><span>小隊</span></div><div><b>' + rs.length + '</b><span>學生</span></div><div><b>' + finished + '</b><span>已結算小隊</span></div><div><b>' + avgTeam + '</b><span>平均團隊分數</span></div></div>' +
      '<h3>全班閱讀能力平均</h3><div class="t-abil">' + D.abilities.map((a) => '<div class="ab-row"><span>' + esc(a.name) + '</span><i style="width:' + (abAvg[a.id] || 0) + '%"></i><b>' + (abAvg[a.id] == null ? '–' : abAvg[a.id]) + '</b></div>').join('') + '</div>' +
      '<h3>全班最常出錯的題目（課後講評用）</h3>' +
      (ana.length ? '<ol class="t-ana">' + ana.slice(0, 12).map((a) =>
        '<li><p class="ana-line"><b>' + roomLabel(a.task.chapter) + '</b>：' + a.rate + '% 小隊第一次就答錯' + (a.top ? '；' + a.top.pct + '% 小隊' + esc(a.top.text) : '') + '</p>' +
        '<p class="muted small">' + esc(a.task.question) + '（作答 ' + a.n + ' 隊，使用提示 ' + a.hintRate + '%' + (a.median ? '，用時中位數 ' + dur(a.median) : '') + '）</p></li>').join('') + '</ol>' : '<p class="muted">還沒有答錯的紀錄。</p>');
  }

  function viewProgress(list) {
    const rows = list.slice().sort((a, b) => (a.stage === 'play' ? 0 : 1) - (b.stage === 'play' ? 0 : 1) || lastActivity(a) - lastActivity(b)).map((t) => {
      const last = lastActivity(t);
      const stuck = t.stage === 'play' && Date.now() - last > STUCK_MS;
      const sc = Scoring.compute(t.results);
      const task = t.now && byId[t.now.taskId];
      return {
        組別: t.name, 提醒: stuck ? '超過 5 分鐘沒有動作' : '', 目前位置: position(t),
        作答者: t.stage === 'play' && t.phase === 'task' && t.now ? (t.now.by || '') : '',
        本題已作答: t.stage === 'play' && t.phase === 'task' && t.now ? dur((Date.now() - t.now.at) / 1000) : '',
        最後動作: clock(last) + '（' + ago(last) + '）',
        已完成題數: Object.keys(t.results || {}).length + '／' + TASKS.length, 目前得分: sc.earned,
        成員: (t.members || []).map((m) => m.seat + ' ' + m.name).join('、'),
        目前題目: t.stage === 'play' && task ? task.question.slice(0, 26) + (task.question.length > 26 ? '…' : '') : '',
        隊伍代碼: t.code, 開始時間: clock(t.startedAt),
        _cls: stuck ? 'row-warn' : ''
      };
    });
    return '<p class="muted small">「本題已作答」是這一組停在目前題目上的時間。超過 5 分鐘沒有動作的小隊會標成紅色，可以過去看看。勾選上方「每 30 秒自動更新」就能持續追蹤。</p>' + table(rows);
  }

  function viewTimeline(list) {
    if (!list.length) return '<p class="muted">目前沒有符合條件的小隊。</p>';
    if (!ui.team || !list.some((t) => t.id === ui.team)) ui.team = list[0].id;
    const t = list.find((x) => x.id === ui.team);
    const rows = answerRows([t]).map((r) => {
      const x = Object.assign({}, r); delete x.隊伍代碼; delete x.組別; delete x.成員; delete x.題目代碼;
      x.題目 = x.題目.length > 28 ? x.題目.slice(0, 28) + '…' : x.題目;
      x._cls = r.完成時間 === '作答中' ? 'row-now' : (r.答案揭曉 ? 'row-warn' : '');
      return x;
    });
    const secs = Object.values(t.results || {}).map((r) => r.seconds || 0);
    const slow = Object.values(t.results || {}).sort((a, b) => (b.seconds || 0) - (a.seconds || 0))[0];
    return '<label class="team-pick">選擇小隊<select id="fTeam">' + list.map((x) => '<option value="' + x.id + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(x.name + '（' + x.code + '）' + (x.members || []).map((m) => m.name).join('、')) + '</option>').join('') + '</select></label>' +
      '<p class="muted small">開始時間：' + fmt(t.startedAt) + '　最後動作：' + clock(lastActivity(t)) + '　已作答 ' + secs.length + ' 題，合計 ' + dur(secs.reduce((a, b) => a + b, 0)) +
      (slow ? '　最久的一題：' + esc(byId[slow.id] ? byId[slow.id].roomNo + ' ' + byId[slow.id].question.slice(0, 16) + '…' : slow.id) + '（' + dur(slow.seconds) + '）' : '') + '</p>' +
      table(rows, 'timeline-t') +
      '<p class="muted small">底色黃色的是這一組目前正在作答的題目；紅色的是三次都沒過、系統揭曉答案的題目。</p>';
  }

  function viewGrades(list) {
    const roster = readRoster();
    const rows = gradeRows(list, roster);
    const missing = rows.filter((r) => r.成績 === '').length;
    return '<div class="grade-top"><div class="grade-roster"><label><span>班級名單（選填，每行一位：座號 姓名）</span>' +
      '<textarea id="roster" rows="6" placeholder="01 王小明&#10;02 陳小華&#10;03 林同學">' + esc(roster) + '</textarea></label>' +
      '<p class="muted small">名單會存在這台裝置，下次選同一個班級會自動帶出。貼上名單後，缺席的同學也會列出來。' + (ui.cls ? '' : '<b>使用名單前，請先在上方「班級」欄輸入班級。</b>') + '</p></div>' +
      '<div class="grade-actions"><button type="button" class="btn primary" id="gradeX">匯出成績登記表</button><button type="button" class="btn ghost" id="gradeCopy">複製成績欄</button>' +
      '<p class="muted small">共 ' + rows.length + ' 人，其中 ' + missing + ' 人沒有成績。「複製成績欄」會依座號順序複製整欄分數，沒有成績的位置留空，可以直接貼進成績系統。</p></div></div>' +
      table(rows.map((r) => Object.assign({}, r, { _cls: r.成績 === '' ? 'row-warn' : '' })), 'grade-t');
  }

  function viewAll(list) {
    return '<div class="t-export"><button type="button" class="btn primary" id="xlsx">匯出 Excel（全部工作表）</button><button type="button" class="btn ghost" id="csv">匯出學生紀錄 CSV</button><button type="button" class="btn ghost" id="csvLog">匯出答題紀錄 CSV</button></div>' +
      '<p class="muted small">Excel 內含四張工作表：成績登記、學生紀錄、答題紀錄（每題的開始與完成時間）、錯誤分析。同儕貢獻只顯示全組平均，個別學生填的原始比例不會出現在畫面與匯出檔。</p>' +
      table(studentRows(list));
  }

  const TABS = [['overview', '總覽'], ['progress', '即時進度'], ['timeline', '答題紀錄'], ['grades', '成績登記'], ['all', '完整紀錄']];
  function render(root) {
    const list = filtered();
    const views = { overview: viewOverview, progress: viewProgress, timeline: viewTimeline, grades: viewGrades, all: viewAll };
    root.innerHTML =
      '<section class="teacher">' +
      '<div class="t-head"><h2>教師後台</h2><p class="muted small">' + (Store.mode() === 'firebase' ? '雲端模式：顯示所有小隊資料' : '單機模式：只顯示這台裝置上的資料') + '　更新時間 ' + clock(Date.now()) + '</p></div>' +
      '<div class="t-filters">' +
      '<label>班級<input id="fCls" value="' + esc(ui.cls) + '" placeholder="電子三甲"></label>' +
      '<label>場次<input id="fSes" value="' + esc(ui.session) + '" placeholder="選填"></label>' +
      '<label>日期<select id="fDay"><option value="all">全部</option><option value="today"' + (ui.day === 'today' ? ' selected' : '') + '>今天</option></select></label>' +
      '<label>狀態<select id="fDone"><option value="all">全部</option><option value="done"' + (ui.done === 'done' ? ' selected' : '') + '>已結算</option></select></label>' +
      '<button type="button" class="btn ghost" id="reload">重新整理</button>' +
      '<label class="auto"><input type="checkbox" id="auto"' + (autoTimer ? ' checked' : '') + '> 每 30 秒自動更新</label></div>' +
      '<nav class="t-tabs" role="tablist">' + TABS.map(([id, name]) => '<button type="button" role="tab" class="t-tab' + (ui.tab === id ? ' on' : '') + '" data-tab="' + id + '" aria-selected="' + (ui.tab === id) + '">' + name + '</button>').join('') + '</nav>' +
      '<div class="t-body">' + views[ui.tab](list) + '</div>' +
      '<div class="row"><a class="btn link" href="#">回到遊戲首頁</a></div></section>';

    const bind = (id, key, ev) => { const el = root.querySelector(id); if (el) el.addEventListener(ev || 'input', (e) => { ui[key] = e.target.value.trim(); render(root); keepFocus(root, id); }); };
    bind('#fCls', 'cls'); bind('#fSes', 'session'); bind('#fDay', 'day', 'change'); bind('#fDone', 'done', 'change'); bind('#fTeam', 'team', 'change');
    root.querySelectorAll('.t-tab').forEach((b) => b.addEventListener('click', () => { ui.tab = b.dataset.tab; render(root); }));
    root.querySelector('#reload').addEventListener('click', () => load(root));
    root.querySelector('#auto').addEventListener('change', (e) => {
      clearInterval(autoTimer); autoTimer = e.target.checked ? setInterval(() => load(root), 30000) : null;
    });
    const roster = root.querySelector('#roster');
    if (roster) roster.addEventListener('change', () => { saveRoster(roster.value); render(root); });
    const on = (id, fn) => { const el = root.querySelector(id); if (el) el.addEventListener('click', fn); };
    on('#gradeX', () => exportSheets([['成績登記', gradeRows(list, readRoster())]], '成績登記_' + (ui.cls || '全部')));
    on('#gradeCopy', () => copyScores(gradeRows(list, readRoster())));
    on('#csv', () => exportCsv(studentRows(list), '學生紀錄'));
    on('#csvLog', () => exportCsv(answerRows(list), '答題紀錄'));
    on('#xlsx', () => exportSheets([
      ['成績登記', gradeRows(list, readRoster())],
      ['學生紀錄', studentRows(list)],
      ['答題紀錄', answerRows(list)],
      ['錯誤分析', analysis(list).sort((a, b) => b.rate - a.rate).map((a) => ({
        關卡: roomLabel(a.task.chapter), 題目代碼: a.id, 題目: a.task.question, 作答隊數: a.n, 第一次答錯率: a.rate + '%',
        最常見錯誤: a.top ? a.top.text : '', 該錯誤比例: a.top ? a.top.pct + '%' : '', 使用提示比例: a.hintRate + '%', 用時中位數: dur(a.median)
      }))]
    ], '翡冷翠雨夜成績'));
  }
  function keepFocus(root, id) {
    const el = root.querySelector(id);
    if (el && el.tagName === 'INPUT') { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  }

  /* ---------- 匯出、複製 ---------- */
  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const clean = (rows) => rows.map((r) => { const x = Object.assign({}, r); delete x._cls; return x; });
  function exportCsv(rows, name) {
    rows = clean(rows);
    if (!rows.length) return alert('沒有資料可以匯出。');
    const cols = Object.keys(rows[0]);
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + [cols.map(q).join(',')].concat(rows.map((r) => cols.map((c) => q(r[c])).join(','))).join('\r\n');
    download(name + '_' + stamp() + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  }
  function exportSheets(sheets, name) {
    sheets = sheets.map(([n, rows]) => [n, clean(rows)]).filter(([, rows]) => rows.length);
    if (!sheets.length) return alert('沒有資料可以匯出。');
    const go = () => {
      const wb = XLSX.utils.book_new();
      sheets.forEach(([n, rows]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), n));
      XLSX.writeFile(wb, name + '_' + stamp() + '.xlsx');
    };
    if (window.XLSX) return go();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = go;
    s.onerror = () => { alert('Excel 元件載入失敗，改為匯出 CSV（Excel 也能直接開啟）。'); exportCsv(sheets[0][1], name); };
    document.head.appendChild(s);
  }
  function copyScores(rows) {
    if (!rows.length) return alert('沒有資料可以複製。');
    const text = rows.map((r) => r.成績).join('\n');
    const done = () => alert('已依座號複製 ' + rows.length + ' 位同學的成績，可以直接貼進成績系統。');
    const fallback = () => {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); done(); } catch (e) { alert('瀏覽器不允許自動複製，請改用「匯出成績登記表」。'); }
      ta.remove();
    };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback);
    else fallback();
  }

  /* ---------- 載入 ---------- */
  async function load(root) {
    if (location.hash !== '#teacher') { clearInterval(autoTimer); autoTimer = null; return; }
    try {
      teams = await Store.listTeams();
      const pairs = await Promise.all(teams.map((t) => Store.getEvals(t.id).then((e) => [t.id, e]).catch(() => [t.id, []])));
      evalsBy = {}; pairs.forEach(([id, e]) => { evalsBy[id] = e; });
      const focused = document.activeElement && document.activeElement.id;
      render(root);
      if (focused === 'fCls' || focused === 'fSes') keepFocus(root, '#' + focused);
    } catch (e) {
      root.innerHTML = '<section class="teacher"><p class="warn-box">讀取失敗：' + esc(e.message || e) + '。請確認 Firestore 規則允許讀取（見 README）。</p></section>';
    }
  }

  function mount(root) {
    const pass = CFG.teacherPasscode;
    let okd = false;
    try { okd = sessionStorage.getItem('frg_teacher_ok') === '1'; } catch (e) { /* 忽略 */ }
    if (!pass || okd) { root.innerHTML = '<section class="teacher"><p>讀取中……</p></section>'; return load(root); }
    root.innerHTML = '<section class="sheet paper gate"><h2 class="sheet-title">教師後台</h2><label><span>教師密碼</span><input type="password" id="pw" autocomplete="off"></label><p class="err" id="err"></p>' +
      '<div class="row end"><a class="btn ghost" href="#">返回</a><button type="button" class="btn primary" id="enter">進入</button></div></section>';
    const enter = () => {
      if (root.querySelector('#pw').value === pass) {
        try { sessionStorage.setItem('frg_teacher_ok', '1'); } catch (e) { /* 忽略 */ }
        mount(root);
      } else root.querySelector('#err').textContent = '密碼不正確。';
    };
    root.querySelector('#enter').addEventListener('click', enter);
    root.querySelector('#pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
  }

  return { mount, _grade: gradeRows, _answers: answerRows, _ui: ui };
})();
