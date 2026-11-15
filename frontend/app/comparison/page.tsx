"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Plus, Trash2, X } from "lucide-react";
import { api } from "@/services/api";
import { useCompareList } from "@/context/compareList";
import { missionStartIso, useMission } from "@/context/mission";
import { fmtDuration, useAnalysis } from "@/context/analysis";
import { useRequirements } from "@/components/planner/planner";
import { FACTOR_META, pct, scorePct, useWeights } from "@/components/comparison/weights";
import type { CompareResponse, ScoreCandidate, ScoredCandidate } from "@/types/api";

type Draft = { id: string; name: string; latitude: string; longitude: string };

const newDraft = (name = ""): Draft => ({ id: Math.random().toString(36).slice(2, 9), name, latitude: "", longitude: "" });

function Gate({ ok }: { ok: boolean }) {
  return ok ? <Check size={12} className="inline text-haz-ok" aria-label="meets" /> : <X size={12} className="inline text-haz-high" aria-label="fails" />;
}

function Contrib({ c }: { c: ScoredCandidate }) {
  const colors: Record<string, string> = { sunlight: "bg-sun", darkness: "bg-sun/70", earth: "bg-earth", terrain: "bg-bone-muted" };
  return (
    <div className="space-y-1">
      <div className="flex h-2 overflow-hidden rounded-full bg-night-800">
        {FACTOR_META.map((f) => (
          <span key={f.id} className={colors[f.id]} style={{ width: `${(c.contributions[f.id] ?? 0) * 100}%` }}
            title={`${f.label}: adds ${((c.contributions[f.id] ?? 0) * 100).toFixed(1)} points to the overall score`} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-bone-faint">
        {FACTOR_META.map((f) => (
          <span key={f.id}><span className={f.tone}>{f.label}</span> {scorePct(c.scores[f.id])} × weight = {scorePct(c.contributions[f.id])}</span>
        ))}
      </div>
    </div>
  );
}

export default function ComparisonPage() {
  const { mission, update } = useMission();
  const { drafts, setDrafts, hydrated, stored } = useCompareList();
  const a = useAnalysis();
  const { req, update: setReq } = useRequirements();
  const { weights, normalised, update: setW, reset: resetW } = useWeights();
  const [seeded, setSeeded] = useState(false);
  const [result, setResult] = useState<CompareResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = missionStartIso(mission);
  const days = Number(mission.durationDays);
  const stop = start && days > 0 ? new Date(Date.parse(start) + days * 86400e3).toISOString() : null;
  const ready = !a.problems.length && a.site && start && stop;

  useEffect(() => {
    if (!hydrated || stored || seeded || !mission.latitude || !mission.longitude) return;
    setDrafts((d) => {
      if (d[0] && d[0].latitude !== "" && d[0].longitude !== "") return d;
      const copy = [...d];
      copy[0] = { ...copy[0], name: mission.name || "Mission target", latitude: mission.latitude, longitude: mission.longitude };
      return copy;
    });
    setSeeded(true);
  }, [hydrated, stored, mission.latitude, mission.longitude, mission.name, seeded, setDrafts]);

  function setDraft(id: string, p: Partial<Draft>) {
    setDrafts((all) => all.map((d) => (d.id === id ? { ...d, ...p } : d)));
  }

  async function run() {
    if (!ready || !a.site || !start || !stop) return;
    const candidates: ScoreCandidate[] = [];
    for (const d of drafts) {
      const lat = Number(d.latitude), lon = Number(d.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || d.latitude === "" || d.longitude === "") {
        setError(`Fill latitude and longitude for "${d.name || "a candidate"}".`);
        return;
      }
      candidates.push({ name: d.name || undefined, lat, lon });
    }
    setLoading(true); setError(null);
    try {
      setResult(await api.compare(a.site.site_id, start, stop, a.observerHeight, candidates, req, normalised));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  function useAsTarget(c: ScoredCandidate) {
    update({ latitude: c.latitude.toFixed(5), longitude: c.longitude_east.toFixed(4), siteId: c.site_id, name: c.name });
  }

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">Rank landing points with rules you can read</h1>
        <p className="mt-2 text-sm leading-relaxed text-bone-muted">
          First, each point has to meet every must-have requirement. Points that pass are then ranked by a score built from four factors,
          and you decide how much each factor counts.
        </p>
      </div>

      {!ready && (
        <div className="panel space-y-2 p-4 text-sm">
          <p className="text-bone">Complete the mission first.</p>
          <ul className="list-disc pl-5 text-bone-muted">{(a.problems.length ? a.problems : ["Set a landing date and duration."]).map((p) => <li key={p}>{p}</li>)}</ul>
          <Link className="link text-xs" href="/dashboard">Open the mission form →</Link>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">Landing points to compare</h2>
            <button className="btn px-2 py-1" disabled={drafts.length >= 6} onClick={() => setDrafts((d) => [...d, newDraft(`Alt ${d.length}`)])}>
              <Plus size={12} aria-hidden /> Add
            </button>
          </div>
          <div className="space-y-3">
            {drafts.map((d, i) => (
              <div key={d.id} className="grid gap-2 rounded-md border border-night-700 p-3 sm:grid-cols-[1fr_5.5rem_5.5rem_auto]">
                <label className="block"><span className="eyebrow">Name</span>
                  <input className="input mt-1" value={d.name} onChange={(e) => setDraft(d.id, { name: e.target.value })} placeholder={`Candidate ${i + 1}`} /></label>
                <label className="block"><span className="eyebrow">Lat °</span>
                  <input className="input num mt-1" value={d.latitude} onChange={(e) => setDraft(d.id, { latitude: e.target.value })} /></label>
                <label className="block"><span className="eyebrow">Lon °E</span>
                  <input className="input num mt-1" value={d.longitude} onChange={(e) => setDraft(d.id, { longitude: e.target.value })} /></label>
                <button className="btn self-end px-2" disabled={drafts.length <= 1} onClick={() => setDrafts((all) => all.filter((x) => x.id !== d.id))} aria-label="Remove">
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-bone-faint">The first row starts as your mission target. Send other points from the Explorer with Send to Compare.</p>
        </div>

        <div className="space-y-4">
          <div className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="eyebrow">Must-have requirements</h2>
              <span className="text-[11px] text-bone-faint">shared with the Slip Planner</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {([
                ["minSunPct", "Sunlight ≥", "%", req.minSunPct],
                ["maxDarkH", "Darkness ≤", "h", req.maxDarkH],
                ["minEarthPct", "Earth ≥", "%", req.minEarthPct],
                ["minFavorablePct", "Favorable ≥", "%", req.minFavorablePct],
              ] as const).map(([k, label, unit, v]) => (
                <label key={k} className="block"><span className="eyebrow">{label}</span>
                  <div className="mt-1 flex items-center gap-2">
                    <input type="number" className="input num w-20" value={v} min={0}
                      onChange={(e) => setReq({ [k]: Number(e.target.value) })} />
                    <span className="text-xs text-bone-muted">{unit}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="panel p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="eyebrow">How much each factor counts</h2>
              <button className="text-[11px] text-bone-muted hover:text-bone" onClick={resetW}>Reset</button>
            </div>
            <div className="space-y-2">
              {FACTOR_META.map((f) => (
                <label key={f.id} className="grid grid-cols-[5rem_1fr_3rem] items-center gap-2" title={f.hint}>
                  <span className={`text-xs ${f.tone}`}>{f.label}</span>
                  <input type="range" min={0} max={100} value={weights[f.id]}
                    onChange={(e) => setW({ [f.id]: Number(e.target.value) })} />
                  <span className="num text-right text-xs text-bone-muted">{Math.round(normalised[f.id] * 100)}%</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-bone-faint">The sliders are relative to each other. The percentages on the right always add up to 100%.</p>
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button className="btn btn-primary" disabled={!ready || loading} onClick={run}>
          {loading ? "Comparing…" : "Compare these points"}
        </button>
        {error && <span className="text-sm text-haz-high">{error}</span>}
        {result && !loading && (
          <span className="text-[11px] text-bone-muted">
            {result.eligible_count} of {result.candidates.length} meet every requirement · {result.start_utc.slice(0, 10)} → {result.stop_utc.slice(0, 10)} · checked every {result.step_minutes} min
          </span>
        )}
      </div>

      {result && (
        <section className="space-y-4">
          {(() => {
            const best = result.candidates.filter((c) => c.eligible).sort((x, y) => x.rank - y.rank)[0];
            return (
              <p className="panel p-4 text-sm text-bone">
                {best
                  ? <>Best option: {best.name}. It meets every requirement, with sunlight for {pct(best.metrics.sun_lit)} of the window, a longest darkness of {fmtDuration(best.metrics.sun_dark_h)} and Earth in view for {pct(best.metrics.earth_view)}. Overall score {scorePct(best.overall)}.</>
                  : "None of these points meets every requirement. Loosen a requirement or try other points."}
              </p>
            );
          })()}
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {result.candidates.map((c) => (
              <article key={`${c.rank}-${c.latitude}-${c.longitude_east}`} className={`panel overflow-hidden ${c.eligible ? "" : "opacity-80"}`}>
                <div className="panel-head">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="num text-lg text-bone">#{c.rank}</span>
                      <span className="text-sm text-bone">{c.name}</span>
                      {c.eligible
                        ? <span className="chip border-haz-ok/40 text-haz-ok"><Check size={11} />meets requirements</span>
                        : <span className="chip border-haz-high/40 text-haz-high"><X size={11} />fails requirements</span>}
                    </div>
                    <div className="num mt-0.5 text-[11px] text-bone-faint">{c.latitude.toFixed(4)}°, {c.longitude_east.toFixed(3)}°E</div>
                  </div>
                  <div className="text-right">
                    <div className="eyebrow">Overall score</div>
                    <div className="num text-2xl">{scorePct(c.overall)}</div>
                  </div>
                </div>
                <div className="space-y-3 p-4">
                  <Contrib c={c} />
                  <dl className="num grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    <dt className="font-sans text-bone-muted">Sunlight <Gate ok={c.gates.sunlight} /></dt>
                    <dd className="text-sun">{pct(c.metrics.sun_lit)}</dd>
                    <dt className="font-sans text-bone-muted">Longest darkness <Gate ok={c.gates.darkness} /></dt>
                    <dd>{fmtDuration(c.metrics.sun_dark_h)}</dd>
                    <dt className="font-sans text-bone-muted">Earth in view <Gate ok={c.gates.earth} /></dt>
                    <dd className="text-earth">{pct(c.metrics.earth_view)}</dd>
                    <dt className="font-sans text-bone-muted">Favorable ground <Gate ok={c.gates.terrain} /></dt>
                    <dd>{pct(c.metrics.favorable_share)}{c.slope_p95_deg != null ? ` · 95% of slopes below ${c.slope_p95_deg.toFixed(1)}°` : ""}</dd>
                  </dl>
                  {!c.eligible && (
                    <p className="text-[11px] text-haz-high">Does not meet: {c.failed_gates.join(", ")}. The score is shown for reference only; this point is not usable under your requirements.</p>
                  )}
                  {c.upper_bound && (
                    <p className="text-[11px] text-bone-faint">Sunlight and Earth figures are best-case (in {(c.horizon_incomplete_fraction * 100).toFixed(0)}% of directions our terrain data stops at the edge of the area we check).</p>
                  )}
                  <button className="btn" onClick={() => useAsTarget(c)}>Set as mission target</button>
                </div>
              </article>
            ))}
          </div>
          <div className="panel space-y-1 p-4 text-[11px] text-bone-faint">
            {result.notes.map((n) => <p key={n}>{n}</p>)}
          </div>
        </section>
      )}
    </div>
  );
}
