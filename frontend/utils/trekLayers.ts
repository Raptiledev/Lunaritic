/** NASA Trek Moon WMTS layers (browser-safe; CORS open). https://trek.nasa.gov/moon/ */

export type TrekLayerId = "dem" | "clrshade" | "shade" | "wac" | "roughness";

export type TrekLayer = {
  id: TrekLayerId;
  label: string;
  summary: string;
  /** WMTS product folder under /tiles/Moon/EQ/ */
  product: string;
  ext: "png" | "jpg";
  maxZoom: number;
  /** Approx equatorial metres per pixel at maxZoom (order-of-magnitude). */
  mPerPxAtMax: number;
};

export const TREK_LAYERS: Record<TrekLayerId, TrekLayer> = {
  dem: {
    id: "dem",
    label: "LOLA DEM",
    summary: "Global LOLA digital elevation model · 128 ppd · height vs 1 737 400 m radius",
    product: "LRO_LOLA_DEM_Global_128ppd_v04",
    ext: "png",
    maxZoom: 5,
    mPerPxAtMax: 237,
  },
  clrshade: {
    id: "clrshade",
    label: "LOLA colour shade",
    summary: "Colourized LOLA shaded relief · elevation hues + hillshade",
    product: "LRO_LOLA_ClrShade_Global_128ppd_v04",
    ext: "png",
    maxZoom: 5,
    mPerPxAtMax: 237,
  },
  shade: {
    id: "shade",
    label: "LOLA hillshade",
    summary: "Grayscale LOLA shaded relief · terrain form without colour stretch",
    product: "LRO_LOLA_Shade_Global_128ppd_v04",
    ext: "png",
    maxZoom: 5,
    mPerPxAtMax: 237,
  },
  wac: {
    id: "wac",
    label: "LROC WAC",
    summary: "LRO Wide Angle Camera global mosaic · 303 ppd",
    product: "LRO_WAC_Mosaic_Global_303ppd_v02",
    ext: "jpg",
    maxZoom: 8,
    mPerPxAtMax: 100,
  },
  roughness: {
    id: "roughness",
    label: "LOLA roughness",
    summary: "Colourized LOLA surface roughness · 16 ppd",
    product: "LRO_LOLA_ClrRoughness_Global_16ppd",
    ext: "png",
    maxZoom: 4,
    mPerPxAtMax: 1900,
  },
};

export function trekTileUrl(layer: TrekLayer, z: number, y: number, x: number): string {
  return `https://trek.nasa.gov/tiles/Moon/EQ/${layer.product}/1.0.0/default/default028mm/${z}/${y}/${x}.${layer.ext}`;
}

export function trekTemplateUrl(layer: TrekLayer): string {
  return `https://trek.nasa.gov/tiles/Moon/EQ/${layer.product}/1.0.0/default/default028mm/{z}/{y}/{x}.${layer.ext}`;
}

/** Lon −180…180, lat −90…90 → WMTS tile indices (Trek / Leaflet EPSG:4326). */
export function lonLatToTile(lon: number, lat: number, z: number): { x: number; y: number; i: number; j: number } {
  const cols = 2 ** (z + 1);
  const rows = 2 ** z;
  const fx = ((lon + 180) / 360) * cols;
  const fy = ((90 - lat) / 180) * rows;
  const x = Math.min(cols - 1, Math.max(0, Math.floor(fx)));
  const y = Math.min(rows - 1, Math.max(0, Math.floor(fy)));
  const i = Math.min(255, Math.max(0, Math.floor((fx - x) * 256)));
  const j = Math.min(255, Math.max(0, Math.floor((fy - y) * 256)));
  return { x, y, i, j };
}

/**
 * Trek DEM PNGs are a colourized stretch of height above the 1 737 400 m lunar radius.
 * Approximate elevation from the common blue→cyan→green→yellow→red ramp (metres).
 * Reported as estimate only — not a certified geodetic query.
 */
export function estimateElevationFromRgb(r: number, g: number, b: number): number | null {
  if (r + g + b < 8) return null;
  // Hue-based position on the LOLA colour DEM ramp (~−9000 … +10700 m typical).
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min || 1;
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  if (h < 0) h += 6;
  const t = h / 6; // 0…1 around the wheel; blue≈0.66, red≈0
  // Map blue (cold/low) → red (hot/high) along Trek’s usual DEM palette.
  const lowBias = ((b - r) / 255 + 1) / 2; // 1 when blue-dominant, 0 when red-dominant
  const mid = g / 255;
  const score = lowBias * 0.55 + (1 - ((r - b) / 255 + 1) / 2) * 0.25 + mid * 0.2;
  const elev = -9000 + score * 19700;
  return Math.round(elev);
}
