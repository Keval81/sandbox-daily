export interface EarthTextures {
  earthData: Uint8ClampedArray;   // 2048×1024 RGBA, hillshade baked in
  cloudData: Uint8ClampedArray;   // 1024×512 RGBA, density in the alpha channel
}

export const TEX_W = 2048;
export const TEX_H = 1024;
export const CLOUD_W = 1024;
export const CLOUD_H = 512;

export const DEFAULT_TEXTURE_URLS = {
  day: "/pulse/day.jpg",
  topo: "/pulse/topo.png",
  clouds: "/pulse/clouds.png",   // PNG, not JPEG: density lives in the alpha channel
};

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

/**
 * Bake hillshade relief from the topography into the day colour, so the
 * surface reads as terrain rather than a flat plain. ~2M pixels — expensive
 * enough that the result is cached for the process, not per engine instance.
 */
const build = async (urls: typeof DEFAULT_TEXTURE_URLS): Promise<EarthTextures> => {
  const [dayImg, topoImg, cloudImg] = await Promise.all([
    loadImage(urls.day), loadImage(urls.topo), loadImage(urls.clouds),
  ]);

  const day = grab(dayImg, TEX_W, TEX_H);
  const HW = TEX_W >> 1;
  const HH = TEX_H >> 1;
  const topo = grab(topoImg, HW, HH);
  const cloudData = grab(cloudImg, CLOUD_W, CLOUD_H);

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
  urls: typeof DEFAULT_TEXTURE_URLS = DEFAULT_TEXTURE_URLS
): Promise<EarthTextures> => {
  // Memoise the success, never the failure: a cached rejection would mean one
  // bad asset path leaves the planet missing for the lifetime of the page,
  // Fast Refresh included, with no way to retry.
  cached ??= build(urls).catch((err: unknown) => {
    cached = null;
    throw err;
  });
  return cached;
};
