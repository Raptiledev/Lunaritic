"use client";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { fmtDuration, useAnalysis } from "@/context/analysis";
import { useMission } from "@/context/mission";
import VisibilityStrip from "@/components/analysis/VisibilityStrip";
import ElevationChart from "@/components/analysis/ElevationChart";
import type { BodySummary, Period, VisibilityResponse } from "@/types/api";

const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 1 : 0)}%`;
const EVENT: Record<string, string> = { sunset: "Sunset in", sunrise: "Sunrise in", earthset: "Earthset in", earthrise: "Earthrise in" };

function Metric({ tone, label, value, sub }: { tone: "sun" | "earth" | "bone"; label: string; value: string; sub: React.ReactNode }) {
  const bar = { sun: "bg-sun", earth: "bg-earth", bone: "bg-bone" }[tone];
  return (
    <div className="panel relative overflow-hidden p-4">
      <span className={`absolute inset-x-0 top-0 h-px ${bar}`} aria-hidden />
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-3xl leading-none tracking-tight">{value}</div>
      <div className="mt-2 text-[11px] leading-snug text-bone-muted">{sub}</div>
    </div>
  );
}

function nextEvent(b: BodySummary) {
  if (b.hours_to_next_event == null) return { label: b.visible_at_start ? "No set in window" : "No rise in window", value: "—" };
  return { label: EVENT[b.next_event] ?? b.next_event, value: fmtDuration(b.hours_to_next_event) };
}

function Periods({ title, color, periods }: { title: string; color: string; periods: Period[] }) {
  const t = (s: string) => s.slice(5, 16).replace("T", " ");
  return (
    <div>
      <div className="mb-2 flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: color }} /><span className="eyebrow">{title}</span>
        <span className="num text-[11px] text-bone-faint">{periods.length}</span></div>
      {periods.length === 0 ? <p className="text-xs text-bone-faint">None in this window.</p> : (
        <ul className="num max-h-56 divide-y divide-night-800 overflow-auto text-xs">
          {periods.map((p) => (
            <li key={p.start_utc} className="flex justify-between gap-3 py-1.5">
              <span className="text-bone-muted">{p.starts_before_window ? "≤ " : ""}{t(p.start_utc)} → {t(p.end_utc)}{p.ends_after_window ? " ≥" : ""}</span>
              <span>{fmtDuration(p.hours)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Results({ r }: { r: VisibilityResponse }) {
  const sunNext = nextEvent(r.sun), earthNext = nextEvent(r.earth);
  const hs = r.sun.hours_to_next_event, he = r.earth.hours_to_next_event;
  const first = hs == null && he == null ? { label: "none in window", value: "—" } : he == null || (hs != null && hs <= he) ? sunNext : earthNext;
  const bound = r.upper_bound ? "≤ " : "";
  return (
    <div className="space-y-5">
      {r.upper_bound && (
        <div className="flex gap-3 rounded-lg border border-night-600 bg-night-900 p-3 text-xs text-bone-muted">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-bone" aria-hidden />
          <p><span className="text-bone">These are upper bounds.</span> {pct(r.horizon_incomplete_fraction)} of horizon rays reach the edge of the 16 km
            terrain tile. Mountains beyond it are unknown and can only hide more sky, so real sunlight and Earth time can be lower, never higher.</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric tone="sun" label="Sunlight" value={bound + pct(r.sun.fraction_of_time)}
          sub={<>of the window with some of the Sun visible. Average share of the disk visible: <span className="num text-bone">{pct(r.sun.mean_disk_fraction)}</span></>} />
        <Metric tone="sun" label="Longest darkness" value={fmtDuration(r.sun.longest_hidden_hours)}
          sub={<>{r.sun.longest_hidden_is_open ? "Continues past the window edge, so it may be longer. " : ""}The stretch a battery must survive.</>} />
        <Metric tone="earth" label="Earth in view" value={bound + pct(r.earth.fraction_of_time)}
          sub={<>of the window with Earth's centre above the terrain. Longest without Earth: <span className="num text-bone">{fmtDuration(r.earth.longest_hidden_hours)}</span></>} />
        <Metric tone="bone" label={`Next event · ${first.label}`} value={first.value}
          sub={<>At touchdown the Sun is {r.sun.visible_at_start ? "up" : "hidden"} and Earth is {r.earth.visible_at_start ? "in view" : "hidden"}.
            <br /><span className="text-sun">{sunNext.label}</span> <span className="num text-bone">{sunNext.value}</span> · <span className="text-earth">{earthNext.label}</span> <span className="num text-bone">{earthNext.value}</span></>} />
      </div>

      <section className="panel">
        <div className="panel-head"><span className="eyebrow">Visibility timeline</span>
          <span className="num text-[11px] text-bone-faint">{r.n_samples} steps of {r.step_minutes} min · both visible {pct(r.both_fraction_of_time)} · neither {pct(r.neither_fraction_of_time)}</span></div>
        <div className="p-4"><VisibilityStrip r={r} /></div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {(["sun", "earth"] as const).map((b) => (
          <section key={b} className="panel">
            <div className="panel-head"><span className="eyebrow">{b === "sun" ? "Sun" : "Earth"} elevation vs terrain horizon</span>
              <span className="num text-[11px] text-bone-faint">max {r[b].elevation_max_deg.toFixed(2)}°</span></div>
            <div className="p-3">
              <ElevationChart r={r} body={b} />
              <p className="mt-1 text-[11px] text-bone-faint">Visible while the {b === "sun" ? "amber" : "blue"} line is above the grey terrain.
                The grey changes because the {b === "sun" ? "Sun" : "Earth"} moves to different azimuths with different terrain.</p>
            </div>
          </section>
        ))}
      </div>

      <section className="panel grid gap-6 p-4 md:grid-cols-2">
        <Periods title="Sunlit periods" color="#ffb547" periods={r.sun.periods} />
        <Periods title="Earth-in-view periods" color="#5aaeff" periods={r.earth.periods} />
      </section>

      <details className="panel p-4 text-xs text-bone-muted">
        <summary className="cursor-pointer text-bone">Definitions and method</summary>
        <dl className="mt-3 grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5">
          {Object.entries(r.definitions).map(([k, v]) => <div key={k} className="contents"><dt className="text-bone-faint">{k.replace(/_/g, " ")}</dt><dd>{v}</dd></div>)}
        </dl>
        <ul className="mt-3 space-y-1">{r.notes.map((n) => <li key={n}>— {n}</li>)}</ul>
      </details>
    </div>
  );
}

export default function AnalysisPage() {
  const { mission: m } = useMission();
  const a = useAnalysis();
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="eyebrow">Landing site analysis</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">{m.name || "Unnamed mission"}: sunlight and Earth over the window</h1>
          <p className="mt-2 text-sm text-bone-muted">
            Every time step compares the real Sun and Earth position (NASA JPL SPICE) with the terrain horizon from LOLA in that direction.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {a.result && !a.fresh && <span className="text-[11px] text-bone-faint">Mission changed since this run</span>}
          <button className="btn btn-primary" disabled={a.loading || a.problems.length > 0} onClick={() => a.run()}>
            {a.loading ? "Computing…" : a.result ? "Re-run analysis" : "Run analysis"}
          </button>
        </div>
      </div>

      {a.problems.length > 0 && (
        <div className="panel p-4 text-sm">
          <p className="text-bone">Complete the mission first.</p>
          <ul className="mt-2 space-y-1 text-xs text-bone-muted">{a.problems.map((p) => <li key={p}>— {p}</li>)}</ul>
          <div className="mt-3 flex gap-3 text-xs"><Link href="/dashboard" className="link">Edit mission</Link><Link href="/explorer" className="link">Pick a target in the Explorer</Link></div>
        </div>
      )}
      {a.error && <p className="panel p-3 text-sm text-haz-high">{a.error}</p>}
      {!a.result && !a.loading && a.problems.length === 0 && (
        <p className="panel border-dashed p-6 text-center text-sm text-bone-muted">Ready. Observer height {a.observerHeight} m above the terrain at {a.site?.site_id}. Press Run analysis.</p>
      )}
      {a.loading && !a.result && <p className="panel p-6 text-center text-sm text-bone-muted">Casting 360 horizon rays and computing every Sun and Earth position…</p>}
      {a.result && <Results r={a.result} />}
    </div>
  );
}
