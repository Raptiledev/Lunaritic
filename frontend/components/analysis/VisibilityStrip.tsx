"use client";
import { useState } from "react";
import type { VisibilityResponse } from "@/types/api";

const ROWS = [
  { id: "sun", label: "Sun", color: "#ffb547" },
  { id: "earth", label: "Earth", color: "#5aaeff" },
  { id: "both", label: "Both", color: "#ece7dc" },
] as const;

/** One column per time step. Sun opacity = share of the solar disk above the terrain; Earth = centre above the terrain. */
export default function VisibilityStrip({ r }: { r: VisibilityResponse }) {
  const s = r.series, n = s.times_utc.length;
  const [hover, setHover] = useState<number | null>(null);
  const sunA = (i: number) => s.sun_visible_fraction[i];
  const earthA = (i: number) => (s.earth_visible_fraction[i] >= 0.5 ? 1 : s.earth_visible_fraction[i] > 0 ? 0.3 : 0);
  const bothA = (i: number) => (s.sun_visible_fraction[i] > 0 && s.earth_visible_fraction[i] >= 0.5 ? 1 : 0);
  const alpha = { sun: sunA, earth: earthA, both: bothA };
  const t0 = Date.parse(s.times_utc[0]), t1 = Date.parse(s.times_utc[n - 1]);
  const days: number[] = [];
  for (let d = Math.ceil(t0 / 86400e3) * 86400e3; d <= t1; d += 86400e3) days.push(d);
  const every = Math.max(1, Math.ceil(days.length / 10));
  const xOf = (t: number) => ((t - t0) / Math.max(t1 - t0, 1)) * 100;

  function onMove(e: React.MouseEvent<HTMLDivElement>) {
    const b = e.currentTarget.getBoundingClientRect();
    setHover(Math.min(n - 1, Math.max(0, Math.round(((e.clientX - b.left) / b.width) * (n - 1)))));
  }

  return (
    <div>
      <div className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1.5">
        {ROWS.map((row) => (
          <div key={row.id} className="contents">
            <span className="self-center text-[11px] text-bone-muted">{row.label}</span>
            <div className="relative h-6 overflow-hidden rounded-sm bg-night-950" onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
              <svg viewBox={`0 0 ${n} 1`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" shapeRendering="crispEdges" aria-hidden>
                {Array.from({ length: n }, (_, i) => {
                  const a = alpha[row.id](i);
                  return a > 0 ? <rect key={i} x={i} y={0} width={1.02} height={1} fill={row.color} fillOpacity={a} /> : null;
                })}
              </svg>
              {hover != null && <span className="pointer-events-none absolute inset-y-0 w-px bg-bone" style={{ left: `${(hover / (n - 1)) * 100}%` }} />}
            </div>
          </div>
        ))}
        <span />
        <div className="relative h-4">
          {days.map((d, k) => k % every === 0 && (
            <span key={d} className="num absolute -translate-x-1/2 text-[10px] text-bone-faint" style={{ left: `${xOf(d)}%` }}>
              {new Date(d).toISOString().slice(5, 10)}
            </span>
          ))}
        </div>
      </div>
      <p className="num mt-2 h-4 text-[11px] text-bone-muted">
        {hover == null ? "Hover the bars to read a moment." : (
          <>{s.times_utc[hover].replace("T", " ").replace("Z", " UTC")} · Sun el {s.sun_elevation_deg[hover].toFixed(2)}° vs terrain {s.sun_horizon_deg[hover].toFixed(2)}°
            ({(s.sun_visible_fraction[hover] * 100).toFixed(0)}% of disk) · Earth el {s.earth_elevation_deg[hover].toFixed(2)}° vs terrain {s.earth_horizon_deg[hover].toFixed(2)}°</>
        )}
      </p>
    </div>
  );
}
