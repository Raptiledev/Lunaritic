"use client";
import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VisibilityResponse } from "@/types/api";

/** Body elevation against the terrain horizon in the body's own direction: the body is visible while its line is above the grey. */
export default function ElevationChart({ r, body }: { r: VisibilityResponse; body: "sun" | "earth" }) {
  const s = r.series, n = s.times_utc.length, stride = Math.max(1, Math.ceil(n / 900));
  const el = body === "sun" ? s.sun_elevation_deg : s.earth_elevation_deg;
  const hz = body === "sun" ? s.sun_horizon_deg : s.earth_horizon_deg;
  const color = body === "sun" ? "#ffb547" : "#5aaeff";
  const rows = [];
  for (let i = 0; i < n; i += stride) rows.push({ t: Date.parse(s.times_utc[i]), el: el[i], hz: hz[i] });
  const lo = Math.floor(Math.min(...rows.map((d) => Math.min(d.el, d.hz))) - 0.5);
  const hi = Math.ceil(Math.max(...rows.map((d) => Math.max(d.el, d.hz))) + 0.5);

  return (
    <div className="h-48 w-full" role="img" aria-label={`${body} elevation versus terrain horizon over the mission window`}>
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 6, right: 6, bottom: 0, left: -10 }}>
          <CartesianGrid stroke="#1c2230" vertical={false} />
          <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} stroke="#6c6a64" fontSize={10} tickLine={false}
            tickFormatter={(v) => new Date(v).toISOString().slice(5, 10)} />
          <YAxis domain={[lo, hi]} stroke="#6c6a64" fontSize={10} unit="°" tickLine={false} allowDataOverflow />
          <Tooltip contentStyle={{ background: "#0a0d13", border: "1px solid #2a3140", fontSize: 11, fontFamily: "monospace" }}
            labelFormatter={(v) => new Date(Number(v)).toISOString().slice(0, 16).replace("T", " ") + " UTC"}
            formatter={(v: number, k: string) => [`${Number(v).toFixed(2)}°`, k === "el" ? (body === "sun" ? "Sun elevation" : "Earth elevation") : "Terrain horizon in that direction"]} />
          <Area dataKey="hz" baseValue={lo} stroke="#a19d93" strokeWidth={1} fill="#1c2230" fillOpacity={1} isAnimationActive={false} />
          <Line dataKey="el" stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
