"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import { api } from "@/services/api";
import { missionStartIso, useMission } from "@/context/mission";
import { fmtDuration, useAnalysis } from "@/context/analysis";
import LandingCalendar from "@/components/planner/LandingCalendar";
import TrendChart from "@/components/planner/TrendChart";
import Alternatives from "@/components/planner/Alternatives";
import { CHECK_LABEL, dayLabel, failures, pct, statusOf, useRequirements } from "@/components/planner/planner";
import type { AlternativeCell, AlternativesResponse, CalendarResponse, Requirements } from "@/types/api";

const DAYS_BEFORE = 14, N_DAYS = 120;

function Field({ label, unit, value, onChange, hint }: { label: string; unit: string; value: number; onChange: (v: number) => void; hint: string }) {
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input type="number" className="input num w-24" value={value} min={0} onChange={(e) => onChange(Number(e.target.value))} />
        <span className="text-xs text-bone-muted">{unit}</span>
      </div>
      <span className="mt-1 block text-[11px] text-bone-faint">{hint}</span>
    </label>
  );
}

function slipTolerance(c: CalendarResponse, req: Requirements, planned: number): number | null {
  if (failures(c.days[planned], req).length) return null;
  let n = 0;
  while (planned + n + 1 < c.days.length && failures(c.days[planned + n + 1], req).length === 0) n++;
  return n;
}

export default function SlipPlanner() {
  const { mission, update } = useMission();
  const a = useAnalysis();
  const { req, update: setReq, reset } = useRequirements();
  const [cal, setCal] = useState<CalendarResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(DAYS_BEFORE);
  const [alts, setAlts] = useState<AlternativesResponse | null>(null);
  const [altLoading, setAltLoading] = useState(false);
  const [altError, setAltError] = useState<string | null>(null);
  const req0 = useRef(0);

  const start = missionStartIso(mission);
  const duration = Number(mission.durationDays);
  const lat = Number(mission.latitude), lon = Number(mission.longitude);
  const ready = !a.problems.length && a.site && start;
  const firstStart = start ? new Date(Date.parse(start) - DAYS_BEFORE * 86400e3).toISOString() : null;

  useEffect(() => {
    if (!ready || !firstStart) return;
    const id = ++req0.current;
    setLoading(true); setError(null); setAlts(null); setSelected(DAYS_BEFORE);
    api.calendar(a.site!.site_id, lat, lon, firstStart, N_DAYS, duration, a.observerHeight)
      .then((c) => { if (id === req0.current) setCal(c); })
      .catch((e) => { if (id === req0.current) setError(e instanceof Error ? e.message : "Request failed"); })
      .finally(() => { if (id === req0.current) setLoading(false); });
  }, [ready, firstStart, lat, lon, duration, a.observerHeight, a.site]);

  useEffect(() => { setAlts(null); setAltError(null); }, [selected, req]);

  async function findAlternatives() {
    if (!cal || !a.site) return;
    const d = cal.days[selected], s = d.start_utc, stop = new Date(Date.parse(s) + duration * 86400e3).toISOString();
    setAltLoading(true); setAltError(null);
    try { setAlts(await api.alternatives(a.site.site_id, lat, lon, s, stop, req)); }
    catch (e) { setAltError(e instanceof Error ? e.message : "Request failed"); }
    finally { setAltLoading(false); }
  }

  function applyDate(i: number) {
    update({ date: cal!.days[i].start_utc.slice(0, 10) });
  }

  function setTarget(c: AlternativeCell) {
    update({ latitude: c.latitude.toFixed(5), longitude: c.longitude_east.toFixed(4), siteId: a.site?.site_id });
  }

  const planned = DAYS_BEFORE;
  const tol = cal ? slipTolerance(cal, req, planned) : null;
  const nextGo = cal ? cal.days.findIndex((d, i) => i >= planned && failures(d, req).length === 0) : -1;
  const goCount = cal ? cal.days.filter((d, i) => i >= planned && failures(d, req).length === 0).length : 0;
  const sel = cal?.days[selected], selFails = sel ? failures(sel, req) : [];

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <p className="eyebrow">Slip Planner · what if the landing date moves?</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">Which landing dates still work, and where else could we go?</h1>
        <p className="mt-2 text-sm leading-relaxed text-bone-muted">
          Every day below is a full mission of <span className="num text-bone">{mission.durationDays || "?"}</span> days starting that day,
          analysed at your target with real terrain and NASA SPICE. Colours show whether it meets your requirements.
        </p>
      </div>

      {!ready && (
        <div className="panel space-y-2 p-4 text-sm">
          <p className="text-bone">Complete the mission first.</p>
          <ul className="list-disc pl-5 text-bone-muted">{(a.problems.length ? a.problems : ["Set a landing date and time."]).map((p) => <li key={p}>{p}</li>)}</ul>
          <Link className="link text-xs" href="/dashboard">Open the mission form →</Link>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="panel p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="eyebrow">Mission requirements</h2>
            <button className="text-[11px] text-bone-muted hover:text-bone" onClick={reset}>Reset</button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Sunlight at least" unit="% of window" value={req.minSunPct} onChange={(v) => setReq({ minSunPct: v })} hint="Power for solar panels." />
            <Field label="Darkness at most" unit="hours" value={req.maxDarkH} onChange={(v) => setReq({ maxDarkH: v })} hint="What the battery can survive." />
            <Field label="Earth at least" unit="% of window" value={req.minEarthPct} onChange={(v) => setReq({ minEarthPct: v })} hint="Direct radio contact." />
            <Field label="Favorable ground" unit="% of 100 m cell" value={req.minFavorablePct} onChange={(v) => setReq({ minFavorablePct: v })} hint="Used when searching other spots." />
          </div>
          <p className="mt-4 text-[11px] text-bone-faint">Default values are illustrative examples, not NASA requirements. Set them to your lander's real limits.</p>
        </div>

        <div className="panel p-4">
          <h2 className="eyebrow mb-3">Verdict for the planned date</h2>
          {loading && <p className="text-sm text-bone-muted">Analysing {N_DAYS} possible landing dates…</p>}
          {error && <p className="text-sm text-haz-high">{error}</p>}
          {cal && !loading && (() => {
            const f = failures(cal.days[planned], req), s = statusOf(f.length);
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                  <span className="text-lg">{dayLabel(cal.days[planned].start_utc)}: {f.length ? <>fails <span className="text-bone">{f.map((c) => CHECK_LABEL[c].toLowerCase()).join(" and ")}</span></> : "meets every requirement"}</span>
                </div>
                <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-md bg-night-700 text-center">
                  <div className="bg-night-900 p-3"><dt className="eyebrow">Slip tolerance</dt>
                    <dd className="num mt-1 text-2xl">{tol == null ? "0 d" : `${tol} d`}</dd>
                    <dd className="text-[11px] text-bone-muted">{tol == null ? "planned date already fails" : "of delay still meets everything"}</dd></div>
                  <div className="bg-night-900 p-3"><dt className="eyebrow">Next good date</dt>
                    <dd className="num mt-1 text-2xl">{nextGo < 0 ? "—" : nextGo === planned ? "planned" : `+${nextGo - planned} d`}</dd>
                    <dd className="text-[11px] text-bone-muted">{nextGo < 0 ? `none in the next ${N_DAYS - planned} days` : dayLabel(cal.days[nextGo].start_utc)}</dd></div>
                  <div className="bg-night-900 p-3"><dt className="eyebrow">Good dates ahead</dt>
                    <dd className="num mt-1 text-2xl">{goCount}</dd>
                    <dd className="text-[11px] text-bone-muted">of the next {N_DAYS - planned} days</dd></div>
                </dl>
                {cal.upper_bound && <p className="flex gap-2 text-[11px] text-bone-faint"><AlertTriangle size={13} className="mt-px shrink-0" />{cal.notes[0]}</p>}
              </div>
            );
          })()}
        </div>
      </section>

      {cal && (
        <section className="panel">
          <div className="panel-head"><span className="eyebrow">Landing calendar · click a day</span>
            <span className="num text-[11px] text-bone-faint">{N_DAYS} landing dates · {cal.n_samples} time steps of {cal.step_minutes} min · same time of day as planned</span></div>
          <div className="grid gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <LandingCalendar days={cal.days} req={req} planned={planned} selected={selected} onSelect={setSelected} />
            <TrendChart days={cal.days} req={req} planned={planned} selected={selected} />
          </div>
        </section>
      )}

      {cal && sel && (
        <section className="panel">
          <div className="panel-head flex-wrap gap-2">
            <div>
              <span className="eyebrow">Landing on {dayLabel(sel.start_utc)}</span>
              <span className="num ml-2 text-[11px] text-bone-faint">{selected === planned ? "planned date" : `${selected > planned ? "+" : ""}${selected - planned} d from plan`}</span>
            </div>
            <div className="flex gap-2">
              {selected !== planned && <button className="btn" onClick={() => applyDate(selected)}>Use this date</button>}
              <button className="btn-primary btn" onClick={findAlternatives} disabled={altLoading}>
                <Search size={13} aria-hidden />{altLoading ? "Searching every 100 m cell…" : "Find nearest spot that works on this date"}
              </button>
            </div>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {([["sunlight", "Sunlight", pct(sel.sun_lit), `need ≥ ${req.minSunPct}%`, "text-sun"],
                ["darkness", "Longest darkness", fmtDuration(sel.sun_dark_h), `need ≤ ${req.maxDarkH} h`, "text-sun"],
                ["earth", "Earth in view", pct(sel.earth_view), `need ≥ ${req.minEarthPct}%`, "text-earth"]] as const).map(([id, label, v, need, tone]) => {
                const bad = selFails.includes(id);
                return (
                  <div key={id} className={`rounded-md border p-3 ${bad ? "border-haz-high/50" : "border-night-700"}`}>
                    <div className="eyebrow">{label}</div>
                    <div className={`num mt-1 text-xl ${tone}`}>{v}</div>
                    <div className={`text-[11px] ${bad ? "text-haz-high" : "text-haz-ok"}`}>{bad ? "fails" : "meets"} · {need}</div>
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-bone-faint">At touchdown the Sun is {sel.sunlit_at_landing ? "up" : "hidden"} and Earth is {sel.earth_at_landing ? "in view" : "hidden"}.
              Sunlight and Earth figures are upper bounds; darkness is a lower bound.</p>
            {altError && <p className="text-sm text-haz-high">{altError}</p>}
            {alts && <Alternatives a={alts} onTarget={setTarget} />}
            {!alts && !altLoading && <p className="text-xs text-bone-muted">The search checks every 100 m cell within 3 km for this date and returns the nearest ones that meet
              all requirements, including favorable ground. The first search for a new date takes up to about 30 seconds.</p>}
          </div>
        </section>
      )}
    </div>
  );
}
