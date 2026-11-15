// זיהוי אובייקטים: MobileNet מפיק "טביעת אצבע" לכל פריים, ומשווים אותה לדגימות שנסרקו (KNN).
const Recognizer = (() => {
  const LABELS = ['door', 'ac', 'station', 'bg']; // 'ac' הוא מקור הסכנה (המקרן). השם הפנימי נשאר מהגרסה שבה זה היה מזגן
  const KEY = 'arfire-scans-v2'; // שינוי המספר מוחק סריקות ישנות שנשמרו בטלפונים
  const K = 5;
  let net = null, dim = 256;
  const samples = { door: [], ac: [], station: [], bg: [] };
  const crop = document.createElement('canvas');
  crop.width = crop.height = 224;
  const cctx = crop.getContext('2d', { willReadFrequently: false });

  async function load() {
    const full = await tf.loadLayersModel('vendor/mobilenet/model.json');
    const out = full.getLayer('global_average_pooling2d_1').output;
    net = tf.model({ inputs: full.inputs, outputs: out });
    tf.tidy(() => net.predict(tf.zeros([1, 224, 224, 3]))); // חימום
    dim = out.shape[out.shape.length - 1];
    await loadScans();
  }

  // החלק היחסי מהצלע הקצרה של הווידאו שנכנס לזיהוי (הריבוע שבמרכז)
  const CROP = 0.75;

  async function embed(video) {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!net || !vw) return null;
    const s = Math.min(vw, vh) * CROP;
    cctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, 224, 224);
    const t = tf.tidy(() => {
      const img = tf.browser.fromPixels(crop).toFloat().div(127.5).sub(1).expandDims(0);
      const e = net.predict(img).flatten();
      return e.div(e.norm().add(1e-8));
    });
    const data = await t.data();
    t.dispose();
    return data;
  }

  function classify(e) {
    const top = []; // K הדגימות הדומות ביותר
    for (const label of LABELS) {
      for (const s of samples[label]) {
        let d = 0;
        for (let i = 0; i < dim; i++) d += e[i] * s[i];
        if (top.length < K) { top.push([d, label]); top.sort((a, b) => b[0] - a[0]); }
        else if (d > top[K - 1][0]) { top[K - 1] = [d, label]; top.sort((a, b) => b[0] - a[0]); }
      }
    }
    const votes = { door: 0, ac: 0, station: 0, bg: 0 };
    for (const [, l] of top) votes[l] += 1 / K;
    let best = 'bg';
    for (const l of LABELS) if (votes[l] > votes[best]) best = l;
    // sim: הדמיון לדגימה הקרובה ביותר (1 = זהה). נמוך = המשחק רואה משהו שלא נסרק בכלל
    return { votes, best, sim: top.length ? top[0][0] : 0, n: top.length };
  }

  function add(label, e) { samples[label].push(Float32Array.from(e)); }
  function counts() { const c = {}; for (const l of LABELS) c[l] = samples[l].length; return c; }
  function clear(label) { if (label) samples[label] = []; else for (const l of LABELS) samples[l] = []; }
  function ready() { return ['door', 'ac', 'station'].every(l => samples[l].length >= 5); }

  // --- שמירה / טעינה ---
  function toB64(arrs) {
    const f = new Float32Array(arrs.length * dim);
    arrs.forEach((a, i) => f.set(a, i * dim));
    const u = new Uint8Array(f.buffer);
    let s = '';
    for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
    return btoa(s);
  }
  function fromB64(b) {
    const s = atob(b), u = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    const f = new Float32Array(u.buffer), out = [];
    for (let i = 0; i + dim <= f.length; i += dim) out.push(f.slice(i, i + dim));
    return out;
  }
  function serialize() {
    const o = { version: 1, dim, labels: {} };
    for (const l of LABELS) o.labels[l] = toB64(samples[l]);
    return JSON.stringify(o);
  }
  function deserialize(text) {
    const o = typeof text === 'string' ? JSON.parse(text) : text;
    if (!o || !o.labels || o.dim !== dim) throw new Error('קובץ סריקות לא תקין');
    for (const l of LABELS) samples[l] = o.labels[l] ? fromB64(o.labels[l]) : [];
  }
  function save() { try { localStorage.setItem(KEY, serialize()); } catch (e) { console.warn(e); } }
  async function loadScans() {
    // טוענים את הקובץ שבריפו (scans/scans.json), ואז לכל אובייקט שנסרק בטלפון הזה
    // הסריקות המקומיות מחליפות את אלה שבריפו. אובייקט שלא נסרק בטלפון נשאר מהריפו.
    try {
      const r = await fetch('scans/scans.json', { cache: 'no-cache' });
      if (r.ok) deserialize(await r.json());
    } catch (e) {}
    try {
      const ls = localStorage.getItem(KEY);
      if (ls) {
        const o = JSON.parse(ls);
        if (o && o.dim === dim && o.labels) {
          for (const l of LABELS) if (o.labels[l]) { const a = fromB64(o.labels[l]); if (a.length) samples[l] = a; }
        }
      }
    } catch (e) { console.warn(e); }
  }

  return { LABELS, CROP, load, embed, classify, add, counts, clear, ready, save, serialize, deserialize };
})();
