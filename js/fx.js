// כל הגרפיקה שמצוירת מעל תמונת המצלמה
const Fx = (() => {
  const rnd = (a, b) => a + Math.random() * (b - a);

  function sprite(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  const SPR = {
    smoke: sprite([[0, 'rgba(70,70,70,.9)'], [0.6, 'rgba(50,50,50,.45)'], [1, 'rgba(40,40,40,0)']]),
    steam: sprite([[0, 'rgba(240,240,245,.8)'], [0.6, 'rgba(220,225,235,.35)'], [1, 'rgba(220,225,235,0)']]),
    fire: sprite([[0, 'rgba(255,255,200,1)'], [0.25, 'rgba(255,190,40,.9)'], [0.6, 'rgba(255,70,0,.5)'], [1, 'rgba(160,0,0,0)']]),
    glow: sprite([[0, 'rgba(255,120,0,.55)'], [1, 'rgba(255,60,0,0)']]),
  };

  // ---------- מסגרת סריקה ----------
  function reticle(ctx, W, H, size, progress, t, color = '#fff') {
    const x = W / 2 - size / 2, y = H / 2 - size / 2, L = size * 0.18;
    ctx.save();
    ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 6;
    ctx.beginPath();
    [[x, y, 1, 1], [x + size, y, -1, 1], [x, y + size, 1, -1], [x + size, y + size, -1, -1]].forEach(([cx, cy, sx, sy]) => {
      ctx.moveTo(cx + sx * L, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + sy * L);
    });
    ctx.stroke();
    // קו סריקה
    const sy = y + (0.5 + 0.5 * Math.sin(t * 3)) * size;
    ctx.globalAlpha = 0.5; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 8, sy); ctx.lineTo(x + size - 8, sy); ctx.stroke();
    // טבעת התקדמות
    if (progress > 0.02) {
      ctx.globalAlpha = 1; ctx.strokeStyle = '#3dff7a'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, size * 0.2, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- חץ שמוביל אל תוך הדלת ----------
  function doorArrow(ctx, W, H, p, t, alpha) {
    const tx = p.front ? Math.max(W * 0.15, Math.min(W * 0.85, p.x)) : W / 2;
    const ty = p.front ? Math.max(H * 0.25, Math.min(H * 0.6, p.y)) : H * 0.45;
    const sx = W / 2, sy = H * 0.95;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 18;
    for (let i = 0; i < 6; i++) {
      const u = ((i / 6) + t * 0.45) % 1;           // 0 קרוב לשחקן, 1 בדלת
      const k = 1 - Math.pow(1 - u, 1.6);           // תחושת עומק
      const x = sx + (tx - sx) * k, y = sy + (ty - sy) * k;
      const s = (1 - k * 0.8) * W * 0.16;
      ctx.globalAlpha = alpha * Math.sin(u * Math.PI);
      ctx.strokeStyle = '#3dffa0'; ctx.lineWidth = Math.max(3, s * 0.22);
      ctx.beginPath(); ctx.moveTo(x - s, y + s * 0.55); ctx.lineTo(x, y); ctx.lineTo(x + s, y + s * 0.55); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- חוש סכנה: ברקים אדומים וכחולים מצידי הפריים ----------
  let bolts = [], boltT = 0;
  function makeBolt(W, H, side) {
    const pts = [], y0 = rnd(0.05, 0.95) * H, reach = rnd(0.18, 0.42) * W, n = 9;
    let y = y0;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * reach;
      y += rnd(-1, 1) * H * 0.035;
      pts.push([side < 0 ? x : W - x, y]);
    }
    return { pts, side, w: rnd(1.5, 4) };
  }
  function danger(ctx, W, H, env, dt) {
    // env: עוצמת פעימת הלב 0..1
    ctx.save();
    const a = 0.12 + 0.5 * env;
    let g = ctx.createLinearGradient(0, 0, W * 0.45, 0);
    g.addColorStop(0, `rgba(255,20,30,${a})`); g.addColorStop(1, 'rgba(255,20,30,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W * 0.45, H);
    g = ctx.createLinearGradient(W, 0, W * 0.55, 0);
    g.addColorStop(0, `rgba(30,90,255,${a})`); g.addColorStop(1, 'rgba(30,90,255,0)');
    ctx.fillStyle = g; ctx.fillRect(W * 0.55, 0, W * 0.45, H);

    boltT -= dt;
    if (boltT <= 0) {
      boltT = 0.08; bolts = [];
      const n = env > 0.25 ? 2 + Math.round(env * 3) : 0;
      for (let i = 0; i < n; i++) { bolts.push(makeBolt(W, H, -1)); bolts.push(makeBolt(W, H, 1)); }
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.lineJoin = 'round';
    for (const b of bolts) {
      const col = b.side < 0 ? '#ff2a3a' : '#2a7bff';
      ctx.shadowColor = col; ctx.shadowBlur = 16; ctx.strokeStyle = col;
      ctx.globalAlpha = Math.min(1, 0.4 + env); ctx.lineWidth = b.w + 2;
      ctx.beginPath(); b.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
      ctx.shadowBlur = 0; ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(1, b.w * 0.4);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- עשן, אש ואדים על המקרן ----------
  const parts = [];
  let spawnAcc = { smoke: 0, fire: 0, steam: 0 };
  function fireUpdate(dt, lv, S, sparksOnly) {
    // lv = {smoke, fire, steam} 0..1 ; S = קנה מידה
    // sparksOnly: האש והעשן עצמם מצוירים ב-flames.js, וכאן נשארים רק גיצים
    const rate = sparksOnly ? { smoke: 0, fire: lv.fire * 16, steam: 0 }
      : { smoke: lv.smoke * 28, fire: lv.fire * 90, steam: lv.steam * 40 };
    for (const k of ['smoke', 'fire', 'steam']) {
      spawnAcc[k] += rate[k] * dt;
      while (spawnAcc[k] >= 1) {
        spawnAcc[k]--;
        const spread = (k === 'fire' ? 55 + 45 * lv.fire : 70) * S;
        parts.push({
          k, x: rnd(-1, 1) * spread, y: rnd(-8, 8) * S,
          vx: rnd(-14, 14) * S, vy: -(k === 'fire' ? rnd(60, 150) * (0.6 + lv.fire) : rnd(35, 80)) * S,
          age: 0, life: k === 'fire' ? rnd(0.5, 1.1) : rnd(1.6, 3),
          r: (k === 'fire' ? rnd(22, 46) * (0.5 + lv.fire * 0.9) : rnd(16, 30)) * S, rot: rnd(0, 6),
        });
        if (sparksOnly) {
          const p = parts[parts.length - 1];
          p.r = rnd(2.5, 6) * S; p.life = rnd(0.9, 2); p.vx = rnd(-45, 45) * S; p.vy = -rnd(120, 300) * S; p.y = -rnd(20, 120) * S * lv.fire;
        }
      }
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k !== 'fire' || sparksOnly) p.vx += rnd(-60, 60) * S * dt;
      if (p.age >= p.life) parts.splice(i, 1);
    }
    if (parts.length > 700) parts.splice(0, parts.length - 700);
  }
  function fireDraw(ctx, W, H, pos, lv, S, t, sparksOnly) {
    if (!pos.front) return;
    const ax = pos.x, ay = pos.y;
    ctx.save();
    for (const p of parts) { // עשן ואדים מאחור
      if (p.k === 'fire') continue;
      const u = p.age / p.life, r = p.r * (1 + u * 2.4);
      ctx.globalAlpha = (1 - u) * (u < 0.15 ? u / 0.15 : 1) * 0.75;
      ctx.drawImage(SPR[p.k], ax + p.x - r, ay + p.y - r, r * 2, r * 2);
    }
    ctx.globalCompositeOperation = 'lighter';
    if (lv.fire > 0.02) {
      const gr = (150 + 170 * lv.fire) * S * (0.92 + 0.08 * Math.sin(t * 23));
      ctx.globalAlpha = Math.min(1, lv.fire * 1.2) * (sparksOnly ? 0.55 : 1);
      ctx.drawImage(SPR.glow, ax - gr, ay - gr * 1.1, gr * 2, gr * 2);
    }
    for (const p of parts) {
      if (p.k !== 'fire') continue;
      const u = p.age / p.life, r = p.r * (1 - u * 0.65);
      ctx.globalAlpha = (1 - u) * 0.9;
      ctx.drawImage(SPR.fire, ax + p.x - r, ay + p.y - r * 1.3, r * 2, r * 2.6);
    }
    ctx.restore();
  }
  function fireReset() { parts.length = 0; spawnAcc = { smoke: 0, fire: 0, steam: 0 }; }

  // הבהוב כתום בשולי המסך כשהאש חזקה
  function heat(ctx, W, H, level, t) {
    if (level < 0.3) return;
    const a = (level - 0.3) * 0.5 * (0.8 + 0.2 * Math.sin(t * 17));
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(255,90,0,0)'); g.addColorStop(1, `rgba(255,70,0,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // חץ בשולי המסך שמצביע לכיוון של עוגן שלא נמצא בפריים
  function pointer(ctx, W, H, pos, color, t) {
    const m = 46;
    if (pos.front && pos.x > m && pos.x < W - m && pos.y > m && pos.y < H - m) return;
    let dx = pos.x - W / 2, dy = pos.y - H / 2;
    if (!pos.front) { dx = pos.dx * W; dy = pos.dy * H; }
    const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
    const x = W / 2 + dx * k, y = H / 2 + dy * k, ang = Math.atan2(dy, dx);
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    const s = 16 + 3 * Math.sin(t * 8);
    ctx.fillStyle = color; ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(-s, -s * 0.8); ctx.lineTo(-s * 0.4, 0); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------- עמדת כיבוי: זכוכית נשברת וידית נמשכת ----------
  let shards = [];
  function glassBuild(W, H) {
    const w = Math.min(W * 0.84, 380), h = w * 0.78, cx = W / 2, cy = H / 2;
    const ix = cx + rnd(-0.12, 0.12) * w, iy = cy + rnd(-0.12, 0.12) * h, N = 16;
    const ang = []; for (let i = 0; i < N; i++) ang.push((i + rnd(-0.3, 0.3)) / N * Math.PI * 2);
    const edge = a => { // נקודת החיתוך של קרן עם שפת המלבן
      const dx = Math.cos(a), dy = Math.sin(a);
      const kx = dx > 0 ? (cx + w / 2 - ix) / dx : dx < 0 ? (cx - w / 2 - ix) / dx : 1e9;
      const ky = dy > 0 ? (cy + h / 2 - iy) / dy : dy < 0 ? (cy - h / 2 - iy) / dy : 1e9;
      const k = Math.min(kx, ky); return [ix + dx * k, iy + dy * k];
    };
    const outer = ang.map(edge);
    const mid = outer.map(([x, y]) => { const f = rnd(0.3, 0.55); return [ix + (x - ix) * f, iy + (y - iy) * f]; });
    shards = [];
    const push = pts => {
      const c = pts.reduce((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length], [0, 0]);
      const d = Math.hypot(c[0] - ix, c[1] - iy) || 1;
      shards.push({
        pts: pts.map(p => [p[0] - c[0], p[1] - c[1]]), x: c[0], y: c[1],
        vx: (c[0] - ix) / d * rnd(60, 260), vy: (c[1] - iy) / d * rnd(40, 200) - rnd(60, 220),
        rot: 0, vr: rnd(-5, 5), delay: d / 900,
      });
    };
    for (let i = 0; i < N; i++) {
      const j = (i + 1) % N;
      push([[ix, iy], mid[i], mid[j]]);
      push([mid[i], outer[i], outer[j]]);
      push([mid[i], outer[j], mid[j]]);
    }
    return { cx, cy, w, h };
  }
  function glassDraw(ctx, W, H, box, tt, dt) {
    // tt: זמן מתחילת האנימציה. 0-0.5 הזכוכית מופיעה, 0.5 נסדקת, אחר כך נופלת
    const BREAK = 0.5;
    ctx.save();
    // הקופסה האדומה והידית שמאחורי הזכוכית
    const a = Math.min(1, tt / 0.3);
    ctx.globalAlpha = a;
    ctx.fillStyle = '#c4161c'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
    roundRect(ctx, box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `700 ${box.w * 0.075}px system-ui, sans-serif`;
    ctx.fillText('משוך בשעת שריפה', box.cx, box.cy - box.h * 0.33);
    // ידית: נמשכת למטה אחרי שהזכוכית נופלת
    const pull = Math.max(0, Math.min(1, (tt - 1.5) / 0.6));
    const ease = pull * pull * (3 - 2 * pull);
    const px = box.cx, py = box.cy - box.h * 0.08, len = box.h * 0.42;
    ctx.fillStyle = '#7d0d11'; roundRect(ctx, px - box.w * 0.06, py - 8, box.w * 0.12, len + 16, 8); ctx.fill();
    const hy = py + ease * len;
    ctx.fillStyle = '#fff'; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 10;
    roundRect(ctx, px - box.w * 0.2, hy - box.h * 0.07, box.w * 0.4, box.h * 0.14, box.h * 0.07); ctx.fill();
    ctx.shadowBlur = 0;
    if (pull >= 1) {
      ctx.fillStyle = '#3dff7a'; ctx.font = `800 ${box.w * 0.1}px system-ui, sans-serif`;
      ctx.fillText('הופעל!', box.cx, box.cy + box.h * 0.02);
    }
    // הזכוכית
    for (const s of shards) {
      const ft = tt - BREAK - s.delay;
      if (ft > 0) { s.vy += 1500 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; }
      if (s.y > H + 300) continue;
      ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
      ctx.beginPath(); s.pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
      ctx.globalAlpha = a; ctx.fillStyle = 'rgba(190,230,255,.38)'; ctx.fill();
      if (tt >= BREAK - 0.05) { ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.restore();
    }
    if (tt >= BREAK && tt < BREAK + 0.15) { // הבזק ברגע השבירה
      ctx.globalAlpha = 1 - (tt - BREAK) / 0.15; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  // ---------- ספרינקלרים ----------
  let drops = [];
  const HEADS = []; // ראשי ספרינקלרים "על התקרה" מסביב לחדר
  for (let i = 0; i < 8; i++) {
    const az = i / 8 * Math.PI * 2, el = (i % 2 ? 38 : 55) * Math.PI / 180;
    HEADS.push([Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]);
  }
  function rain(ctx, W, H, level, t, dt) {
    if (level <= 0) return;
    const want = Math.round(170 * level);
    while (drops.length < want) drops.push({ x: rnd(0, W), y: rnd(-H, 0), v: rnd(700, 1300), l: rnd(14, 34), sx: rnd(-0.12, 0.12) });
    if (drops.length > want) drops.length = want;
    ctx.save();
    ctx.fillStyle = `rgba(120,180,255,${0.10 * level})`; ctx.fillRect(0, 0, W, H);
    // ראשי הספרינקלרים והתרסיס שלהם
    for (const h of HEADS) {
      const p = Orient.project(h, W, H);
      if (!p.front || p.x < -80 || p.x > W + 80 || p.y < -80 || p.y > H) continue;
      ctx.strokeStyle = `rgba(200,230,255,${0.55 * level})`; ctx.lineWidth = 2;
      ctx.setLineDash([10, 14]); ctx.lineDashOffset = -t * 500;
      ctx.beginPath();
      for (let k = -5; k <= 5; k++) {
        const a = Math.PI / 2 + k * 0.17;
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + Math.cos(a) * 200, p.y + 40, p.x + Math.cos(a) * 430, p.y + H * 0.9);
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#b9bec6'; ctx.beginPath(); ctx.arc(p.x, p.y, 11, 0, 7); ctx.fill();
      ctx.fillStyle = '#e02b2b'; ctx.fillRect(p.x - 3, p.y - 3, 6, 12);
    }
    // גשם על כל המסך
    ctx.strokeStyle = 'rgba(205,232,255,.6)'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const d of drops) {
      d.y += d.v * dt; d.x += d.sx * d.v * dt;
      if (d.y > H + 40) { d.y = rnd(-80, 0); d.x = rnd(0, W); }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.sx * d.l, d.y - d.l);
    }
    ctx.stroke();
    ctx.restore();
  }
  function rainReset() { drops = []; }

  return { reticle, doorArrow, danger, fireUpdate, fireDraw, fireReset, heat, pointer, glassBuild, glassDraw, rain, rainReset };
})();
