"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export const MAX_COMPARE_POINTS = 6;

export type CompareDraft = { id: string; name: string; latitude: string; longitude: string };
export type SendResult = "added" | "duplicate" | "full";

const KEY = "lunaris.compare.v1";

export const DEFAULT_DRAFTS: CompareDraft[] = [
  { id: "mission", name: "Mission target", latitude: "", longitude: "" },
  { id: "alt-a", name: "Alt A", latitude: "", longitude: "" },
];

function lonClose(a: number, b: number): boolean {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d) < 1e-3;
}

function samePoint(d: CompareDraft, latitude: string, longitude: string): boolean {
  const lat = Number(d.latitude), lon = Number(d.longitude);
  return d.latitude !== "" && d.longitude !== ""
    && Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat - Number(latitude)) < 1e-4
    && lonClose(lon, Number(longitude));
}

function isBlank(d: CompareDraft): boolean {
  return d.latitude.trim() === "" || d.longitude.trim() === "";
}

function parseStored(raw: string | null): CompareDraft[] | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_COMPARE_POINTS) return null;
  const drafts = parsed.filter((d): d is CompareDraft =>
    !!d && typeof d === "object"
    && typeof (d as CompareDraft).id === "string"
    && typeof (d as CompareDraft).name === "string"
    && typeof (d as CompareDraft).latitude === "string"
    && typeof (d as CompareDraft).longitude === "string");
  return drafts.length === parsed.length ? drafts : null;
}

interface Ctx {
  drafts: CompareDraft[];
  hydrated: boolean;
  stored: boolean;
  setDrafts: (next: CompareDraft[] | ((prev: CompareDraft[]) => CompareDraft[])) => void;
  addPoint: (point: { name: string; latitude: string; longitude: string }) => SendResult;
}

const CompareListContext = createContext<Ctx | null>(null);

export function CompareListProvider({ children }: { children: React.ReactNode }) {
  const [drafts, setDraftsState] = useState<CompareDraft[]>(DEFAULT_DRAFTS);
  const draftsRef = useRef(drafts);
  const [hydrated, setHydrated] = useState(false);
  const [stored, setStored] = useState(false);
  draftsRef.current = drafts;

  useEffect(() => {
    try {
      const saved = parseStored(localStorage.getItem(KEY));
      if (saved && saved.some((d) => d.latitude.trim() !== "" && d.longitude.trim() !== "")) {
        setDraftsState(saved);
        draftsRef.current = saved;
        setStored(true);
      }
    } catch { /* corrupt or unavailable storage: keep the two empty rows */ }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try { localStorage.setItem(KEY, JSON.stringify(drafts)); } catch { /* storage full or disabled */ }
  }, [drafts, hydrated]);

  const setDrafts = useCallback<Ctx["setDrafts"]>((next) => {
    setDraftsState((prev) => {
      const resolved = typeof next === "function" ? next(prev) : next;
      draftsRef.current = resolved;
      return resolved;
    });
  }, []);

  const addPoint: Ctx["addPoint"] = (point) => {
    const prev = draftsRef.current;
    if (prev.some((d) => samePoint(d, point.latitude, point.longitude))) return "duplicate";
    const blank = prev.find(isBlank);
    let next: CompareDraft[];
    if (blank) {
      const keepName = blank.name.trim() !== "" && blank.name !== "Mission target" && !/^Alt( \d+)?$/.test(blank.name);
      next = prev.map((d) => d.id === blank.id
        ? { ...d, name: keepName ? d.name : point.name, latitude: point.latitude, longitude: point.longitude }
        : d);
    } else if (prev.length >= MAX_COMPARE_POINTS) {
      return "full";
    } else {
      next = [...prev, { id: Math.random().toString(36).slice(2, 9), name: point.name, latitude: point.latitude, longitude: point.longitude }];
    }
    draftsRef.current = next;
    setDraftsState(next);
    return "added";
  };

  return (
    <CompareListContext.Provider value={{ drafts, hydrated, stored, setDrafts, addPoint }}>
      {children}
    </CompareListContext.Provider>
  );
}

export function useCompareList(): Ctx {
  const c = useContext(CompareListContext);
  if (!c) throw new Error("useCompareList must be used inside CompareListProvider");
  return c;
}
