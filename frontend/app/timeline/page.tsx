"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Pause, Play, SkipBack } from "lucide-react";
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtDuration, useAnalysis } from "@/context/analysis";
import { missionStartIso, useMission } from "@/context/mission";

const SUN = "#ffb547", EARTH = "#5aaeff", GRID = "#1c2230", AXIS = "#6c6a64";
const tick = { fill: AXIS, fontSize: 10, fontFamily: "var(--font-mono, monospace)" };

export default function TimelinePage() {
  const a = useAnalysis();
  const { mission } = useMission();
  const r = a.fresh ? a.result : null;
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(8); // steps per second
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const n = r?.series.times_utc.length ?? 0;
  useEffect(() => { setI(0); setPlaying(false); }, [r?.start_utc, r?.stop_utc]);

  useEffect(() => {
    if (!playing || !n) return;
    timer.current = setInterval(() => setI((x) => (x + 1) % n), 1000 / speed);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [playing, speed, n]);

  const data = useMemo(() => {
    if (!r) return [];
    const s = r.series;
    // Downsample chart to ~400 points for smooth Recharts.
    const step = Math.max(1, Math.ceil(s.times_utc.length / 400));
    const out = [];
    for (let k = 0; k < s.times_utc.length; k += step) {
      out.push({
        t: s.times_utc[k].slice(5, 16).replace("T", " "),
        sun: s.sun_elevation_deg[k], sunH: s.sun_horizon_deg[k], sunF: s.sun_visible_fraction[k],
        earth: s.earth_elevation_deg[k], earthH: s.earth_horizon_deg[k], earthF: s.earth_visible_fraction[k],
        idx: k,
      });
    }
    return out;
  }, [r]);

  if (!r) {
    return (
      <div className="space-y-5">
        <Header />
        <div className="panel space-y-2 p-4 text-sm">
          <p className="text-bone">Run analysis first so the timeline has a real Sun / Earth / horizon series.</p>
          <p className="text-bone-muted">Mission: {mission.name || "unnamed"} · {missionStartIso(mission) ?? "no date"}</p>
          <Link href="/dashboard" className="link text-xs">Mission → Run analysis</Link>
        </div>
      </div>
    );
  }

  const s = r.series;
  const sunUp = s.sun_visible_fraction[i] > 0;
  const earthUp = s.earth_visible_fraction[i] >= 0.5;
  const tLabel = s.times_utc[i].replace("T", " ").replace("Z", " UTC");
  const chartIdx = data.reduce((best, d) => (d.idx <= i ? d.t : best), data[0]?.t);

  return (
    <div className="space-y-5">
      <Header />

      <section className="panel p-4">
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={14} /> : <Play size={14} />} {playing ? "Pause" : "Play"}
          </button>
          <button className="btn" onClick={() => { setPlaying(false); setI(0); }}><SkipBack size={14} /> Start</button>
          <label className="flex items-center gap-2 text-[11px] text-bone-muted">
            Speed <input type="range" min={1} max={30} value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            <span className="num text-bone">{speed}×</span>
          </label>
          <span className="num text-sm text-bone">{tLabel}</span>
          <span className="text-[11px] text-bone-faint">step {i + 1}/{n} · {r.step_minutes} min</span>
        </div>
        <input className="mt-3 w-full accent-sun" type="range" min={0} max={Math.max(n - 1, 0)} value={i}
          onChange={(e) => { setPlaying(false); setI(Number(e.target.value)); }} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric tone="sun" label="Sun elevation" value={`${s.sun_elevation_deg[i].toFixed(2)}°`}
          sub={<>horizon {s.sun_horizon_deg[i].toFixed(2)}° · disk { (s.sun_visible_fraction[i] * 100).toFixed(0)}% · {sunUp ? "lit" : "hidden"}</>} />
        <Metric tone="earth" label="Earth elevation" value={`${s.earth_elevation_deg[i].toFixed(2)}°`}
          sub={<>horizon {s.earth_horizon_deg[i].toFixed(2)}° · disk {(s.earth_visible_fraction[i] * 100).toFixed(0)}% · {earthUp ? "in view" : "hidden"}</>} />
        <Metric tone="sun" label="Sun azimuth" value={`${s.sun_azimuth_deg[i].toFixed(1)}°`} sub="clockwise from lunar north" />
        <Metric tone="earth" label="Earth azimuth" value={`${s.earth_azimuth_deg[i].toFixed(1)}°`} sub="clockwise from lunar north" />
      </div>

      <section className="panel">
        <div className="panel-head">
          <span className="eyebrow">Elevation vs terrain horizon</span>
          <span className="text-[11px] text-bone-faint">line above the grey area = clear of the hills</span>
        </div>
        <div className="grid gap-4 p-4 lg:grid-cols-2">
          <Chart title="Sun" color={SUN} data={data} yKey="sun" hKey="sunH" cursor={chartIdx} />
          <Chart title="Earth" color={EARTH} data={data} yKey="earth" hKey="earthH" cursor={chartIdx} />
        </div>
      </section>

      <section className="panel p-4">
        <h2 className="eyebrow mb-3">Sky compass at this moment</h2>
        <Compass sunAz={s.sun_azimuth_deg[i]} earthAz={s.earth_azimuth_deg[i]} sunEl={s.sun_elevation_deg[i]} earthEl={s.earth_elevation_deg[i]}
          sunUp={sunUp} earthUp={earthUp} />
        <p className="mt-3 text-[11px] text-bone-faint">
          Longest darkness in this window: <span className="num text-bone">{fmtDuration(r.sun.longest_hidden_hours)}</span>
          {" · "}Earth gaps: <span className="num text-bone">{fmtDuration(r.earth.longest_hidden_hours)}</span>
          {r.upper_bound ? " · visibility figures are upper bounds" : ""}
        </p>
      </section>
    </div>
  );
}

function Header() {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow">Timeline · play the mission window</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">Watch the Sun and Earth skim the terrain</h1>
      <p className="mt-2 text-sm leading-relaxed text-bone-muted">
        Every frame is one time step from the real Analysis series: SPICE positions against the LOLA horizon. Nothing is simulated for show.
      </p>
    </div>
  );
}

function Metric({ tone, label, value, sub }: { tone: "sun" | "earth"; label: string; value: string; sub: React.ReactNode }) {
  return (
    <div className="panel relative overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-px ${tone === "sun" ? "bg-sun" : "bg-earth"}`} />
      <div className="eyebrow">{label}</div>
      <div className={`num mt-1 text-2xl ${tone === "sun" ? "text-sun" : "text-earth"}`}>{value}</div>
      <div className="mt-1 text-[11px] text-bone-muted">{sub}</div>
    </div>
  );
}

function Chart({ title, color, data, yKey, hKey, cursor }: {
  title: string; color: string; data: { t: string; idx: number; [k: string]: number | string }[]; yKey: string; hKey: string; cursor?: string;
}) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-bone-muted"><span style={{ color }}>{title}</span> elevation · grey = terrain in that direction</div>
      <div className="h-52">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="t" tick={tick} interval="preserveStartEnd" minTickGap={40} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={tick} tickLine={false} axisLine={false} unit="°" />
            <Tooltip contentStyle={{ background: "#0b0e14", border: "1px solid #232a3a", fontSize: 11 }} />
            <Area dataKey={hKey} name="Horizon" stroke="none" fill="#3a4150" fillOpacity={0.55} isAnimationActive={false} />
            <Line dataKey={yKey} name={title} stroke={color} dot={false} strokeWidth={1.6} isAnimationActive={false} />
            {cursor && <ReferenceLine x={cursor} stroke="#ece7dc" strokeDasharray="3 3" />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function Compass({ sunAz, earthAz, sunEl, earthEl, sunUp, earthUp }: {
  sunAz: number; earthAz: number; sunEl: number; earthEl: number; sunUp: boolean; earthUp: boolean;
}) {
  const polar = (az: number, el: number) => {
    const r = 40 * (1 - Math.max(-5, Math.min(el, 20)) / 25); // higher elevation → closer to centre
    const a = (az * Math.PI) / 180; // az clockwise from north; north is up
    return { x: 50 + r * Math.sin(a), y: 50 - r * Math.cos(a) };
  };
  const S = polar(sunAz, sunEl), E = polar(earthAz, earthEl);
  return (
    <svg viewBox="0 0 100 100" className="mx-auto h-56 w-56">
      <circle cx="50" cy="50" r="40" fill="#0b0e14" stroke="#232a3a" />
      <circle cx="50" cy="50" r="20" fill="none" stroke="#1c2230" />
      {["N", "E", "S", "W"].map((lab, k) => {
        const a = (k * Math.PI) / 2;
        return <text key={lab} x={50 + 46 * Math.sin(a)} y={50 - 46 * Math.cos(a) + 1} textAnchor="middle" fontSize="4" fill="#6c6a64">{lab}</text>;
      })}
      <circle cx={S.x} cy={S.y} r="3.2" fill={SUN} opacity={sunUp ? 1 : 0.35} />
      <circle cx={E.x} cy={E.y} r="3.2" fill={EARTH} opacity={earthUp ? 1 : 0.35} />
      <text x="50" y="96" textAnchor="middle" fontSize="3.5" fill="#6c6a64">centre = zenith · rim = horizon</text>
    </svg>
  );
}
