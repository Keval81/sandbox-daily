import { test } from "node:test";
import assert from "node:assert/strict";
import {
  llToVec, qaxis, qnorm, qmul, qmat, qFromUnit, qslerp, projectVec,
} from "./globe-engine/math";

const near = (a: number, b: number, eps = 1e-9) =>
  assert.ok(Math.abs(a - b) < eps, `expected ${b}, got ${a}`);

const length = (v: number[]) => Math.hypot(...v);

test("maps 0,0 to the unit vector facing the prime meridian", () => {
  const [x, y, z] = llToVec(0, 0);
  near(x, 1); near(y, 0); near(z, 0);
});

test("maps the north pole to +Y", () => {
  const [x, y, z] = llToVec(90, 0);
  near(x, 0); near(y, 1); near(z, 0);
});

test("negates Z so east stays east and the map does not mirror", () => {
  const [, , z] = llToVec(0, 90);
  near(z, -1);
});

test("always returns a unit vector", () => {
  for (const [lat, lon] of [[51.5, -0.13], [-33.9, 151.2], [35.7, 139.7]]) {
    near(length(llToVec(lat, lon)), 1, 1e-12);
  }
});

test("normalises a quaternion to unit length", () => {
  near(length(qnorm([3, 0, 0, 4])), 1, 1e-12);
});

test("normalising a zero quaternion does not divide by zero", () => {
  const q = qnorm([0, 0, 0, 0]);
  assert.ok(q.every(Number.isFinite));
});

test("multiplying by the identity quaternion changes nothing", () => {
  const q = qnorm([0.2, 0.5, 0.1, 0.8]);
  const r = qmul(q, [0, 0, 0, 1]);
  q.forEach((v, i) => near(r[i], v, 1e-12));
});

test("a quarter turn about Y sends +X to -Z", () => {
  const m = qmat(qaxis(0, 1, 0, Math.PI / 2));
  const x = m[0] * 1 + m[1] * 0 + m[2] * 0;
  const z = m[6] * 1 + m[7] * 0 + m[8] * 0;
  near(x, 0, 1e-12); near(z, -1, 1e-12);
});

test("builds the rotation that carries one unit vector onto another", () => {
  const a = llToVec(12, 40);
  const b: [number, number, number] = [0, 0, 1];
  const m = qmat(qFromUnit(a, b));
  const out = [
    m[0] * a[0] + m[1] * a[1] + m[2] * a[2],
    m[3] * a[0] + m[4] * a[1] + m[5] * a[2],
    m[6] * a[0] + m[7] * a[1] + m[8] * a[2],
  ];
  out.forEach((v, i) => near(v, b[i], 1e-9));
});

test("handles the antipodal case without producing NaN", () => {
  const q = qFromUnit([1, 0, 0], [-1, 0, 0]);
  assert.ok(q.every(Number.isFinite));
  near(length(q), 1, 1e-12);
});

test("slerp at t=0 and t=1 returns the endpoints", () => {
  const a = qnorm([0, 0, 0, 1]);
  const b = qnorm(qaxis(0, 1, 0, 1.2));
  qslerp(a, b, 0).forEach((v, i) => near(v, a[i], 1e-9));
  qslerp(a, b, 1).forEach((v, i) => near(v, b[i], 1e-9));
});

test("slerp stays on the unit sphere at the midpoint", () => {
  const a = qnorm([0, 0, 0, 1]);
  const b = qnorm(qaxis(1, 0, 0, 2.4));
  near(length(qslerp(a, b, 0.5)), 1, 1e-9);
});

test("slerp takes the short way round when the endpoints are opposed in sign", () => {
  const a = qnorm([0, 0, 0, 1]);
  const b: [number, number, number, number] = [0, 0, 0, -1];
  const mid = qslerp(a, b, 0.5);
  assert.ok(Math.abs(mid[3]) > 0.99, "should barely move — these are the same orientation");
});

test("projects the facing point to the centre of the viewport, in front", () => {
  const m = qmat([0, 0, 0, 1]);
  const [sx, sy, vz] = projectVec([0, 0, 1], m, 200, 150, 100);
  near(sx, 200); near(sy, 150);
  assert.ok(vz > 0, "should be on the near side");
});

test("reports a point on the far side of the globe as behind", () => {
  const m = qmat([0, 0, 0, 1]);
  const [, , vz] = projectVec([0, 0, -1], m, 200, 150, 100);
  assert.ok(vz < 0);
});

test("screen Y is inverted, because canvas Y grows downward", () => {
  const m = qmat([0, 0, 0, 1]);
  const [, sy] = projectVec([0, 1, 0], m, 200, 150, 100);
  near(sy, 50); // 150 - 1*100
});
