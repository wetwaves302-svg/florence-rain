/* =========================================================
   音效全部以 Web Audio 即時合成，不需要任何音檔，也沒有授權問題。
   學生按下「開始旅程」後才啟動，符合瀏覽器自動播放規則。
   ========================================================= */
window.Sound = (function () {
  let ctx = null, master = null, rainGain = null, rainSrc = null, dripTimer = null;
  let muted = false;
  try { muted = localStorage.getItem('frg_muted') === '1'; } catch (e) { /* 忽略 */ }
  const MASTER = 0.5;

  function start() {
    // iPhone 的靜音鍵預設會讓網頁音效消失；設為 playback 後，靜音鍵打開也聽得到（Safari 17 以上）
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 忽略 */ }
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : MASTER;
      master.connect(ctx.destination);
      startRain();
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function noiseBuffer(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  function startRain() {
    rainSrc = ctx.createBufferSource();
    rainSrc.buffer = noiseBuffer(3);
    rainSrc.loop = true;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    rainGain = ctx.createGain(); rainGain.gain.value = 0.045;
    rainSrc.connect(hp); hp.connect(lp); lp.connect(rainGain); rainGain.connect(master);
    rainSrc.start();
    const drip = () => {
      if (ctx && !muted) tone(1400 + Math.random() * 1400, 0.05, 0.012, 'sine', 700);
      dripTimer = setTimeout(drip, 500 + Math.random() * 1600);
    };
    drip();
  }

  function setRain(level) { if (rainGain) rainGain.gain.setTargetAtTime(level, ctx.currentTime, 0.8); }

  function wake() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
  function tone(freq, dur, vol, type, endFreq, when) {
    if (!ctx) return;
    wake();
    const t = ctx.currentTime + (when || 0);
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }

  function burst(dur, freq, q, vol, when, sweepTo) {
    if (!ctx) return;
    const t = ctx.currentTime + (when || 0);
    const s = ctx.createBufferSource(); s.buffer = noiseBuffer(dur + 0.05);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }

  function bellStrike(base, vol, when, decay) {
    const partials = [0.5, 1, 1.19, 1.56, 2, 2.51, 3.01];
    partials.forEach((p, i) => tone(base * p, decay * (1 - i * 0.08), vol / (i + 1.3), 'sine', null, when));
  }

  const api = {
    start,
    ready: () => !!ctx,
    isMuted: () => muted,
    toggleMute() {
      muted = !muted;
      try { localStorage.setItem('frg_muted', muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
      if (master) master.gain.setTargetAtTime(muted ? 0 : MASTER, ctx.currentTime, 0.05);
      return muted;
    },
    rainSoft() { setRain(0.03); },
    rainNormal() { setRain(0.045); },
    step() { burst(0.08, 380, 1.2, 0.12); burst(0.08, 320, 1.2, 0.1, 0.28); },
    paper() { burst(0.35, 2500, 0.8, 0.09, 0, 900); burst(0.2, 1800, 0.8, 0.05, 0.25, 3200); },
    // 答對：上行三音鈴聲，連續答對時音高逐次升高，最後加一串亮音
    right(streak) {
      const up = Math.pow(1.06, Math.min(streak || 0, 6));
      [523.25, 659.25, 783.99].forEach((f, i) => { tone(f * up, 0.45, 0.16, 'triangle', null, i * 0.09); tone(f * up * 2, 0.35, 0.05, 'sine', null, i * 0.09); });
      tone(1567.98 * up, 0.9, 0.09, 'sine', null, 0.3);
      if ((streak || 0) >= 2) [2093, 2637, 3136].forEach((f, i) => tone(f, 0.25, 0.04, 'sine', null, 0.42 + i * 0.06));
    },
    // 答錯：兩聲低沉下行，清楚但不刺耳
    wrong() {
      tone(311, 0.2, 0.16, 'triangle', 262); tone(155, 0.22, 0.1, 'sine');
      tone(262, 0.32, 0.14, 'triangle', 196, 0.2); tone(131, 0.34, 0.1, 'sine', null, 0.2);
    },
    // 放卡片：輕輕的一聲
    place() { tone(880, 0.09, 0.07, 'sine', 1320); burst(0.05, 3000, 1, 0.03); },
    bellSmall() { bellStrike(392, 0.08, 0, 2.2); },
    bellsFull() {
      // 遠方近方、大大小小各寺院鐘樓的鐘聲
      bellStrike(196, 0.12, 0, 4.5);
      bellStrike(262, 0.07, 0.9, 3.8);
      bellStrike(147, 0.1, 1.6, 5);
      bellStrike(330, 0.05, 2.3, 3);
      bellStrike(196, 0.1, 3.2, 5);
      bellStrike(220, 0.06, 4.1, 4);
    }
  };
  return api;
})();
