// צלילים מסונתזים (בלי קבצי אודיו)
const Sfx = (() => {
  let ac = null, master, noiseBuf, fireGain, waterGain, alarmTimer = null;

  function init() {
    if (ac) { ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain(); master.gain.value = 0.8; master.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    fireGain = loopNoise('lowpass', 900);
    waterGain = loopNoise('highpass', 2500);
  }
  function loopNoise(type, freq) {
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start();
    return g;
  }
  function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo = null) {
    if (!ac) return;
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function burst(dur, type, freq, vol) {
    if (!ac) return;
    const src = ac.createBufferSource(); src.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ac.createGain(), t = ac.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random()); src.stop(t + dur);
  }
  const vib = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

  return {
    init,
    heartbeat(strength = 1) {
      tone(70, 0.16, 'sine', 0.7 * strength, 0, 40);
      tone(60, 0.14, 'sine', 0.5 * strength, 0.17, 38);
      vib([35, 110, 25]);
    },
    scan() { tone(880, 0.08, 'square', 0.12); tone(1320, 0.12, 'square', 0.12, 0.09); vib(60); },
    door() { tone(180, 0.5, 'sawtooth', 0.15, 0, 90); tone(520, 0.25, 'sine', 0.2, 0.35); },
    glass() {
      burst(0.5, 'highpass', 3500, 0.9);
      for (let i = 0; i < 7; i++) tone(2200 + Math.random() * 3000, 0.25, 'triangle', 0.12, 0.05 + Math.random() * 0.5);
      vib([120, 40, 60]);
    },
    lever() { tone(140, 0.25, 'square', 0.25, 0, 70); burst(0.15, 'lowpass', 600, 0.6); vib(150); },
    alarm(on) {
      clearInterval(alarmTimer); alarmTimer = null;
      if (!on) return;
      const beep = () => { tone(950, 0.22, 'square', 0.1); tone(700, 0.22, 'square', 0.1, 0.25); };
      beep(); alarmTimer = setInterval(beep, 600);
    },
    fire(level) { if (ac) fireGain.gain.setTargetAtTime(Math.min(0.5, level * 0.5), ac.currentTime, 0.2); },
    water(level) { if (ac) waterGain.gain.setTargetAtTime(level * 0.25, ac.currentTime, 0.3); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, 'triangle', 0.25, i * 0.14)); vib([80, 60, 80, 60, 200]); },
    stopAll() { this.alarm(false); this.fire(0); this.water(0); },
  };
})();
