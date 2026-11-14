/** Named lunar sites for nearest-neighbour click info (not an exhaustive gazetteer). */

export type LunarSite = {
  id: string;
  name: string;
  lat: number;
  lon: number;
  kind: "apollo" | "artemis" | "robotic" | "feature" | "candidate";
  note: string;
};

export const LUNAR_SITES: LunarSite[] = [
  { id: "a11", name: "Apollo 11 · Tranquility Base", lat: 0.6741, lon: 23.473, kind: "apollo", note: "First crewed landing · Mare Tranquillitatis" },
  { id: "a12", name: "Apollo 12", lat: -3.0124, lon: -23.4216, kind: "apollo", note: "Oceanus Procellarum · Surveyor 3 vicinity" },
  { id: "a14", name: "Apollo 14", lat: -3.6453, lon: -17.4714, kind: "apollo", note: "Fra Mauro highlands" },
  { id: "a15", name: "Apollo 15", lat: 26.1322, lon: 3.6339, kind: "apollo", note: "Hadley–Apennine" },
  { id: "a16", name: "Apollo 16", lat: -8.9734, lon: 15.5011, kind: "apollo", note: "Descartes highlands" },
  { id: "a17", name: "Apollo 17", lat: 20.1908, lon: 30.7717, kind: "apollo", note: "Taurus–Littrow valley" },
  { id: "ce3", name: "Chang’e 3", lat: 44.1214, lon: -19.5116, kind: "robotic", note: "Mare Imbrium · Yutu rover" },
  { id: "ce4", name: "Chang’e 4 · Statio Tianhe", lat: -45.4446, lon: 177.5991, kind: "robotic", note: "Von Kármán · lunar far side" },
  { id: "ce5", name: "Chang’e 5", lat: 43.0576, lon: -51.9161, kind: "robotic", note: "Mons Rümker · sample return" },
  { id: "ce6", name: "Chang’e 6", lat: -41.6385, lon: -153.9852, kind: "robotic", note: "Apollo basin · far-side sample return" },
  { id: "slim", name: "SLIM", lat: -13.316, lon: 25.251, kind: "robotic", note: "JAXA Smart Lander · near Shioli crater" },
  { id: "im1", name: "IM-1 Odysseus", lat: -80.13, lon: 1.44, kind: "robotic", note: "Near Malapert A · south polar region" },
  { id: "shackleton", name: "Shackleton crater", lat: -89.9, lon: 0.0, kind: "feature", note: "South-pole rim · near-permanent illumination candidates" },
  { id: "malapert", name: "Malapert Massif", lat: -85.99, lon: -2.0, kind: "candidate", note: "South polar massif · Artemis region of interest" },
  { id: "connecting", name: "Connecting Ridge", lat: -89.45, lon: -137.1, kind: "candidate", note: "Between Shackleton & de Gerlache · Artemis candidate" },
  { id: "peaknear", name: "Peak Near Shackleton", lat: -88.79, lon: 123.7, kind: "candidate", note: "Artemis III candidate region" },
  { id: "degerlache", name: "de Gerlache Rim", lat: -88.48, lon: -68.3, kind: "candidate", note: "South polar rim · illumination interest" },
  { id: "leibnitz", name: "Leibnitz plateau", lat: -85.3, lon: 30.0, kind: "candidate", note: "Elevated south-polar plateau" },
  { id: "haworth", name: "Haworth crater", lat: -86.9, lon: -4.0, kind: "feature", note: "Permanently shadowed region · volatile interest" },
  { id: "tycho", name: "Tycho crater", lat: -43.3, lon: -11.2, kind: "feature", note: "Young rayed crater · southern highlands" },
  { id: "copernicus", name: "Copernicus crater", lat: 9.62, lon: -20.08, kind: "feature", note: "Prominent rayed crater · Oceanus Procellarum" },
  { id: "oriental", name: "Orientale basin", lat: -19.4, lon: -92.8, kind: "feature", note: "Multi-ring impact basin · western limb" },
];

const R_MOON_KM = 1737.4;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toR = Math.PI / 180;
  const dLat = (lat2 - lat1) * toR;
  const dLon = (lon2 - lon1) * toR;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * toR) * Math.cos(lat2 * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * R_MOON_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function nearestSite(lat: number, lon: number): { site: LunarSite; distanceKm: number } {
  let best = LUNAR_SITES[0];
  let bestD = Infinity;
  for (const s of LUNAR_SITES) {
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { site: best, distanceKm: bestD };
}

export function regionLabel(lat: number, lon: number): string {
  const abs = Math.abs(lat);
  const face = Math.abs(lon) > 90 ? "far side" : "near side";
  if (abs >= 80) return `${lat >= 0 ? "North" : "South"} polar · ${face}`;
  if (abs >= 60) return `${lat >= 0 ? "Northern" : "Southern"} high-latitude · ${face}`;
  if (abs <= 30) return `Equatorial / mid-latitude · ${face}`;
  return `${lat >= 0 ? "Northern" : "Southern"} mid-latitude · ${face}`;
}
