import type { SiteInfo } from "@/types/api";

/** Same sphere and projection as the backend (south polar stereographic, lat_0=-90, lon_0=0, k=1, R=1737.4 km). */
export const MOON_RADIUS_M = 1737400;

export function latlonToXy(lat: number, lonEast: number): { x: number; y: number } {
  const rho = 2 * MOON_RADIUS_M * Math.tan(Math.PI / 4 + (lat * Math.PI) / 360);
  const l = (lonEast * Math.PI) / 180;
  return { x: rho * Math.sin(l), y: rho * Math.cos(l) };
}

/** Inverse of latlonToXy (same sphere and south polar stereographic). Lon in 0..360 east. */
export function xyToLatLon(x: number, y: number): { lat: number; lon: number } {
  const rho = Math.hypot(x, y);
  const lat = (2 * Math.atan(rho / (2 * MOON_RADIUS_M)) * 180) / Math.PI - 90;
  const lon = ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
  return { lat, lon };
}

/** Geographic → Three.js Y-up cartesian (km). Lon east-positive; frame is for visualisation, not SPICE ME. */
export function latLonToCartesian(lat: number, lonEast: number, radiusKm: number): { x: number; y: number; z: number } {
  const φ = (lat * Math.PI) / 180;
  const λ = (lonEast * Math.PI) / 180;
  const c = Math.cos(φ);
  return { x: radiusKm * c * Math.sin(λ), y: radiusKm * Math.sin(φ), z: radiusKm * c * Math.cos(λ) };
}

/** Fractional position (0..1, origin top-left) of a lat/lon inside a site's grid, or null when outside it. */
export function siteFraction(site: SiteInfo, lat: number, lonEast: number): { fx: number; fy: number } | null {
  const { x, y } = latlonToXy(lat, lonEast);
  const [xmin, ymin, xmax, ymax] = site.bounds_xy_m;
  if (x < xmin || x > xmax || y < ymin || y > ymax) return null;
  return { fx: (x - xmin) / (xmax - xmin), fy: (ymax - y) / (ymax - ymin) };
}

/** Nearest site to a point that lies outside every site, with the straight-line distance (m) to that site's edge. */
export function nearestSiteMiss(sites: SiteInfo[], lat: number, lonEast: number): { site: SiteInfo; distanceM: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lonEast)) return null;
  const { x, y } = latlonToXy(lat, lonEast);
  let best: { site: SiteInfo; distanceM: number } | null = null;
  for (const s of sites) {
    const [xmin, ymin, xmax, ymax] = s.bounds_xy_m;
    const d = Math.hypot(Math.max(xmin - x, 0, x - xmax), Math.max(ymin - y, 0, y - ymax));
    if (!best || d < best.distanceM) best = { site: s, distanceM: d };
  }
  return best;
}

export function outsideMessage(sites: SiteInfo[], lat: number, lonEast: number): string {
  const miss = nearestSiteMiss(sites, lat, lonEast);
  if (!miss) return "The target is outside every loaded LOLA tile. Pick a point in the Explorer.";
  const d = miss.distanceM >= 1000 ? `${(miss.distanceM / 1000).toFixed(1)} km` : `${Math.round(miss.distanceM)} m`;
  return `The target is ${d} outside the ${miss.site.site_id} LOLA tile, so there is no terrain to analyse there. Pick a point in the Explorer.`;
}

export const normLon = (lon: number) => ((lon % 360) + 360) % 360;
