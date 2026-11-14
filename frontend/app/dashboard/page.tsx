"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import MissionForm from "@/components/dashboard/MissionForm";
import DemLoader from "@/components/layout/DemLoader";
import { fmtDuration, useAnalysis } from "@/context/analysis";
import Indicator from "@/components/dashboard/Indicator";
import { api, layerUrl } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { missionStartIso, useMission } from "@/context/mission";
import { useRequirements } from "@/components/planner/planner";
import { scorePct, useWeights } from "@/components/comparison/weights";
import { normLon, outsideMessage, siteFraction } from "@/utils/geo";
import type { AreaSummary, ScoredCandidate, SiteInfo } from "@/types/api";

function useTargetSite() {
  const { mission: m } = useMission();
  const { data, loading, error } = useApi(api.sites);
  const lat = Number(m.latitude), lon = normLon(Number(m.longitude));
  const ok = m.latitude !== "" && m.longitude !== "" && Number.isFinite(lat) && Number.isFinite(lon);
  for (const s of data?.sites ?? []) {
    const f = ok ? siteFraction(s, lat, lon) : null;
    if (f) return { site: s, frac: f, lat, lon, sites: data!.sites, hasTarget: true, loading, error };
  }
  return { site: null as SiteInfo | null, frac: null, lat, lon, sites: data?.sites ?? [], hasTarget: ok, loading, error };
}

function TargetPanel() {
  const t = useTargetSite();
  const site = t.site ?? t.sites[0];
  const siteId = site?.site_id ?? "";
  const [trackedSite, setTrackedSite] = useState(siteId);
  const [layerReady, setLayerReady] = useState(false);
  const [layerError, setLayerError] = useState<string | null>(null);
  if (trackedSite !== siteId) {
    setTrackedSite(siteId);
    setLayerReady(false);
    setLayerError(null);
  }
  const fetching = t.loading && !site;
  const drawing = Boolean(site) && !layerReady && !layerError;
  return (
    <section className="panel flex flex-col" aria-labelledby="target-h" aria-busy={fetching || drawing}>
      <div className="panel-head">
        <h2 id="target-h" className="eyebrow">Target on LOLA terrain</h2>
        <Link href="/explorer" className="text-[11px] text-bone-muted hover:text-bone">Open Explorer →</Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="w-full">
          <div className="relative mx-auto aspect-square max-h-72 overflow-hidden rounded-lg border border-night-700 bg-night-950">
            {site && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={layerUrl(site.site_id, "hillshade", 600)}
                alt={`Hillshade of ${site.site_id}`}
                className={`h-full w-full object-cover transition-opacity ${layerReady ? "opacity-90" : "opacity-0"}`}
                ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLayerReady(true); }}
                onLoad={() => setLayerReady(true)}
                onError={() => setLayerError("The hillshade layer did not load.")}
              />
            )}
            {layerReady && (
              <>
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-night-950/50 via-transparent to-night-950/20" aria-hidden />
                <div className="pointer-events-none absolute inset-2 rounded border border-bone/10" aria-hidden />
                <span className="pointer-events-none absolute left-3 top-3 font-mono text-[10px] tracking-wide text-bone/70" aria-hidden>
                  {site!.site_id.toUpperCase()} · LOLA
                </span>
                {t.frac && (
                  <span className="pointer-events-none absolute" style={{ left: `${t.frac.fx * 100}%`, top: `${t.frac.fy * 100}%` }} aria-hidden>
                    <span className="absolute -left-3 -top-3 h-6 w-6 animate-pulse-soft rounded-full border border-bone shadow-[0_0_0_1px_rgba(0,0,0,0.6)]" />
                    <span className="absolute -left-[3px] -top-[3px] h-1.5 w-1.5 rounded-full bg-bone" />
                  </span>
                )}
              </>
            )}
            {fetching && <DemLoader title="Fetching the LOLA DEM" detail="Site01 is downloading from NASA PGDA. The terrain stays hidden until the hillshade is on screen." />}
            {drawing && <DemLoader title="Drawing the terrain layer" detail="Hillshade is computed from the 5 m LOLA surface." />}
            {!fetching && !site && !t.error && (
              <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-bone-muted">No DEM loaded. LUNARIS shows real LOLA terrain or nothing, never a stand-in map.</p>
            )}
            {(t.error || layerError) && !fetching && (
              <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-haz-high">{layerError ?? t.error}</p>
            )}
          </div>
          <p className="mt-3 text-center text-xs text-bone-muted">
            {fetching || drawing ? "Waiting for the LOLA layer…"
              : t.site ? <>Target lies inside <span className="text-bone">{t.site.site_id}</span>, 5 m/px LOLA tile.</>
              : t.hasTarget ? outsideMessage(t.sites, t.lat, t.lon)
              : "No target set yet. Pick a point in the Explorer or type a latitude and longitude."}
          </p>
        </div>
      </div>
    </section>
  );
}

function TerrainSafety() {
  const t = useTargetSite();
  const [s, setS] = useState<AreaSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const id = t.site?.site_id;
  useEffect(() => {
    setS(null); setErr(null);
    if (id) api.summaryLatLon(id, t.lat, t.lon, 100).then(setS).catch((e) => setErr(e.message));
  }, [id, t.lat, t.lon]);
  if (!id) return null;
  if (err) return <p className="text-xs text-haz-high">{err}</p>;
  if (!s) return <p className="text-xs text-bone-faint">Reading terrain…</p>;
  const f = s.hazard_fractions;
  const bars: [string, string][] = [["Favorable", "bg-haz-ok"], ["Caution", "bg-haz-caution"], ["High risk", "bg-haz-high"], ["Insufficient data", "bg-haz-none"]];
  return (
    <div>
      <p className="num text-lg">{(f["Favorable"] * 100).toFixed(0)}<span className="text-xs text-bone-muted">% favorable within 100 m</span></p>
      <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-night-800">
        {bars.map(([k, c]) => <span key={k} className={c} style={{ width: `${(f[k] ?? 0) * 100}%` }} title={`${k} ${((f[k] ?? 0) * 100).toFixed(0)}%`} />)}
      </div>
      <p className="num mt-2 text-[11px] text-bone-muted">slope p95 {s.slope_p95_deg?.toFixed(1)}° · roughness {s.roughness_mean_m?.toFixed(2)} m</p>
      <p className="mt-1 text-[11px] text-bone-faint">Illustrative thresholds, not NASA requirements.</p>
    </div>
  );
}

function VisibilityValue({ body }: { body: "sun" | "earth" }) {
  const a = useAnalysis();
  if (!a.result || !a.fresh) {
    return <><p className="num text-lg text-bone-faint">Not computed</p><p className="mt-1 text-[11px] text-bone-faint">Press Run analysis.</p></>;
  }
  const b = a.result[body];
  return (
    <div>
      <p className="num text-lg">{a.result.upper_bound ? "≤ " : ""}{(b.fraction_of_time * 100).toFixed(0)}<span className="text-xs text-bone-muted">% of the window</span></p>
      <p className="num mt-2 text-[11px] text-bone-muted">longest {body === "sun" ? "darkness" : "without Earth"} {fmtDuration(b.longest_hidden_hours)}</p>
      <Link href="/analysis" className="link mt-1 inline-block text-[11px]">Details</Link>
    </div>
  );
}

function OverallValue() {
  const { mission } = useMission();
  const a = useAnalysis();
  const { req } = useRequirements();
  const { normalised } = useWeights();
  const [c, setC] = useState<ScoredCandidate | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const start = missionStartIso(mission);
  const days = Number(mission.durationDays);
  const stop = start && days > 0 ? new Date(Date.parse(start) + days * 86400e3).toISOString() : null;

  useEffect(() => {
    setC(null); setErr(null);
    if (!a.fresh || !a.result || !a.site || !start || !stop) return;
    let cancelled = false;
    api.compare(a.site.site_id, start, stop, a.observerHeight,
      [{ name: mission.name || "Target", lat: a.result.latitude, lon: a.result.longitude_east }], req, normalised)
      .then((r) => { if (!cancelled) setC(r.candidates[0] ?? null); })
      .catch((e) => { if (!cancelled) setErr(e instanceof Error ? e.message : "Score failed"); });
    return () => { cancelled = true; };
  }, [a.fresh, a.result, a.site, a.observerHeight, start, stop, mission.name, req, normalised]);

  if (!a.result || !a.fresh) {
    return <><p className="num text-lg text-bone-faint">Not computed</p><p className="mt-1 text-[11px] text-bone-faint">Press Run analysis.</p></>;
  }
  if (err) return <p className="text-xs text-haz-high">{err}</p>;
  if (!c) return <p className="text-xs text-bone-faint">Scoring…</p>;
  return (
    <div>
      <p className="num text-lg">{scorePct(c.overall)}<span className="text-xs text-bone-muted"> / 100</span></p>
      <p className={`mt-2 text-[11px] ${c.eligible ? "text-haz-ok" : "text-haz-high"}`}>
        {c.eligible ? "Meets every hard requirement" : `Fails ${c.failed_gates.join(", ")}`}
      </p>
      <Link href="/comparison" className="link mt-1 inline-block text-[11px]">Compare & weights</Link>
    </div>
  );
}

export default function Dashboard() {
  const { mission, setMission } = useMission();
  const { data: ds, error } = useApi(api.datasets);
  const a = useAnalysis();
  const router = useRouter();
  const ready = a.problems.length === 0;

  return (
    <div className="space-y-7">
      <header className="relative overflow-hidden rounded-2xl border border-night-700/80 bg-night-900/50 px-5 py-6 shadow-panel sm:px-7 sm:py-7">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_80%_at_0%_0%,rgba(255,181,71,0.07),transparent_55%),radial-gradient(50%_60%_at_100%_0%,rgba(90,174,255,0.06),transparent_50%)]"
          aria-hidden
        />
        <div className="relative max-w-3xl">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="font-display text-xs font-semibold tracking-brand text-bone">LUNARIS</p>
            <span className="text-bone-faint">·</span>
            <p className="eyebrow !normal-case tracking-normal text-bone-muted">Mission console</p>
          </div>
          <h1 className="mt-3 font-display text-2xl font-semibold tracking-tightish sm:text-3xl">
            Where the Sun skims the horizon, metres decide everything.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-bone-muted">
            Define a candidate landing point and window. LUNARIS evaluates sunlight, direct-to-Earth visibility and terrain safety from real
            NASA LOLA terrain and JPL ephemerides — and shows how every number was reached.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link href="/explorer" className="chip hover:border-bone-faint hover:text-bone">Explorer</Link>
            <Link href="/view3d" className="chip hover:border-bone-faint hover:text-bone">3D Moon</Link>
            <Link href="/validation" className="chip hover:border-bone-faint hover:text-bone">Validation</Link>
            <Link href="/methodology" className="chip hover:border-bone-faint hover:text-bone">Data & method</Link>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <section className="panel" aria-labelledby="mission-h">
          <div className="panel-head"><h2 id="mission-h" className="eyebrow">Mission configuration</h2>
            <span className="text-[11px] text-bone-faint">Saved in this browser</span></div>
          <div className="p-4">
            <MissionForm value={mission} onChange={setMission} />
            <div className="mt-5 flex items-center gap-3">
              <button disabled={!ready || a.loading} className="btn btn-primary"
                onClick={async () => { if (await a.run()) router.push("/analysis"); }}>{a.loading ? "Computing…" : "Run analysis"}</button>
              <span className="text-[11px] text-bone-faint">
                {a.error ? <span className="text-haz-high">{a.error}</span> : ready ? `Ready: ${a.site?.site_id}, observer ${a.observerHeight} m above the terrain.` : a.problems[0]}
              </span>
            </div>
          </div>
        </section>
        <TargetPanel />
      </div>

      <section aria-labelledby="ind-h">
        <h2 id="ind-h" className="eyebrow mb-3">Suitability indicators</h2>
        <div className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Indicator tone="sun" title="Sunlight" question="Is the Sun's disk above the local terrain horizon?" source="Run analysis">
            <VisibilityValue body="sun" />
          </Indicator>
          <Indicator tone="earth" title="Direct-to-Earth" question="Is Earth geometrically above the terrain horizon?" source="Run analysis">
            <VisibilityValue body="earth" />
          </Indicator>
          <Indicator tone="terrain" title="Terrain safety" question="Slope and roughness around the target" source="a target inside a loaded LOLA tile">
            <TerrainSafetyOrPlaceholder />
          </Indicator>
          <Indicator tone="overall" title="Overall" question="How the factors combine under your weights" source="Compare">
            <OverallValue />
          </Indicator>
        </div>
      </section>

      <section className="panel" aria-labelledby="data-h">
        <div className="panel-head">
          <h2 id="data-h" className="eyebrow">Data sources</h2>
          {ds && <span className="num text-[11px] text-bone-muted">{ds.acquired_count}/{ds.total_count} acquired</span>}
        </div>
        {error && <p className="p-4 text-sm text-haz-high">Could not load the dataset registry ({error}). Check that the backend is running.</p>}
        {!ds && !error && <p className="p-4 text-sm text-bone-muted">Loading…</p>}
        {ds && (
          <ul className="grid divide-night-800 sm:grid-cols-2">
            {ds.datasets.map((d) => (
              <li key={d.id} className="flex items-start gap-3 border-b border-night-800 px-4 py-2.5 text-sm">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${d.status === "acquired" ? "bg-haz-ok" : d.status === "remote" ? "bg-earth" : "bg-night-500"}`} aria-hidden />
                <div className="min-w-0">
                  <div className="truncate">{d.name}</div>
                  <div className="truncate text-[11px] text-bone-faint">{d.status === "acquired" ? "Cached from NASA URL" : d.status === "remote" ? "NASA URL · fetched on use" : "Not acquired"} · {d.role}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="px-4 py-2.5"><Link href="/methodology" className="link text-xs">Full data and methodology</Link></div>
      </section>
    </div>
  );
}

function TerrainSafetyOrPlaceholder() {
  const t = useTargetSite();
  if (!t.site) return <><p className="num text-lg text-bone-faint">Not computed</p><p className="mt-1 text-[11px] text-bone-faint">Set a target inside a loaded LOLA tile.</p></>;
  return <TerrainSafety />;
}
