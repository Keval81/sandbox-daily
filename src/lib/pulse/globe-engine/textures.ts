export interface EarthTextures {
  earthData: Uint8ClampedArray;   // 2048×1024 RGBA, hillshade baked in
  /** 1024×512 RGBA, density in the alpha channel. Starts as a transparent
   *  stand-in and is replaced when the cloud sheet lands — see
   *  `loadEarthTextures`. */
  cloudData: Uint8ClampedArray;
}

export const TEX_W = 2048;
export const TEX_H = 1024;
export const CLOUD_W = 1024;
export const CLOUD_H = 512;

export interface TextureUrls {
  day: string;
  topo: string;
  clouds: string;   // PNG, not JPEG: density lives in the alpha channel
}

/** A function, not an exported const object — deliberately. Turbopack's
 *  production minifier compiled the previous
 *  `export const DEFAULT_TEXTURE_URLS = { day: "/pulse/day.jpg", ... }` into
 *  a literal `{}` in the client chunk (all three string properties dropped;
 *  every URL became `undefined`, the engine 404'd on `/undefined`, and the
 *  planet silently fell back to the static poster — "the globe isn't
 *  spinning, only the pins are"). Dev builds were unaffected, so it only
 *  showed in production. Building the object at call time inside a function
 *  body is opaque to that optimisation. Verified fixed by grepping the built
 *  chunk for "/pulse/day.jpg" — keep that check if this ever changes shape. */
export const defaultTextureUrls = (): TextureUrls => ({
  day: "/pulse/day.jpg",
  topo: "/pulse/topo.png",
  clouds: "/pulse/clouds.png",
});

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error(`texture failed to load: ${src}`));
    im.src = src;
  });

const grab = (
  img: HTMLImageElement, w: number, h: number
): Uint8ClampedArray => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d", { willReadFrequently: true });
  if (!x) throw new Error("2d context unavailable");
  x.drawImage(img, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data;
};

/** A cloudless sheet: alpha 0 everywhere, so renderSphere's `ca > 0.02` test
 *  skips the cloud blend entirely. Lets the planet render before the cloud
 *  PNG has arrived without a null check in the per-pixel hot loop. */
const emptyClouds = (): Uint8ClampedArray =>
  new Uint8ClampedArray(CLOUD_W * CLOUD_H * 4);

let cloudCache: Uint8ClampedArray | null = null;
let cloudPending: Promise<Uint8ClampedArray> | null = null;

/** The cloud sheet, fetched once per process and off the planet's critical
 *  path. Failure is never cached: a transient drop would otherwise leave the
 *  globe permanently clear. */
const loadClouds = (url: string): Promise<Uint8ClampedArray> => {
  if (cloudCache) return Promise.resolve(cloudCache);
  cloudPending ??= loadImage(url)
    .then((img) => {
      cloudCache = grab(img, CLOUD_W, CLOUD_H);
      return cloudCache;
    })
    .catch((err: unknown) => {
      cloudPending = null;
      throw err;
    });
  return cloudPending;
};

/**
 * Bake hillshade relief from the topography into the day colour, so the
 * surface reads as terrain rather than a flat plain. ~2M pixels — expensive
 * enough that the result is cached for the process, not per engine instance.
 */
const build = async (urls: TextureUrls): Promise<EarthTextures> => {
  const [dayImg, topoImg] = await Promise.all([
    loadImage(urls.day), loadImage(urls.topo),
  ]);

  const day = grab(dayImg, TEX_W, TEX_H);
  const HW = TEX_W >> 1;
  const HH = TEX_H >> 1;
  const topo = grab(topoImg, HW, HH);
  const cloudData = cloudCache ?? emptyClouds();

  const earthData = new Uint8ClampedArray(day.length);
  const hAt = (hx: number, hy: number) => topo[((hy * HW) + hx) << 2];
  const lx = -0.55, ly = -0.55, lz = 1.5;
  const ll = Math.hypot(lx, ly, lz);

  for (let ty = 0; ty < TEX_H; ty++) {
    const hy = ty >> 1;
    const hy0 = hy > 0 ? hy - 1 : hy;
    const hy1 = hy < HH - 1 ? hy + 1 : hy;
    for (let tx = 0; tx < TEX_W; tx++) {
      const i = (ty * TEX_W + tx) << 2;
      const hx = tx >> 1;
      const hx0 = hx > 0 ? hx - 1 : hx;
      const hx1 = hx < HW - 1 ? hx + 1 : hx;
      const sx = (hAt(hx0, hy) - hAt(hx1, hy)) * 0.05;
      const sy = (hAt(hx, hy0) - hAt(hx, hy1)) * 0.05;
      const nl = Math.hypot(sx, sy, 1);
      const sh = (sx * lx + sy * ly + lz) / (nl * ll);
      const f = 0.78 + 0.42 * Math.max(0, sh);
      earthData[i] = day[i] * f;
      earthData[i + 1] = day[i + 1] * f;
      earthData[i + 2] = day[i + 2] * f;
      earthData[i + 3] = 255;
    }
  }

  return { earthData, cloudData };
};

let cached: Promise<EarthTextures> | null = null;

export const loadEarthTextures = (
  urls: TextureUrls = defaultTextureUrls(),
  /** Called when the cloud sheet lands — after the returned promise, normally. */
  onClouds?: (cloudData: Uint8ClampedArray) => void
): Promise<EarthTextures> => {
  // Memoise the success, never the failure: a cached rejection would mean one
  // bad asset path leaves the planet missing for the lifetime of the page,
  // Fast Refresh included, with no way to retry.
  cached ??= build(urls).catch((err: unknown) => {
    cached = null;
    throw err;
  });

  // Clouds are cosmetic, so they load alongside the planet rather than gating
  // it. The canvas is invisible (opacity 0) until the engine marks it ready,
  // and the engine can only do that once this promise resolves — holding that
  // behind another 470KB cost ~2s of blank globe on a 4 Mbps connection, on
  // top of the ~8s the planet's own bytes already took (measured 2026-08-02).
  if (onClouds) {
    void loadClouds(urls.clouds)
      .then(onClouds)
      .catch((err: unknown) => {
        // Honest degradation, logged not hidden: a clear globe is a correct
        // globe, but a silently missing weather layer is a lie by omission.
        console.error("[GlobeEngine] cloud sheet failed to load", err);
      });
  }

  return cached;
};
