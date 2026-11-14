import { useEffect, useMemo, useState } from "react";
import type { ScoreWeights } from "@/types/api";

export const DEFAULT_WEIGHTS: ScoreWeights = { sunlight: 35, darkness: 25, earth: 20, terrain: 20 };
const KEY = "lunaris.weights.v1";

export const FACTOR_META: { id: keyof ScoreWeights; label: string; tone: string; hint: string }[] = [
  { id: "sunlight", label: "Sunlight", tone: "text-sun", hint: "Share of the window with some of the Sun above the terrain." },
  { id: "darkness", label: "Darkness", tone: "text-sun", hint: "Score = 1 − longest darkness / mission length." },
  { id: "earth", label: "Earth", tone: "text-earth", hint: "Share of the window with Earth's centre above the terrain." },
  { id: "terrain", label: "Terrain", tone: "text-bone", hint: "Favorable share within 100 m (illustrative thresholds)." },
];

export function useWeights() {
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setWeights({ ...DEFAULT_WEIGHTS, ...JSON.parse(raw) });
    } catch { /* unavailable storage */ }
  }, []);
  const update = (p: Partial<ScoreWeights>) => {
    setWeights((prev) => {
      const next = { ...prev, ...p };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage full or disabled */ }
      return next;
    });
  };
  const total = Math.max(0.0001, Object.values(weights).reduce((a, b) => a + Math.max(0, b), 0));
  const normalised = useMemo<ScoreWeights>(() => ({
    sunlight: Math.max(0, weights.sunlight) / total,
    darkness: Math.max(0, weights.darkness) / total,
    earth: Math.max(0, weights.earth) / total,
    terrain: Math.max(0, weights.terrain) / total,
  }), [weights, total]);
  return { weights, normalised, update, reset: () => update(DEFAULT_WEIGHTS), total };
}

export const pct = (v: number) => `${(v * 100).toFixed(v > 0 && v < 0.01 ? 1 : 0)}%`;
export const scorePct = (v: number) => `${(v * 100).toFixed(0)}`;
