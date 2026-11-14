/** Pure math helpers for the Full Moon 3D globe (Mean Earth / Polar Axis). No Three import required. */

export const MOON_RADIUS_KM = 1737.4;
export const MOON_RADIUS_M = 1_737_400;
/** Default unit-sphere radius used by the Three mesh. */
export const GLOBE_RADIUS = 1;

export type Vec3 = { x: number; y: number; z: number };

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/** Clamp longitude into (−180, 180]. */
export function wrapLon(lon: number): number {
  let x = ((((lon + 180) % 360) + 360) % 360) - 180;
  if (x === -180) x = 180;
  return x;
}

/** Clamp latitude into [−90, 90]. */
export function clampLat(lat: number): number {
  return Math.max(-90, Math.min(90, lat));
}

/**
 * Lat/lon → Cartesian on a sphere of radius `r`.
 * Y-up, +Z toward lon 0 on the near side (matches common Three.js globe setups).
 */
export function latLonToVec3(lat: number, lon: number, r = GLOBE_RADIUS): Vec3 {
  const φ = clampLat(lat) * DEG;
  const λ = wrapLon(lon) * DEG;
  const cosφ = Math.cos(φ);
  return {
    x: r * cosφ * Math.sin(λ),
    y: r * Math.sin(φ),
    z: r * cosφ * Math.cos(λ),
  };
}

/** Cartesian → lat/lon (degrees). Origin-safe. */
export function vec3ToLatLon(v: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(v.x, v.y, v.z) || 1;
  const lat = Math.asin(Math.max(-1, Math.min(1, v.y / r))) * RAD;
  const lon = Math.atan2(v.x, v.z) * RAD;
  return { lat, lon: wrapLon(lon) };
}

/** Equirectangular UV for Trek/WAC-style textures (u: 0 at −180°, v: 0 at +90°). */
export function latLonToUv(lat: number, lon: number): { u: number; v: number } {
  return {
    u: (wrapLon(lon) + 180) / 360,
    v: (90 - clampLat(lat)) / 180,
  };
}

/**
 * Camera eye that looks at a surface point from distance `dist` (from origin).
 * Use with a unit globe (`GLOBE_RADIUS = 1`); typical `dist` ≈ 3.5–4.5.
 */
export function cameraForLatLon(lat: number, lon: number, dist = 4.0): Vec3 {
  return latLonToVec3(lat, lon, dist);
}

/** Surface normal at lat/lon (same as unit position vector). */
export function surfaceNormal(lat: number, lon: number): Vec3 {
  return latLonToVec3(lat, lon, 1);
}

/** Great-circle angular separation in degrees. */
export function angularDistanceDeg(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const a = latLonToVec3(lat1, lon1, 1);
  const b = latLonToVec3(lat2, lon2, 1);
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z));
  return Math.acos(dot) * RAD;
}

/** Arc length on the mean lunar sphere (km). */
export function surfaceDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return (angularDistanceDeg(lat1, lon1, lat2, lon2) * DEG) * MOON_RADIUS_KM;
}

export function formatLat(lat: number, digits = 2): string {
  const a = Math.abs(lat).toFixed(digits);
  return `${a}°${lat >= 0 ? "N" : "S"}`;
}

export function formatLon(lon: number, digits = 2): string {
  const w = wrapLon(lon);
  const a = Math.abs(w).toFixed(digits);
  return `${a}°${w >= 0 ? "E" : "W"}`;
}

export function formatLatLon(lat: number, lon: number, digits = 2): string {
  return `${formatLat(lat, digits)}  ${formatLon(lon, digits)}`;
}
