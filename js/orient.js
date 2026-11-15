// חיישני תנועה: הופך את כיוון הטלפון לקווטרניון ומאפשר "לעגן" גרפיקה לכיוון בחדר.
const Orient = (() => {
  let q = [0, 0, 0, 1];      // x,y,z,w - מצלמה -> עולם
  let active = false;
  const D = Math.PI / 180;

  function mul(a, b) {
    return [
      a[3]*b[0] + a[0]*b[3] + a[1]*b[2] - a[2]*b[1],
      a[3]*b[1] - a[0]*b[2] + a[1]*b[3] + a[2]*b[0],
      a[3]*b[2] + a[0]*b[1] - a[1]*b[0] + a[2]*b[3],
      a[3]*b[3] - a[0]*b[0] - a[1]*b[1] - a[2]*b[2],
    ];
  }
  function rot(v, k) { // סיבוב וקטור v לפי קווטרניון k
    const [x, y, z] = v, [qx, qy, qz, qw] = k;
    const ix = qw*x + qy*z - qz*y, iy = qw*y + qz*x - qx*z, iz = qw*z + qx*y - qy*x, iw = -qx*x - qy*y - qz*z;
    return [
      ix*qw + iw*-qx + iy*-qz - iz*-qy,
      iy*qw + iw*-qy + iz*-qx - ix*-qz,
      iz*qw + iw*-qz + ix*-qy - iy*-qx,
    ];
  }
  const conj = k => [-k[0], -k[1], -k[2], k[3]];

  function onOrient(e) {
    if (e.alpha == null || e.beta == null) return;
    active = true;
    const x = e.beta * D, y = e.alpha * D, z = -e.gamma * D;
    const c1 = Math.cos(x/2), c2 = Math.cos(y/2), c3 = Math.cos(z/2);
    const s1 = Math.sin(x/2), s2 = Math.sin(y/2), s3 = Math.sin(z/2);
    let k = [ // אוילר בסדר YXZ
      s1*c2*c3 + c1*s2*s3,
      c1*s2*c3 - s1*c2*s3,
      c1*c2*s3 - s1*s2*c3,
      c1*c2*c3 + s1*s2*s3,
    ];
    k = mul(k, [-Math.SQRT1_2, 0, 0, Math.SQRT1_2]); // המצלמה מסתכלת מגב המכשיר
    const so = ((screen.orientation && screen.orientation.angle) || window.orientation || 0) * D;
    k = mul(k, [0, 0, Math.sin(-so/2), Math.cos(-so/2)]);
    q = k;
  }

  async function start() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) {
        await DeviceOrientationEvent.requestPermission(); // iOS
      }
    } catch (e) {}
    window.addEventListener('deviceorientation', onOrient);
  }

  // הכיוון בעולם שהמצלמה מסתכלת אליו עכשיו (עם היסט אופציונלי במרחב המצלמה)
  function forward(dx = 0, dy = 0) { return rot([dx, dy, -1], q); }

  // הטלת כיוון בעולם למסך. מחזיר {x,y,front,dx,dy}
  function project(dir, W, H, fov = 62) {
    const v = rot(dir, conj(q));
    const f = (H / 2) / Math.tan(fov * D / 2);
    const front = v[2] < -0.05;
    const zz = front ? -v[2] : 0.05;
    const n = Math.hypot(v[0], v[1]) || 1;
    return { x: W/2 + v[0]/zz * f, y: H/2 - v[1]/zz * f, front, dx: v[0]/n, dy: -v[1]/n };
  }

  return { start, forward, project, get active() { return active; } };
})();
