"use client";
import { useEffect, useState } from "react";
import { Area, CartesianGrid, ComposedChart, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "@/services/api";
import { missionStartIso, useMission } from "@/context/mission";
import type { EphemerisResponse, HorizonResponse, PointInfo } from "@/types/api";

const SUN = "#ffb547", EARTH = "#5aaeff", BONE = "#ece7dc";

/** Terrain horizon at an arbitrary azimuth: periodic linear interpolation of the computed profile (display only). */
function horizonAt(h: HorizonResponse, az: number): number | null {
  const n = h.azimuth_true_deg.length, step = 360 / n, i = Math.floor((((az % 360) + 360) % 360) / step);
  const a = h.horizon_deg[i % n], b = h.horizon_deg[(i + 1) % n];
  if (a == null || b == null) return a ?? b;
  const t = ((((az % 360) + 360) % 360) - h.azimuth_true_deg[i % n]) / step;
  return a + (b - a) * t;
}

export function windowFor(m: ReturnType<typeof useMission>["mission"]) {
  const iso = missionStartIso(m);
  const days = Number(m.durationDays) > 0 ? Number(m.durationDays) : 14;
  if (iso && !Number.isNaN(Date.parse(iso))) {
    return { start: iso, stop: new Date(Date.parse(iso) + days * 86400e3).toISOString(), days, label: `Mission window: ${m.date} ${m.time} UTC + ${days} d` };
  }
  const now = new Date(); now.setUTCMinutes(0, 0, 0);
  return { start: now.toISOString(), stop: new Date(now.getTime() + 29.5 * 86400e3).toISOString(), days: 29.5,
    label: "Next 29.5 days from now (one lunar day). Set mission dates to use your window." };
}

function Readout({ color, name, az, el, horizon, radius }: { color: string; name: string; az: number; el: number; horizon: number | null; radius: number }) {
  const blocked = horizon != null && el + radius < horizon;
  return (
    <div className="bg-night-900 px-3 py-2.5">
      <div className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full" style={{ background: color }} /><span className="eyebrow">{name} at window start</span></div>
      <div className="num mt-1 text-sm">az {az.toFixed(2)}° · el <span style={{ color }}>{el.toFixed(2)}°</span></div>
      <div className="num text-[11px] text-bone-faint">terrain horizon there {horizon == null ? "—" : `${horizon.toFixed(2)}°`}
        {blocked ? " · disk hidden" : horizon != null && el - radius > horizon ? " · disk clear" : horizon != null ? " · disk partly hidden" : ""}</div>
    </div>
  );
}

export default function HorizonPanel({ site, point }: { site: string; point: PointInfo }) {
  const { mission } = useMission();
  const [height, setHeight] = useState(mission.heightM || "2");
  const [data, setData] = useState<HorizonResponse | null>(null);
  const [sky, setSky] = useState<EphemerisResponse | null>(null);
  const [skyErr, setSkyErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const win = windowFor(mission);

  useEffect(() => { setData(null); setSky(null); setErr(null); setSkyErr(null); }, [point.x_m, point.y_m]);

  async function run() {
    const h = Number(height);
    if (Number.isNaN(h) || h < 0 || h > 100) { setErr("Observer height must be between 0 and 100 m."); return; }
    setBusy(true); setErr(null); setSkyErr(null);
    const step = Math.max(10, Math.ceil((win.days * 1440) / 720));
    const ground = point.elevation_m ?? 0;
    const [hz, ep] = await Promise.allSettled([
      api.horizon(site, point.x_m, point.y_m, h),
      api.ephemeris(point.latitude, point.longitude_east, ground + h, win.start, win.stop, step),
    ]);
    if (hz.status === "fulfilled") setData(hz.value); else setErr(hz.reason instanceof Error ? hz.reason.message : "Horizon request failed");
    if (ep.status === "fulfilled") setSky(ep.value); else setSkyErr(ep.reason instanceof Error ? ep.reason.message : "Ephemeris request failed");
    setBusy(false);
  }

  const terrain = data?.azimuth_true_deg.map((az, i) => ({ az, h: data.horizon_deg[i] }));
  const track = (b: "sun" | "earth") => {
    const t = sky?.tracks.find((x) => x.body === b);
    return t ? t.azimuth_deg.map((az, i) => ({ az, el: t.elevation_deg[i], time: sky!.times_utc[i] })) : [];
  };
  const sun = track("sun"), earth = track("earth");
  const all = [...(terrain?.map((r) => r.h ?? 0) ?? []), ...sun.map((p) => p.el), ...earth.map((p) => p.el)];
  const yMin = Math.floor(Math.min(-2, ...all) - 1), yMax = Math.ceil(Math.max(2, ...all) + 1);
  const sunT = sky?.tracks.find((x) => x.body === "sun"), earthT = sky?.tracks.find((x) => x.body === "earth");

  return (
    <section className="panel" aria-label="Horizon and sky">
      <div className="panel-head flex-wrap">
        <span className="eyebrow">Horizon &amp; sky at this point</span>
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-bone-muted">Observer height
            <input value={height} onChange={(e) => setHeight(e.target.value)} inputMode="decimal" className="input num w-14 px-1.5 py-0.5 text-xs" />m
          </label>
          <button onClick={run} disabled={busy} className="btn btn-primary">{busy ? "Computing…" : data ? "Recompute" : "Compute"}</button>
        </div>
      </div>
      <div className="p-4">
        <p className="text-[11px] text-bone-faint">{win.label}</p>
        {err && <p className="mt-2 text-xs text-haz-high">{err}</p>}
        {skyErr && <p className="mt-2 text-xs text-haz-high">Sun/Earth positions unavailable: {skyErr}</p>}
        {!data && !busy && !err && (
          <p className="mt-3 text-xs text-bone-muted">Casts 360 rays over the DEM for the terrain horizon, and computes the Sun and Earth paths with NASA JPL SPICE for the window above.</p>
        )}
        {data && terrain && (
          <>
            <div className="mt-3 h-60 w-full" role="img" aria-label="Terrain horizon with Sun and Earth paths versus true azimuth">
              <ResponsiveContainer>
                <ComposedChart data={terrain} margin={{ top: 6, right: 6, bottom: 14, left: -8 }}>
                  <CartesianGrid stroke="#1c2230" vertical={false} />
                  <XAxis dataKey="az" type="number" domain={[0, 360]} ticks={[0, 90, 180, 270, 360]} tickFormatter={(v) => ["N", "E", "S", "W", "N"][v / 90]}
                    stroke="#6c6a64" fontSize={10} tickLine={false} />
                  <YAxis type="number" domain={[yMin, yMax]} stroke="#6c6a64" fontSize={10} unit="°" tickLine={false} allowDataOverflow />
                  <ReferenceLine y={0} stroke="#3b4354" strokeDasharray="3 3" />
                  <Tooltip cursor={{ stroke: "#3b4354" }} contentStyle={{ background: "#0a0d13", border: "1px solid #2a3140", fontSize: 11, fontFamily: "monospace" }}
                    formatter={(v: number, n: string) => [`${Number(v).toFixed(2)}°`, n]} labelFormatter={(l) => `azimuth ${Number(l).toFixed(1)}°`} />
                  <Area dataKey="h" name="Terrain horizon" baseValue={yMin} stroke={BONE} strokeWidth={1.25} fill="#1c2230" fillOpacity={1} isAnimationActive={false} />
                  <Scatter data={earth} dataKey="el" name="Earth" fill={EARTH} shape={<Dot r={1.6} />} isAnimationActive={false} />
                  <Scatter data={sun} dataKey="el" name="Sun" fill={SUN} shape={<Dot r={1.6} />} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-bone-muted">
              <span className="flex items-center gap-1.5"><i className="h-2 w-3 rounded-sm border-t border-bone bg-night-700" />Terrain (lower bound where rays leave the tile)</span>
              {sky && <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-sun" />Sun path</span>}
              {sky && <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-earth" />Earth path</span>}
              {sky && <span className="num text-bone-faint">every {sky.step_minutes} min</span>}
            </div>

            {sky && sunT && earthT && (
              <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-night-700 bg-night-700">
                <Readout color={SUN} name="Sun" az={sunT.azimuth_deg[0]} el={sunT.elevation_deg[0]} horizon={horizonAt(data, sunT.azimuth_deg[0])} radius={sunT.angular_radius_deg[0]} />
                <Readout color={EARTH} name="Earth" az={earthT.azimuth_deg[0]} el={earthT.elevation_deg[0]} horizon={horizonAt(data, earthT.azimuth_deg[0])} radius={earthT.angular_radius_deg[0]} />
                <div className="bg-night-900 px-3 py-2 text-[11px] text-bone-muted">
                  Sun elevation range <span className="num text-bone">{sunT.elevation_min_deg.toFixed(2)}° … {sunT.elevation_max_deg.toFixed(2)}°</span>
                </div>
                <div className="bg-night-900 px-3 py-2 text-[11px] text-bone-muted">
                  Earth elevation range <span className="num text-bone">{earthT.elevation_min_deg.toFixed(2)}° … {earthT.elevation_max_deg.toFixed(2)}°</span>
                </div>
              </div>
            )}

            <dl className="num mt-3 grid grid-cols-[9.5rem_1fr] gap-y-1 text-xs">
              <dt className="font-sans text-bone-muted">Highest horizon</dt>
              <dd>{data.max_horizon_deg?.toFixed(2)}° toward {data.max_horizon_azimuth_deg?.toFixed(0)}°</dd>
              <dt className="font-sans text-bone-muted">Mean horizon</dt><dd>{data.mean_horizon_deg?.toFixed(2)}°</dd>
              <dt className="font-sans text-bone-muted">Rays cut by the tile</dt>
              <dd className={data.incomplete_fraction > 0 ? "text-bone" : ""}>{(data.incomplete_fraction * 100).toFixed(0)}% of directions</dd>
              <dt className="font-sans text-bone-muted">Model</dt><dd>{data.model}, {data.step_m} m step, {data.max_range_m / 1000} km</dd>
              {sky && <><dt className="font-sans text-bone-muted">Ephemeris</dt><dd>SPICE DE421 · {sky.frame} · {sky.aberration_correction}</dd></>}
            </dl>
            <details className="mt-3 text-[11px] text-bone-faint">
              <summary className="cursor-pointer text-bone-muted hover:text-bone">Method notes</summary>
              <ul className="mt-2 space-y-1.5">{[...data.notes, ...(sky?.notes ?? [])].map((n) => <li key={n}>{n}</li>)}</ul>
            </details>
          </>
        )}
      </div>
    </section>
  );
}

function Dot({ cx, cy, r, fill }: { cx?: number; cy?: number; r: number; fill?: string }) {
  return cx == null || cy == null ? null : <circle cx={cx} cy={cy} r={r} fill={fill} />;
}
