import type { AlternativesResponse, AreaSummary, CalendarResponse, CompareResponse, DatasetList, EphemerisResponse, Health, HorizonResponse,
  MapsResponse, MapsStatus, MeshGrid, PointInfo, Requirements, ScoreCandidate, ScoreWeights, SiteInfo, ValidationReport, VisibilityResponse } from "@/types/api";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, { cache: "no-store", ...init });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch { /* non-JSON error body */ }
    throw new Error(`${res.status}: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  }
  return res.json() as Promise<T>;
}
const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown) => request<T>(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export const api = {
  health: () => get<Health>("/health"),
  datasets: () => get<DatasetList>("/datasets"),
  sites: () => get<{ sites: SiteInfo[]; count: number }>("/terrain/sites"),
  legend: (site: string, layer: string) => get<{ min?: number; max?: number }>(`/terrain/${site}/legend/${layer}`),
  mesh: (site: string, maxDim = 160) => get<MeshGrid>(`/terrain/${site}/mesh?max_dim=${maxDim}`),
  point: (site: string, x: number, y: number) => get<PointInfo>(`/terrain/${site}/point?x=${x}&y=${y}`),
  horizon: (site: string, x: number, y: number, heightM: number) =>
    get<HorizonResponse>(`/terrain/${site}/horizon?x=${x}&y=${y}&observer_height_m=${heightM}&az_step_deg=1&max_range_m=20000`),
  summary: (site: string, x: number, y: number, radius: number) => get<AreaSummary>(`/terrain/${site}/summary?x=${x}&y=${y}&radius_m=${radius}`),
  summaryLatLon: (site: string, lat: number, lon: number, radius: number) =>
    get<AreaSummary>(`/terrain/${site}/summary?lat=${lat}&lon=${lon}&radius_m=${radius}`),
  ephemeris: (lat: number, lon: number, heightM: number, startIso: string, stopIso: string, stepMin: number) =>
    get<EphemerisResponse>(`/ephemeris/track?lat=${lat}&lon=${lon}&height_m=${heightM}&start=${encodeURIComponent(startIso)}` +
      `&stop=${encodeURIComponent(stopIso)}&step_min=${stepMin}`),
  visibility: (site: string, lat: number, lon: number, startIso: string, stopIso: string, heightM: number, stepMin: number) =>
    get<VisibilityResponse>(`/analysis/${site}/visibility?lat=${lat}&lon=${lon}&start=${encodeURIComponent(startIso)}` +
      `&stop=${encodeURIComponent(stopIso)}&observer_height_m=${heightM}&step_min=${stepMin}`),
  calendar: (site: string, lat: number, lon: number, firstStartIso: string, nDays: number, durationDays: number, heightM: number) =>
    get<CalendarResponse>(`/analysis/${site}/calendar?lat=${lat}&lon=${lon}&first_start=${encodeURIComponent(firstStartIso)}` +
      `&n_days=${nDays}&duration_days=${durationDays}&observer_height_m=${heightM}&step_min=30`),
  alternatives: (site: string, lat: number, lon: number, startIso: string, stopIso: string, r: Requirements) =>
    get<AlternativesResponse>(`/analysis/${site}/alternatives?lat=${lat}&lon=${lon}&start=${encodeURIComponent(startIso)}` +
      `&stop=${encodeURIComponent(stopIso)}&min_sun=${r.minSunPct / 100}&max_dark_h=${r.maxDarkH}&min_earth=${r.minEarthPct / 100}` +
      `&min_favorable=${r.minFavorablePct / 100}&radius_m=3000&limit=6`),
  compare: (site: string, startIso: string, stopIso: string, heightM: number, candidates: ScoreCandidate[],
            req: Requirements, weights: ScoreWeights) =>
    post<CompareResponse>(`/analysis/${site}/compare`, {
      start: startIso, stop: stopIso, observer_height_m: heightM, step_min: 30, candidates,
      requirements: { min_sun: req.minSunPct / 100, max_dark_h: req.maxDarkH, min_earth: req.minEarthPct / 100, min_favorable: req.minFavorablePct / 100 },
      weights,
    }),
  validation: (site = "site01") => get<ValidationReport>(`/validation/report?site_id=${site}`),
  mapsStatus: (site: string) => get<MapsStatus>(`/analysis/${site}/maps/status`),
  maps: (site: string, startIso: string, stopIso: string, stepMin: number) =>
    get<MapsResponse>(`/analysis/${site}/maps?start=${encodeURIComponent(startIso)}&stop=${encodeURIComponent(stopIso)}&step_min=${stepMin}`),
  globeManifest: () => get<{
    assets: { albedo: string; bump: string };
    sources: Record<string, string>;
    honesty: string[];
  }>("/terrain/global/globe"),
};

export const layerUrl = (site: string, layer: string, maxPx = 1600) => `${API_URL}/api/terrain/${site}/layer/${layer}.png?max_px=${maxPx}`;

export const globeAlbedoUrl = () => `${API_URL}/api/terrain/global/globe/wac_albedo_4k.jpg`;
export const globeBumpUrl = () => `${API_URL}/api/terrain/global/globe/ldem_bump_2k.png`;
