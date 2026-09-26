/* =========================================================
   題型引擎：每一種題型都支援「點選」與「拖曳」兩種操作，
   手機觸控、平板、電腦滑鼠、鍵盤都能完成，不依賴 hover。
   ========================================================= */
window.Tasks = (function () {
  const cfg = () => window.APP_CONFIG.scoring;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const arr = (v) => (Array.isArray(v) ? v : [v]);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function shuffle(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  const GENERIC = '這個答案和課文的說法對不上。回到題目下方的句子，先確認主詞，再看重點動詞。';

  /* ---------------- 拖曳輔助：拖到帶有 data-drop 的元素上 ---------------- */
  function enableDrag(chip, onDrop) {
    let start = null, ghost = null, dragging = false;
    chip.addEventListener('pointerdown', (e) => {
      if (chip.disabled || e.button > 0) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    });
    chip.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      if (!dragging && Math.hypot(dx, dy) > 8) {
        dragging = true;
        try { chip.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
        ghost = chip.cloneNode(true);
        ghost.classList.add('drag-ghost');
        const r = chip.getBoundingClientRect();
        ghost.style.width = r.width + 'px';
        document.body.appendChild(ghost);
        chip.classList.add('lifting');
      }
      if (dragging) {
        ghost.style.transform = 'translate(' + (e.clientX - 20) + 'px,' + (e.clientY - 20) + 'px)';
        document.querySelectorAll('.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
        const t = targetAt(e.clientX, e.clientY);
        if (t) t.classList.add('drop-hover');
      }
    });
    const end = (e) => {
      if (!start) return;
      if (dragging) {
        const t = targetAt(e.clientX, e.clientY);
        chip.dataset.dragged = '1';
        setTimeout(() => { delete chip.dataset.dragged; }, 50);
        if (t) onDrop(t.dataset.drop);
      }
      if (ghost) ghost.remove();
      ghost = null; dragging = false; start = null;
      chip.classList.remove('lifting');
      document.querySelectorAll('.drop-hover').forEach((n) => n.classList.remove('drop-hover'));
    };
    chip.addEventListener('pointerup', end);
    chip.addEventListener('pointercancel', end);
  }
  function targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    return el ? el.closest('[data-drop]') : null;
  }

  /* =========================================================
     共用引擎
     ========================================================= */
  function mount(root, task, hooks) {
    const st = { submits: 0, wrongs: 0, hints: 0, firstBase: null, firstWrong: [], allWrong: [], revealed: false, done: false };
    const stars = '●●●'.slice(0, task.difficulty || 1) + '○○○'.slice(0, 3 - (task.difficulty || 1));
    root.innerHTML =
      '<article class="task t-' + task.type + '">' +
      '<div class="task-meta"><span class="role-badge">' + esc(hooks.roleLabel(task.role)) + '</span>' +
      '<span class="task-pts">' + task.score + ' 分　難度 ' + stars + '</span></div>' +
      '<h2 class="q">' + esc(task.question) + '</h2>' +
      (task.sourceText && task.sourceText.length > 6 && task.layout !== 'compare' ? '<blockquote class="src">' + esc(task.sourceText) + '</blockquote>' : '') +
      (task.clues ? '<ul class="clues">' + task.clues.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>' : '') +
      '<div class="play"></div>' +
      '<div class="hint-box" hidden></div>' +
      '<div class="fb" aria-live="polite"></div>' +
      '<div class="actions">' +
      '<button type="button" class="btn ghost h1">提示一</button>' +
      '<button type="button" class="btn ghost h2" disabled>提示二</button>' +
      '<button type="button" class="btn primary submit">送出答案</button></div>' +
      '<div class="after"></div></article>';
    const $ = (s) => root.querySelector(s);
    const fb = $('.fb'), submitBtn = $('.submit'), hintBox = $('.hint-box');

    const ctl = {
      sfx: hooks.sfx || {},
      setSubmitLabel(t) { submitBtn.textContent = t; },
      message(html, kind) { fb.className = 'fb ' + (kind || ''); fb.innerHTML = html; },
      finishNow() { finish(); },
      onSearch: hooks.onSearch || function () {}
    };
    const impl = TYPES[task.type](root.querySelector('.play'), task, ctl);
    if (impl.submitLabel) ctl.setSubmitLabel(impl.submitLabel);

    $('.h1').addEventListener('click', () => {
      if (st.done) return;
      if (st.hints < 1) st.hints = 1;
      hintBox.hidden = false;
      hintBox.innerHTML = '<p><b>提示一</b>' + esc(task.hint1) + '</p>';
      $('.h2').disabled = false; $('.h1').disabled = true;
      hooks.onHint && hooks.onHint(1);
    });
    $('.h2').addEventListener('click', () => {
      if (st.done) return;
      st.hints = 2;
      hintBox.innerHTML += '<p><b>提示二</b>' + esc(task.hint2) + '</p>';
      $('.h2').disabled = true;
      hooks.onHint && hooks.onHint(2);
    });

    submitBtn.addEventListener('click', () => {
      if (st.done) return;
      const r = impl.check();
      if (r.notReady) { ctl.message(esc(r.notReady), 'info'); return; }
      st.submits++;
      if (st.submits === 1) { st.firstBase = r.base; st.firstWrong = (r.wrongKeys || []).slice(); }
      (r.wrongKeys || []).forEach((k) => st.allWrong.push(k));
      if (r.ok) { st.lastOk = true; finish(); return; }
      st.wrongs++;
      ctl.sfx.wrong && ctl.sfx.wrong();
      const art = root.querySelector('.task');
      art.classList.remove('oops'); void art.offsetWidth; art.classList.add('oops');
      const msgs = (r.msgs || []).filter(Boolean);
      const shown = msgs.slice(0, 3).map((m) => '<li>' + esc(m) + '</li>').join('');
      const more = msgs.length > 3 ? '<li>還有 ' + (msgs.length - 3) + ' 處需要再看一次。</li>' : '';
      const left = cfg().maxSubmit - st.submits;
      const part = r.partial ? '（已答對 ' + r.partial + '）' : '';
      if (r.soft) {
        ctl.message('<p class="fb-title">關鍵詞還可以更精準</p><ul>' + shown + more + '</ul>' +
          '<p class="fb-note">可以修改後再檢查一次，也可以直接用這組完成。</p>' +
          '<button type="button" class="btn ghost accept">就用這組完成</button>', 'warn');
        fb.querySelector('.accept').addEventListener('click', () => finish());
        if (st.submits >= 2) finish();
        return;
      }
      if (st.submits >= cfg().maxSubmit) {
        st.revealed = true;
        impl.reveal && impl.reveal();
        ctl.message('<p class="fb-title">答案揭曉，看看正確的位置' + part + '</p><ul>' + shown + more + '</ul>', 'warn');
        finish();
        return;
      }
      ctl.message('<p class="fb-title">差一點！' + part + '看看錯在哪一種讀法：</p><ul>' + shown + more + '</ul>' +
        '<p class="fb-note">還可以再送出 ' + left + ' 次；卡住的話可以使用提示。</p>', 'warn');
    });

    function finish() {
      if (st.done) return;
      st.done = true;
      impl.lock && impl.lock();
      const c = cfg();
      let factor = impl.single ? c.mcqRetry[Math.min(st.wrongs, c.mcqRetry.length - 1)] : (st.firstBase == null ? 0 : st.firstBase);
      if (impl.factor) factor = impl.factor();
      if (st.revealed) factor = Math.min(factor, c.revealCap);
      const pen = (st.hints >= 1 ? c.hint1Penalty : 0) + (st.hints >= 2 ? c.hint2Penalty : 0);
      const f = clamp(factor - pen, c.floor, 1);
      const earned = Math.round(task.score * f * 10) / 10;
      const result = {
        id: task.id, room: task.chapter, ability: task.abilityTag, earned, max: task.score,
        wrongs: st.wrongs, hints: st.hints, submits: st.submits, firstBase: st.firstBase == null ? 0 : st.firstBase,
        firstWrong: st.firstWrong, allWrong: st.allWrong.slice(0, 30), revealed: st.revealed, at: Date.now()
      };
      if (impl.extra) Object.assign(result, impl.extra());
      const info = (hooks.onFinish && hooks.onFinish(result)) || {};
      const streak = info.streak || 0;
      root.querySelectorAll('.actions button').forEach((b) => { b.disabled = true; });
      root.querySelector('.actions').hidden = true;
      const good = !st.revealed && (st.lastOk || impl.factor);
      if (good) ctl.sfx.right && ctl.sfx.right(streak);
      const fullOk = st.lastOk || (impl.factor && impl.factor() >= 1);
      const verdict = st.revealed ? '答案揭曉' : (!fullOk ? '任務完成' : (st.wrongs === 0 ? '答對了！' : '修正成功，答對了！'));
      const streakTag = fullOk && !st.revealed && streak >= 2 ? '<span class="streak">連續答對 ' + streak + ' 題</span>' : '';
      const burst = good ? '<div class="burst" aria-hidden="true">' + Array.from({ length: 12 }, (_, i) => '<i style="--a:' + (i * 30) + 'deg;--d:' + (46 + (i % 3) * 14) + 'px"></i>').join('') + '</div>' : '';
      const note = task.afterNote ? '<div class="name-card"><p class="nc-title">' + esc(task.afterNote.title) + '</p><p>' + esc(task.afterNote.body) + '</p></div>' : '';
      $('.after').innerHTML =
        '<div class="after-card' + (st.revealed ? ' revealed' : ' win') + '">' + burst +
        '<p class="verdict"><span class="v-main">' + verdict + '</span>' + streakTag + '<span class="v-pts">本題得分 ' + earned + '／' + task.score + '</span></p>' +
        '<p class="exp">' + esc(task.explanation) + '</p>' +
        '<p class="strat">閱讀策略　' + esc(task.strategy) + '</p></div>' + note +
        '<button type="button" class="btn primary next">' + esc(hooks.nextLabel || '下一個任務') + '</button>';
      if (!st.revealed && fb.classList.contains('warn')) fb.innerHTML = '';
      if (good) root.querySelector('.task').classList.add('solved');
      $('.next').addEventListener('click', () => hooks.onNext && hooks.onNext());
      setTimeout(() => { const a = $('.after'); if (a && a.scrollIntoView) a.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 60);
    }
    return { finish, state: st, impl };
  }

  /* =========================================================
     題型
     ========================================================= */
  const TYPES = {};

  /* ---------- 單選／複選 ---------- */
  TYPES.mcq = function (el, task, ctl) {
    const multi = !!task.multi;
    let sel = multi ? new Set() : null;
    let html = '';
    if (task.layout === 'compare' && task.compare) {
      html += '<div class="compare">' + task.compare.map((c) => '<div class="cmp"><p class="cmp-label">' + esc(c.label) + '</p><p>' + esc(c.text) + '</p></div>').join('') + '</div>';
    }
    const hasImg = task.options.some((o) => o.image);
    html += (multi ? '<p class="multi-tip">可以複選</p>' : '') +
      '<div class="opts' + (hasImg ? ' img-grid' : '') + '" role="' + (multi ? 'group' : 'radiogroup') + '">' +
      task.options.map((o) => '<button type="button" class="opt" data-id="' + o.id + '" aria-pressed="false">' +
        (o.image ? Art.figure(o.image, { cls: 'opt-img' }) : '') + '<span class="opt-text">' + esc(o.text) + '</span></button>').join('') + '</div>';
    el.innerHTML = html;
    const btns = [...el.querySelectorAll('.opt')];
    btns.forEach((b) => b.addEventListener('click', () => {
      if (b.disabled) return;
      const id = b.dataset.id;
      btns.forEach((x) => x.classList.remove('is-wrong'));
      if (multi) { sel.has(id) ? sel.delete(id) : sel.add(id); }
      else sel = id;
      btns.forEach((x) => {
        const on = multi ? sel.has(x.dataset.id) : sel === x.dataset.id;
        x.classList.toggle('on', on); x.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }));
    const fbOf = (id) => (task.feedback && task.feedback[id]) || GENERIC;
    return {
      single: !multi,
      check() {
        if (!multi) {
          if (!sel) return { notReady: '請先選一個答案。' };
          const ok = sel === task.correctAnswer;
          if (!ok) btns.forEach((x) => { if (x.dataset.id === sel) x.classList.add('is-wrong'); });
          return { ok, base: ok ? 1 : 0, wrongKeys: ok ? [] : [sel], msgs: ok ? [] : [fbOf(sel)] };
        }
        if (!sel.size) return { notReady: '請至少選一個答案。' };
        const ca = arr(task.correctAnswer);
        const wrong = [...sel].filter((x) => !ca.includes(x));
        const missing = ca.filter((x) => !sel.has(x));
        const base = clamp((ca.length - missing.length - wrong.length) / ca.length, 0, 1);
        btns.forEach((x) => { if (wrong.includes(x.dataset.id)) x.classList.add('is-wrong'); });
        const msgs = wrong.map(fbOf).concat(missing.map((m) => (task.feedback && task.feedback['missing:' + m]) || '還有正確的選項沒有選到。'));
        return { ok: !wrong.length && !missing.length, base, wrongKeys: wrong.concat(missing.map((m) => 'missing:' + m)), msgs };
      },
      reveal() {
        const ca = arr(task.correctAnswer);
        btns.forEach((x) => { x.classList.toggle('on', ca.includes(x.dataset.id)); });
      },
      lock() {
        const ca = arr(task.correctAnswer);
        btns.forEach((x) => { x.disabled = true; if (ca.includes(x.dataset.id)) x.classList.add('is-right'); });
      }
    };
  };

  /* ---------- 看板：分類（含地圖、圖片、時間軸）與關鍵詞槽位共用 ----------
     assign 模式（分類題）：上方「題目卡」顯示目前這張卡，直接點下面的答案格就放進去。
     fill 模式（關鍵詞槽位）：亮起來的問題框是目前要回答的，直接點下面的詞就填進去。
     兩種模式都保留拖曳。 */
  function board(el, task, ctl, opts) {
    const items = task.options;
    const buckets = opts.buckets;
    const capacity = opts.capacity || 0;
    const mode = opts.mode || 'assign';
    const place = {}; items.forEach((i) => { place[i.id] = null; });
    const locked = new Set();
    let current = null, activeSlot = null;
    const layout = task.layout || opts.layout || 'stack';
    const order = opts.noShuffle ? items : shuffle(items);

    let bucketsHtml = '';
    if (layout === 'map') {
      bucketsHtml = '<div class="map-wrap">' + Art.figure('map_florence', { cls: 'map-img' }) +
        buckets.map((b) => '<div class="pin target" role="button" tabindex="0" data-drop="' + b.id + '" style="left:' + b.x + '%;top:' + b.y + '%">' +
          '<span class="pin-icon">' + Art.icon(b.icon) + '<b>' + esc(b.label) + '</b></span><span class="slot-in" data-in="' + b.id + '"></span></div>').join('') + '</div>';
    } else {
      bucketsHtml = '<div class="buckets l-' + layout + '">' + buckets.map((b) =>
        '<div class="bucket target tone-' + (b.tone || 'plain') + '" data-drop="' + b.id + '" role="button" tabindex="0">' +
        (b.image ? Art.figure(b.image, { cls: 'bucket-img' }) : '') +
        '<p class="bucket-label">' + esc(b.label) + '</p><div class="slot-in" data-in="' + b.id + '"></div></div>').join('') + '</div>';
    }
    const poolHtml = '<div class="pool rain-pool" data-drop="__pool"><p class="pool-label">' + esc(opts.poolLabel || '答案選項') + '</p><div class="slot-in" data-in="__pool"></div></div>';
    if (mode === 'fill') {
      const how = layout === 'map'
        ? '亮起來的圖釘是現在要放的位置，直接點上面的地名就放進去；想改某個位置，先點那個圖釘。'
        : '直接點上面的詞，就會填進下面亮起來的問題框；想換題，點那個問題框，點框裡的詞可以拿回來。';
      el.innerHTML = '<p class="how">' + how + '</p>' + poolHtml + bucketsHtml;
    } else {
      const letters = 'ABCDEFGHIJ';
      el.innerHTML = '<p class="how">看題目卡，直接點下方的答案選項。放錯了，點結果區格子裡的卡片就能拿回來重放。</p>' +
        '<div class="qcard-area" data-drop="__pool"><p class="qcard-label">題目卡</p><div class="qcard" data-in="__current"></div>' +
        '<div class="answer-opts" role="group" aria-label="答案選項">' + buckets.map((b, i) =>
          '<button type="button" class="ans-opt" data-opt="' + b.id + '"><span class="ans-letter">（' + letters[i] + '）</span>' + esc(b.label) + '</button>').join('') + '</div>' +
        '<details class="rest"><summary class="rest-label"></summary><div class="slot-in" data-in="__pool"></div></details></div>' +
        '<p class="result-label">結果區</p>' + bucketsHtml;
      el.querySelectorAll('.ans-opt').forEach((b) => b.addEventListener('click', () => tapZone(b.dataset.opt)));
    }

    const chips = {};
    order.forEach((it, idx) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (mode === 'fill' ? ' drop-in' : '');
      b.style.animationDelay = (idx * 0.1) + 's';
      b.dataset.id = it.id; b.textContent = it.text;
      b.addEventListener('click', () => { if (!b.dataset.dragged && !locked.has(it.id)) tapChip(it.id); });
      enableDrag(b, (dropId) => { if (!locked.has(it.id)) move(it.id, dropId); });
      chips[it.id] = b;
    });
    el.querySelectorAll('.target').forEach((zone) => {
      const act = (e) => { if (e.target.closest('.chip')) return; tapZone(zone.dataset.drop); };
      zone.addEventListener('click', act);
      zone.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
    });

    const occupant = (bid) => Object.keys(place).find((k) => place[k] === bid);
    const nextUnplaced = () => { const it = order.find((i) => !place[i.id] && !locked.has(i.id)); return it ? it.id : null; };
    const nextEmpty = () => { const b = buckets.find((x) => !occupant(x.id)); return b ? b.id : null; };

    function tapChip(id) {
      if (mode === 'fill') {
        if (place[id]) { activeSlot = place[id]; place[id] = null; ctl.sfx.place && ctl.sfx.place(); render(); return; }
        const slot = activeSlot || nextEmpty();
        if (!slot) { ctl.message('問題框都填好了。要換詞，先點一個問題框。', 'info'); return; }
        put(id, slot);
        activeSlot = nextEmpty();
        render();
        return;
      }
      if (place[id]) { place[id] = null; current = id; ctl.sfx.place && ctl.sfx.place(); render(); return; }
      current = id; render();
    }
    function tapZone(bid) {
      if (mode === 'fill') {
        const occ = occupant(bid);
        if (occ && locked.has(occ)) return;
        activeSlot = bid; render(); return;
      }
      if (!current) { ctl.message('卡片都放好了。要改的話，先點格子裡的卡片把它拿回來。', 'info'); return; }
      put(current, bid);
      current = nextUnplaced();
      render();
    }
    function put(id, bid) {
      if (capacity) {
        const occ = Object.keys(place).filter((k) => place[k] === bid && k !== id);
        if (occ.length >= capacity) {
          const bump = occ.find((k) => !locked.has(k));
          if (!bump) return;
          place[bump] = null;
        }
      }
      place[id] = bid;
      chips[id].classList.remove('was-wrong');
      chips[id].classList.add('landed');
      setTimeout(() => chips[id].classList.remove('landed'), 400);
      ctl.sfx.place && ctl.sfx.place();
      ctl.message('', '');
    }
    function move(id, dropId) {
      if (dropId === '__pool') { place[id] = null; if (mode === 'assign') current = id; }
      else { put(id, dropId); if (mode === 'assign' && current === id) current = nextUnplaced(); if (mode === 'fill') activeSlot = nextEmpty(); }
      render();
    }
    function render() {
      if (mode === 'assign' && (!current || place[current] || locked.has(current))) current = nextUnplaced();
      if (mode === 'fill') {
        const occ = activeSlot && occupant(activeSlot);
        if (!activeSlot || (occ && locked.has(occ))) activeSlot = nextEmpty();
      }
      el.querySelectorAll('[data-in]').forEach((s) => { s.innerHTML = ''; });
      order.forEach((it) => {
        let where = place[it.id] || '__pool';
        if (mode === 'assign' && !place[it.id] && it.id === current) where = '__current';
        el.querySelector('[data-in="' + where + '"]').appendChild(chips[it.id]);
      });
      if (mode === 'assign') {
        const left = items.filter((i) => !place[i.id]).length;
        const q = el.querySelector('.qcard');
        q.classList.toggle('empty', !current);
        if (!current) q.innerHTML = '<p class="qcard-done">全部放好了，確認後按「送出答案」。</p>';
        const rl = el.querySelector('.rest-label');
        rl.textContent = left > 1 ? '後面還有 ' + (left - 1) + ' 張（想先放別張，點這裡）' : '';
        el.querySelector('.rest').hidden = left <= 1;
        el.classList.toggle('has-current', !!current);
        el.querySelectorAll('.ans-opt').forEach((b) => { b.disabled = !current; });
      } else {
        buckets.forEach((b) => el.querySelector('[data-drop="' + b.id + '"]').classList.toggle('active', b.id === activeSlot));
      }
      buckets.forEach((b) => el.querySelector('[data-drop="' + b.id + '"]').classList.toggle('filled', !!occupant(b.id)));
    }
    render();

    return {
      place, locked, chips, items, buckets, render,
      label(id) { const b = buckets.find((x) => x.id === id); return b ? b.label : ''; },
      text(id) { const i = items.find((x) => x.id === id); return i ? i.text : ''; },
      mark(id, cls) { chips[id].classList.remove('right', 'was-wrong'); if (cls) chips[id].classList.add(cls); },
      lockItem(id) { locked.add(id); chips[id].classList.add('right'); chips[id].setAttribute('aria-disabled', 'true'); },
      toPool(id) { place[id] = null; },
      resetFocus() { current = null; activeSlot = null; },
      lockAll() {
        Object.values(chips).forEach((c) => { c.disabled = true; });
        el.querySelectorAll('.ans-opt').forEach((b) => { b.disabled = true; });
        el.classList.remove('has-current');
      }
    };
  }

  TYPES.sort = function (el, task, ctl) {
    const isMap = task.layout === 'map';
    const bd = board(el, task, ctl, { buckets: task.buckets, capacity: task.capacity || (isMap ? 1 : 0), mode: isMap ? 'fill' : 'assign', poolLabel: isMap ? '地名' : '答案選項' });
    return {
      check() {
        const left = bd.items.filter((i) => !bd.place[i.id]).length;
        if (left) return { notReady: '還有 ' + left + ' 張卡片沒有放好。' };
        let good = 0; const wrongKeys = [], msgs = [];
        bd.items.forEach((it) => {
          const ok = arr(task.correctAnswer[it.id]).includes(bd.place[it.id]);
          if (ok) { good++; bd.lockItem(it.id); return; }
          const key = it.id + '>' + bd.place[it.id];
          wrongKeys.push(key);
          msgs.push((task.feedback && (task.feedback[key] || task.feedback[it.id])) ||
            '「' + it.text + '」放在「' + bd.label(bd.place[it.id]) + '」不太對。先問這句話真正在說什麼，再決定它屬於哪一格。');
          bd.mark(it.id, 'was-wrong'); bd.toPool(it.id);
        });
        bd.resetFocus(); bd.render();
        return { ok: good === bd.items.length, base: good / bd.items.length, wrongKeys, msgs, partial: good + '／' + bd.items.length };
      },
      reveal() {
        bd.items.forEach((it) => { bd.place[it.id] = arr(task.correctAnswer[it.id])[0]; bd.lockItem(it.id); });
        bd.render();
      },
      lock() { bd.lockAll(); }
    };
  };

  TYPES.slots = function (el, task, ctl) {
    const bd = board(el, task, ctl, { buckets: task.slots, capacity: 1, mode: 'fill', layout: 'slots', poolLabel: '詞語選項' });
    const weight = (slotId, tok) => ((task.correctAnswer[slotId] || {})[tok] || 0);
    return {
      check() {
        const filled = task.slots.filter((s) => Object.values(bd.place).includes(s.id)).length;
        if (filled < task.slots.length) return { notReady: '每個問題框都要各留下一個詞。' };
        let sum = 0, good = 0; const wrongKeys = [], msgs = [];
        task.slots.forEach((s) => {
          const tok = Object.keys(bd.place).find((k) => bd.place[k] === s.id);
          const w = weight(s.id, tok);
          sum += w;
          if (w === 1) { good++; bd.lockItem(tok); return; }
          wrongKeys.push(s.id + ':' + tok);
          msgs.push((task.feedback && (task.feedback[tok + '@' + s.id] || task.feedback[tok])) ||
            '「' + bd.text(tok) + '」不能回答「' + s.label + '」。回到原文，找直接回答這個問題的詞。');
          bd.mark(tok, 'was-wrong'); bd.toPool(tok);
        });
        bd.resetFocus(); bd.render();
        return { ok: sum === task.slots.length, base: sum / task.slots.length, wrongKeys, msgs, partial: good + '／' + task.slots.length };
      },
      reveal() {
        Object.keys(bd.place).forEach((k) => { if (!bd.locked.has(k)) bd.place[k] = null; });
        task.slots.forEach((s) => {
          const best = Object.keys(task.correctAnswer[s.id]).find((k) => task.correctAnswer[s.id][k] === 1);
          bd.place[best] = s.id; bd.lockItem(best);
        });
        bd.render();
      },
      lock() { bd.lockAll(); }
    };
  };

  /* ---------- 排序：依序點卡片，卡片就排進上方的順序格 ---------- */
  TYPES.order = function (el, task, ctl) {
    const n = task.options.length;
    let pool = shuffle(task.options.map((o) => o.id));
    if (pool.join() === task.correctAnswer.join()) pool = pool.slice().reverse();
    const seq = new Array(n).fill(null);
    const good = new Set();
    let locked = false;
    const text = (id) => task.options.find((o) => o.id === id).text;
    function render() {
      const waiting = pool.filter((id) => !seq.includes(id));
      el.innerHTML = '<p class="how">依照順序點上面的卡片，點到的卡片會排進下方的順序格。點順序格裡的卡片可以拿回來。</p>' +
        '<div class="order-pool"><p class="pool-label">答案選項</p>' + (waiting.length ? waiting.map((id) => '<button type="button" class="chip" data-id="' + id + '"' + (locked ? ' disabled' : '') + '>' + esc(text(id)) + '</button>').join('') : '<p class="muted small">卡片都排好了，確認後按「送出答案」。</p>') + '</div>' +
        '<ol class="seq">' + seq.map((id, i) => '<li class="seq-slot' + (id ? ' filled' : '') + (id && good.has(id) ? ' right' : '') + '">' +
          '<span class="order-n">' + (i + 1) + '</span>' +
          (id ? '<button type="button" class="seq-card" data-i="' + i + '"' + (locked || good.has(id) ? ' disabled' : '') + '>' + esc(text(id)) + '</button>' : '<span class="seq-empty">第 ' + (i + 1) + ' 步</span>') +
          '</li>').join('') + '</ol>';
      el.querySelectorAll('.order-pool .chip').forEach((b) => b.addEventListener('click', () => {
        const i = seq.indexOf(null); if (i < 0 || locked) return;
        seq[i] = b.dataset.id; ctl.sfx.place && ctl.sfx.place(); ctl.message('', ''); render();
      }));
      el.querySelectorAll('.seq-card').forEach((b) => b.addEventListener('click', () => {
        if (locked) return; seq[+b.dataset.i] = null; ctl.sfx.place && ctl.sfx.place(); render();
      }));
    }
    render();
    return {
      check() {
        if (seq.includes(null)) return { notReady: '還有 ' + seq.filter((x) => !x).length + ' 格沒排。' };
        const wrongKeys = []; let g = 0;
        seq.forEach((id, i) => {
          if (task.correctAnswer[i] === id) { g++; good.add(id); } else { wrongKeys.push('pos:' + id); seq[i] = null; }
        });
        render();
        const ok = g === n;
        return { ok, base: g / n, wrongKeys, partial: g + '／' + n,
          msgs: ok ? [] : [(task.feedback && task.feedback.generic) || GENERIC, '目前有 ' + g + ' 格排對了（綠色），排錯的卡片已經放回上方選項。'] };
      },
      reveal() { task.correctAnswer.forEach((id, i) => { seq[i] = id; good.add(id); }); render(); },
      lock() { locked = true; render(); }
    };
  };

  /* ---------- 關係連線：亮起來的人物就是目前的人物，直接點右邊的節點連線 ---------- */
  TYPES.connect = function (el, task, ctl) {
    const edges = new Set();
    const P = task.people, H = task.hubs;
    let selP = P[0].id, locked = false;
    el.innerHTML = '<p class="how">亮起來的是目前的人物。直接點右邊和他有關的地點就會連線，可以連好幾條；再點一次會取消。換人時點左邊的人名。</p>' +
      '<div class="graph"><svg class="graph-lines" aria-hidden="true"></svg>' +
      '<div class="g-col g-people">' + P.map((p) => '<button type="button" class="g-node person" data-p="' + p.id + '"><b>' + esc(p.text) + '</b><small>' + esc(p.sub || '') + '</small></button>').join('') + '</div>' +
      '<div class="g-col g-hubs">' + H.map((h) => '<button type="button" class="g-node hub c-' + h.color + '" data-h="' + h.id + '"><b>' + esc(h.text) + '</b><small>' + esc(h.sub || '') + '</small></button>').join('') + '</div>' +
      '</div><div class="edge-list" aria-live="polite"></div>';
    const svg = el.querySelector('.graph-lines'), graph = el.querySelector('.graph');
    const colorOf = (h) => ({ brick: '#a9523b', warm: '#c7952e', sage: '#5f7a60' }[(H.find((x) => x.id === h) || {}).color] || '#5e7a8e');
    const pname = (id) => P.find((x) => x.id === id).text, hname = (id) => H.find((x) => x.id === id).text;

    el.querySelectorAll('.person').forEach((b) => b.addEventListener('click', () => { if (!locked) { selP = b.dataset.p; paint(); } }));
    el.querySelectorAll('.hub').forEach((b) => b.addEventListener('click', () => { if (!locked && selP) toggle(selP + '-' + b.dataset.h); }));
    function toggle(key) {
      edges.has(key) ? edges.delete(key) : edges.add(key);
      ctl.sfx.place && ctl.sfx.place(); ctl.message('', '');
      paint();
    }
    function paint() {
      el.querySelectorAll('.person').forEach((b) => {
        b.classList.toggle('sel', !locked && b.dataset.p === selP);
        b.classList.toggle('linked', [...edges].some((k) => k.startsWith(b.dataset.p + '-')));
      });
      el.querySelectorAll('.hub').forEach((b) => b.classList.toggle('on', !locked && edges.has(selP + '-' + b.dataset.h)));
      draw();
      const list = [...edges].sort();
      el.querySelector('.edge-list').innerHTML = list.length
        ? list.map((k) => { const [p, h] = k.split('-'); return '<button type="button" class="edge-chip" data-k="' + k + '"' + (locked ? ' disabled' : '') + '>' + esc(pname(p)) + ' ↔ ' + esc(hname(h)) + (locked ? '' : ' <span aria-hidden="true">✕</span>') + '</button>'; }).join('')
        : '<p class="muted">還沒有連線。</p>';
      el.querySelectorAll('.edge-chip').forEach((c) => c.addEventListener('click', () => { if (!locked) toggle(c.dataset.k); }));
    }
    function draw() {
      const g = graph.getBoundingClientRect();
      svg.setAttribute('viewBox', '0 0 ' + g.width + ' ' + g.height);
      let s = '';
      edges.forEach((k) => {
        const [p, h] = k.split('-');
        const a = el.querySelector('[data-p="' + p + '"]'), b = el.querySelector('[data-h="' + h + '"]');
        if (!a || !b) return;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const x1 = ra.right - g.left, y1 = ra.top + ra.height / 2 - g.top, x2 = rb.left - g.left, y2 = rb.top + rb.height / 2 - g.top;
        const mx = (x1 + x2) / 2;
        s += '<path d="M' + x1 + ' ' + y1 + ' C' + mx + ' ' + y1 + ',' + mx + ' ' + y2 + ',' + x2 + ' ' + y2 + '" stroke="' + colorOf(h) + '" stroke-width="' + (p === selP && !locked ? 3.5 : 2.2) + '" fill="none" stroke-linecap="round"/>';
      });
      svg.innerHTML = s;
    }
    const ro = window.ResizeObserver ? new ResizeObserver(() => draw()) : null;
    if (ro) ro.observe(graph); else window.addEventListener('resize', () => draw());
    setTimeout(() => paint(), 30);
    const req = task.correctAnswer, opt = task.optionalEdges || [];
    return {
      check() {
        if (!edges.size) return { notReady: '請先連出至少一條線。' };
        const wrong = [...edges].filter((k) => !req.includes(k) && !opt.includes(k));
        const missing = req.filter((k) => !edges.has(k));
        const base = clamp((req.length - missing.length - wrong.length) / req.length, 0, 1);
        const msgs = wrong.map((k) => (task.feedback && task.feedback[k]) || ('課文沒有把「' + pname(k.split('-')[0]) + '」和「' + hname(k.split('-')[1]) + '」放在一起談。'))
          .concat(missing.map((k) => (task.feedback && task.feedback['missing:' + k]) || '還有應該連的線沒有連上。'));
        wrong.forEach((k) => edges.delete(k));
        paint();
        return { ok: !wrong.length && !missing.length, base, wrongKeys: wrong.concat(missing.map((k) => 'missing:' + k)), msgs,
          partial: (req.length - missing.length) + '／' + req.length };
      },
      reveal() { req.forEach((k) => edges.add(k)); paint(); },
      lock() { locked = true; paint(); }
    };
  };

  /* ---------- 點選線索（大衛像） ---------- */
  TYPES.reveal = function (el, task, ctl) {
    const need = task.correctAnswer;
    const found = new Set(), decoys = new Set();
    el.innerHTML = '<div class="reveal-stage">' + Art.figure(task.image || 'david', { cls: 'reveal-img' }) +
      '<p class="reveal-count">已找到 <b>0</b>／' + need.length + ' 片</p></div>' +
      '<div class="fragments">' + task.options.map((o) => '<button type="button" class="frag" data-id="' + o.id + '">' + esc(o.text) + '</button>').join('') + '</div>' +
      '<div class="frag-fb" aria-live="polite"></div>';
    const img = el.querySelector('.reveal-img');
    const setBlur = () => { img.style.setProperty('--blur', (14 * (1 - found.size / need.length)).toFixed(1) + 'px'); };
    setBlur();
    el.querySelectorAll('.frag').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.id;
      if (found.has(id) || b.disabled) return;
      if (need.includes(id)) {
        found.add(id); b.classList.add('found'); b.disabled = true;
        ctl.sfx.right && ctl.sfx.right();
        el.querySelector('.reveal-count b').textContent = found.size;
        el.querySelector('.frag-fb').innerHTML = found.size === need.length ? '<p class="ok">霧散了。大衛站在你們面前。按下「完成搜證」。</p>' : '<p class="ok">這片碎片描寫的是雕像本身，霧散開了一些。</p>';
        setBlur();
      } else {
        decoys.add(id); b.classList.add('decoy'); b.disabled = true;
        ctl.sfx.wrong && ctl.sfx.wrong();
        el.querySelector('.frag-fb').innerHTML = '<p class="warn">' + esc((task.feedback && task.feedback[id]) || GENERIC) + '</p>';
      }
    }));
    return {
      submitLabel: '完成搜證',
      check() {
        if (found.size < need.length) return { notReady: '還有 ' + (need.length - found.size) + ' 片描寫雕像的碎片沒有找到。' };
        const f = clamp(1 - 0.1 * decoys.size, 0.3, 1);
        return { ok: true, base: f, wrongKeys: [...decoys], msgs: [] };
      },
      factor() { return clamp(1 - 0.1 * decoys.size, 0.3, 1); },
      extra() { return { wrongs: decoys.size, firstWrong: [...decoys] }; },
      lock() { el.querySelectorAll('.frag').forEach((b) => { b.disabled = true; }); }
    };
  };

  /* ---------- 搜尋驗證 ---------- */
  TYPES.search = function (el, task, ctl) {
    const groups = task.correctAnswer.groups;
    let best = 0, lastWords = [];
    el.innerHTML = '<div class="kw-inputs">' + [1, 2, 3].map((n) => '<label class="kw"><span>關鍵詞 ' + n + '</span><input type="text" maxlength="24" autocomplete="off" inputmode="text"></label>').join('') + '</div>' +
      '<div class="kw-result"></div>';
    const inputs = [...el.querySelectorAll('input')];
    const norm = (s) => s.trim().toLowerCase();
    function links(words) {
      const q = encodeURIComponent(words.join(' '));
      return '<div class="search-links"><a class="btn ghost" target="_blank" rel="noopener" href="' + APP_CONFIG.searchUrl + q + '">用這組關鍵詞搜尋</a>' +
        '<a class="btn ghost" target="_blank" rel="noopener" href="' + APP_CONFIG.imageSearchUrl + q + '">搜尋圖片</a></div>' +
        '<p class="muted small">搜尋會開新分頁。重點是練習「把文章關鍵詞轉成搜尋關鍵詞」，不用花時間讀完結果。</p>';
    }
    return {
      submitLabel: '檢查關鍵詞',
      check() {
        const words = inputs.map((i) => i.value.trim()).filter(Boolean);
        if (words.length < 3) return { notReady: '請填滿三個關鍵詞。' };
        const lower = words.map(norm);
        const covered = groups.filter((g) => lower.some((w) => g.words.some((x) => w.includes(x.toLowerCase()))));
        const missing = groups.filter((g) => !covered.includes(g));
        const base = covered.length / groups.length;
        best = Math.max(best, base); lastWords = words;
        const msgs = missing.map((g) => (task.feedback && task.feedback[g.id]) || ('少了「' + g.name + '」。'));
        const usesOld = lower.some((w) => w.includes('翡冷翠')) && !lower.some((w) => w.includes('佛羅倫斯') || w.includes('florence') || w.includes('firenze'));
        if (usesOld && task.feedback && task.feedback.translation) msgs.push(task.feedback.translation);
        ctl.onSearch({ words, base, at: Date.now() });
        el.querySelector('.kw-result').innerHTML = '<p class="kw-cover">' + groups.map((g) => '<span class="' + (covered.includes(g) ? 'yes' : 'no') + '">' + esc(g.name) + (covered.includes(g) ? ' ✓' : ' ？') + '</span>').join('') + '</p>' + links(words);
        return { ok: missing.length === 0 && !usesOld, base, wrongKeys: missing.map((g) => g.id), msgs, soft: true };
      },
      factor() { return best; },
      extra() { return { keywords: lastWords }; },
      lock() { inputs.forEach((i) => { i.disabled = true; }); }
    };
  };

  /* ---------- 能力雷達 ---------- */
  function radar(scores, abilities) {
    const n = abilities.length, R = 110, cx = 160, cy = 150;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; };
    let s = '<svg viewBox="0 0 320 300" class="radar" role="img" aria-label="閱讀能力雷達圖">';
    [0.25, 0.5, 0.75, 1].forEach((k) => {
      s += '<polygon points="' + abilities.map((_, i) => pt(i, R * k).join(',')).join(' ') + '" fill="none" stroke="var(--line)" stroke-width="1"/>';
    });
    abilities.forEach((_, i) => { const [x, y] = pt(i, R); s += '<line x1="' + cx + '" y1="' + cy + '" x2="' + x + '" y2="' + y + '" stroke="var(--line)"/>'; });
    s += '<polygon points="' + abilities.map((a, i) => pt(i, R * (scores[a.id] || 0) / 100).join(',')).join(' ') + '" fill="var(--fog)" fill-opacity=".35" stroke="var(--fog-d)" stroke-width="2"/>';
    abilities.forEach((a, i) => {
      const [x, y] = pt(i, R + 26);
      s += '<text x="' + x + '" y="' + y + '" text-anchor="middle" dominant-baseline="middle" class="radar-label">' + esc(a.name) + '</text>' +
        '<text x="' + x + '" y="' + (y + 15) + '" text-anchor="middle" class="radar-val">' + (scores[a.id] == null ? '–' : scores[a.id]) + '</text>';
    });
    return s + '</svg>';
  }

  return { mount, radar, esc, shuffle };
})();
