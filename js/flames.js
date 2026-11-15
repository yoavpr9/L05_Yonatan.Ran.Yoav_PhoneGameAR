// אש, עשן ואדים ריאליסטיים: שיידרים פרוצדורליים (רעש fbm) שמצוירים עם three.js על קנבס WebGL שקוף מעל המצלמה
const Flames = (() => {
  let renderer, scene, camera, fire, smoke, steam, ok = false;

  const NOISE = `
    precision highp float;
    varying vec2 vUv;
    uniform float uTime, uLevel;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
      vec2 i = floor(p), f = fract(p); f = f*f*(3.0 - 2.0*f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    float fbm(vec2 p){
      float a = 0.5, s = 0.0;
      for (int i = 0; i < 5; i++) { s += a * noise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; }
      return s;
    }`;
  const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

  const FIRE = NOISE + `
    void main(){
      float x = vUv.x * 2.0 - 1.0;
      float y = max(0.0, (1.0 - vUv.y) - 0.06) / 0.94;      // גובה מעל בסיס הלהבה
      float t = uTime;
      float w1 = fbm(vec2(x * 2.4, y * 3.0 - t * 1.7));
      float w2 = fbm(vec2(x * 5.5 + 4.0, y * 7.0 - t * 3.3));
      float xx = x + (w1 - 0.5) * 0.55 * (0.2 + y);          // הלהבה מתפתלת ככל שעולים
      float tongue = 0.4 + 0.6 * noise(vec2(xx * 3.6 + 7.0, t * 1.1));   // לשונות אש בגבהים שונים
      float h = (0.2 + 0.8 * uLevel) * tongue;
      float k = clamp(y / h, 0.0, 1.0);                      // 0 בבסיס, 1 בקצה הלשון
      float halfW = (0.36 + 0.42 * uLevel) * (1.0 - 0.55 * k);   // הלהבה נעשית צרה כלפי מעלה
      float body = 1.0 - smoothstep(halfW * 0.35, halfW, abs(xx));
      float base = body * (1.0 - k);
      // הרעש רק "אוכל" מהלהבה (קצוות קרועים וחורים), ולא מוסיף אש במקום שאין
      float c = base * (0.45 + 1.35 * w2) - (0.62 - w2) * 0.9 * smoothstep(0.0, 1.0, k);
      c *= smoothstep(0.0, 0.05, base);                      // אין אש מחוץ לגוף הלהבה
      c *= smoothstep(0.0, 0.09, (1.0 - vUv.y) - 0.06 + (w1 - 0.5) * 0.08);     // הלהבות צומחות מהבסיס ולא נחתכות בקו ישר
      c = clamp(c, 0.0, 1.0);
      vec3 col = mix(vec3(0.55, 0.04, 0.0), vec3(1.0, 0.42, 0.04), smoothstep(0.0, 0.4, c));
      col = mix(col, vec3(1.0, 0.82, 0.3), smoothstep(0.35, 0.72, c));
      col = mix(col, vec3(1.0, 0.98, 0.8), smoothstep(0.75, 1.0, c));
      float a = smoothstep(0.02, 0.45, c) * 0.95 * smoothstep(0.0, 0.12, uLevel);
      gl_FragColor = vec4(col * a, a);
    }`;

  const SMOKE = NOISE + `
    uniform vec3 uColor; uniform float uGlow;
    void main(){
      float x = vUv.x * 2.0 - 1.0;
      float y = 1.0 - vUv.y;
      float t = uTime;
      vec2 q = vec2(x * 2.2, y * 3.2 - t * 0.55);
      vec2 warp = vec2(fbm(q + vec2(0.0, t * 0.15)), fbm(q + vec2(5.2, 1.3)));
      float n = fbm(q * 1.3 + warp * 1.6);
      float xx = x + (warp.x - 0.5) * 0.7 * y + sin(t * 0.4 + y * 3.0) * 0.06 * y;   // נדידה ברוח
      float halfW = 0.16 + 0.62 * pow(y, 0.75);              // הענן מתרחב כלפי מעלה
      float body = 1.0 - smoothstep(halfW * 0.25, halfW, abs(xx));
      float vert = smoothstep(0.0, 0.07, y) * (1.0 - smoothstep(0.45 + 0.4 * uLevel, 1.0, y));
      float d = body * vert * smoothstep(0.28, 0.72, n + body * 0.25);
      float shade = 0.55 + 0.9 * (n - 0.35);                 // גושים בהירים וכהים
      vec3 col = uColor * shade;
      col += vec3(1.0, 0.38, 0.05) * uGlow * (1.0 - smoothstep(0.0, 0.4, y)) * 0.8;   // האש מאירה את בסיס העשן
      float a = d * (0.35 + 0.6 * uLevel) * smoothstep(0.0, 0.05, uLevel);
      gl_FragColor = vec4(col, a);
    }`;

  function mesh(frag, uniforms, blending) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: frag, transparent: true, depthTest: false, depthWrite: false,
      side: THREE.DoubleSide, blending,
      uniforms: Object.assign({ uTime: { value: 0 }, uLevel: { value: 0 } }, uniforms),
    }));
    m.visible = false; scene.add(m); return m;
  }

  function init(canvas) {
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
      renderer.setClearColor(0x000000, 0);
      scene = new THREE.Scene();
      camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1, 1);
      smoke = mesh(SMOKE, { uColor: { value: new THREE.Color(0.2, 0.19, 0.18) }, uGlow: { value: 0 } }, THREE.NormalBlending);
      steam = mesh(SMOKE, { uColor: { value: new THREE.Color(1.15, 1.15, 1.2) }, uGlow: { value: 0 } }, THREE.NormalBlending);
      fire = mesh(FIRE, {}, THREE.CustomBlending);
      // חיבור "מסך": מוסיף אור בלי לשרוף את התמונה
      fire.material.blendSrc = THREE.OneFactor; fire.material.blendDst = THREE.OneMinusSrcAlphaFactor;
      fire.material.blendSrcAlpha = THREE.OneFactor; fire.material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
      [smoke, steam, fire].forEach((m, i) => { m.renderOrder = i; });
      ok = true;
    } catch (e) { console.warn('WebGL לא זמין', e); }
    return ok;
  }

  function resize(W, H) {
    if (!ok) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(W, H, false);
    camera.right = W; camera.bottom = H; camera.updateProjectionMatrix();
  }

  function place(m, x, baseY, w, h) { m.scale.set(w, h, 1); m.position.set(x, baseY - h / 2, 0); }

  // pos: מיקום המקרן על המסך, lv: {smoke, fire, steam} בטווח 0..1, S: קנה מידה
  function render(pos, lv, S, t) {
    if (!ok) return;
    const show = pos && pos.front;
    smoke.visible = show && lv.smoke > 0.01;
    steam.visible = show && lv.steam > 0.01;
    fire.visible = show && lv.fire > 0.01;
    if (show) {
      for (const m of [smoke, steam, fire]) m.material.uniforms.uTime.value = t;
      smoke.material.uniforms.uLevel.value = lv.smoke; smoke.material.uniforms.uGlow.value = lv.fire;
      steam.material.uniforms.uLevel.value = lv.steam; steam.material.uniforms.uTime.value = t * 1.6 + 40;
      fire.material.uniforms.uLevel.value = lv.fire;
      place(smoke, pos.x, pos.y + 10 * S, 560 * S, 1000 * S);
      place(steam, pos.x, pos.y + 20 * S, 620 * S, 800 * S);
      place(fire, pos.x, pos.y + 34 * S, 400 * S, 560 * S);
    }
    renderer.render(scene, camera);
  }

  return { init, resize, render, get ok() { return ok; } };
})();
