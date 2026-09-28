/* =========================================================
   資料儲存層
   - 已填 firebaseConfig：使用 Firebase 匿名登入 + Firestore（多裝置同步）
   - 未填或載入失敗：使用單機模式（localStorage，只存在這台裝置）
   上層程式只呼叫 Store.xxx()，兩種模式介面相同。
   ========================================================= */
window.Store = (function () {
  const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
  let mode = 'local', db = null, uid = null, initError = '';
  const localKey = 'frg_db_v1';
  const listeners = { team: {}, evals: {} };

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('無法載入 ' + src));
      document.head.appendChild(s);
    });
  }

  async function init() {
    const cfg = (window.APP_CONFIG || {}).firebaseConfig || {};
    if (!cfg.apiKey || !cfg.projectId) { mode = 'local'; return mode; }
    try {
      await loadScript(SDK + 'firebase-app-compat.js');
      await loadScript(SDK + 'firebase-auth-compat.js');
      await loadScript(SDK + 'firebase-firestore-compat.js');
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      const cred = await firebase.auth().signInAnonymously();
      uid = cred.user.uid;
      db = firebase.firestore();
      mode = 'firebase';
    } catch (e) {
      console.warn('Firebase 初始化失敗，改用單機模式：', e);
      initError = e && e.message ? e.message : String(e);
      mode = 'local';
    }
    return mode;
  }

  /* ---------------- 單機模式 ---------------- */
  function readLocal() {
    try { return JSON.parse(localStorage.getItem(localKey)) || { teams: {}, evals: {} }; }
    catch (e) { return { teams: {}, evals: {} }; }
  }
  function writeLocal(data) {
    try { localStorage.setItem(localKey, JSON.stringify(data)); } catch (e) { console.warn('本機儲存失敗', e); }
  }
  function notify(kind, id, value) {
    (listeners[kind][id] || []).forEach((cb) => { try { cb(value); } catch (e) { console.error(e); } });
  }
  window.addEventListener('storage', (ev) => {
    if (ev.key !== localKey) return;
    const data = readLocal();
    Object.keys(listeners.team).forEach((id) => notify('team', id, data.teams[id] || null));
    Object.keys(listeners.evals).forEach((id) => notify('evals', id, Object.values(data.evals[id] || {})));
  });

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  function deepMerge(base, patch) {
    const out = Object.assign({}, base || {});
    Object.keys(patch).forEach((k) => {
      out[k] = isObj(patch[k]) && isObj(out[k]) ? deepMerge(out[k], patch[k]) : patch[k];
    });
    return out;
  }

  /* ---------------- 共同介面 ---------------- */
  async function saveTeam(id, patch) {
    patch = clone(patch); patch.updatedAt = Date.now();
    if (mode === 'firebase') {
      await db.collection('teams').doc(id).set(patch, { merge: true });
      return;
    }
    const data = readLocal();
    data.teams[id] = deepMerge(data.teams[id] || {}, patch);
    writeLocal(data);
    notify('team', id, data.teams[id]);
  }

  async function getTeam(id) {
    if (mode === 'firebase') {
      const snap = await db.collection('teams').doc(id).get();
      return snap.exists ? snap.data() : null;
    }
    return readLocal().teams[id] || null;
  }

  async function findTeamByCode(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return null;
    let list = [];
    if (mode === 'firebase') {
      const qs = await db.collection('teams').where('code', '==', code).get();
      qs.forEach((d) => list.push(d.data()));
    } else {
      list = Object.values(readLocal().teams).filter((t) => t.code === code);
    }
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return list[0] || null;
  }

  function subscribeTeam(id, cb) {
    if (mode === 'firebase') {
      return db.collection('teams').doc(id).onSnapshot((s) => cb(s.exists ? s.data() : null), (e) => { console.warn(e); if (window.reportError) window.reportError('同步小隊資料失敗：' + (e.code || '') + ' ' + (e.message || e)); });
    }
    (listeners.team[id] = listeners.team[id] || []).push(cb);
    cb(readLocal().teams[id] || null);
    return () => { listeners.team[id] = (listeners.team[id] || []).filter((f) => f !== cb); };
  }

  async function saveEval(teamId, evaluatorId, data) {
    const doc = Object.assign({ evaluatorId, at: Date.now() }, clone(data));
    if (mode === 'firebase') {
      await db.collection('teams').doc(teamId).collection('evals').doc(evaluatorId).set(doc);
      return;
    }
    const all = readLocal();
    all.evals[teamId] = all.evals[teamId] || {};
    all.evals[teamId][evaluatorId] = doc;
    writeLocal(all);
    notify('evals', teamId, Object.values(all.evals[teamId]));
  }

  async function getEvals(teamId) {
    if (mode === 'firebase') {
      const qs = await db.collection('teams').doc(teamId).collection('evals').get();
      const out = []; qs.forEach((d) => out.push(d.data())); return out;
    }
    return Object.values((readLocal().evals || {})[teamId] || {});
  }

  function subscribeEvals(teamId, cb) {
    if (mode === 'firebase') {
      return db.collection('teams').doc(teamId).collection('evals').onSnapshot((qs) => {
        const out = []; qs.forEach((d) => out.push(d.data())); cb(out);
      }, (e) => { console.warn(e); if (window.reportError) window.reportError('同步評估資料失敗：' + (e.code || '') + ' ' + (e.message || e)); });
    }
    (listeners.evals[teamId] = listeners.evals[teamId] || []).push(cb);
    cb(Object.values((readLocal().evals || {})[teamId] || {}));
    return () => { listeners.evals[teamId] = (listeners.evals[teamId] || []).filter((f) => f !== cb); };
  }

  async function listTeams() {
    if (mode === 'firebase') {
      const qs = await db.collection('teams').orderBy('createdAt', 'desc').limit(1000).get();
      const out = []; qs.forEach((d) => out.push(d.data())); return out;
    }
    return Object.values(readLocal().teams).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  async function exportLocal() { return readLocal(); }

  return {
    init, saveTeam, getTeam, findTeamByCode, subscribeTeam, saveEval, getEvals, subscribeEvals, listTeams, exportLocal,
    mode: () => mode, uid: () => uid, error: () => initError
  };
})();
