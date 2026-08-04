export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];   // [x, y, z, w]
export type Mat3 = number[];                           // row-major, 9 entries

const DEG = Math.PI / 180;

/**
 * Geographic → 3D unit vector. Z is NEGATED to match the standard
 * equirectangular texture convention (east is +lon); this keeps markers and
 * the map from mirroring east-west.
 */
export const llToVec = (lat: number, lon: number): Vec3 => {
  const la = lat * DEG;
  const lo = lon * DEG;
  return [Math.cos(la) * Math.cos(lo), Math.sin(la), -Math.cos(la) * Math.sin(lo)];
};

export const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

export const qaxis = (x: number, y: number, z: number, ang: number): Quat => {
  const h = ang / 2;
  const s = Math.sin(h);
  return [x * s, y * s, z * s, Math.cos(h)];
};

export const qnorm = (q: Quat): Quat => {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
};

/** Rotation matrix (row-major) that rotates a vector by q. */
export const qmat = (q: Quat): Mat3 => {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    1 - (yy + zz), xy - wz, xz + wy,
    xy + wz, 1 - (xx + zz), yz - wx,
    xz - wy, yz + wx, 1 - (xx + yy),
  ];
};

/** The rotation carrying unit vector a onto unit vector b. */
export const qFromUnit = (a: Vec3, b: Vec3): Quat => {
  const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  if (d < -0.999999) {
    // Opposite vectors: any perpendicular axis will do, but it must be a real
    // one — the cross product is zero here and would give a NaN quaternion.
    return Math.abs(a[0]) > Math.abs(a[2])
      ? qnorm([-a[1], a[0], 0, 0])
      : qnorm([0, -a[2], a[1], 0]);
  }
  return qnorm([
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
    1 + d,
  ]);
};

export const qslerp = (a: Quat, b: Quat, t: number): Quat => {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  let end = b;
  if (dot < 0) {
    end = [-b[0], -b[1], -b[2], -b[3]];
    dot = -dot;
  }
  if (dot > 0.9995) {
    return qnorm([
      a[0] + (end[0] - a[0]) * t,
      a[1] + (end[1] - a[1]) * t,
      a[2] + (end[2] - a[2]) * t,
      a[3] + (end[3] - a[3]) * t,
    ]);
  }
  const th = Math.acos(dot);
  const s = Math.sin(th);
  const wa = Math.sin((1 - t) * th) / s;
  const wb = Math.sin(t * th) / s;
  return [
    a[0] * wa + end[0] * wb,
    a[1] * wa + end[1] * wb,
    a[2] * wa + end[2] * wb,
    a[3] * wa + end[3] * wb,
  ];
};

/** World unit vector → [screenX, screenY, viewZ]. viewZ > 0 means front-facing. */
export const projectVec = (
  v: Vec3, m: Mat3, cx: number, cy: number, r: number
): Vec3 => {
  const vx = m[0] * v[0] + m[1] * v[1] + m[2] * v[2];
  const vy = m[3] * v[0] + m[4] * v[1] + m[5] * v[2];
  const vz = m[6] * v[0] + m[7] * v[1] + m[8] * v[2];
  return [cx + vx * r, cy - vy * r, vz];
};

/** How long the photographic terrain takes to fade in over the flat stand-in. */
export const TERRAIN_FADE_MS = 400;

/**
 * Alpha for the textured sphere, ramping in over the flat-shaded one.
 *
 * The canvas is revealed on its first drawn frame rather than when the planet's
 * 440KB of terrain resolves — the markers need none of those bytes, and waiting
 * for them left live pins hidden behind a marker-free poster that reads as a
 * finished globe with no events. The terrain then arrives mid-session, so it
 * ramps rather than popping.
 */
export const terrainFade = (now: number, arrivedAt: number | null): number => {
  if (arrivedAt === null) return 0;
  const t = (now - arrivedAt) / TERRAIN_FADE_MS;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
};
