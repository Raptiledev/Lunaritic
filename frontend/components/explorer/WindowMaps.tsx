"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/services/api";
import { useMission } from "@/context/mission";
import { windowFor } from "./HorizonPanel";
import type { MapCell, MapLayerId, MapsResponse, MapsStatus, SiteInfo } from "@/types/api";

// Colour carries meaning: amber ramps are about the Sun, blue about Earth, bone for "both".
const SUN = ["#06080c", "#2b1d08", "#8a5a14", "#ffb547", "#fff3dc"];
const EARTH = ["#06080c", "#0c1d33", "#1f5a99", "#5aaeff", "#e6f3ff"];
const BONE = ["#06080c", "#2a2925", "#8f8b82", "#ece7dc"];

export interface MapLayerDef { id: MapLayerId; label: string; stops: string[]; hours?: boolean; note: string }

export const MAP_LAYERS: MapLayerDef[] = [
  { id: "sun_lit", label: "Sunlight", stops: SUN, note: "Share of the window with some of the Sun's disk above the local terrain." },
  { id: "sun_dark_h", label: "Longest darkness", stops: SUN, hours: true, note: "Longest unbroken time without any sunlight. Bright = short darkness, black = dark for the whole window." },
  { id: "earth_view", label: "Earth in view", stops: EARTH, note: "Share of the window with the centre of Earth's disk above the local terrain." },
  { id: "both", label: "Sun + Earth", stops: BONE, note: "Share of the window with sunlight and Earth in view at the same moment." },
];
export const isMapLayer = (id: string): id is MapLayerId => MAP_LAYERS.some((l) => l.id === id);

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function ramp(stops: string[], t: number): number[] {
  const x = Math.min(Math.max(t, 0), 1) * (stops.length - 1), i = Math.min(Math.floor(x), stops.length - 2), f = x - i;
  const a = hex(stops[i]), b = hex(stops[i + 1]);
  return a.map((v, k) => Math.round(v + (b[k] - v) * f));
}
export const windowHours = (d: MapsResponse) => ((d.n_samples - 1) * d.step_minutes) / 60;
/** 0..1 position on the colour ramp. Darkness is inverted so that bright always means "more sunlight". */
const position = (def: MapLayerDef, v: number, d: MapsResponse) => (def.hours ? 1 - v / windowHours(d) : v);

export function fmtHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return h < 48 ? `${h.toFixed(1)} h` : `${Math.floor(h / 24)} d ${Math.round(h % 24)} h`;
}
const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 1 : 0)}%`;

export function useWindowMaps(site: string, active: boolean) {
  const { mission } = useMission();
  const win = windowFor(mission);
  const [status, setStatus] = useState<MapsStatus | null>(null);
  const [data, setData] = useState<MapsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);
  const step = Math.max(30, Math.ceil((win.days * 1440) / 1500));

  useEffect(() => {
    if (!active) return;
    api.mapsStatus(site).then(setStatus).catch((e) => setError(e instanceof Error ? e.message : "Request failed"));
  }, [site, active]);

  useEffect(() => {
    if (!active || !status?.built) return;
    const id = ++req.current;
    setLoading(true); setError(null);
    api.maps(site, win.start, win.stop, step)
      .then((d) => { if (id === req.current) setData(d); })
      .catch((e) => { if (id === req.current) setError(e instanceof Error ? e.message : "Request failed"); })
      .finally(() => { if (id === req.current) setLoading(false); });
  }, [site, active, status?.built, win.start, win.stop, step]);

  return { status, data, loading, error, win };
}

/** Index of the map cell containing grid point (x, y), or null outside the map. */
export function cellAt(d: MapsResponse, x: number, y: number): number | null {
  const [xmin, ymin, xmax, ymax] = d.bounds_xy_m;
  if (x < xmin || x >= xmax || y <= ymin || y > ymax) return null;
  const i = Math.floor((x - xmin) / d.spacing_m), j = Math.floor((ymax - y) / d.spacing_m);
  return j * d.nx + i;
}

/** Map cells drawn one canvas pixel each, positioned over the terrain image by grid coordinates. */
export function MapCanvas({ data, layer, site }: { data: MapsResponse; layer: MapLayerId; site: SiteInfo }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = MAP_LAYERS.find((l) => l.id === layer)!;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.width = data.nx; c.height = data.ny;
    const ctx = c.getContext("2d")!, img = ctx.createImageData(data.nx, data.ny), vals = data.layers[layer];
    vals.forEach((v, k) => {
      if (v == null) return;
      const [r, g, b] = ramp(def.stops, position(def, v, data));
      img.data.set([r, g, b, 235], k * 4);
    });
    ctx.putImageData(img, 0, 0);
  }, [data, layer, def]);
  const [sx0, sy0, sx1, sy1] = site.bounds_xy_m, [x0, y0, x1, y1] = data.bounds_xy_m;
  const W = sx1 - sx0, H = sy1 - sy0;
  return (
    <canvas ref={ref} aria-hidden className="pointer-events-none absolute opacity-90"
      style={{ left: `${((x0 - sx0) / W) * 100}%`, top: `${((sy1 - y1) / H) * 100}%`, width: `${((x1 - x0) / W) * 100}%`,
        height: `${((y1 - y0) / H) * 100}%`, imageRendering: "pixelated" }} />
  );
}

export function BrightestMarkers({ data, site, onPick }: { data: MapsResponse; site: SiteInfo; onPick: (c: MapCell) => void }) {
  const [x0, y0, x1, y1] = site.bounds_xy_m;
  return (
    <>
      {data.brightest.map((c, k) => (
        <button key={k} onClick={() => onPick(c)} title={`Brightest spot ${k + 1}: sunlight ≤ ${pct(c.sun_lit)}`}
          className="num absolute -ml-2.5 -mt-2.5 grid h-5 w-5 place-items-center rounded-full border border-night-950 bg-sun text-[10px] font-semibold text-night-950 shadow"
          style={{ left: `${((c.x_m - x0) / (x1 - x0)) * 100}%`, top: `${((y1 - c.y_m) / (y1 - y0)) * 100}%` }}>{k + 1}</button>
      ))}
    </>
  );
}

export function MapLegend({ data, layer }: { data: MapsResponse; layer: MapLayerId }) {
  const def = MAP_LAYERS.find((l) => l.id === layer)!;
  const grad = `linear-gradient(90deg,${def.stops.join(",")})`;
  const total = windowHours(data);
  return (
    <div className="flex items-center gap-2">
      <span className="num w-16 text-right text-[11px] text-bone-muted">{def.hours ? fmtHours(total) : "0%"}</span>
      <span className="h-1.5 flex-1 rounded-full" style={{ background: grad }} />
      <span className="num w-16 text-[11px] text-bone-muted">{def.hours ? "0 h" : "100%"}</span>
    </div>
  );
}

export function CellReadout({ data, index, label }: { data: MapsResponse; index: number | null; label: string }) {
  if (index == null || data.layers.sun_lit[index] == null) {
    return <p className="text-[11px] text-bone-faint">Hover over the map to read a cell.</p>;
  }
  const L = data.layers, v = (id: MapLayerId) => L[id][index] as number;
  return (
    <div className="num flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-bone-muted">
      <span className="font-sans text-bone-faint">{label}</span>
      <span>Sunlight <span className="text-sun">≤ {pct(v("sun_lit"))}</span></span>
      <span>Longest darkness <span className="text-sun">≥ {fmtHours(v("sun_dark_h"))}</span></span>
      <span>Earth <span className="text-earth">≤ {pct(v("earth_view"))}</span></span>
      <span>Both <span className="text-bone">≤ {pct(v("both"))}</span></span>
    </div>
  );
}

export function BrightestList({ data, onPick }: { data: MapsResponse; onPick: (c: MapCell) => void }) {
  return (
    <section aria-label="Brightest spots">
      <div className="panel-head"><span className="eyebrow">Most sunlit cells in this window</span>
        <span className="text-[11px] text-bone-faint">at least 500 m apart</span></div>
      <table className="w-full text-xs">
        <thead className="text-left text-bone-faint">
          <tr className="[&>th]:px-4 [&>th]:py-2 [&>th]:font-normal"><th>#</th><th>Lat, lon °E</th><th>Sunlight</th><th>Longest dark</th><th>Earth</th></tr>
        </thead>
        <tbody className="num">
          {data.brightest.map((c, k) => (
            <tr key={k} className="cursor-pointer border-t border-night-800 hover:bg-night-800/60 [&>td]:px-4 [&>td]:py-1.5" onClick={() => onPick(c)}>
              <td className="text-sun">{k + 1}</td><td>{c.latitude.toFixed(4)}, {c.longitude_east.toFixed(2)}</td>
              <td className="text-sun">≤ {pct(c.sun_lit)}</td><td>≥ {fmtHours(c.sun_dark_h)}</td><td className="text-earth">≤ {pct(c.earth_view)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-4 py-2.5 text-[11px] text-bone-faint">Click a row to inspect that spot, then check its slope before choosing it. Sunlight alone does not make a safe landing site.</p>
    </section>
  );
}
