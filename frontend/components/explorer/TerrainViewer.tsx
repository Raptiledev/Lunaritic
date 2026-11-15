"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Crosshair } from "lucide-react";
import { api, layerUrl } from "@/services/api";
import { type SendResult, useCompareList } from "@/context/compareList";
import { useMission } from "@/context/mission";
import DemLoader from "@/components/layout/DemLoader";
import HorizonPanel from "./HorizonPanel";
import { BrightestList, BrightestMarkers, CellReadout, MAP_LAYERS, MapCanvas, MapLegend, cellAt, isMapLayer, useWindowMaps } from "./WindowMaps";
import type { AreaSummary, MapCell, PointInfo, SiteInfo } from "@/types/api";

// Colour stops mirror the backend renderer (terrain_service.py) so the legend is the real scale.
const VIRIDIS = "linear-gradient(90deg,#440154,#3b528b 25%,#21918c 50%,#5ec962 75%,#fde725)";
const HEAT = "linear-gradient(90deg,#0c1430,#4cc9f0 35%,#f2a93b 65%,#f07178)";
const GREY = "linear-gradient(90deg,#000,#fff)";

const LAYERS: { id: string; label: string; needs?: string; note: string; unit: string; ramp?: string }[] = [
  { id: "hillshade", label: "Hillshade", unit: "", ramp: GREY, note: "Cartographic shading from the north-west at 45°. A display aid, not real sunlight." },
  { id: "elevation", label: "Elevation", unit: "m", ramp: VIRIDIS, note: "Surface height Z (percentile-stretched colours)." },
  { id: "slope", label: "Slope", unit: "°", ramp: HEAT, note: "Horn 3×3, about 10 m baseline. Colours span 0 to 15°." },
  { id: "roughness", label: "Roughness", unit: "m", ramp: HEAT, note: "RMS height residual from a local plane over 5×5 px (25 m)." },
  { id: "hazard", label: "Hazard", unit: "", note: "Worst of slope and roughness against illustrative thresholds (5°/10°, 0.25/0.5 m). Not NASA requirements." },
  { id: "lola_count", label: "LOLA returns", needs: "ldec", unit: "", ramp: HEAT, note: "Pixels with a count above 0 hold a real LOLA measurement; the rest are interpolated." },
  { id: "z_uncertainty", label: "Height σ", needs: "toterr", unit: "m", ramp: HEAT, note: "Total Z RMS error from the NASA product." },
];
const HAZ: [string, string][] = [["Favorable", "#6fd6a0"], ["Caution", "#f2a93b"], ["High risk", "#f07178"], ["Insufficient data", "#5a647d"]];
const hazColor = (h: string) => HAZ.find(([n]) => n === h)?.[1] ?? "#5a647d";
const fmt = (v: number | null | undefined, d = 1) => (v == null ? "—" : v.toFixed(d));

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="bg-night-900 px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className="num mt-0.5 text-lg leading-tight">{value}<span className="ml-0.5 text-xs text-bone-muted">{unit}</span></div>
      {sub && <div className="num text-[11px] text-bone-faint">{sub}</div>}
    </div>
  );
}

export default function TerrainViewer({ site }: { site: SiteInfo }) {
  const { update } = useMission();
  const { addPoint } = useCompareList();
  const [layer, setLayer] = useState("hillshade");
  const [point, setPoint] = useState<PointInfo | null>(null);
  const [area, setArea] = useState<AreaSummary | null>(null);
  const [xy, setXy] = useState<{ x: number; y: number; fx: number; fy: number } | null>(null);
  const [radius, setRadius] = useState(100);
  const [err, setErr] = useState<string | null>(null);
  const [legend, setLegend] = useState<{ min?: number; max?: number }>({});
  const [imgLoading, setImgLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [sent, setSent] = useState<SendResult | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const req = useRef(0);
  const mapLayer = isMapLayer(layer) ? layer : null;
  const mapDef = MAP_LAYERS.find((l) => l.id === layer);
  const maps = useWindowMaps(site.site_id, mapLayer != null);
  const meta = LAYERS.find((l) => l.id === layer) ?? LAYERS[0];
  const imageLayer = mapLayer ? "hillshade" : layer;
  const available = (l: (typeof LAYERS)[number]) => !l.needs || site.layers_available.includes(l.needs);
  const [xmin, ymin, xmax, ymax] = site.bounds_xy_m;

  const layerKey = `${site.site_id}:${imageLayer}`;
  const [trackedLayer, setTrackedLayer] = useState(layerKey);
  if (trackedLayer !== layerKey) {
    setTrackedLayer(layerKey);
    setImgLoading(true);
  }
  useEffect(() => {
    setLegend({});
    if (!mapLayer && layer !== "hazard") api.legend(site.site_id, layer).then(setLegend).catch(() => undefined);
  }, [site.site_id, layer, mapLayer]);

  useEffect(() => {
    if (!xy) return;
    const id = ++req.current;
    setErr(null); setSaved(false); setSent(null);
    Promise.all([api.point(site.site_id, xy.x, xy.y), api.summary(site.site_id, xy.x, xy.y, radius)])
      .then(([p, a]) => { if (id === req.current) { setPoint(p); setArea(a); } })
      .catch((ex) => { if (id === req.current) setErr(ex instanceof Error ? ex.message : "Request failed"); });
  }, [site.site_id, xy, radius]);

  function onClick(e: React.MouseEvent<HTMLImageElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    setXy({ x: xmin + fx * (xmax - xmin), y: ymax - fy * (ymax - ymin), fx, fy });
  }

  function onMove(e: React.MouseEvent<HTMLImageElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    setHover({ x: xmin + ((e.clientX - r.left) / r.width) * (xmax - xmin), y: ymax - ((e.clientY - r.top) / r.height) * (ymax - ymin) });
  }

  function pickCell(c: MapCell) {
    setXy({ x: c.x_m, y: c.y_m, fx: (c.x_m - xmin) / (xmax - xmin), fy: (ymax - c.y_m) / (ymax - ymin) });
  }

  const readXy = hover ?? xy;
  const readIndex = maps.data && readXy ? cellAt(maps.data, readXy.x, readXy.y) : null;

  function setAsTarget() {
    if (!point) return;
    update({ latitude: point.latitude.toFixed(5), longitude: point.longitude_east.toFixed(4), siteId: site.site_id });
    setSaved(true);
  }

  function sendToCompare() {
    if (!point) return;
    setSent(addPoint({
      name: `Explorer ${point.latitude.toFixed(3)}°`,
      latitude: point.latitude.toFixed(5),
      longitude: point.longitude_east.toFixed(4),
    }));
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <section className="panel self-start" aria-label="Terrain map">
        <div className="panel-head flex-col items-start gap-2">
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <div role="tablist" aria-label="Terrain layer" className="seg">
              {LAYERS.map((l) => (
                <button key={l.id} role="tab" aria-selected={layer === l.id} disabled={!available(l)} className="seg-item"
                  title={available(l) ? l.note : `Needs the ${l.needs} file`} onClick={() => setLayer(l.id)}>{l.label}</button>
              ))}
            </div>
            <span className="num text-[11px] text-bone-faint">{site.site_id} · {site.pixel_size_m} m/px</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="eyebrow">Mission window</span>
            <div role="tablist" aria-label="Mission-window map" className="seg">
              {MAP_LAYERS.map((l) => (
                <button key={l.id} role="tab" aria-selected={layer === l.id} className="seg-item" title={l.note} onClick={() => setLayer(l.id)}>{l.label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="p-3">
          <div className="relative overflow-hidden rounded-md border border-night-700 bg-night-950">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={layerUrl(site.site_id, imageLayer)} alt={`${mapDef?.label ?? meta.label} map of ${site.site_id}`} onClick={onClick}
              onMouseMove={mapLayer ? onMove : undefined} onMouseLeave={() => setHover(null)}
              ref={(el) => { if (el?.complete && el.naturalWidth > 0) setImgLoading(false); }}
              onLoad={() => setImgLoading(false)} className="block w-full cursor-crosshair" />
            {mapLayer && maps.data && <MapCanvas data={maps.data} layer={mapLayer} site={site} />}
            {mapLayer && maps.data && <BrightestMarkers data={maps.data} site={site} onPick={pickCell} />}
            {imgLoading && <DemLoader title="Drawing the terrain layer" detail={`${mapDef?.label ?? meta.label} is computed from the 5 m LOLA surface.`} />}
            {mapLayer && maps.loading && <div className="absolute inset-0 grid place-items-center bg-night-950/60 text-xs text-bone-muted">Computing {mapDef!.label.toLowerCase()} for every 100 m cell over the window…</div>}
            {xy && (
              <span className="pointer-events-none absolute" style={{ left: `${xy.fx * 100}%`, top: `${xy.fy * 100}%` }} aria-hidden>
                <span className="absolute -left-4 -top-4 h-8 w-8 rounded-full border border-bone shadow-[0_0_0_1px_rgba(0,0,0,0.7)]" />
                <span className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full bg-bone" />
              </span>
            )}
            <span className="num pointer-events-none absolute left-2 top-2 rounded bg-night-950/70 px-1.5 py-0.5 text-[10px] text-bone-muted">↑ grid +y (not lunar north)</span>
            <span className="pointer-events-none absolute bottom-2 right-2 rounded bg-night-950/70 px-1.5 py-0.5 text-[10px] text-bone-muted">
              <span className="num">{((xmax - xmin) / 1000).toFixed(0)} km</span> across
            </span>
          </div>

          {mapLayer ? (
            <div className="mt-3 space-y-1.5">
              {maps.error && <p className="text-xs text-haz-high">{maps.error}</p>}
              {maps.status && !maps.status.built && (
                <div className="rounded-md border border-dashed border-night-600 p-3 text-xs text-bone-muted">
                  <p className="text-bone">The horizon grid for these maps has not been built yet.</p>
                  <p className="mt-1">It traces the 360° horizon at every 100 m across the tile once (about 30–45 minutes), then any mission window takes seconds. Run:</p>
                  <code className="num mt-1.5 block rounded bg-night-950 px-2 py-1 text-bone">{maps.status.build_command}</code>
                </div>
              )}
              {maps.data && <>
                <MapLegend data={maps.data} layer={mapLayer} />
                <CellReadout data={maps.data} index={readIndex} label={hover ? "Cell under cursor" : "Selected cell"} />
                <p className="text-[11px] text-bone-muted">{mapDef!.note}</p>
                {maps.data.notes.map((n) => <p key={n} className="text-[11px] text-bone-faint">{n}</p>)}
              </>}
              <p className="num text-[10px] text-bone-faint">{maps.win.label}{maps.data ? ` · ${maps.data.n_samples} time steps · computed in ${maps.data.compute_seconds} s` : ""}</p>
            </div>
          ) : (
          <div className="mt-3 space-y-1.5">
            {layer === "hazard" ? (
              <div className="flex flex-wrap gap-3 text-[11px] text-bone-muted">
                {HAZ.map(([n, c]) => <span key={n} className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-sm" style={{ background: c }} />{n}</span>)}
              </div>
            ) : meta.ramp ? (
              <div className="flex items-center gap-2">
                <span className="num w-14 text-right text-[11px] text-bone-muted">{legend.min != null ? legend.min.toFixed(layer === "elevation" ? 0 : 2) : ""}</span>
                <span className="h-1.5 flex-1 rounded-full" style={{ background: meta.ramp }} />
                <span className="num w-14 text-[11px] text-bone-muted">{legend.max != null ? `${legend.max.toFixed(layer === "elevation" ? 0 : 2)} ${meta.unit}` : ""}</span>
              </div>
            ) : null}
            <p className="text-[11px] text-bone-muted">{meta.note}</p>
            <p className="num text-[10px] text-bone-faint">Polar stereographic · x {xmin}…{xmax} m · y {ymin}…{ymax} m · lat {site.lat_min.toFixed(2)}…{site.lat_max.toFixed(2)}°</p>
          </div>
          )}
        </div>
        {mapLayer && maps.data && maps.data.brightest.length > 0 && <div className="border-t border-night-700"><BrightestList data={maps.data} onPick={pickCell} /></div>}
      </section>

      <aside className="space-y-4" aria-live="polite">
        {err && <p className="panel border-haz-high/40 p-3 text-sm text-haz-high">{err}</p>}
        {!point && !err && (
          <div className="panel flex flex-col items-center gap-2 px-6 py-10 text-center">
            <Crosshair size={20} className="text-bone-faint" aria-hidden />
            <p className="text-sm text-bone">Click anywhere on the terrain</p>
            <p className="text-xs text-bone-muted">Reads elevation, slope, roughness and data quality at that pixel, then the 360° horizon.</p>
          </div>
        )}
        {point && (
          <section className="panel" aria-label="Selected point">
            <div className="panel-head">
              <div>
                <div className="eyebrow">Selected point</div>
                <div className="num mt-0.5 text-sm">{point.latitude.toFixed(4)}°, {point.longitude_east.toFixed(3)}°E</div>
              </div>
              <span className="chip" style={{ borderColor: hazColor(point.hazard), color: hazColor(point.hazard) }}>
                <i className="h-1.5 w-1.5 rounded-full" style={{ background: hazColor(point.hazard) }} />{point.hazard}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-px bg-night-700">
              <Stat label="Elevation" value={fmt(point.elevation_m, 0)} unit="m" sub={`σ ${fmt(point.total_z_uncertainty_m, 2)} m`} />
              <Stat label="Slope" value={fmt(point.slope_deg)} unit="°" sub={`σ ${fmt(point.slope_uncertainty_deg)}°`} />
              <Stat label="Roughness" value={fmt(point.roughness_rms_m, 2)} unit="m" sub="25 m window" />
              <Stat label="Relief" value={fmt(point.relief_m)} unit="m" sub="55 m window" />
              <Stat label="LOLA returns" value={point.lola_returns_in_pixel == null ? "—" : String(point.lola_returns_in_pixel)}
                sub={point.lola_returns_in_pixel === 0 ? "interpolated" : point.lola_returns_in_pixel == null ? "" : "measured"} />
              <Stat label="Grid x, y (km)" value={`${(point.x_m / 1000).toFixed(1)}, ${(point.y_m / 1000).toFixed(1)}`} />
            </div>
            <div className="flex flex-wrap items-center gap-3 px-4 py-2.5">
              <button className="btn" onClick={setAsTarget}>Set as mission target</button>
              <button className="btn" onClick={sendToCompare}>Send to Compare</button>
              {saved && <span className="text-[11px] text-haz-ok">Saved to the mission</span>}
              {sent === "added" && <span className="text-[11px] text-haz-ok">Added · <Link href="/comparison" className="link">Open Compare</Link></span>}
              {sent === "duplicate" && <span className="text-[11px] text-bone-muted">Already in Compare · <Link href="/comparison" className="link">Open Compare</Link></span>}
              {sent === "full" && <span className="text-[11px] text-haz-high">Compare already has 6 points</span>}
            </div>
          </section>
        )}
        {point && <HorizonPanel site={site.site_id} point={point} />}
        {area && (
          <section className="panel" aria-label="Area statistics">
            <div className="panel-head">
              <span className="eyebrow">Area within <span className="num">{area.radius_m}</span> m</span>
              <div className="seg" role="tablist" aria-label="Radius">
                {[50, 100, 250, 500, 1000].map((r) => (
                  <button key={r} role="tab" aria-selected={radius === r} className="seg-item num" onClick={() => setRadius(r)}>{r}</button>
                ))}
              </div>
            </div>
            <div className="space-y-3 p-4 text-sm">
              <div className="flex h-2 overflow-hidden rounded-full bg-night-800">
                {HAZ.map(([n, c]) => <span key={n} style={{ width: `${(area.hazard_fractions[n] ?? 0) * 100}%`, background: c }} title={n} />)}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
                {HAZ.map(([n, c]) => (
                  <span key={n} className="flex items-center gap-1.5 text-bone-muted"><i className="h-2 w-2 rounded-sm" style={{ background: c }} />{n}
                    <span className="num text-bone">{((area.hazard_fractions[n] ?? 0) * 100).toFixed(0)}%</span></span>
                ))}
              </div>
              <dl className="num grid grid-cols-[9rem_1fr] gap-y-1 text-xs">
                <dt className="font-sans text-bone-muted">Slope mean / p95 / max</dt><dd>{fmt(area.slope_mean_deg)}° / {fmt(area.slope_p95_deg)}° / {fmt(area.slope_max_deg)}°</dd>
                <dt className="font-sans text-bone-muted">Roughness mean / max</dt><dd>{fmt(area.roughness_mean_m, 2)} / {fmt(area.roughness_max_m, 2)} m</dd>
                <dt className="font-sans text-bone-muted">Measured pixels</dt><dd>{area.pixels_with_lola_return_fraction == null ? "—" : `${(area.pixels_with_lola_return_fraction * 100).toFixed(0)}% with a LOLA return`}</dd>
                <dt className="font-sans text-bone-muted">Mean uncertainty</dt><dd>{fmt(area.total_z_uncertainty_mean_m, 2)} m height · {fmt(area.slope_uncertainty_mean_deg)}° slope</dd>
              </dl>
              {area.notes.map((n) => <p key={n} className="text-[11px] text-bone-faint">{n}</p>)}
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}
