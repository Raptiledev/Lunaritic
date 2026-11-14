"use client";
import { Check, X } from "lucide-react";
import type { AlternativeCell, AlternativesResponse } from "@/types/api";
import { compass, pct } from "./planner";
import { fmtDuration } from "@/context/analysis";

const Mark = ({ ok }: { ok: boolean }) => ok
  ? <Check size={12} className="inline text-haz-ok" aria-label="meets" />
  : <X size={12} className="inline text-haz-high" aria-label="fails" />;

function Row({ c, label, onTarget }: { c: AlternativeCell; label: React.ReactNode; onTarget?: () => void }) {
  return (
    <tr className="border-t border-night-800 [&>td]:px-3 [&>td]:py-2">
      <td className="font-sans text-bone">{label}</td>
      <td><span className="text-sun">{pct(c.sun_lit)}</span> <Mark ok={c.passes.sunlight} /></td>
      <td>{fmtDuration(c.sun_dark_h)} <Mark ok={c.passes.darkness} /></td>
      <td><span className="text-earth">{pct(c.earth_view)}</span> <Mark ok={c.passes.earth} /></td>
      <td>{pct(c.favorable_share)} <span className="text-bone-faint">· {c.slope_p95_deg.toFixed(1)}°</span> <Mark ok={c.passes.terrain} /></td>
      <td className="text-right">{onTarget && <button className="btn px-2 py-1 text-[11px]" onClick={onTarget}>Set as target</button>}</td>
    </tr>
  );
}

export default function Alternatives({ a, onTarget }: { a: AlternativesResponse; onTarget: (c: AlternativeCell) => void }) {
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="num w-full min-w-[640px] text-xs">
          <thead className="text-left text-bone-faint">
            <tr className="[&>th]:px-3 [&>th]:py-2 [&>th]:font-normal">
              <th>Place</th><th>Sunlight</th><th>Longest dark</th><th>Earth</th><th>Favorable · slope p95</th><th />
            </tr>
          </thead>
          <tbody>
            <Row c={a.target} label="Your target (exact)" />
            {a.alternatives.map((c, k) => (
              <Row key={k} c={c} onTarget={() => onTarget(c)}
                label={<>{c.distance_m < 1000 ? `${Math.round(c.distance_m / 10) * 10} m` : `${(c.distance_m / 1000).toFixed(1)} km`}{" "}
                  <span className="text-bone-muted">{compass(c.bearing_true_deg)}</span></>} />
            ))}
          </tbody>
        </table>
      </div>
      {a.alternatives.length === 0 && (
        <p className="text-xs text-bone-muted">No 100 m cell within {a.radius_m / 1000} km meets every requirement for this window
          ({a.cells_passing_in_tile} in the whole tile). Try another date or relax a requirement.</p>
      )}
      <p className="text-[11px] text-bone-faint">
        {a.cells_passing_in_tile} cells in the whole tile meet every requirement for this window. Directions are lunar compass
        directions from your target; near the south pole, north simply means directly away from the pole.
      </p>
      {a.notes.map((n) => <p key={n} className="text-[11px] text-bone-faint">{n}</p>)}
    </div>
  );
}
