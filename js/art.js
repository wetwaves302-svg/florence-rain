/* =========================================================
   水彩示意圖（SVG）。images/ 裡有同名照片時，照片會蓋在上面。
   ========================================================= */
window.Art = (function () {
  let uid = 0;
  const C = {
    sky: '#cfdbe2', fog: '#8fa7b8', fogD: '#5e7a8e', sage: '#9fb09a', sageD: '#6f8570',
    cream: '#f4ecdc', stone: '#d9cdb6', stoneD: '#b8a98e', brick: '#a9523b', terra: '#c46a45',
    warm: '#e3b04b', ink: '#36434d', water: '#7f9fb3', night: '#3e4d6b'
  };

  function wrap(vb, inner, extraDefs) {
    const id = 'a' + (++uid);
    const body = inner.replace(/ID_/g, id);
    const defs = (extraDefs || '').replace(/ID_/g, id);
    return '<svg viewBox="' + vb + '" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">' +
      '<defs><filter id="' + id + 'wc" x="-5%" y="-5%" width="110%" height="110%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="' + (uid % 9) + '"/>' +
      '<feDisplacementMap in="SourceGraphic" scale="3.5"/></filter>' + defs + '</defs>' +
      '<g filter="url(#' + id + 'wc)">' + body + '</g></svg>';
  }
  const grad = (id, a, b, vertical) =>
    '<linearGradient id="ID_' + id + '" x1="0" y1="0" x2="' + (vertical ? 0 : 1) + '" y2="' + (vertical ? 1 : 0) + '">' +
    '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/></linearGradient>';
  const rainLines = (n, w, h, color) => {
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = (i * 37) % w, y = (i * 53) % h;
      s += '<line x1="' + x + '" y1="' + y + '" x2="' + (x - 6) + '" y2="' + (y + 18) + '" stroke="' + (color || '#fff') + '" stroke-opacity=".45" stroke-width="1"/>';
    }
    return s;
  };
  const windows = (x, y, cols, rows, dx, dy, color) => {
    let s = '';
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++)
      s += '<rect x="' + (x + c * dx) + '" y="' + (y + r * dy) + '" width="' + (dx * 0.45) + '" height="' + (dy * 0.55) + '" rx="3" fill="' + color + '"/>';
    return s;
  };
  const dome = (cx, base, r, color) =>
    '<path d="M' + (cx - r) + ' ' + base + ' Q' + (cx - r) + ' ' + (base - r * 1.25) + ' ' + cx + ' ' + (base - r * 1.3) +
    ' Q' + (cx + r) + ' ' + (base - r * 1.25) + ' ' + (cx + r) + ' ' + base + ' Z" fill="' + color + '"/>' +
    '<path d="M' + cx + ' ' + (base - r * 1.3) + ' L' + cx + ' ' + base + ' M' + (cx - r * 0.5) + ' ' + (base - r * 1.1) + ' Q' + (cx - r * 0.55) + ' ' + (base - r * 0.5) + ' ' + (cx - r * 0.62) + ' ' + base +
    ' M' + (cx + r * 0.5) + ' ' + (base - r * 1.1) + ' Q' + (cx + r * 0.55) + ' ' + (base - r * 0.5) + ' ' + (cx + r * 0.62) + ' ' + base + '" stroke="#f4ecdc" stroke-opacity=".7" stroke-width="2" fill="none"/>' +
    '<rect x="' + (cx - r * 0.12) + '" y="' + (base - r * 1.55) + '" width="' + (r * 0.24) + '" height="' + (r * 0.3) + '" fill="#f4ecdc"/>';

  const scenes = {
    train() {
      return wrap('0 0 400 220',
        '<rect width="400" height="220" fill="url(#ID_s)"/>' +
        '<g opacity=".55">' + dome(250, 150, 40, C.terra) + '<rect x="60" y="120" width="120" height="60" fill="' + C.stoneD + '"/><rect x="300" y="110" width="90" height="70" fill="' + C.stone + '"/></g>' +
        '<rect y="175" width="400" height="45" fill="' + C.sageD + '" opacity=".5"/>' +
        rainLines(60, 400, 200) +
        '<rect x="0" y="0" width="400" height="220" fill="none" stroke="' + C.ink + '" stroke-width="26" rx="36"/>' +
        '<rect x="196" y="0" width="8" height="220" fill="' + C.ink + '"/>',
        grad('s', '#b9c9d3', '#e6dcc8', true));
    },
    alley() {
      return wrap('0 0 400 220',
        '<rect width="400" height="220" fill="url(#ID_s)"/>' + dome(200, 120, 34, C.terra) +
        '<rect x="170" y="120" width="60" height="50" fill="' + C.cream + '"/>' +
        '<path d="M0 0 L120 30 L135 220 L0 220 Z" fill="' + C.stone + '"/>' + windows(20, 50, 2, 3, 45, 45, C.fogD) +
        '<path d="M400 0 L285 25 L270 220 L400 220 Z" fill="#e2c9a3"/>' + windows(300, 50, 2, 3, 45, 45, C.fogD) +
        '<path d="M135 220 L175 165 L225 165 L270 220 Z" fill="#c8c6c0"/>' +
        '<ellipse cx="300" cy="200" rx="10" ry="4" fill="' + C.ink + '" opacity=".3"/>' +
        '<rect x="296" y="160" width="9" height="36" rx="4" fill="' + C.warm + '"/>' + rainLines(50, 400, 200),
        grad('s', '#aebfcc', '#f0d9a8', true));
    },
    arno() {
      return wrap('0 0 400 220',
        '<rect width="400" height="220" fill="url(#ID_s)"/>' +
        '<path d="M0 110 Q100 80 200 100 T400 95 L400 130 L0 130 Z" fill="' + C.sage + '" opacity=".7"/>' +
        '<rect y="128" width="400" height="92" fill="url(#ID_w)"/>' +
        bridge(40, 128, 320) + '<rect y="175" width="400" height="45" fill="' + C.water + '" opacity=".35"/>' + rainLines(40, 400, 200),
        grad('s', '#c0cdd5', '#e9dfcc', true) + grad('w', '#8fabbd', '#5f7f94', true));
    },
    duomo() {
      return wrap('0 0 400 220',
        '<rect width="400" height="220" fill="url(#ID_s)"/>' + dome(200, 120, 70, C.terra) +
        '<rect x="110" y="120" width="180" height="100" fill="' + C.cream + '"/>' +
        '<g fill="' + C.sageD + '" opacity=".75"><rect x="110" y="135" width="180" height="6"/><rect x="110" y="165" width="180" height="6"/><rect x="110" y="195" width="180" height="6"/></g>' +
        '<g fill="#d99a8a" opacity=".7"><rect x="130" y="145" width="12" height="18"/><rect x="170" y="145" width="12" height="18"/><rect x="218" y="145" width="12" height="18"/><rect x="258" y="145" width="12" height="18"/></g>' +
        '<rect x="320" y="40" width="34" height="180" fill="' + C.cream + '"/><rect x="320" y="80" width="34" height="5" fill="' + C.sageD + '"/><rect x="320" y="130" width="34" height="5" fill="' + C.sageD + '"/>' +
        '<rect x="0" y="150" width="100" height="70" fill="' + C.stone + '"/>' + rainLines(40, 400, 200),
        grad('s', '#b9c8d2', '#eee3cf', true));
    },
    david() {
      return wrap('0 0 400 220',
        '<rect width="400" height="220" fill="url(#ID_s)"/>' +
        '<path d="M140 220 L140 70 Q200 10 260 70 L260 220 Z" fill="#d7d2c6"/>' + statue(200, 38, 0.95) +
        '<rect x="160" y="200" width="80" height="20" fill="' + C.stoneD + '"/>',
        grad('s', '#9aa7ad', '#e5ded0', true));
    },
    santacroce() {
      return wrap('0 0 400 220',
        '<rect width="400" height="220" fill="url(#ID_s)"/>' +
        '<path d="M110 220 L110 90 L200 40 L290 90 L290 220 Z" fill="' + C.cream + '"/>' +
        '<path d="M110 90 L200 40 L290 90" stroke="' + C.sageD + '" stroke-width="5" fill="none"/>' +
        '<circle cx="200" cy="100" r="18" fill="' + C.fog + '"/><circle cx="200" cy="100" r="10" fill="none" stroke="' + C.cream + '" stroke-width="2"/>' +
        '<path d="M178 220 L178 170 Q200 148 222 170 L222 220 Z" fill="' + C.brick + '"/>' +
        '<path d="M125 220 L125 180 Q138 168 151 180 L151 220 Z M249 220 L249 180 Q262 168 275 180 L275 220 Z" fill="' + C.brick + '" opacity=".8"/>' +
        '<rect x="320" y="30" width="26" height="190" fill="#e2c9a3"/><path d="M316 30 L333 10 L350 30 Z" fill="' + C.terra + '"/>' +
        '<rect y="205" width="400" height="15" fill="' + C.stoneD + '"/>' + rainLines(30, 400, 200),
        grad('s', '#c4d0d8', '#ecdcc0', true));
    },
    dusk() {
      return wrap('0 0 400 220',
        '<rect width="400" height="220" fill="url(#ID_s)"/>' +
        '<path d="M0 30 L110 60 L110 220 L0 220 Z" fill="#5a5f73"/>' + windows(15, 80, 2, 3, 45, 40, C.warm) +
        '<path d="M400 30 L290 60 L290 220 L400 220 Z" fill="#62667a"/>' + windows(305, 80, 2, 3, 45, 40, C.warm) +
        '<rect x="175" y="30" width="50" height="120" fill="#6d6f80"/><circle cx="200" cy="65" r="18" fill="' + C.cream + '"/>' +
        '<path d="M200 65 L200 51 M200 65 L200 80" stroke="' + C.ink + '" stroke-width="3" stroke-linecap="round"/>' +
        '<path d="M110 220 L170 150 L230 150 L290 220 Z" fill="#7b7a86"/>' +
        '<g fill="' + C.warm + '"><circle cx="140" cy="140" r="6"/><circle cx="260" cy="140" r="6"/></g>' +
        '<g fill="' + C.warm + '" opacity=".25"><circle cx="140" cy="140" r="22"/><circle cx="260" cy="140" r="22"/></g>' + rainLines(55, 400, 210),
        grad('s', '#3e4d6b', '#c98e6a', true));
    },
    barcelona() {
      return wrap('0 0 400 220',
        '<rect width="400" height="220" fill="url(#ID_s)"/>' + spires(120) + crane(300) +
        '<rect y="195" width="400" height="25" fill="' + C.stoneD + '"/>',
        grad('s', '#d4dce0', '#f1e3c4', true));
    }
  };

  function bridge(x, water, w) {
    let s = '<rect x="' + x + '" y="' + (water - 40) + '" width="' + w + '" height="14" fill="' + C.stoneD + '"/>';
    const houses = ['#e2b36a', '#c9805a', '#e6d2a0', '#b9634a', '#d9a86b', '#e0c48e', '#c27556'];
    for (let i = 0; i < 7; i++) s += '<rect x="' + (x + i * (w / 7)) + '" y="' + (water - 72 + (i % 2) * 6) + '" width="' + (w / 7 - 2) + '" height="' + (34 - (i % 2) * 6) + '" fill="' + houses[i] + '"/>' +
      windows(x + i * (w / 7) + 6, water - 64 + (i % 2) * 6, 2, 1, 16, 16, C.fogD);
    s += '<rect x="' + x + '" y="' + (water - 26) + '" width="' + w + '" height="30" fill="' + C.stone + '"/>';
    for (let i = 0; i < 3; i++) {
      const ax = x + 30 + i * ((w - 60) / 3), aw = (w - 60) / 3 - 20;
      s += '<path d="M' + ax + ' ' + (water + 4) + ' Q' + (ax + aw / 2) + ' ' + (water - 24) + ' ' + (ax + aw) + ' ' + (water + 4) + ' Z" fill="#6f8b9c"/>';
    }
    return s;
  }
  function statue(cx, top, k) {
    const t = (v) => v * k;
    return '<g fill="#f3f0e8" stroke="#bdb6a6" stroke-width="1.2">' +
      '<circle cx="' + cx + '" cy="' + (top + t(14)) + '" r="' + t(12) + '"/>' +
      '<path d="M' + (cx - t(4)) + ' ' + (top + t(26)) + ' L' + (cx - t(22)) + ' ' + (top + t(40)) + ' L' + (cx - t(26)) + ' ' + (top + t(88)) +
      ' L' + (cx - t(16)) + ' ' + (top + t(90)) + ' L' + (cx - t(14)) + ' ' + (top + t(52)) + ' L' + (cx - t(14)) + ' ' + (top + t(96)) +
      ' L' + (cx - t(18)) + ' ' + (top + t(160)) + ' L' + (cx - t(8)) + ' ' + (top + t(160)) + ' L' + (cx) + ' ' + (top + t(104)) +
      ' L' + (cx + t(8)) + ' ' + (top + t(158)) + ' L' + (cx + t(20)) + ' ' + (top + t(156)) + ' L' + (cx + t(14)) + ' ' + (top + t(96)) +
      ' L' + (cx + t(16)) + ' ' + (top + t(52)) + ' L' + (cx + t(26)) + ' ' + (top + t(30)) + ' L' + (cx + t(20)) + ' ' + (top + t(18)) +
      ' L' + (cx + t(12)) + ' ' + (top + t(36)) + ' L' + (cx + t(4)) + ' ' + (top + t(26)) + ' Z"/></g>' +
      '<path d="M' + (cx - t(8)) + ' ' + (top + t(60)) + ' Q' + cx + ' ' + (top + t(66)) + ' ' + (cx + t(8)) + ' ' + (top + t(60)) + '" stroke="#c9c2b2" fill="none"/>';
  }
  function spires(x) {
    let s = '';
    [[0, 70], [40, 40], [80, 30], [120, 55], [160, 75]].forEach(([dx, top]) => {
      const cx = x + dx;
      s += '<path d="M' + (cx - 14) + ' 200 L' + (cx - 11) + ' ' + (top + 30) + ' Q' + cx + ' ' + top + ' ' + (cx + 11) + ' ' + (top + 30) + ' L' + (cx + 14) + ' 200 Z" fill="#cdb48f"/>' +
        '<circle cx="' + cx + '" cy="' + (top + 4) + '" r="5" fill="' + C.warm + '"/>';
      for (let y = top + 40; y < 190; y += 18) s += '<rect x="' + (cx - 3) + '" y="' + y + '" width="6" height="8" rx="3" fill="#8a7458" opacity=".6"/>';
    });
    return s;
  }
  function crane(x) {
    return '<g stroke="' + C.brick + '" stroke-width="3" fill="none"><path d="M' + x + ' 200 L' + x + ' 20 M' + (x - 70) + ' 30 L' + (x + 40) + ' 30 M' + x + ' 20 L' + (x - 70) + ' 30 M' + x + ' 20 L' + (x + 40) + ' 30"/>' +
      '<path d="M' + (x - 55) + ' 30 L' + (x - 55) + ' 80" stroke-width="1.5"/></g><rect x="' + (x - 62) + '" y="80" width="14" height="10" fill="' + C.brick + '"/>' +
      '<path d="M' + (x - 6) + ' 40 L' + (x + 6) + ' 52 M' + (x + 6) + ' 40 L' + (x - 6) + ' 52 M' + (x - 6) + ' 70 L' + (x + 6) + ' 82 M' + (x + 6) + ' 70 L' + (x - 6) + ' 82" stroke="' + C.brick + '" stroke-width="1.5"/>';
  }

  const images = {
    ponte_vecchio() {
      return wrap('0 0 300 200', '<rect width="300" height="200" fill="url(#ID_s)"/><rect y="130" width="300" height="70" fill="url(#ID_w)"/>' + bridge(20, 130, 260) +
        '<rect y="165" width="300" height="35" fill="' + C.water + '" opacity=".35"/>', grad('s', '#c3d0d8', '#efe3cc', true) + grad('w', '#8fabbd', '#5f7f94', true));
    },
    bridge_modern() {
      let cables = '';
      for (let i = 0; i < 7; i++) cables += '<line x1="150" y1="' + (30 + i * 8) + '" x2="' + (20 + i * 18) + '" y2="128" stroke="#8d969c" stroke-width="1.3"/><line x1="150" y1="' + (30 + i * 8) + '" x2="' + (280 - i * 18) + '" y2="128" stroke="#8d969c" stroke-width="1.3"/>';
      return wrap('0 0 300 200', '<rect width="300" height="200" fill="#d6e0e6"/><rect y="140" width="300" height="60" fill="#8aa6b8"/>' + cables +
        '<rect x="145" y="20" width="10" height="150" fill="#9aa3a8"/><rect x="0" y="126" width="300" height="8" fill="#7d858a"/>');
    },
    bridge_wood() {
      let trees = '';
      for (let i = 0; i < 9; i++) trees += '<path d="M' + (i * 36) + ' 120 L' + (i * 36 + 18) + ' ' + (40 + (i % 3) * 12) + ' L' + (i * 36 + 36) + ' 120 Z" fill="' + (i % 2 ? C.sageD : '#5d735e') + '"/>';
      return wrap('0 0 300 200', '<rect width="300" height="200" fill="#dfe6d8"/>' + trees + '<rect y="120" width="300" height="80" fill="#8a9e84"/>' +
        '<path d="M0 160 Q150 140 300 165 L300 200 L0 200 Z" fill="#7fa1b1"/>' +
        '<path d="M60 150 Q150 130 240 150" stroke="#8a6a48" stroke-width="7" fill="none"/><path d="M60 140 Q150 120 240 140" stroke="#8a6a48" stroke-width="2" fill="none"/>' +
        '<g stroke="#8a6a48" stroke-width="2"><line x1="90" y1="143" x2="90" y2="132"/><line x1="150" y1="138" x2="150" y2="126"/><line x1="210" y1="143" x2="210" y2="132"/></g>');
    },
    venice_canal() {
      return wrap('0 0 300 200', '<rect width="300" height="200" fill="#e8dcc4"/>' +
        '<path d="M0 0 L100 20 L110 200 L0 200 Z" fill="#d49a72"/>' + windows(15, 40, 2, 3, 38, 40, '#6d7f8a') +
        '<path d="M300 0 L200 20 L190 200 L300 200 Z" fill="#e3c38e"/>' + windows(215, 40, 2, 3, 38, 40, '#6d7f8a') +
        '<path d="M110 200 L130 120 L170 120 L190 200 Z" fill="#6f9c9a"/>' +
        '<path d="M125 172 Q150 184 178 168 L174 176 Q150 190 128 178 Z" fill="#2f3a40"/><line x1="170" y1="172" x2="182" y2="140" stroke="#2f3a40" stroke-width="2"/>');
    },
    david() { return scenes.david(); },
    duomo() { return scenes.duomo(); },
    columns_forest() {
      let s = '';
      [50, 120, 190, 260].forEach((x) => {
        s += '<rect x="' + (x - 7) + '" y="90" width="14" height="110" fill="#e6dccb"/>' +
          '<path d="M' + x + ' 92 L' + (x - 30) + ' 30 M' + x + ' 92 L' + x + ' 20 M' + x + ' 92 L' + (x + 30) + ' 30 M' + (x - 30) + ' 30 L' + (x - 42) + ' 5 M' + (x + 30) + ' 30 L' + (x + 42) + ' 5" stroke="#e6dccb" stroke-width="7" stroke-linecap="round" fill="none"/>';
      });
      return wrap('0 0 300 200', '<rect width="300" height="200" fill="#8e9aa0"/>' + s + '<rect y="190" width="300" height="10" fill="#6f777b"/>');
    },
    window_warm() {
      return wrap('0 0 300 200', '<rect width="300" height="200" fill="#5b4a48"/>' +
        '<path d="M110 10 L190 10 L190 140 L110 140 Z" fill="url(#ID_g)"/>' +
        '<path d="M110 140 L20 200 L280 200 L190 140 Z" fill="#e59a4f" opacity=".55"/>' +
        '<g stroke="#5b4a48" stroke-width="3"><line x1="150" y1="10" x2="150" y2="140"/><line x1="110" y1="60" x2="190" y2="60"/><line x1="110" y1="100" x2="190" y2="100"/></g>',
        grad('g', '#f4c26b', '#c9522f', true));
    },
    crane_spires() {
      return wrap('0 0 300 200', '<rect width="300" height="200" fill="#dfe5e8"/>' +
        '<g transform="translate(-40,0) scale(.9)">' + spires(90) + '</g>' + crane(240) + '<rect y="185" width="300" height="15" fill="' + C.stoneD + '"/>');
    },
    map_florence() {
      return wrap('0 0 400 300', '<rect width="400" height="300" fill="#f2ead9"/>' +
        '<g stroke="#d6c9ae" stroke-width="3" fill="none"><path d="M40 40 L360 120"/><path d="M60 250 L200 30"/><path d="M150 280 L380 60"/><path d="M20 160 L380 180"/><path d="M100 20 L140 280"/></g>' +
        '<path d="M-10 238 C 80 220, 140 190, 200 196 S 330 230, 410 205" stroke="#8fb3c6" stroke-width="30" fill="none" stroke-linecap="round"/>' +
        '<path d="M-10 238 C 80 220, 140 190, 200 196 S 330 230, 410 205" stroke="#b9d2de" stroke-width="10" fill="none" opacity=".7"/>' +
        '<text x="330" y="270" font-size="15" fill="#6d8898" font-family="serif">N ↑</text>');
    }
  };

  function icon(name) {
    const icons = {
      wave: '<path d="M4 16 Q10 10 16 16 T28 16 M4 24 Q10 18 16 24 T28 24" stroke="#4f7d96" stroke-width="3" fill="none" stroke-linecap="round"/>',
      bridge: '<rect x="3" y="11" width="26" height="6" fill="#b8a98e"/><path d="M5 26 Q10 17 15 26 M17 26 Q22 17 27 26" stroke="#8a7a60" stroke-width="3" fill="none"/><rect x="5" y="5" width="6" height="6" fill="#e2b36a"/><rect x="13" y="6" width="6" height="5" fill="#c9805a"/><rect x="21" y="5" width="6" height="6" fill="#e6d2a0"/>',
      dome: '<path d="M6 24 Q6 8 16 7 Q26 8 26 24 Z" fill="#c46a45"/><rect x="14" y="3" width="4" height="5" fill="#f4ecdc"/><rect x="4" y="24" width="24" height="5" fill="#e8dcc4"/>',
      facade: '<path d="M5 29 L5 13 L16 5 L27 13 L27 29 Z" fill="#f4ecdc" stroke="#6f8570" stroke-width="2"/><circle cx="16" cy="15" r="3.5" fill="#8fa7b8"/><path d="M13 29 L13 23 Q16 20 19 23 L19 29 Z" fill="#a9523b"/>'
    };
    return '<svg viewBox="0 0 32 32" aria-hidden="true">' + (icons[name] || '') + '</svg>';
  }

  const sceneImageKey = { train: 'florence_rain_street', alley: 'florence_rain_street', arno: 'arno_river', duomo: 'duomo', david: 'david', santacroce: 'santa_croce', dusk: 'florence_dusk', barcelona: 'sagrada_familia' };

  function figure(key, opts) {
    opts = opts || {};
    const meta = (window.GAME_IMAGES || {})[key];
    const svg = images[key] ? images[key]() : (scenes[key] ? scenes[key]() : '');
    const useFile = window.APP_CONFIG && APP_CONFIG.useImageFiles && meta;
    const img = useFile ? '<img src="images/' + meta.file + '" alt="' + (opts.alt || meta.use) + '" loading="lazy" onload="this.parentNode.classList.add(\'has-photo\')" onerror="this.remove()">' : '';
    const tag = meta ? '<span class="ph-tag">示意圖 ' + meta.file + '</span>' : '';
    return '<figure class="ph ' + (opts.cls || '') + '">' + svg + img + tag + (opts.caption ? '<figcaption>' + opts.caption + '</figcaption>' : '') + '</figure>';
  }
  function scene(name, cls) {
    const key = sceneImageKey[name];
    const meta = (window.GAME_IMAGES || {})[key];
    const useFile = window.APP_CONFIG && APP_CONFIG.useImageFiles && meta;
    const img = useFile ? '<img src="images/' + meta.file + '" alt="" onload="this.parentNode.classList.add(\'has-photo\')" onerror="this.remove()">' : '';
    return '<div class="scene ' + (cls || '') + '">' + (scenes[name] ? scenes[name]() : '') + img + '<div class="rain-layer"></div></div>';
  }

  return { scene, figure, icon, scenes, images };
})();
