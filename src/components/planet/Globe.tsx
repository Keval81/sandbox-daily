"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import landData from "@/lib/planet/land.json";
import bordersData from "@/lib/planet/borders.json";
import { categoryColor } from "@/lib/planet/categories";
import type { HazardEvent } from "@/lib/planet/types";

const GLOBE_R = 1;

interface LandData {
  polygons: number[][][][];
}
interface BordersData {
  lines: number[][][];
}

/** Longitude/latitude (degrees) → point on a sphere of the given radius. */
function latLonToVec3(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  );
}

/** Soft radial-gradient sprite used for the glowing marker dots. */
function makeGlowTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.85)");
  g.addColorStop(0.5, "rgba(255,255,255,0.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Thin ring sprite used for the expanding "beacon" pulses. */
function makeRingTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement("canvas");
  c.width = c.height = s;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,1)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Build an equirectangular "Blue Marble" earth texture from bundled land
 * polygons — blue oceans, latitude-tinted land (tropical green, arid tan,
 * boreal, polar ice), baked coastline and a faint graticule. Lighting is left
 * to the scene, so no shading is baked in.
 */
function makeEarthTexture(): THREE.Texture {
  const TW = 2048;
  const TH = 1024;
  const c = document.createElement("canvas");
  c.width = TW;
  c.height = TH;
  const x = c.getContext("2d")!;
  const X = (lon: number) => ((lon + 180) / 360) * TW;
  const Y = (lat: number) => ((90 - lat) / 180) * TH;
  const at = (lat: number) => (90 - lat) / 180;

  // Ocean — deep blue, a touch lighter through the tropics.
  const og = x.createLinearGradient(0, 0, 0, TH);
  og.addColorStop(0.0, "#0a1f36");
  og.addColorStop(0.3, "#0e2c48");
  og.addColorStop(0.5, "#12436a");
  og.addColorStop(0.7, "#0e2c48");
  og.addColorStop(1.0, "#0a1f36");
  x.fillStyle = og;
  x.fillRect(0, 0, TW, TH);

  // Land path.
  const path = new Path2D();
  for (const poly of (landData as LandData).polygons) {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const px = X(lon);
        const py = Y(lat);
        if (i === 0) path.moveTo(px, py);
        else path.lineTo(px, py);
      });
      path.closePath();
    }
  }
  x.fillStyle = "#46754a";
  x.fill(path, "evenodd");

  // Gentle, natural latitude tint (muted — not striped) clipped to land.
  x.save();
  x.clip(path, "evenodd");
  const lg = x.createLinearGradient(0, 0, 0, TH);
  lg.addColorStop(at(90), "#e6edf1");
  lg.addColorStop(at(74), "#d7e3e9");
  lg.addColorStop(at(68), "#3c5c3e");
  lg.addColorStop(at(50), "#4a774d");
  lg.addColorStop(at(34), "#6f7350");
  lg.addColorStop(at(24), "#8a7d4e");
  lg.addColorStop(at(15), "#4f7d43");
  lg.addColorStop(at(0), "#3f7a44");
  lg.addColorStop(at(-15), "#4f7d43");
  lg.addColorStop(at(-24), "#8a7d4e");
  lg.addColorStop(at(-38), "#6f7350");
  lg.addColorStop(at(-55), "#4a774d");
  lg.addColorStop(at(-62), "#cfe0e6");
  lg.addColorStop(at(-90), "#eef4f7");
  x.fillStyle = lg;
  x.globalAlpha = 0.55;
  x.fillRect(0, 0, TW, TH);
  x.globalAlpha = 1;

  // Polar ice caps — opaque white over Greenland/Arctic and Antarctica.
  const ice = x.createLinearGradient(0, 0, 0, TH);
  ice.addColorStop(0, "rgba(240,246,250,0.97)");
  ice.addColorStop(at(72), "rgba(228,239,245,0.8)");
  ice.addColorStop(at(63), "rgba(228,239,245,0)");
  ice.addColorStop(at(-58), "rgba(226,237,244,0)");
  ice.addColorStop(at(-66), "rgba(236,245,249,0.92)");
  ice.addColorStop(1, "rgba(246,250,252,0.98)");
  x.fillStyle = ice;
  x.fillRect(0, 0, TW, TH);

  // Country borders (interior), thin, drawn only over land.
  x.strokeStyle = "rgba(230,240,255,0.18)";
  x.lineWidth = 0.8;
  x.beginPath();
  for (const line of (bordersData as BordersData).lines) {
    for (let i = 0; i < line.length - 1; i++) {
      const a = line[i];
      const b = line[i + 1];
      if (Math.abs(a[0] - b[0]) > 180) continue; // skip antimeridian wrap
      x.moveTo(X(a[0]), Y(a[1]));
      x.lineTo(X(b[0]), Y(b[1]));
    }
  }
  x.stroke();
  x.restore();

  // Coastline definition + faint graticule.
  x.strokeStyle = "rgba(6,16,28,0.6)";
  x.lineWidth = 1;
  x.stroke(path);
  x.strokeStyle = "rgba(255,255,255,0.045)";
  for (let lat = -60; lat <= 60; lat += 30) {
    x.beginPath();
    x.moveTo(0, Y(lat));
    x.lineTo(TW, Y(lat));
    x.stroke();
  }
  for (let lon = -150; lon <= 150; lon += 30) {
    x.beginPath();
    x.moveTo(X(lon), 0);
    x.lineTo(X(lon), TH);
    x.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export interface GlobeHandle {
  focus: (id: string) => void;
}

interface GlobeProps {
  events: HazardEvent[];
  selectedId: string | null;
  focusToken: number;
  focusId: string | null;
  onSelect: (id: string | null) => void;
  onHover: (ev: HazardEvent | null, x: number, y: number) => void;
  autoRotate: boolean;
}

export function Globe({
  events,
  selectedId,
  focusToken,
  focusId,
  onSelect,
  onHover,
  autoRotate,
}: GlobeProps) {
  const mountRef = useRef<HTMLDivElement>(null);

  // Mutable refs shared across the effect + the imperative pieces below.
  const eventsRef = useRef<HazardEvent[]>(events);
  const selectedRef = useRef<string | null>(selectedId);
  const autoRotateRef = useRef<boolean>(autoRotate);
  const rebuildRef = useRef<(evs: HazardEvent[]) => void>(() => {});
  const focusRef = useRef<(id: string | null) => void>(() => {});

  eventsRef.current = events;
  selectedRef.current = selectedId;
  autoRotateRef.current = autoRotate;

  // One-time scene setup.
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    let cameraDist = 3.1;
    let userZoomed = false;
    camera.position.set(0, 0, cameraDist);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.touchAction = "none";
    renderer.domElement.style.cursor = "grab";

    // Lighting — a warm key from upper-right, cool fill from below-left.
    scene.add(new THREE.AmbientLight(0x2b3a5a, 0.9));
    const key = new THREE.DirectionalLight(0xfff2e0, 1.5);
    key.position.set(3, 2, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x3355aa, 0.6);
    fill.position.set(-4, -2, -3);
    scene.add(fill);

    // Everything that spins lives under `world`.
    const world = new THREE.Group();
    scene.add(world);

    // ---- Earth sphere (Blue Marble texture; scene lights do the shading) ----
    const earthTex = makeEarthTexture();
    const earthMat = new THREE.MeshPhongMaterial({
      map: earthTex,
      specular: 0x2a4a66,
      shininess: 15,
      emissive: 0x0a1526,
      emissiveIntensity: 0.35,
    });
    const earth = new THREE.Mesh(
      new THREE.SphereGeometry(GLOBE_R, 96, 96),
      earthMat
    );
    world.add(earth);

    // ---- Atmosphere glow (fresnel shell) -----------------------------------
    {
      const mat = new THREE.ShaderMaterial({
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { uColor: { value: new THREE.Color(0x4a90ff) } },
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vNormal;
          uniform vec3 uColor;
          void main() {
            float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.4);
            gl_FragColor = vec4(uColor, 1.0) * intensity * 0.82;
          }`,
      });
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(GLOBE_R * 1.17, 64, 64),
        mat
      );
      scene.add(glow); // sits in scene so it never rotates with markers
    }

    // ---- Starfield ---------------------------------------------------------
    {
      const n = 1400;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const r = 40 + Math.random() * 30;
        const t = Math.acos(2 * Math.random() - 1);
        const p = 2 * Math.PI * Math.random();
        pos[i * 3] = r * Math.sin(t) * Math.cos(p);
        pos[i * 3 + 1] = r * Math.sin(t) * Math.sin(p);
        pos[i * 3 + 2] = r * Math.cos(t);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      const mat = new THREE.PointsMaterial({
        color: 0x9fb4d8,
        size: 0.09,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.8,
      });
      scene.add(new THREE.Points(geo, mat));
    }

    // ---- Markers (spikes + glow tips) --------------------------------------
    const glowTex = makeGlowTexture();
    const ringTex = makeRingTexture();
    const markerGroup = new THREE.Group();
    world.add(markerGroup);

    let points: THREE.Points | null = null;
    let spikes: THREE.LineSegments | null = null;
    let markerEvents: HazardEvent[] = [];
    // Beacon pulses: reusable pool of ring sprites.
    const BEACONS = 16;
    const beacons: THREE.Sprite[] = [];
    for (let i = 0; i < BEACONS; i++) {
      const spr = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: ringTex,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          opacity: 0,
        })
      );
      spr.visible = false;
      markerGroup.add(spr);
      beacons.push(spr);
    }
    let beaconTargets: { pos: THREE.Vector3; color: THREE.Color; sev: number }[] =
      [];

    function disposeMarkers() {
      if (points) {
        markerGroup.remove(points);
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
        points = null;
      }
      if (spikes) {
        markerGroup.remove(spikes);
        spikes.geometry.dispose();
        (spikes.material as THREE.Material).dispose();
        spikes = null;
      }
    }

    function rebuildMarkers(evs: HazardEvent[]) {
      disposeMarkers();
      markerEvents = evs;
      if (!evs.length) {
        beaconTargets = [];
        return;
      }

      const tipPos = new Float32Array(evs.length * 3);
      const tipColor = new Float32Array(evs.length * 3);
      const tipSize = new Float32Array(evs.length);
      const spikeVerts: number[] = [];
      const spikeColors: number[] = [];
      const col = new THREE.Color();

      evs.forEach((e, i) => {
        const height = 0.04 + e.severity * 0.28;
        const base = latLonToVec3(e.lat, e.lon, GLOBE_R * 1.004);
        const tip = latLonToVec3(e.lat, e.lon, GLOBE_R * (1.004 + height));
        tipPos[i * 3] = tip.x;
        tipPos[i * 3 + 1] = tip.y;
        tipPos[i * 3 + 2] = tip.z;
        col.set(categoryColor(e.category));
        tipColor[i * 3] = col.r;
        tipColor[i * 3 + 1] = col.g;
        tipColor[i * 3 + 2] = col.b;
        tipSize[i] = 0.06 + e.severity * 0.14;
        // Spike fades from dim base to bright tip.
        spikeVerts.push(base.x, base.y, base.z, tip.x, tip.y, tip.z);
        spikeColors.push(col.r * 0.15, col.g * 0.15, col.b * 0.15);
        spikeColors.push(col.r, col.g, col.b);
      });

      // Glow tips.
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute("position", new THREE.BufferAttribute(tipPos, 3));
      pGeo.setAttribute("color", new THREE.BufferAttribute(tipColor, 3));
      pGeo.setAttribute("aSize", new THREE.BufferAttribute(tipSize, 1));
      const pMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uTex: { value: glowTex },
          uScale: { value: 1 },
          uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
        },
        vertexShader: `
          attribute float aSize;
          varying vec3 vColor;
          uniform float uScale;
          uniform float uPixelRatio;
          void main() {
            vColor = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = aSize * uScale * uPixelRatio * (300.0 / -mv.z);
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `
          varying vec3 vColor;
          uniform sampler2D uTex;
          void main() {
            vec4 t = texture2D(uTex, gl_PointCoord);
            gl_FragColor = vec4(vColor, 1.0) * t.a;
          }`,
      });
      pMat.vertexColors = true;
      points = new THREE.Points(pGeo, pMat);
      points.frustumCulled = false;
      markerGroup.add(points);

      // Spikes.
      const sGeo = new THREE.BufferGeometry();
      sGeo.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(spikeVerts, 3)
      );
      sGeo.setAttribute(
        "color",
        new THREE.Float32BufferAttribute(spikeColors, 3)
      );
      const sMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      spikes = new THREE.LineSegments(sGeo, sMat);
      spikes.frustumCulled = false;
      markerGroup.add(spikes);

      // Pick the most severe events as beacon targets.
      beaconTargets = [...evs]
        .map((e, i) => ({ e, i }))
        .sort((a, b) => b.e.severity - a.e.severity)
        .slice(0, BEACONS)
        .map(({ e }) => ({
          pos: latLonToVec3(e.lat, e.lon, GLOBE_R * 1.01),
          color: new THREE.Color(categoryColor(e.category)),
          sev: e.severity,
        }));
    }

    rebuildRef.current = rebuildMarkers;
    rebuildMarkers(eventsRef.current);

    // ---- Orientation state (quaternion-driven) -----------------------------
    const Y_AXIS = new THREE.Vector3(0, 1, 0);
    const X_AXIS = new THREE.Vector3(1, 0, 0);
    // Start tilted so the northern hemisphere / land is nicely framed.
    world.quaternion.setFromEuler(new THREE.Euler(0.35, -1.2, 0));

    let dragging = false;
    let moved = false;
    let lastX = 0;
    let lastY = 0;
    let velX = 0;
    let velY = 0;
    let focusing = false;
    const focusTarget = new THREE.Quaternion();

    function setFocus(id: string | null) {
      if (!id) return;
      const idx = markerEvents.findIndex((e) => e.id === id);
      if (idx < 0) return;
      const e = markerEvents[idx];
      const dir = latLonToVec3(e.lat, e.lon, 1).normalize();
      const a = Math.atan2(dir.x, dir.z);
      const horiz = Math.hypot(dir.x, dir.z);
      const elev = Math.atan2(dir.y, horiz);
      const qY = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, -a);
      const qX = new THREE.Quaternion().setFromAxisAngle(X_AXIS, elev * 0.85);
      focusTarget.copy(qX.multiply(qY));
      focusing = true;
      velX = velY = 0;
    }
    focusRef.current = setFocus;

    // ---- Pointer interaction ----------------------------------------------
    const raycaster = new THREE.Raycaster();
    raycaster.params.Points = { threshold: 0.05 };
    const pointer = new THREE.Vector2();
    let hoverIndex = -1;

    function pick(clientX: number, clientY: number): number {
      if (!points) return -1;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObject(points, false);
      if (!hits.length) return -1;
      // Nearest to camera among hits with a valid index.
      let best = -1;
      let bestDist = Infinity;
      for (const h of hits) {
        if (h.index == null) continue;
        if (h.distanceToRay != null && h.distanceToRay > 0.045) continue;
        if (h.distance < bestDist) {
          bestDist = h.distance;
          best = h.index;
        }
      }
      return best;
    }

    function onPointerDown(e: PointerEvent) {
      dragging = true;
      moved = false;
      lastX = e.clientX;
      lastY = e.clientY;
      focusing = false;
      renderer.domElement.setPointerCapture(e.pointerId);
      renderer.domElement.style.cursor = "grabbing";
    }
    function onPointerMove(e: PointerEvent) {
      if (dragging) {
        const dx = e.clientX - lastX;
        const dy = e.clientY - lastY;
        lastX = e.clientX;
        lastY = e.clientY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        const k = 0.005;
        velY = dx * k;
        velX = dy * k;
        world.quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(Y_AXIS, velY)
        );
        world.quaternion.premultiply(
          new THREE.Quaternion().setFromAxisAngle(X_AXIS, velX)
        );
      } else {
        const idx = pick(e.clientX, e.clientY);
        if (idx !== hoverIndex) {
          hoverIndex = idx;
          renderer.domElement.style.cursor = idx >= 0 ? "pointer" : "grab";
        }
        if (idx >= 0) {
          onHover(markerEvents[idx], e.clientX, e.clientY);
        } else {
          onHover(null, 0, 0);
        }
      }
    }
    function onPointerUp(e: PointerEvent) {
      if (dragging && !moved) {
        const idx = pick(e.clientX, e.clientY);
        onSelect(idx >= 0 ? markerEvents[idx].id : null);
        if (idx >= 0) setFocus(markerEvents[idx].id);
      }
      dragging = false;
      renderer.domElement.style.cursor = "grab";
      try {
        renderer.domElement.releasePointerCapture(e.pointerId);
      } catch {}
    }
    function onPointerLeave() {
      onHover(null, 0, 0);
      hoverIndex = -1;
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      userZoomed = true;
      cameraDist = THREE.MathUtils.clamp(
        cameraDist + e.deltaY * 0.0016,
        1.6,
        6.5
      );
    }

    const el = renderer.domElement;
    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove);
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointerleave", onPointerLeave);
    el.addEventListener("wheel", onWheel, { passive: false });

    // ---- Resize ------------------------------------------------------------
    // Distance that frames the whole globe for a given aspect. Portrait phones
    // need to pull back (globe fits the narrow width) and nudge the sphere down
    // so it clears the header panel.
    function fitDistance(aspect: number): number {
      let d = 3.1;
      if (aspect < 1) d = 3.1 + (1 / aspect - 1) * 1.8;
      return THREE.MathUtils.clamp(d, 2.4, 6.5);
    }
    function resize() {
      const w = mount!.clientWidth || 1;
      const h = mount!.clientHeight || 1;
      const aspect = w / h;
      renderer.setSize(w, h, false);
      camera.aspect = aspect;
      // Shift the globe lower on portrait so the HUD panel doesn't cover it.
      if (aspect < 0.95) {
        camera.setViewOffset(w, h, 0, -h * 0.08, w, h);
      } else {
        camera.clearViewOffset();
      }
      camera.updateProjectionMatrix();
      // Re-fit unless the user has taken manual control of zoom.
      if (!userZoomed) cameraDist = fitDistance(aspect);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ---- Animation loop ----------------------------------------------------
    let raf = 0;
    let running = true;
    const clock = new THREE.Clock();

    function frame() {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;

      // Idle spin + inertia when not dragging or focusing.
      if (!dragging && !focusing) {
        if (Math.abs(velY) > 0.0002 || Math.abs(velX) > 0.0002) {
          world.quaternion.premultiply(
            new THREE.Quaternion().setFromAxisAngle(Y_AXIS, velY)
          );
          world.quaternion.premultiply(
            new THREE.Quaternion().setFromAxisAngle(X_AXIS, velX)
          );
          velY *= 0.94;
          velX *= 0.94;
        } else if (autoRotateRef.current && !reduceMotion) {
          world.quaternion.premultiply(
            new THREE.Quaternion().setFromAxisAngle(Y_AXIS, dt * 0.06)
          );
        }
      }

      // Ease toward focus target.
      if (focusing) {
        world.quaternion.slerp(focusTarget, 0.08);
        if (world.quaternion.angleTo(focusTarget) < 0.01) focusing = false;
      }

      // Smooth camera dolly.
      camera.position.z += (cameraDist - camera.position.z) * 0.12;

      // Pulse the glow-tip size subtly.
      if (points) {
        const mat = points.material as THREE.ShaderMaterial;
        mat.uniforms.uScale.value = 1 + Math.sin(t * 2.2) * 0.08;
      }

      // Animate beacons — expanding fading rings on the most severe events.
      const period = 2.4;
      beacons.forEach((spr, i) => {
        const tgt = beaconTargets[i];
        if (!tgt) {
          spr.visible = false;
          return;
        }
        spr.visible = true;
        spr.position.copy(tgt.pos);
        const phase = ((t / period) + i * 0.17) % 1;
        const scale = 0.05 + phase * (0.14 + tgt.sev * 0.16);
        spr.scale.setScalar(scale);
        const m = spr.material as THREE.SpriteMaterial;
        m.color.copy(tgt.color);
        m.opacity = (1 - phase) * 0.9;
      });

      renderer.render(scene, camera);
    }
    frame();

    // Pause when the tab is hidden to save the GPU.
    function onVisibility() {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        clock.getDelta();
        frame();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);

    // ---- Cleanup -----------------------------------------------------------
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointerleave", onPointerLeave);
      el.removeEventListener("wheel", onWheel);
      disposeMarkers();
      glowTex.dispose();
      ringTex.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        const anyO = o as unknown as {
          geometry?: THREE.BufferGeometry;
          material?: THREE.Material | THREE.Material[];
        };
        anyO.geometry?.dispose?.();
        const m = anyO.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m?.dispose?.();
      });
      if (renderer.domElement.parentNode === mount)
        mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rebuild markers when the event set changes.
  useEffect(() => {
    rebuildRef.current(events);
  }, [events]);

  // Fly to a marker when the focus token changes.
  useEffect(() => {
    if (focusId) focusRef.current(focusId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusToken]);

  return <div ref={mountRef} className="h-full w-full" />;
}
