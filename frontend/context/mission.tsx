"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { MissionConfig } from "@/types/api";

export const EMPTY_MISSION: MissionConfig = { name: "", latitude: "", longitude: "", date: "", time: "", durationDays: "14", heightM: "" };
const KEY = "lunaris.mission.v1";

interface Ctx { mission: MissionConfig; setMission: (m: MissionConfig) => void; update: (p: Partial<MissionConfig>) => void }
const MissionContext = createContext<Ctx | null>(null);

export function MissionProvider({ children }: { children: React.ReactNode }) {
  const [mission, setState] = useState<MissionConfig>(EMPTY_MISSION);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...EMPTY_MISSION, ...JSON.parse(raw) });
    } catch { /* corrupt or unavailable storage: start empty */ }
  }, []);

  const setMission = (m: MissionConfig) => {
    setState(m);
    try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage full or disabled */ }
  };
  return (
    <MissionContext.Provider value={{ mission, setMission, update: (p) => setMission({ ...mission, ...p }) }}>
      {children}
    </MissionContext.Provider>
  );
}

export function useMission(): Ctx {
  const c = useContext(MissionContext);
  if (!c) throw new Error("useMission must be used inside MissionProvider");
  return c;
}

/** Mission start as an ISO UTC string, or null when date/time are not both set. */
export function missionStartIso(m: MissionConfig): string | null {
  return m.date && m.time ? `${m.date}T${m.time}:00Z` : null;
}
