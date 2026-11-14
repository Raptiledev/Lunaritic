"use client";
import { createContext, useContext, useState } from "react";
import { api } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { missionStartIso, useMission } from "@/context/mission";
import { validate } from "@/components/dashboard/MissionForm";
import { normLon, outsideMessage, siteFraction } from "@/utils/geo";
import type { MissionConfig, SiteInfo, VisibilityResponse } from "@/types/api";

export const DEFAULT_OBSERVER_HEIGHT_M = 2;

interface Ctx {
  result: VisibilityResponse | null; fresh: boolean; loading: boolean; error: string | null;
  site: SiteInfo | null; problems: string[]; observerHeight: number; run: () => Promise<boolean>;
}
const AnalysisContext = createContext<Ctx | null>(null);

const keyOf = (m: MissionConfig) => JSON.stringify([m.latitude, m.longitude, m.date, m.time, m.durationDays, m.heightM]);

export function AnalysisProvider({ children }: { children: React.ReactNode }) {
  const { mission: m } = useMission();
  const { data: sites } = useApi(api.sites);
  const [state, setState] = useState<{ result: VisibilityResponse | null; key: string | null; loading: boolean; error: string | null }>(
    { result: null, key: null, loading: false, error: null });

  const lat = Number(m.latitude), lon = normLon(Number(m.longitude));
  const siteList = sites?.sites;
  const site = (siteList ?? []).find((s) => m.latitude !== "" && m.longitude !== "" && siteFraction(s, lat, lon)) ?? null;
  const problems = Object.values(validate(m));
  // Wait until /terrain/sites has answered before calling a missing tile an out-of-bounds error.
  if (!problems.length && siteList && !site) problems.push(outsideMessage(siteList, lat, lon));
  const observerHeight = m.heightM !== "" ? Number(m.heightM) : DEFAULT_OBSERVER_HEIGHT_M;

  async function run(): Promise<boolean> {
    if (problems.length || !site) return false;
    const key = keyOf(m), start = missionStartIso(m)!, days = Number(m.durationDays);
    const stop = new Date(Date.parse(start) + days * 86400e3).toISOString();
    const step = Math.max(10, Math.ceil((days * 1440) / 3000));
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const result = await api.visibility(site.site_id, lat, lon, start, stop, observerHeight, step);
      setState({ result, key, loading: false, error: null });
      return true;
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Analysis failed" }));
      return false;
    }
  }

  return (
    <AnalysisContext.Provider value={{ result: state.result, fresh: state.result != null && state.key === keyOf(m), loading: state.loading,
      error: state.error, site, problems, observerHeight, run }}>
      {children}
    </AnalysisContext.Provider>
  );
}

export function useAnalysis(): Ctx {
  const c = useContext(AnalysisContext);
  if (!c) throw new Error("useAnalysis must be used inside AnalysisProvider");
  return c;
}

/** "3 d 4 h", "5 h 20 min", "40 min". */
export function fmtDuration(hours: number | null | undefined): string {
  if (hours == null) return "—";
  const mins = Math.round(hours * 60);
  if (mins < 60) return `${mins} min`;
  const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), mm = mins % 60;
  return d ? `${d} d ${h} h` : `${h} h${mm ? ` ${mm} min` : ""}`;
}
