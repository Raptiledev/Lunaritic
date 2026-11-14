import { useEffect, useState } from "react";
import type { CalendarDay, Requirements } from "@/types/api";

export const DEFAULT_REQUIREMENTS: Requirements = { minSunPct: 70, maxDarkH: 48, minEarthPct: 20, minFavorablePct: 80 };
const KEY = "lunaris.requirements.v1";

export function useRequirements() {
  const [req, setReq] = useState<Requirements>(DEFAULT_REQUIREMENTS);
  useEffect(() => {
    try { const raw = localStorage.getItem(KEY); if (raw) setReq({ ...DEFAULT_REQUIREMENTS, ...JSON.parse(raw) }); } catch { /* unavailable storage */ }
  }, []);
  const update = (p: Partial<Requirements>) => {
    const next = { ...req, ...p };
    setReq(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or disabled */ }
  };
  return { req, update, reset: () => update(DEFAULT_REQUIREMENTS) };
}

export type Check = "sunlight" | "darkness" | "earth";
export const CHECK_LABEL: Record<Check, string> = { sunlight: "Sunlight", darkness: "Darkness", earth: "Earth" };

/** Requirements a landing day fails. Terrain does not depend on the date, so it is checked separately. */
export function failures(d: CalendarDay, r: Requirements): Check[] {
  const f: Check[] = [];
  if (d.sun_lit * 100 < r.minSunPct) f.push("sunlight");
  if (d.sun_dark_h > r.maxDarkH) f.push("darkness");
  if (d.earth_view * 100 < r.minEarthPct) f.push("earth");
  return f;
}

export const STATUS = [
  { id: "go", label: "Meets all requirements", color: "#6fd6a0" },
  { id: "one", label: "Fails one", color: "#f2a93b" },
  { id: "many", label: "Fails two or more", color: "#f07178" },
] as const;
export const statusOf = (n: number) => STATUS[Math.min(n, 2)];

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
export const compass = (deg: number) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
export const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 1 : 0)}%`;
export const dayLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
