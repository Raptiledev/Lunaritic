"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { api } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import type { HorizonsCase, ValidationReport } from "@/types/api";

const sci = (v: number, d = 2) => v.toExponential(d);
const deg = (v: number, d = 6) => `${v.toFixed(d)}°`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Verdict({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`chip ${ok ? "border-haz-ok/40 text-haz-ok" : "border-haz-high/40 text-haz-high"}`}>
      {ok ? <Check size={11} aria-hidden /> : <X size={11} aria-hidden />}{label}
    </span>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-night-900 px-3 py-2.5">
      <div className="eyebrow">{label}</div>
      <div className="num mt-0.5 text-lg leading-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-bone-faint">{sub}</div>}
    </div>
  );
}

function CaseTable({ c }: { c: HorizonsCase }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-night-800">
      <button className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-night-800/50" onClick={() => setOpen(!open)}>
        <Verdict ok={c.passed} label={c.passed ? "pass" : "fail"} />
        <span className="flex-1 text-bone">{c.site_name} · <span className={c.body === "sun" ? "text-sun" : "text-earth"}>{c.body}</span></span>
        <span className="num text-[11px] text-bone-muted">{c.n_epochs} epochs · max sky error {sci(c.max_sky_error_deg)}°</span>
      </button>
      {open && (
        <div className="overflow-x-auto px-4 pb-3">
          <table className="num w-full min-w-[640px] text-[11px]">
            <thead className="text-left text-bone-faint">
              <tr className="[&>th]:py-1 [&>th]:pr-3 [&>th]:font-normal">
                <th>UTC</th><th>Horizons az / el</th><th>LUNARIS az / el</th><th>Δaz</th><th>Δel</th><th>Sky error</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.utc} className="border-t border-night-800/80 text-bone-muted [&>td]:py-1 [&>td]:pr-3">
                  <td>{r.utc.replace("T", " ").replace("Z", "")}</td>
                  <td>{r.horizons_az_deg.toFixed(5)} / {r.horizons_el_deg.toFixed(5)}</td>
                  <td>{r.lunaris_az_deg.toFixed(5)} / {r.lunaris_el_deg.toFixed(5)}</td>
                  <td>{sci(r.delta_az_deg)}</td>
                  <td>{sci(r.delta_el_deg)}</td>
                  <td className={r.passed ? "text-haz-ok" : "text-haz-high"}>{sci(r.sky_error_deg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HorizonsPanel({ r }: { r: NonNullable<ValidationReport["horizons"]> }) {
  return (
    <section className="panel">
      <div className="panel-head flex-wrap gap-2">
        <div>
          <h2 className="eyebrow">JPL Horizons vs LUNARIS SPICE</h2>
          <p className="mt-0.5 text-xs text-bone-muted">Independent airless topocentric check. Recomputed live from the stored Horizons fixture.</p>
        </div>
        <Verdict ok={r.all_pass} label={r.all_pass ? `all ${r.n_epochs} epochs pass` : "failed"} />
      </div>
      <div className="grid grid-cols-2 gap-px bg-night-700 sm:grid-cols-4">
        <Metric label="Max sky error" value={sci(r.max_sky_error_deg) + "°"} sub={`tolerance ${r.tolerance_deg}°`} />
        <Metric label="RMS sky error" value={sci(r.rms_sky_error_deg) + "°"} sub={`RMS Δel ${sci(r.rms_delta_el_deg)}°`} />
        <Metric label="Vs solar disk" value={`${(r.max_sky_error_deg / 0.53 * 1e6).toFixed(0)} ppm`} sub="of the Sun's apparent diameter" />
        <Metric label="Cases" value={`${r.n_cases}`} sub={`fixture ${r.retrieved_utc.slice(0, 10)}`} />
      </div>
      <div className="divide-y-0">{r.cases.map((c, i) => <CaseTable key={i} c={c} />)}</div>
      <div className="space-y-1 border-t border-night-700 px-4 py-3 text-[11px] text-bone-faint">
        <p>{r.source}</p>
        {r.notes.map((n) => <p key={n}>{n}</p>)}
      </div>
    </section>
  );
}

function TerrainPanel({ t }: { t: NonNullable<ValidationReport["terrain"]> }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2 className="eyebrow">Terrain data confidence · {t.site_id}</h2>
          <p className="mt-0.5 text-xs text-bone-muted">From the NASA LOLA product layers themselves, not invented by LUNARIS.</p>
        </div>
        <span className="num text-[11px] text-bone-faint">{t.shape_px[1]}×{t.shape_px[0]} px · {t.pixel_size_m} m</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-night-700 sm:grid-cols-4">
        <Metric label="LOLA returns" value={t.lola_return_fraction == null ? "—" : pct(t.lola_return_fraction)}
          sub="pixels with a real measurement" />
        <Metric label="Height σ mean" value={t.height_uncertainty?.mean == null ? "—" : `${t.height_uncertainty.mean.toFixed(2)} m`}
          sub={t.height_uncertainty?.p95 == null ? undefined : `p95 ${t.height_uncertainty.p95.toFixed(2)} m`} />
        <Metric label="Slope σ mean" value={t.slope_uncertainty?.mean == null ? "—" : deg(t.slope_uncertainty.mean, 2)}
          sub={t.slope_uncertainty?.p95 == null ? undefined : `p95 ${t.slope_uncertainty.p95.toFixed(2)}°`} />
        <Metric label="Our slope mean" value={t.our_slope.mean == null ? "—" : deg(t.our_slope.mean, 1)}
          sub={t.our_slope.p95 == null ? undefined : `p95 ${t.our_slope.p95.toFixed(1)}°`} />
      </div>
      <div className="space-y-1 px-4 py-3 text-[11px] text-bone-faint">{t.notes.map((n) => <p key={n}>{n}</p>)}</div>
    </section>
  );
}

export default function ValidationPage() {
  const { data, error, loading } = useApi(() => api.validation("site01"));
  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <p className="eyebrow">Validation · prove the numbers, admit the limits</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">What we checked against NASA, and what we have not</h1>
        <p className="mt-2 text-sm leading-relaxed text-bone-muted">
          Every result below is recomputed live. A check is marked passed only after it has actually been run.
          Missing comparisons are listed as not acquired, never filled with demo data.
        </p>
      </div>

      {loading && <p className="text-sm text-bone-muted">Running the Horizons comparison and reading the DEM confidence layers…</p>}
      {error && <p className="panel p-4 text-sm text-haz-high">{error}</p>}

      {data && (
        <div className="space-y-5">
          {data.horizons ? <HorizonsPanel r={data.horizons} /> : (
            <section className="panel p-4 text-sm text-haz-high">{data.horizons_error ?? "Horizons comparison unavailable."}</section>
          )}

          {data.terrain ? <TerrainPanel t={data.terrain} /> : (
            <section className="panel p-4 text-sm text-haz-high">{data.terrain_error ?? "Terrain confidence unavailable."}</section>
          )}

          <section className="panel">
            <div className="panel-head">
              <h2 className="eyebrow">NASA slope cross-check</h2>
              <Verdict ok={!!data.nasa_slope} label={data.nasa_slope ? "run" : "not acquired"} />
            </div>
            <div className="p-4 text-sm text-bone-muted">
              {data.nasa_slope ? (
                <div className="space-y-2">
                  <p>Compared our Horn 3×3 slope with NASA&apos;s published <span className="num">slp</span> layer over{" "}
                    <span className="num text-bone">{data.nasa_slope.n_compared.toLocaleString()}</span> pixels.</p>
                  <div className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-night-700">
                    <Metric label="RMS difference" value={deg(data.nasa_slope.rms_diff_deg, 3)} />
                    <Metric label="Mean difference" value={deg(data.nasa_slope.mean_diff_deg, 3)} />
                    <Metric label="p95 |diff|" value={deg(data.nasa_slope.p95_abs_diff_deg, 3)} />
                  </div>
                  {data.nasa_slope.notes.map((n) => <p key={n} className="text-[11px] text-bone-faint">{n}</p>)}
                </div>
              ) : (
                <p>The optional file <span className="num text-bone">Site01_final_adj_5mpp_slp.tif</span> is not in{" "}
                  <span className="num">backend/app/data/dem/</span>. Drop it in and reload to run this check.</p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="eyebrow">Pending independent checks</h2>
              <span className="text-[11px] text-bone-faint">honest gaps</span></div>
            <ul className="divide-y divide-night-800">
              {data.pending.map((p) => (
                <li key={p.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:gap-4">
                  <Verdict ok={false} label={p.status.replace("_", " ")} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-bone">{p.name}</div>
                    <p className="mt-0.5 text-[12px] text-bone-muted">{p.why}</p>
                    <a className="link mt-1 inline-block text-[11px]" href={p.url} target="_blank" rel="noreferrer">Source →</a>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-head"><h2 className="eyebrow">Method limits we always report</h2></div>
            <dl className="divide-y divide-night-800">
              {data.method_limits.map((m) => (
                <div key={m.id} className="grid gap-1 px-4 py-3 sm:grid-cols-[14rem_1fr]">
                  <dt className="text-sm text-bone">{m.title}</dt>
                  <dd className="text-[13px] text-bone-muted">{m.detail}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      )}
    </div>
  );
}
