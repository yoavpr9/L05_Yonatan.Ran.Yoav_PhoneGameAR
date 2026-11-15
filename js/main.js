// מהלך המשחק
(() => {
  const $ = id => document.getElementById(id);
  const video = $('cam'), canvas = $('fx'), ctx = canvas.getContext('2d');
  const NAMES = { door: 'ידית דלת', ac: 'מקרן', station: 'עמדת כיבוי', bg: 'רקע' };

  // ----- כיוונון המשחק (אפשר לשנות בחופשיות) -----
  const CFG = {
    smokeOnlySeconds: 3.5,  // עשן עדין לפני שהלהבה מתחילה
    fireGrowSeconds: 12,    // כמה זמן עד שהלהבה בשיא
    extinguishSeconds: 7,   // כמה זמן לוקח לספרינקלרים לכבות
    voteThreshold: 0.8,     // כמה מה"שכנים" צריכים להסכים שזה האובייקט
    minSimilarity: 0.82,    // דמיון מינימלי לדגימה שנסרקה (0..1). גבוה יותר = פחות זיהויים שגויים, אבל צריך לכוון מדויק יותר
    hitsNeeded: 7,          // כמה זיהויים רצופים נדרשים
    acHoldSeconds: 1.5,     // כמה זמן האש נשארת על המסך אחרי שהמקרן יצא מהפריים
  };

  let W = 0, H = 0, state = 'menu', stateT = 0, gameT = 0;
  let camOn = false, modelOn = false, hits = 0, lastRes = null, capLabel = null;
  let doorDir, acDir, stationDir, glassBox, fire0 = 0, beatPhase = 0, beatEnv = 0;
  const lv = { smoke: 0, fire: 0, steam: 0 };
  // האש מוצגת רק כשהמצלמה באמת רואה את המקרן. כך היא לא "נודדת" לקיר אחר כשהולכים בחדר
  let acSeenAt = 0, acLost = false, acVis = 1, extT = 0;
  const acGate = () => modelOn && Recognizer.counts().ac > 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    Flames.resize(W, H);
  }
  const gl3d = Flames.init($('gl'));
  window.addEventListener('resize', resize); resize();

  const show = (id, on) => $(id).classList.toggle('hidden', !on);
  const say = text => { $('msg').textContent = text; };

  async function startCamera() {
    if (camOn) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      video.srcObject = stream; await video.play(); camOn = true;
      try { await navigator.wakeLock.request('screen'); } catch (e) {}
      return true;
    } catch (e) {
      $('loadStatus').textContent = 'אין גישה למצלמה. צריך לאשר הרשאת מצלמה ולפתוח את הדף ב-HTTPS.';
      return false;
    }
  }

  function refreshScanStatus() {
    const c = Recognizer.counts();
    $('scanStatus').textContent = Recognizer.ready()
      ? `אובייקטים סרוקים: דלת ${c.door}, מקרן ${c.ac}, עמדה ${c.station}, רקע ${c.bg}`
      : 'עדיין לא נסרקו אובייקטים. התחל ב"סריקת אובייקטים".';
    document.querySelectorAll('.cap').forEach(b => {
      const n = c[b.dataset.label];
      b.querySelector('span').textContent = n; b.classList.toggle('ok', n >= 20);
    });
  }

  // ----- מעבר בין שלבים -----
  function go(s) {
    state = s; stateT = 0; hits = 0;
    show('start', s === 'menu'); show('setup', s === 'setup'); show('win', s === 'win');
    show('hud', !['menu', 'setup', 'win'].includes(s)); show('btnEnter', s === 'enter');
    if (s === 'menu') { Sfx.stopAll(); refreshScanStatus(); }
    if (s === 'door') {
      gameT = 0; lv.smoke = lv.fire = lv.steam = 0; acDir = stationDir = doorDir = null;
      Fx.fireReset(); Fx.rainReset(); Sfx.stopAll();
      say('פתח את הדלת: כוון את המצלמה אל ידית הדלת');
    }
    if (s === 'enter') { doorDir = Orient.forward(); Sfx.door(); say('הדלת נפתחה! עקוב אחרי החץ, היכנס לכיתה ולחץ "נכנסתי לכיתה"'); }
    if (s === 'sense') { beatPhase = 0; say('החושים שלך מזהירים מסכנה! חפש את מקור הסכנה בחדר'); }
    if (s === 'fire') { acDir = Orient.forward(); acSeenAt = performance.now(); acLost = false; acVis = 1; Sfx.scan(); say('מצאת את מקור הסכנה: המקרן מעלה עשן!'); }
    if (s === 'break') {
      stationDir = Orient.forward(); glassBox = Fx.glassBuild(W, H); Sfx.scan();
      say('שוברים את הזכוכית ומושכים בידית...');
      setTimeout(() => state === 'break' && Sfx.glass(), 500);
      setTimeout(() => state === 'break' && Sfx.lever(), 1600);
    }
    if (s === 'extinguish') { fire0 = lv.fire; extT = 0; Sfx.alarm(true); say('הספרינקלרים פועלים! חזור אל המקרן וראה את האש נכבית'); }
    if (s === 'win') {
      Sfx.stopAll(); Sfx.win();
      $('winTime').textContent = `כיבית את השריפה תוך ${gameT.toFixed(1)} שניות`;
    }
  }

  const TARGET = { door: 'door', sense: 'ac', fire: 'station' };
  const NEXT = { door: 'enter', enter: 'sense', sense: 'fire', fire: 'break', extinguish: 'win' };
  function currentTarget() {
    if (state === 'fire' && stateT < CFG.smokeOnlySeconds) return null; // קודם רואים את העשן
    return TARGET[state] || null;
  }

  // ----- לולאת הזיהוי -----
  async function recognizeLoop() {
    for (;;) {
      const scanning = state === 'setup' || currentTarget() || (acDir && ['fire', 'break', 'extinguish'].includes(state));
      if (camOn && modelOn && scanning) {
        try {
          const e = await Recognizer.embed(video);
          if (e) {
            if (state === 'setup' && capLabel) { Recognizer.add(capLabel, e); refreshScanStatus(); }
            lastRes = Recognizer.classify(e);
            if (acDir && lastRes.votes.ac >= 0.6 && lastRes.sim >= CFG.minSimilarity - 0.06) {
              if (acLost) { acDir = Orient.forward(); acLost = false; } // חזרנו למקרן: מעגנים את האש מחדש
              acSeenAt = performance.now();
            }
            const tg = currentTarget();
            if (tg && lastRes.n) {
              const match = lastRes.votes[tg] >= CFG.voteThreshold && lastRes.sim >= CFG.minSimilarity;
              if (match) hits++; else hits = Math.max(0, hits - 2);
              if (hits >= CFG.hitsNeeded) go(NEXT[state]);
            }
            if (state === 'setup') {
              $('liveGuess').textContent = capLabel ? `מצלם: ${NAMES[capLabel]}`
                : !lastRes.n ? 'אין דגימות עדיין'
                : lastRes.sim < CFG.minSimilarity ? `לא מזוהה (דמיון ${Math.round(lastRes.sim * 100)}%)`
                : `מזהה: ${NAMES[lastRes.best]} (דמיון ${Math.round(lastRes.sim * 100)}%)`;
            }
          }
        } catch (e) { console.warn(e); }
      }
      await new Promise(r => setTimeout(r, 90));
    }
  }

  // ----- לולאת הציור -----
  const shown = { smoke: 0, fire: 0, steam: 0 };
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = now / 1000;
    stateT += dt;
    ctx.clearRect(0, 0, W, H);
    const S = Math.min(W, H) / 400;
    const playing = !['menu', 'setup', 'win'].includes(state);
    let flamePos = null;
    if (playing) { gameT += dt; $('timer').textContent = gameT.toFixed(1); }

    // גודל מסגרת הסריקה על המסך תואם לאזור שנשלח לזיהוי
    let ret = Math.min(W, H) * 0.7;
    if (video.videoWidth) {
      const sc = Math.max(W / video.videoWidth, H / video.videoHeight);
      ret = Math.min(W * 0.92, Math.min(video.videoWidth, video.videoHeight) * Recognizer.CROP * sc);
    }

    if (state === 'setup') Fx.reticle(ctx, W, H, ret, 0, t, capLabel ? '#ff3b30' : '#fff');

    if (state === 'enter') {
      Fx.doorArrow(ctx, W, H, Orient.project(doorDir, W, H), t, Math.min(1, stateT * 2));
    }

    // פעימות לב: מואצות עם הזמן וכשמתקרבים למקרן
    if (state === 'sense' || state === 'fire' || state === 'break') {
      const near = state === 'sense' && lastRes ? lastRes.votes.ac : 0;
      const bpm = state === 'sense' ? 70 + Math.min(1, stateT / 40) * 60 + near * 45 : 150;
      beatPhase += dt * bpm / 60;
      if (beatPhase >= 1) { beatPhase -= 1; Sfx.heartbeat(state === 'sense' ? 1 : 0.5); }
      const lub = Math.exp(-beatPhase * 9), dub = beatPhase > 0.22 ? Math.exp(-(beatPhase - 0.22) * 9) * 0.7 : 0;
      beatEnv = Math.max(lub, dub);
      if (state === 'sense') Fx.danger(ctx, W, H, beatEnv * (0.6 + 0.4 * Math.min(1, stateT / 20) + 0.3 * near), dt);
    }

    // עשן ואש על המקרן
    if (acDir) {
      if (state === 'fire' || state === 'break') {
        const tf = state === 'fire' ? stateT : 999;
        lv.smoke = Math.min(1, 0.3 + tf / 6);
        if (state === 'fire') lv.fire = Math.max(0, Math.min(1, (stateT - CFG.smokeOnlySeconds) / CFG.fireGrowSeconds + (stateT > CFG.smokeOnlySeconds ? 0.12 : 0)));
        else lv.fire = Math.min(1, lv.fire + dt / CFG.fireGrowSeconds);
        if (state === 'fire' && stateT > CFG.smokeOnlySeconds && stateT - dt <= CFG.smokeOnlySeconds)
          say('המקרן עולה באש! רוץ לעמדת כיבוי האש וסרוק אותה');
      }
      if (acGate()) {
        if (now - acSeenAt > CFG.acHoldSeconds * 1000) acLost = true;
        acVis = Math.max(0, Math.min(1, acVis + (acLost ? -dt / 0.35 : dt / 0.35)));
      } else { acLost = false; acVis = 1; }
      if (state === 'extinguish') {
        if (!acLost) extT += dt;   // האש נכבית מול העיניים: השעון מתקדם רק כשרואים את המקרן
        const u = Math.min(1, extT / CFG.extinguishSeconds);
        lv.fire = fire0 * (1 - u) * (1 - u);
        lv.smoke = Math.max(0, 1 - u * 1.3);
        lv.steam = Math.sin(Math.min(1, extT / (CFG.extinguishSeconds + 1.5)) * Math.PI);
        if (extT > CFG.extinguishSeconds + 2) go('win');
      }
      if (playing) {
        const pos = Orient.project(acDir, W, H);
        flamePos = pos;
        shown.smoke = lv.smoke * acVis; shown.fire = lv.fire * acVis; shown.steam = lv.steam * acVis;
        Fx.fireUpdate(dt, shown, S, gl3d);
        Fx.fireDraw(ctx, W, H, pos, shown, S, t, gl3d);
        Fx.heat(ctx, W, H, lv.fire, t);
        Sfx.fire(lv.fire + lv.smoke * 0.15);
      }
    }

    if (state === 'break') {
      Fx.glassDraw(ctx, W, H, glassBox, stateT, dt);
      if (stateT > 2.7) go('extinguish');
    }
    if (state === 'extinguish') {
      const r = Math.min(1, stateT / 1.2);
      Fx.rain(ctx, W, H, r, t, dt); Sfx.water(r);
    }

    Flames.render(flamePos, shown, S, t);
    if (currentTarget()) Fx.reticle(ctx, W, H, ret, hits / CFG.hitsNeeded, t);
    requestAnimationFrame(frame);
  }

  // ----- כפתורים -----
  async function begin(next) {
    Sfx.init(); Orient.start();
    if (!(await startCamera())) return;
    go(next);
  }
  $('btnPlay').onclick = () => begin('door');
  $('btnAgain').onclick = () => begin('door');
  $('btnSetup').onclick = () => begin('setup');
  $('btnBack').onclick = () => { Recognizer.save(); go('menu'); };
  $('btnSkip').onclick = () => { if (NEXT[state]) go(NEXT[state]); };
  $('btnEnter').onclick = () => { if (state === 'enter') go('sense'); };

  document.querySelectorAll('.cap').forEach(b => {
    const stop = () => { if (capLabel) { capLabel = null; b.classList.remove('rec'); Recognizer.save(); refreshScanStatus(); } };
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      if (Date.now() - clearArmed < 4000) { // מצב מחיקה: מוחקים רק את האובייקט שנלחץ
        Recognizer.clear(b.dataset.label); Recognizer.save(); refreshScanStatus(); disarmClear();
        $('setupMsg').textContent = `הסריקות של "${NAMES[b.dataset.label]}" נמחקו.`;
        return;
      }
      capLabel = b.dataset.label; b.classList.add('rec');
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => b.addEventListener(ev, stop));
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  $('btnExport').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([Recognizer.serialize()], { type: 'application/json' }));
    a.download = 'scans.json'; a.click();
  };
  $('btnImport').onclick = () => $('fileImport').click();
  $('fileImport').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try { Recognizer.deserialize(await f.text()); Recognizer.save(); refreshScanStatus(); $('setupMsg').textContent = 'הסריקות נטענו.'; }
    catch (err) { $('setupMsg').textContent = 'הקובץ לא תקין.'; }
    e.target.value = '';
  };
  let clearArmed = 0, clearTimer = 0;
  function disarmClear() { clearArmed = 0; clearTimeout(clearTimer); $('btnClear').textContent = 'מחק'; }
  $('btnClear').onclick = () => {
    if (Date.now() - clearArmed < 4000) {
      Recognizer.clear(); Recognizer.save(); refreshScanStatus(); disarmClear();
      $('setupMsg').textContent = 'כל הסריקות נמחקו.';
    } else {
      clearArmed = Date.now(); $('btnClear').textContent = 'הכל?';
      $('setupMsg').textContent = 'מחיקה: לחץ על האובייקט שרוצים למחוק, או שוב על הכפתור כדי למחוק הכל.';
      clearTimer = setTimeout(disarmClear, 4000);
    }
  };

  // ----- אתחול -----
  $('btnPlay').disabled = $('btnSetup').disabled = true;
  Recognizer.load().then(() => {
    modelOn = true; $('loadStatus').textContent = '';
  }).catch(e => {
    console.error(e); $('loadStatus').textContent = 'מודל הזיהוי לא נטען. אפשר לשחק עם כפתור "דלג".';
  }).finally(() => {
    $('btnPlay').disabled = $('btnSetup').disabled = false; refreshScanStatus();
  });
  recognizeLoop();
  requestAnimationFrame(frame);
  window.__game = { go, get state() { return state; }, lv, Recognizer };
})();
