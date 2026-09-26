/* =========================================================
   教師後台：index.html#teacher
   ========================================================= */
window.Teacher = (function () {
  const D = window.GAME_DATA, CFG = window.APP_CONFIG;
  const esc = Tasks.esc;
  const TASKS = Scoring.allTasks();
  const byId = {}; TASKS.forEach((t) => { byId[t.id] = t; });
  let teams = [], evalsBy = {}, filter = { cls: '', session: '', day: 'all', done: 'all' }, autoTimer = null;

  const fmt = (ms) => (ms ? new Date(ms).toLocaleString('zh-TW', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
  const mins = (a, b) => (a && b ? Math.round((b - a) / 6000) / 10 : '');
  const roomLabel = (ch) => (ch >= 7 ? 'FINAL' : '第' + ch + '關');

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
      if (filter.cls && !(t.members || []).some((m) => (m.cls || '').includes(filter.cls))) return false;
      if (filter.session && !(t.session || '').includes(filter.session)) return false;
      if (filter.day === 'today' && (t.createdAt || 0) < today.getTime()) return false;
      if (filter.done === 'done' && t.stage !== 'final' && t.stage !== 'done') return false;
      return true;
    });
  }

  function rows(list) {
    const out = [];
    list.forEach((t) => {
      const sc = Scoring.compute(t.results);
      const ev = evalsBy[t.id] || [];
      const fin = t.final || Scoring.final(Object.assign({}, t, { teamScore: sc.teamScore }), ev);
      const search = (t.searchLog || []).map((s) => (s.words || []).join('+')).join('｜');
      (t.members || []).forEach((m) => {
        const f = fin[m.id] || {};
        const r = {
          班級: m.cls, 座號: m.seat, 姓名: m.name, 組別: t.name, 隊伍代碼: t.code, 場次: t.session || '',
          開始時間: fmt(t.startedAt), 完成時間: fmt(t.finishedAt), '總遊戲時間(分)': mins(t.startedAt, t.finishedAt)
        };
        D.rooms.forEach((room) => { const k = room.boss ? 'boss' : room.id; const x = sc.rooms[k]; r[room.no + ' 得分'] = x ? x.earned + '/' + x.max : ''; });
        Object.assign(r, { 錯誤次數: sc.wrongs, 提示使用次數: sc.hints, 搜尋驗證紀錄: search });
        D.abilities.forEach((a) => { r[a.name] = sc.abilities[a.id] == null ? '' : sc.abilities[a.id]; });
        Object.assign(r, {
          團隊分數: sc.teamScore, 同儕貢獻平均: f.peerAvg == null ? '' : f.peerAvg + '%', 個人參與: f.personal == null ? '' : f.personal,
          個人最後分數: t.stage === 'final' || t.stage === 'done' ? f.total : '(進行中) ' + (f.total == null ? '' : f.total),
          狀態: ({ ready: '已組隊', play: '遊戲中', results: '已完成關卡', peer: '同儕評估中', final: '已結算', done: '已結算' })[t.stage] || t.stage || ''
        });
        out.push(r);
      });
    });
    return out;
  }

  function analysis(list) {
    const stat = {};
    list.forEach((t) => Object.values(t.results || {}).forEach((r) => {
      const s = stat[r.id] = stat[r.id] || { n: 0, wrong: 0, picks: {}, hints: 0 };
      s.n++; if ((r.firstWrong || []).length) s.wrong++;
      s.hints += r.hints ? 1 : 0;
      (r.firstWrong || []).forEach((k) => { s.picks[k] = (s.picks[k] || 0) + 1; });
    }));
    return Object.keys(stat).filter((id) => byId[id]).map((id) => {
      const s = stat[id]; const task = byId[id];
      const topPick = Object.entries(s.picks).sort((a, b) => b[1] - a[1])[0];
      return { id, task, n: s.n, rate: Math.round((s.wrong / s.n) * 100), hintRate: Math.round((s.hints / s.n) * 100),
        top: topPick ? { text: describe(task, topPick[0]), pct: Math.round((topPick[1] / s.n) * 100) } : null };
    }).filter((a) => a.rate > 0).sort((a, b) => b.rate - a.rate || b.n - a.n);
  }

  function render(root) {
    const list = filtered();
    const rs = rows(list);
    const ana = analysis(list);
    const finished = list.filter((t) => t.stage === 'final' || t.stage === 'done').length;
    const avgTeam = list.length ? Math.round(list.reduce((s, t) => s + Scoring.compute(t.results).teamScore, 0) / list.length * 10) / 10 : 0;
    const abAvg = {};
    D.abilities.forEach((a) => {
      const v = list.map((t) => Scoring.compute(t.results).abilities[a.id]).filter((x) => x != null);
      abAvg[a.id] = v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null;
    });
    const cols = rs.length ? Object.keys(rs[0]) : [];
    root.innerHTML =
      '<section class="teacher">' +
      '<div class="t-head"><h2>教師後台</h2><p class="muted small">' + (Store.mode() === 'firebase' ? '雲端模式：顯示所有小隊資料' : '單機模式：只顯示這台裝置上的資料') + '</p></div>' +
      '<div class="t-filters">' +
      '<label>班級<input id="fCls" value="' + esc(filter.cls) + '" placeholder="電子三甲"></label>' +
      '<label>場次<input id="fSes" value="' + esc(filter.session) + '" placeholder="選填"></label>' +
      '<label>日期<select id="fDay"><option value="all">全部</option><option value="today"' + (filter.day === 'today' ? ' selected' : '') + '>今天</option></select></label>' +
      '<label>狀態<select id="fDone"><option value="all">全部</option><option value="done"' + (filter.done === 'done' ? ' selected' : '') + '>已結算</option></select></label>' +
      '<button type="button" class="btn ghost" id="reload">重新整理</button>' +
      '<label class="auto"><input type="checkbox" id="auto"' + (autoTimer ? ' checked' : '') + '> 每 30 秒自動更新</label></div>' +
      '<div class="t-stats"><div><b>' + list.length + '</b><span>小隊</span></div><div><b>' + rs.length + '</b><span>學生</span></div><div><b>' + finished + '</b><span>已結算</span></div><div><b>' + avgTeam + '</b><span>平均團隊分數</span></div></div>' +
      '<h3>全班閱讀能力平均</h3><div class="t-abil">' + D.abilities.map((a) => '<div class="ab-row"><span>' + esc(a.name) + '</span><i style="width:' + (abAvg[a.id] || 0) + '%"></i><b>' + (abAvg[a.id] == null ? '–' : abAvg[a.id]) + '</b></div>').join('') + '</div>' +
      '<h3>全班最常出錯的題目（課後講評用）</h3>' +
      (ana.length ? '<ol class="t-ana">' + ana.slice(0, 12).map((a) =>
        '<li><p class="ana-line"><b>' + roomLabel(a.task.chapter) + '</b>：' + a.rate + '% 小隊第一次就答錯' +
        (a.top ? '；' + a.top.pct + '% 小隊' + esc(a.top.text) : '') + '</p>' +
        '<p class="muted small">' + esc(a.task.question) + '（作答 ' + a.n + ' 隊，使用提示 ' + a.hintRate + '%）</p></li>').join('') + '</ol>' : '<p class="muted">還沒有作答紀錄。</p>') +
      '<div class="t-export"><h3>學生紀錄</h3><button type="button" class="btn primary" id="csv">匯出 CSV</button><button type="button" class="btn ghost" id="xlsx">匯出 Excel</button></div>' +
      (rs.length ? '<div class="table-scroll"><table class="t-table"><thead><tr>' + cols.map((c) => '<th>' + esc(c) + '</th>').join('') + '</tr></thead><tbody>' +
        rs.map((r) => '<tr>' + cols.map((c) => '<td>' + esc(r[c]) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : '<p class="muted">目前沒有符合條件的學生紀錄。</p>') +
      '<p class="muted small">同儕貢獻只顯示全組平均；每位學生填的原始比例保存在資料庫 teams/{小隊}/evals，畫面與匯出都不顯示。</p>' +
      '<div class="row"><a class="btn link" href="#">回到遊戲首頁</a></div></section>';

    const bind = (id, key, ev) => root.querySelector(id).addEventListener(ev || 'input', (e) => { filter[key] = e.target.value.trim(); render(root); keepFocus(root, id); });
    bind('#fCls', 'cls'); bind('#fSes', 'session'); bind('#fDay', 'day', 'change'); bind('#fDone', 'done', 'change');
    root.querySelector('#reload').addEventListener('click', () => load(root));
    root.querySelector('#auto').addEventListener('change', (e) => {
      clearInterval(autoTimer); autoTimer = e.target.checked ? setInterval(() => load(root), 30000) : null;
    });
    root.querySelector('#csv').addEventListener('click', () => exportCsv(rs));
    root.querySelector('#xlsx').addEventListener('click', () => exportXlsx(rs, ana));
  }
  function keepFocus(root, id) {
    const el = root.querySelector(id);
    if (el && el.tagName === 'INPUT') { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  }

  function download(name, blob) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => { const d = new Date(); return d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0'); };

  function exportCsv(rs) {
    if (!rs.length) return alert('沒有資料可以匯出。');
    const cols = Object.keys(rs[0]);
    const q = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + [cols.map(q).join(',')].concat(rs.map((r) => cols.map((c) => q(r[c])).join(','))).join('\r\n');
    download('翡冷翠雨夜成績_' + stamp() + '.csv', new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  }

  function exportXlsx(rs, ana) {
    if (!rs.length) return alert('沒有資料可以匯出。');
    const go = () => {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rs), '學生紀錄');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(ana.map((a) => ({
        關卡: roomLabel(a.task.chapter), 題目代碼: a.id, 題目: a.task.question, 作答隊數: a.n, 第一次答錯率: a.rate + '%',
        最常見錯誤: a.top ? a.top.text : '', 該錯誤比例: a.top ? a.top.pct + '%' : '', 使用提示比例: a.hintRate + '%'
      }))), '錯誤分析');
      XLSX.writeFile(wb, '翡冷翠雨夜成績_' + stamp() + '.xlsx');
    };
    if (window.XLSX) return go();
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = go;
    s.onerror = () => { alert('Excel 元件載入失敗，改為匯出 CSV（Excel 也能直接開啟）。'); exportCsv(rs); };
    document.head.appendChild(s);
  }

  async function load(root) {
    if (location.hash !== '#teacher') { clearInterval(autoTimer); autoTimer = null; return; }
    try {
      teams = await Store.listTeams();
      const pairs = await Promise.all(teams.map((t) => Store.getEvals(t.id).then((e) => [t.id, e]).catch(() => [t.id, []])));
      evalsBy = {}; pairs.forEach(([id, e]) => { evalsBy[id] = e; });
      render(root);
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

  return { mount, _rows: rows, _analysis: analysis };
})();
