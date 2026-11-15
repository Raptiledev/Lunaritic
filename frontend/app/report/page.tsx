"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { api } from "@/services/api";
import { fmtDuration, useAnalysis } from "@/context/analysis";
import { missionStartIso, useMission } from "@/context/mission";
import { useRequirements } from "@/components/planner/planner";
import { scorePct, useWeights } from "@/components/comparison/weights";
import type { ScoredCandidate, ValidationReport } from "@/types/api";

const pct = (v: number) => `${(v * 100).toFixed(0)}%`;

export default function ReportPage() {
  const { mission } = useMission();
  const a = useAnalysis();
  const { req } = useRequirements();
  const { normalised } = useWeights();
  const [score, setScore] = useState<ScoredCandidate | null>(null);
  const [val, setVal] = useState<ValidationReport | null>(null);
  const start = missionStartIso(mission);
  const days = Number(mission.durationDays);
  const stop = start && days > 0 ? new Date(Date.parse(start) + days * 86400e3).toISOString() : null;
  const r = a.fresh ? a.result : null;

  useEffect(() => {
    api.validation("site01").then(setVal).catch(() => setVal(null));
  }, []);

  useEffect(() => {
    setScore(null);
    if (!r || !a.site || !start || !stop) return;
    let cancelled = false;
    api.compare(a.site.site_id, start, stop, a.observerHeight,
      [{ name: mission.name || "Target", lat: r.latitude, lon: r.longitude_east }], req, normalised)
      .then((out) => { if (!cancelled) setScore(out.candidates[0] ?? null); })
      .catch(() => { if (!cancelled) setScore(null); });
    return () => { cancelled = true; };
  }, [r, a.site, a.observerHeight, start, stop, mission.name, req, normalised]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div className="max-w-3xl">
          <p className="eyebrow">Mission report · printable</p>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">Export what you can defend</h1>
          <p className="mt-2 text-sm leading-relaxed text-bone-muted">
            A one-page summary of the current mission, visibility analysis, explainable score and validation status. Use your browser&apos;s Print dialog to save a PDF.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => window.print()}><Printer size={14} /> Print / Save PDF</button>
      </div>

      <article className="report panel space-y-6 p-6 print:border-0 print:bg-white print:text-black">
        <header className="border-b border-night-700 pb-4 print:border-neutral-300">
          <div className="eyebrow print:text-neutral-500">LUNARIS · Team Alpha 8 · NASA Space Apps Challenge 2026</div>
          <h2 className="mt-1 text-xl font-semibold">{mission.name || "Unnamed mission"}</h2>
          <p className="mt-1 text-sm text-bone-muted print:text-neutral-600">
            Not an official NASA tool. Geometry only: sunlight is not power; Earth in view is not a radio link.
          </p>
        </header>

        <section>
          <h3 className="eyebrow mb-2">Mission</h3>
          <dl className="num grid gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
            <dt className="font-sans text-bone-muted print:text-neutral-600">Target</dt>
            <dd>{mission.latitude || "—"}°, {mission.longitude || "—"}°E {mission.siteId ? `· ${mission.siteId}` : ""}</dd>
            <dt className="font-sans text-bone-muted print:text-neutral-600">Window</dt>
            <dd>{start ? `${start.replace("T", " ").replace(":00Z", " UTC")}` : "—"} · {mission.durationDays || "?"} days</dd>
            <dt className="font-sans text-bone-muted print:text-neutral-600">Observer height</dt>
            <dd>{a.observerHeight} m above the ground</dd>
          </dl>
        </section>

        <section>
          <h3 className="eyebrow mb-2">Visibility over the window</h3>
          {!r ? (
            <p className="text-sm text-bone-muted print:text-neutral-600">Not computed. Run analysis on the Mission page first. <Link href="/dashboard" className="link print:hidden">Open Mission →</Link></p>
          ) : (
            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Sunlight" value={`${r.upper_bound ? "≤ " : ""}${pct(r.sun.fraction_of_time)}`} note={`longest dark ${fmtDuration(r.sun.longest_hidden_hours)}`} />
                <Stat label="Earth in view" value={`${r.upper_bound ? "≤ " : ""}${pct(r.earth.fraction_of_time)}`} note={`longest gap ${fmtDuration(r.earth.longest_hidden_hours)}`} />
                <Stat label="Both at once" value={`${r.upper_bound ? "≤ " : ""}${pct(r.both_fraction_of_time)}`} note={`${r.n_samples} steps of ${r.step_minutes} min`} />
              </div>
              {r.notes.map((n) => <p key={n} className="text-[11px] text-bone-faint print:text-neutral-500">{n}</p>)}
            </div>
          )}
        </section>

        <section>
          <h3 className="eyebrow mb-2">Explainable score</h3>
          {!score ? (
            <p className="text-sm text-bone-muted print:text-neutral-600">Score appears after a fresh analysis.</p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                Overall <span className="num text-lg">{scorePct(score.overall)}</span> / 100 ·{" "}
                {score.eligible ? <span className="text-haz-ok">meets every hard requirement</span> : <span className="text-haz-high">fails {score.failed_gates.join(", ")}</span>}
              </p>
              <table className="num w-full text-xs">
                <thead className="text-left text-bone-faint print:text-neutral-500">
                  <tr className="[&>th]:py-1 [&>th]:pr-3 [&>th]:font-normal"><th>Factor</th><th>Metric</th><th>Score</th><th>Weight</th><th>Contribution</th><th>Gate</th></tr>
                </thead>
                <tbody>
                  {(["sunlight", "darkness", "earth", "terrain"] as const).map((k) => (
                    <tr key={k} className="border-t border-night-800 print:border-neutral-200 [&>td]:py-1 [&>td]:pr-3">
                      <td className="capitalize">{k}</td>
                      <td>{k === "sunlight" ? pct(score.metrics.sun_lit)
                        : k === "darkness" ? fmtDuration(score.metrics.sun_dark_h)
                        : k === "earth" ? pct(score.metrics.earth_view)
                        : pct(score.metrics.favorable_share)}</td>
                      <td>{scorePct(score.scores[k])}</td>
                      <td>{Math.round(normalised[k] * 100)}%</td>
                      <td>{scorePct(score.contributions[k])}</td>
                      <td>{score.gates[k] ? "pass" : "fail"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-bone-faint print:text-neutral-500">
                Requirements used: sunlight ≥ {req.minSunPct}%, darkness ≤ {req.maxDarkH} h, Earth ≥ {req.minEarthPct}%, favorable ≥ {req.minFavorablePct}%.
                Defaults are illustrative, not NASA requirements. Overall is a weighted geometry summary, not a success probability.
              </p>
            </div>
          )}
        </section>

        <section>
          <h3 className="eyebrow mb-2">Validation snapshot</h3>
          {!val?.horizons ? (
            <p className="text-sm text-bone-muted print:text-neutral-600">Validation report unavailable.</p>
          ) : (
            <div className="space-y-1 text-sm">
              <p>JPL Horizons vs LUNARIS SPICE: <span className="text-haz-ok">{val.horizons.all_pass ? `all ${val.horizons.n_epochs} epochs pass` : "failed"}</span></p>
              <p className="num text-xs text-bone-muted print:text-neutral-600">
                max sky error {val.horizons.max_sky_error_deg.toExponential(2)}° · tolerance {val.horizons.tolerance_deg}°
              </p>
              {val.terrain && (
                <p className="text-xs text-bone-muted print:text-neutral-600">
                  Site01 LOLA returns in {(val.terrain.lola_return_fraction! * 100).toFixed(1)}% of pixels ·
                  height σ mean {val.terrain.height_uncertainty?.mean?.toFixed(2)} m ·
                  slope σ mean {val.terrain.slope_uncertainty?.mean?.toFixed(2)}°
                </p>
              )}
              <p className="text-[11px] text-bone-faint print:text-neutral-500">
                Pending: {val.pending.map((p) => p.name).join("; ")}.
              </p>
            </div>
          )}
        </section>

        <footer className="border-t border-night-700 pt-3 text-[11px] text-bone-faint print:border-neutral-300 print:text-neutral-500">
          Generated {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC · Data: NASA PGDA LOLA 5 m Site01, NAIF SPICE DE421, JPL Horizons validation fixture.
        </footer>
      </article>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-md border border-night-700 p-3 print:border-neutral-300">
      <div className="eyebrow">{label}</div>
      <div className="num mt-1 text-xl">{value}</div>
      <div className="mt-1 text-[11px] text-bone-faint print:text-neutral-500">{note}</div>
    </div>
  );
}
