"use client";
import { api } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import type { Dataset } from "@/types/api";

const val = (v: string | number | null) => (v === null ? <span className="text-bone-faint">Not yet recorded</span> : String(v));

function DatasetCard({ d }: { d: Dataset }) {
  const rows: [string, React.ReactNode][] = [
    ["Provider", d.provider],
    ["Used for", d.role],
    ["Resolution", d.resolution_m === null ? val(null) : `${d.resolution_m} m`],
    ["Coordinate reference", val(d.crs)],
    ["Vertical reference", val(d.vertical_reference)],
    ["Units", val(d.units)],
    ["Coverage", val(d.coverage)],
    ["Product date", val(d.product_date)],
    ["Processing", d.processing_steps.length ? d.processing_steps.join("; ") : <span className="text-bone-faint">None yet</span>],
  ];
  const ok = d.status === "acquired";
  const remote = d.status === "remote";
  return (
    <article className="panel">
      <div className="panel-head">
        <h3 className="text-sm font-medium">{d.name}</h3>
        <span className={`chip shrink-0 ${ok ? "border-haz-ok/50 text-haz-ok" : remote ? "border-earth/50 text-earth" : ""}`}>
          <i className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-haz-ok" : remote ? "bg-earth" : "bg-night-500"}`} />
          {ok ? "Cached from NASA URL" : remote ? "NASA URL" : "Not acquired"}
        </span>
      </div>
      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 gap-y-1.5 px-4 py-3 text-[13px]">
        {rows.map(([k, v]) => (<div key={k} className="contents"><dt className="text-bone-faint">{k}</dt><dd className="text-bone-muted">{v}</dd></div>))}
      </dl>
      <div className="border-t border-night-800 px-4 py-2.5">
        {d.notes && <p className="text-xs text-bone-muted">{d.notes}</p>}
        <a href={d.url} target="_blank" rel="noreferrer" className="link mt-1 inline-block text-xs">Source</a>
      </div>
    </article>
  );
}

const PRINCIPLES = [
  "Every dataset's source, resolution, coordinate reference and vertical reference is recorded. Anything unknown is shown as not yet recorded, never guessed.",
  "Results come from real data or are not shown. Any demonstration data will be labelled as such on screen.",
  "Direct-to-Earth geometric visibility means Earth is above the local terrain horizon. It does not guarantee a working communication link.",
  "Sunlight availability is geometric. It is not an estimate of electrical power unless panel orientation, efficiency and temperature are modelled.",
  "Scoring weights are configurable and are not NASA mission requirements. LUNARIS is not an official NASA tool or certification.",
  "A validation test is reported as passed only after it has actually been run.",
];

const COLOURS: [string, string, string][] = [
  ["bg-sun", "Sun", "Amber is used only for the Sun: its position, path and illumination."],
  ["bg-earth", "Earth", "Blue is used only for Earth: its position, path and direct-to-Earth visibility."],
  ["bg-bone", "Terrain and interface", "Neutral regolith tones for the surface, the terrain horizon and controls."],
  ["bg-haz-high", "Hazard classes", "Green, amber-orange and red appear only in the hazard map and its statistics."],
];

const METHODS: [string, string][] = [
  ["Terrain", "Slope (Horn 3×3), roughness (plane residual over 25 m) and hazard classes from the LOLA 5 m surface. Hazard thresholds are illustrative."],
  ["Horizon", "From the observer, 360 rays at 1° steps, sampled every 5 m to 20 km on the 1737.4 km sphere. The highest elevation angle along each ray is the horizon in that direction."],
  ["Sun and Earth", "NAIF SPICE (DE421, MOON_ME, light time + aberration) gives azimuth, elevation and apparent size. Checked against JPL Horizons at 108 epochs: agreement about 0.00001°."],
  ["Visibility over time", "At every time step the Sun's and Earth's disks are compared with the horizon in their direction. Lit = any part of the Sun above the terrain; Earth in view = at least half its disk above it."],
  ["Mission-window maps", "The horizon is precomputed at every 100 m node of the tile (25,600 points), then the same visibility test runs at every node and time step. Each node reproduces the single-point analysis (tested)."],
  ["Slip Planner", "One long SPICE track covers 120 possible landing days; each day's mission window is a slice of it, judged by the same rules as the Analysis page (tested equal). The alternative search keeps only 100 m cells that meet every requirement, including at least the chosen share of Favorable 5 m pixels."],
  ["Validation", "The Validation page recomputes every Horizons epoch against SPICE live, reports LOLA height/slope uncertainty from the NASA layers, and marks pending checks (NASA slope file, PGDA illumination) as not acquired."],
  ["Compare", "Hard requirements gate eligibility. Soft score = sum of weight_i × score_i for sunlight, darkness, Earth and terrain. Contributions are shown so every point of the overall number is readable. Not a black-box AI score."],
  ["3D / Timeline / Report", "Full Moon 3D is a reference sphere for context; real LOLA heights are only the Site01 AOI patch (or the Site-tile mesh). Timeline plays the Analysis series. Report reprints those numbers for PDF; invents nothing."],
  ["Honest limits", "The tile ends 8 to 16 km away, so distant mountains are missing: sunlight and Earth figures are upper bounds, darkness figures lower bounds. No global DEM is loaded. Geometry only; no power, thermal or radio model."],
];

export default function Methodology() {
  const { data, error, loading } = useApi(api.datasets);
  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <p className="eyebrow">Data and methodology</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">What LUNARIS uses, and what it can claim</h1>
      </div>
      <section className="grid gap-4 md:grid-cols-2">
        <div className="panel p-4">
          <h2 className="eyebrow mb-3">Principles</h2>
          <ul className="space-y-2 text-[13px] leading-relaxed text-bone-muted">{PRINCIPLES.map((p) => <li key={p} className="flex gap-2"><span className="text-bone-faint">—</span>{p}</li>)}</ul>
        </div>
        <div className="panel p-4">
          <h2 className="eyebrow mb-3">Colour language</h2>
          <ul className="space-y-3 text-[13px]">
            {COLOURS.map(([c, n, d]) => (
              <li key={n} className="flex gap-3"><span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${c}`} />
                <span><span className="text-bone">{n}.</span> <span className="text-bone-muted">{d}</span></span></li>
            ))}
          </ul>
        </div>
      </section>
      <section className="panel p-4">
        <h2 className="eyebrow mb-3">Methods, step by step</h2>
        <dl className="grid gap-x-6 gap-y-3 text-[13px] md:grid-cols-[11rem_1fr]">
          {METHODS.map(([t, d]) => (
            <div key={t} className="contents"><dt className="text-bone">{t}</dt><dd className="text-bone-muted">{d}</dd></div>
          ))}
        </dl>
      </section>
      <section>
        <h2 className="eyebrow mb-3">Datasets</h2>
        {loading && <p className="text-sm text-bone-muted">Loading…</p>}
        {error && <p className="text-sm text-haz-high">Could not load the dataset registry ({error}). Check that the backend is running.</p>}
        <div className="space-y-3">{data?.datasets.map((d) => <DatasetCard key={d.id} d={d} />)}</div>
      </section>
    </div>
  );
}
