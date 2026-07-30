import type { Marker } from "../types";
import {
  llToVec, qaxis, qFromUnit, qmat, qmul, qnorm, qslerp, projectVec,
  type Mat3, type Quat, type Vec3,
} from "./math";
import {
  loadEarthTextures, DEFAULT_TEXTURE_URLS, TEX_W, TEX_H, CLOUD_W, CLOUD_H,
  type EarthTextures,
} from "./textures";

export interface GlobeEngineOptions {
  /** Compact mode: auto-spin, no picking, no hover, no keyboard rotation. */
  compact?: boolean;
  textures?: typeof DEFAULT_TEXTURE_URLS;
}

export type GlobeEvent = "pick" | "hover";

interface PlacedMarker extends Marker {
  v: Vec3;
  phase: number;
  sx: number | null;
  sy: number | null;
  sr: number;
}

type PickListener = (id: string | null) => void;
type HoverListener = (id: string | null, x: number, y: number) => void;

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Sun direction in view space — fixed, so the terminator stays put as the globe turns. */
const LX = -0.42, LY = 0.44, LZ = 0.79;

/**
 * Marker colours are `#rrggbb`; the marker gradient appends an alpha byte to
 * them. Anything else would make addColorStop throw and kill the frame, so a
 * non-hex colour degrades to itself rather than taking the renderer down.
 */
const withAlpha = (col: string, hex: string): string =>
  /^#[0-9a-f]{6}$/i.test(col) ? col + hex : col;

const dist2 = (t: TouchList): number =>
  Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

export class GlobeEngine {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly sphereCanvas: HTMLCanvasElement;
  private readonly sctx: CanvasRenderingContext2D;
  private readonly compact: boolean;
  /** Not readonly: the OS setting can change mid-session, and the host tells us. */
  private reduceMotion: boolean;
  private readonly cleanups: (() => void)[] = [];
  private readonly pickListeners = new Set<PickListener>();
  private readonly hoverListeners = new Set<HoverListener>();

  private markers: PlacedMarker[] = [];
  private textures: EarthTextures | null = null;
  private raf = 0;
  private destroyed = false;

  private orient: Quat = qFromUnit(llToVec(8, 22), [0, 0, 1]);  // open on Africa
  private curM: Mat3 = qmat(this.orient);
  private target: Quat | null = null;
  private focusing = false;
  /** What the host asked for. What actually happens is `spinning`, below. */
  private spinRequested = true;
  private zoom = 1;
  private velX = 0;
  private velY = 0;
  private selected: string | null = null;
  private dragging = false;

  // viewport
  private W = 0; private H = 0; private DPR = 1;
  private CX = 0; private CY = 0; private R = 0;
  private stars: [number, number, number, number][] = [];

  // sphere raster
  private S = 0; private SHI = 0; private SLO = 0;
  private sphereImg: ImageData | null = null;
  private dirX: Float32Array | null = null;
  private dirY: Float32Array | null = null;
  private dirZ: Float32Array | null = null;
  private sphereDirty = true;
  private lastKey = "";
  private frameNo = 0;
  private cloudDrift = 0;

  constructor(canvas: HTMLCanvasElement, options: GlobeEngineOptions = {}) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    const sphereCanvas = document.createElement("canvas");
    const sctx = sphereCanvas.getContext("2d");
    if (!sctx) throw new Error("2d context unavailable");

    this.canvas = canvas;
    this.ctx = ctx;
    this.sphereCanvas = sphereCanvas;
    this.sctx = sctx;
    this.compact = options.compact ?? false;
    // An initial value only. The preference can be turned off mid-session, and
    // a constructor read would leave the globe refusing to spin under a button
    // the host has already re-enabled and relabelled "Pause".
    this.reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

    this.resize();
    this.bindEvents();

    void loadEarthTextures(options.textures)
      .then((t) => {
        if (this.destroyed) return;
        this.textures = t;
        this.sphereDirty = true;
        this.canvas.classList.add("ready");
      })
      // Without this the rejection is silent and the globe just draws stars,
      // halo and markers with no planet and no explanation. A wrong asset path
      // is the likeliest cause, so the URL in the error is the whole point.
      .catch((err: unknown) => {
        console.error("[GlobeEngine] earth textures failed to load", err);
        if (this.destroyed) return;
        // The canvas starts at opacity 0 and only `ready` reveals it, so without
        // this the degraded state — stars, halo and markers, no planet — is
        // drawn into a permanently invisible canvas. Markers over starfield is
        // an honest picture; nothing at all is not.
        this.canvas.classList.add("failed");
      });

    this.raf = requestAnimationFrame(this.tick);
  }

  /** Container-relative, NOT window-relative — this is what lets the teaser be
   *  a small box on a page that also has other content. */
  resize(): void {
    const host = this.canvas.parentElement;
    const rect = host ? host.getBoundingClientRect() : this.canvas.getBoundingClientRect();
    this.DPR = Math.min(devicePixelRatio || 1, 2);
    this.W = Math.max(1, Math.round(rect.width));
    this.H = Math.max(1, Math.round(rect.height));
    this.canvas.width = this.W * this.DPR;
    this.canvas.height = this.H * this.DPR;
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
    this.ctx.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);

    const portrait = this.W / this.H < 0.95;
    this.R = Math.min(this.W, this.H) * (portrait ? 0.42 : 0.4) * this.zoom;
    this.CX = this.W / 2;
    this.CY = this.H / 2 + (portrait && !this.compact ? this.H * 0.14 : 0);

    this.stars = [];
    const n = Math.round((this.W * this.H) / 9000);
    let seed = 20260726;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (let i = 0; i < n; i++) {
      this.stars.push([rnd() * this.W, rnd() * this.H, rnd() * 1.4 + 0.2, rnd()]);
    }

    this.SHI = clamp(Math.round(2 * this.R), 96, 460);   // crisp, when idle
    this.SLO = clamp(Math.round(1.7 * this.R), 96, 360); // still sharp, while moving
    this.setSphereRes(this.SHI);
    this.sphereDirty = true;
  }

  setMarkers(markers: Marker[]): void {
    this.markers = markers.map((m, i) => ({
      ...m,
      v: llToVec(m.lat, m.lon),
      phase: (i * 0.19) % 1,
      sx: null, sy: null, sr: 0,
    }));
  }

  setSelected(id: string | null): void { this.selected = id; }

  focus(lat: number, lon: number): void {
    const face: Vec3 = [0, 0.18, 0.983];   // slight tilt so north reads up
    this.target = qFromUnit(llToVec(lat, lon), face);
    this.focusing = true;
    this.velX = 0;
    this.velY = 0;
  }

  setSpin(on: boolean): void { this.spinRequested = on; }
  /** Live, not latched at construction — the OS setting can change mid-session. */
  setReduceMotion(on: boolean): void { this.reduceMotion = on; }
  /** The request and the preference, resolved. Reduced motion always wins. */
  private get spin(): boolean { return this.spinRequested && !this.reduceMotion; }
  isSpinning(): boolean { return this.spin; }

  on(event: "pick", cb: PickListener): () => void;
  /** x/y are CSS pixels relative to the canvas's top-left — the same space the
   *  canvas draws in — so a tooltip positioned inside the globe's container can
   *  use them directly. */
  on(event: "hover", cb: HoverListener): () => void;
  on(event: GlobeEvent, cb: PickListener | HoverListener): () => void {
    if (event === "pick") {
      this.pickListeners.add(cb as PickListener);
      return () => this.pickListeners.delete(cb as PickListener);
    }
    this.hoverListeners.add(cb as HoverListener);
    return () => this.hoverListeners.delete(cb as HoverListener);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    for (const off of this.cleanups) off();
    this.cleanups.length = 0;
    this.pickListeners.clear();
    this.hoverListeners.clear();
  }

  // ---- private ------------------------------------------------------------

  private listen<K extends keyof HTMLElementEventMap>(
    type: K,
    handler: (ev: HTMLElementEventMap[K]) => void,
    options?: AddEventListenerOptions
  ): void {
    this.canvas.addEventListener(type, handler as EventListener, options);
    this.cleanups.push(() =>
      this.canvas.removeEventListener(type, handler as EventListener, options)
    );
  }

  private bindEvents(): void {
    // Compact mode is a picture, not an instrument: no drag, no pick, no keys.
    // The host component puts a link over it.
    if (this.compact) return;

    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let pinch: number | null = null;

    this.listen("pointerdown", (e) => {
      this.dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      this.focusing = false;
      this.target = null;
      this.canvas.setPointerCapture(e.pointerId);
      this.canvas.classList.add("grabbing");
    });

    this.listen("pointermove", (e) => {
      if (this.dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        // Touch is gentler than mouse so a flick doesn't send the globe spinning.
        const base = e.pointerType === "touch" ? 0.0034 : 0.006;
        const k = base / Math.max(0.6, this.zoom);
        this.velX = dy * k;
        this.velY = dx * k;
        this.applySpin(this.velX, this.velY);
        return;
      }
      const local = this.toLocal(e.clientX, e.clientY);
      const hit = this.pickAt(local[0], local[1]);
      this.canvas.classList.toggle("hot", !!hit);
      this.emitHover(hit, local[0], local[1]);
    });

    this.listen("pointerup", (e) => {
      if (this.dragging && !moved) {
        const local = this.toLocal(e.clientX, e.clientY);
        this.emitPick(this.pickAt(local[0], local[1]));
      }
      this.dragging = false;
      this.canvas.classList.remove("grabbing");
    });

    this.listen("pointerleave", () => {
      this.canvas.classList.remove("hot");
      this.emitHover(null, 0, 0);
    });

    this.listen("wheel", (e) => {
      e.preventDefault();
      this.zoom = clamp(this.zoom - e.deltaY * 0.0012, 0.7, 2.8);
      this.resize();
    }, { passive: false });

    this.listen("touchstart", (e) => {
      if (e.touches.length === 2) pinch = dist2(e.touches);
    }, { passive: true });

    this.listen("touchmove", (e) => {
      // Truthiness, not a null check — the prototype's guard rejected a zero
      // pinch distance too, and it must: d/0 is Infinity or NaN, and a NaN zoom
      // poisons R, then the raster size, then createImageData, permanently.
      if (e.touches.length !== 2 || !pinch) return;
      const d = dist2(e.touches);
      this.zoom = clamp(this.zoom * (d / pinch), 0.7, 2.8);
      pinch = d;
      this.resize();
    }, { passive: true });

    this.listen("touchend", () => { pinch = null; });

    this.listen("keydown", (e) => {
      const s = 0.12;
      let ax = 0;
      let ay = 0;
      if (e.key === "ArrowLeft") ay = -s;
      else if (e.key === "ArrowRight") ay = s;
      else if (e.key === "ArrowUp") ax = -s;
      else if (e.key === "ArrowDown") ax = s;
      else return;
      e.preventDefault();
      this.focusing = false;
      this.target = null;
      this.applySpin(ax, ay);
    });
  }

  /** Viewport coordinates → canvas CSS pixels, the space markers are drawn in. */
  private toLocal(clientX: number, clientY: number): [number, number] {
    const rect = this.canvas.getBoundingClientRect();
    return [clientX - rect.left, clientY - rect.top];
  }

  private emitPick(id: string | null): void {
    for (const cb of this.pickListeners) cb(id);
  }

  private emitHover(id: string | null, x: number, y: number): void {
    for (const cb of this.hoverListeners) cb(id, x, y);
  }

  private pickAt(x: number, y: number): string | null {
    let best: string | null = null;
    let bestD = Infinity;
    for (const m of this.markers) {
      if (m.sx == null || m.sy == null) continue;
      const d = Math.hypot(m.sx - x, m.sy - y);
      if (d < m.sr && d < bestD) { bestD = d; best = m.id; }
    }
    return best;
  }

  /** ax about view-X, ay about view-Y (screen-relative). */
  private applySpin(ax: number, ay: number): void {
    const dq = qmul(qaxis(1, 0, 0, ax), qaxis(0, 1, 0, ay));
    this.orient = qnorm(qmul(dq, this.orient));
  }

  // The whole body is wrapped: a single throw anywhere in here would skip the
  // trailing requestAnimationFrame and stall the loop permanently, turning one
  // bad frame into a dead globe for the rest of the session.
  private tick = (): void => {
    try {
      this.step();
    } catch (err) {
      console.error("[GlobeEngine] frame failed", err);
    }
    if (!this.destroyed) this.raf = requestAnimationFrame(this.tick);
  };

  private step(): void {
    if (this.focusing && this.target) {
      this.orient = qslerp(this.orient, this.target, 0.12);
      const d = this.orient[0] * this.target[0] + this.orient[1] * this.target[1]
        + this.orient[2] * this.target[2] + this.orient[3] * this.target[3];
      if (Math.abs(d) > 0.99995) { this.focusing = false; this.target = null; }
    } else if (!this.dragging) {
      if (Math.abs(this.velX) > 0.00004 || Math.abs(this.velY) > 0.00004) {
        this.applySpin(this.velX, this.velY);
        this.velX *= 0.94;
        this.velY *= 0.94;
      } else if (this.spin) {
        // spin about the planet's own axis (local Y), so it reads as Earth turning
        this.orient = qnorm(qmul(this.orient, qaxis(0, 1, 0, -0.0018)));
      }
    }
    this.frameNo++;
    const moving = this.dragging || this.focusing || this.spin
      || Math.abs(this.velX) > 0.00004 || Math.abs(this.velY) > 0.00004;
    // Lower the raster while moving for smoothness; go crisp the moment it rests.
    this.setSphereRes(moving ? this.SLO : this.SHI);

    const key = this.orient.map((n) => n.toFixed(4)).join() + "|" + this.R.toFixed(1);
    if (key !== this.lastKey) { this.sphereDirty = true; this.lastKey = key; }
    // Clouds drift a touch faster than the planet turns → living weather. When
    // moving they update every frame anyway; when idle, refresh a few times a
    // second so a rested globe stays cheap.
    if (this.textures && !this.reduceMotion && (moving || this.frameNo % 4 === 0)) {
      this.cloudDrift = (performance.now() / 1000) * 0.0032 % 1;
      this.sphereDirty = true;
    }
    this.draw();
  }

  private draw(): void {
    const { ctx, CX, CY, R } = this;
    ctx.clearRect(0, 0, this.W, this.H);
    for (const s of this.stars) {
      ctx.globalAlpha = 0.35 + s[3] * 0.5;
      ctx.fillStyle = "#aab7d6";
      ctx.fillRect(s[0], s[1], s[2], s[2]);
    }
    ctx.globalAlpha = 1;

    const halo = ctx.createRadialGradient(CX, CY, R * 0.92, CX, CY, R * 1.34);
    halo.addColorStop(0, "rgba(74,144,255,0.33)");
    halo.addColorStop(0.5, "rgba(58,110,200,0.12)");
    halo.addColorStop(1, "rgba(58,110,200,0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(CX, CY, R * 1.34, 0, 7);
    ctx.fill();

    if (this.textures) {
      if (this.sphereDirty) { this.renderSphere(); this.sphereDirty = false; }
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.sphereCanvas, CX - R, CY - R, R * 2, R * 2);
    }

    this.curM = qmat(this.orient);
    const t = performance.now() / 1000;
    const drawable: [PlacedMarker, Vec3][] = [];
    for (const m of this.markers) {
      const base = projectVec(m.v, this.curM, CX, CY, R);
      if (base[2] > 0) drawable.push([m, base]);
    }
    drawable.sort((a, b) => a[1][2] - b[1][2]);

    ctx.globalCompositeOperation = "lighter";
    for (const [m, base] of drawable) {
      // The engine knows nothing about hazards: colour and size come off the marker.
      const col = m.color;
      const height = (0.05 + m.weight * 0.26) * R;
      const nx = base[0] - CX, ny = base[1] - CY, nl = Math.hypot(nx, ny) || 1;
      const tipx = base[0] + (nx / nl) * height * (0.4 + base[2] * 0.6);
      const tipy = base[1] + (ny / nl) * height * (0.4 + base[2] * 0.6);
      const grad = ctx.createLinearGradient(base[0], base[1], tipx, tipy);
      grad.addColorStop(0, "rgba(0,0,0,0)");
      grad.addColorStop(1, col);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(base[0], base[1]);
      ctx.lineTo(tipx, tipy);
      ctx.stroke();
      const rad = (2.4 + m.weight * 4.5) * (0.7 + base[2] * 0.3);
      const dg = ctx.createRadialGradient(tipx, tipy, 0, tipx, tipy, rad * 3);
      dg.addColorStop(0, col);
      dg.addColorStop(0.3, withAlpha(col, "cc"));
      dg.addColorStop(1, withAlpha(col, "00"));
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(tipx, tipy, rad * 3, 0, 7);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = 0.92;
      ctx.beginPath();
      ctx.arc(tipx, tipy, rad * 0.5, 0, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
      m.sx = tipx;
      m.sy = tipy;
      m.sr = Math.max(rad * 1.6, 9);
      if (m.weight >= 0.68 && !this.reduceMotion) {
        const phase = ((t * 0.5) + m.phase) % 1;
        ctx.strokeStyle = col;
        ctx.globalAlpha = (1 - phase) * 0.8;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(tipx, tipy, rad + phase * 26, 0, 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      if (this.selected === m.id) {
        ctx.strokeStyle = "#fff";
        ctx.globalAlpha = 0.9;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(tipx, tipy, rad + 7, 0, 7);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.globalCompositeOperation = "source-over";
    const drawn = new Set(drawable.map((d) => d[0].id));
    for (const m of this.markers) if (!drawn.has(m.id)) m.sx = null;
  }

  /**
   * (Re)allocate the sphere raster + per-pixel base directions at resolution `s`.
   * Lower `s` while the globe is moving keeps rotation buttery; higher when idle
   * keeps it crisp.
   */
  private setSphereRes(s: number): void {
    if (s === this.S) return;
    this.S = s;
    this.sphereCanvas.width = this.S;
    this.sphereCanvas.height = this.S;
    this.sphereImg = this.sctx.createImageData(this.S, this.S);
    const dirX = new Float32Array(this.S * this.S);
    const dirY = new Float32Array(this.S * this.S);
    const dirZ = new Float32Array(this.S * this.S);
    this.dirX = dirX;
    this.dirY = dirY;
    this.dirZ = dirZ;
    const half = (this.S - 1) / 2, rad = this.S / 2;
    for (let j = 0; j < this.S; j++) for (let i = 0; i < this.S; i++) {
      const idx = j * this.S + i, nx = (i - half) / rad, ny = (j - half) / rad, q = nx * nx + ny * ny;
      if (q > 1) { dirZ[idx] = -1; continue; }
      dirX[idx] = nx;
      dirY[idx] = -ny;
      dirZ[idx] = Math.sqrt(1 - q);
    }
    this.sphereDirty = true;
  }

  private renderSphere(): void {
    const tex = this.textures;
    const sphereImg = this.sphereImg;
    const dirX = this.dirX, dirY = this.dirY, dirZ = this.dirZ;
    if (!tex || !sphereImg || !dirX || !dirY || !dirZ) return;
    const { earthData, cloudData } = tex;
    const cloudDrift = this.cloudDrift;

    const data = sphereImg.data, m = qmat(this.orient);
    const m0 = m[0], m1 = m[1], m2 = m[2], m3 = m[3], m4 = m[4], m5 = m[5], m6 = m[6], m7 = m[7], m8 = m[8];
    const INV2PI = 0.1591549, INVPI = 0.3183099;
    for (let idx = 0; idx < dirX.length; idx++) {
      const o = idx * 4, dz = dirZ[idx];
      if (dz < 0) { data[o + 3] = 0; continue; }
      const dx = dirX[idx], dy = dirY[idx];
      // world = Mᵀ · d
      const wx = m0 * dx + m3 * dy + m6 * dz;
      const wy = m1 * dx + m4 * dy + m7 * dz;
      const wz = m2 * dx + m5 * dy + m8 * dz;
      const lon = Math.atan2(-wz, wx);
      const lat = Math.asin(wy < -1 ? -1 : wy > 1 ? 1 : wy);
      let u = lon * INV2PI + 0.5; u -= Math.floor(u);
      const tx = (u * TEX_W) | 0;
      const ty = clamp((0.5 - lat * INVPI) * TEX_H | 0, 0, TEX_H - 1);
      const t = (ty * TEX_W + tx) * 4;
      let lam = dx * LX + dy * LY + dz * LZ; if (lam < 0) lam = 0;
      const shade = (0.34 + 0.72 * lam) * (0.6 + 0.4 * dz);
      let r = earthData[t] * shade, g = earthData[t + 1] * shade, b = earthData[t + 2] * shade;
      // ocean specular glint (dark, blue-ish texels facing the light)
      if (earthData[t] < 48 && earthData[t + 2] > earthData[t] + 18 && lam > 0.3) {
        const hz = LZ + 1, hl = Math.sqrt(LX * LX + LY * LY + hz * hz);
        let sp = (dx * LX + dy * LY + dz * hz) / hl; if (sp < 0) sp = 0;
        sp = sp * sp; sp = sp * sp; sp = sp * sp * sp;
        const add = sp * 120; r += add; g += add * 1.03; b += add * 1.1;
      }
      // clouds — drift east relative to the surface for a sense of weather
      let cu = u + cloudDrift; cu -= Math.floor(cu);
      const cx = (cu * CLOUD_W) | 0;
      const cy = clamp((0.5 - lat * INVPI) * CLOUD_H | 0, 0, CLOUD_H - 1);
      const ca = cloudData[((cy * CLOUD_W + cx) << 2) + 3] / 255;
      if (ca > 0.02) {
        const cl = (150 + 105 * lam) * (0.55 + 0.45 * dz) * ca;
        r = r * (1 - ca) + cl; g = g * (1 - ca) + cl; b = b * (1 - ca) + cl;
      }
      if (dz < 0.32) { const rim = (0.32 - dz) / 0.32; r += 26 * rim; g += 48 * rim; b += 88 * rim; }
      data[o] = r > 255 ? 255 : r;
      data[o + 1] = g > 255 ? 255 : g;
      data[o + 2] = b > 255 ? 255 : b;
      data[o + 3] = 255;
    }
    this.sctx.putImageData(sphereImg, 0, 0);
  }
}
