"use client";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { CalendarDay, Requirements } from "@/types/api";

const SUN = "#ffb547", EARTH = "#5aaeff", GRID = "#1c2230", AXIS = "#6c6a64";
const tick = { fill: AXIS, fontSize: 10, fontFamily: "var(--font-mono, monospace)" };
const short = (iso: string) => iso.slice(5, 10);

/** Sunlight and Earth share, and longest darkness, against landing date, with the requirement lines. */
export default function TrendChart({ days, req, planned, selected }: { days: CalendarDay[]; req: Requirements; planned: number; selected: number }) {
  const data = days.map((d) => ({ t: short(d.start_utc), sun: +(d.sun_lit * 100).toFixed(1), earth: +(d.earth_view * 100).toFixed(1), dark: d.sun_dark_h }));
  const common = { margin: { top: 8, right: 12, bottom: 0, left: -12 } };
  const marks = [
    <ReferenceLine key="p" x={data[planned]?.t} stroke="#ece7dc" strokeDasharray="2 3" />,
    <ReferenceLine key="s" x={data[selected]?.t} stroke="#ece7dc" />,
  ];
  return (
    <div className="space-y-4">
      <div>
        <div className="mb-1 flex gap-4 text-[11px] text-bone-muted">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-3" style={{ background: SUN }} />Sunlight % of window</span>
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-3" style={{ background: EARTH }} />Earth in view %</span>
          <span className="text-bone-faint">dashed: your minimums</span>
        </div>
        <div className="h-44">
          <ResponsiveContainer>
            <LineChart data={data} {...common}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="t" tick={tick} interval={13} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis domain={[0, 100]} tick={tick} tickLine={false} axisLine={false} unit="%" />
              <Tooltip contentStyle={{ background: "#0b0e14", border: "1px solid #232a3a", fontSize: 11 }} labelStyle={{ color: "#ece7dc" }} />
              <ReferenceLine y={req.minSunPct} stroke={SUN} strokeDasharray="4 4" strokeOpacity={0.7} />
              <ReferenceLine y={req.minEarthPct} stroke={EARTH} strokeDasharray="4 4" strokeOpacity={0.7} />
              {marks}
              <Line dataKey="sun" name="Sunlight %" stroke={SUN} dot={false} strokeWidth={1.6} isAnimationActive={false} />
              <Line dataKey="earth" name="Earth %" stroke={EARTH} dot={false} strokeWidth={1.6} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div>
        <div className="mb-1 flex gap-4 text-[11px] text-bone-muted">
          <span className="flex items-center gap-1.5"><i className="h-0.5 w-3" style={{ background: SUN, opacity: 0.6 }} />Longest darkness, hours</span>
          <span className="text-bone-faint">dashed: your maximum</span>
        </div>
        <div className="h-32">
          <ResponsiveContainer>
            <LineChart data={data} {...common}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="t" tick={tick} interval={13} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={tick} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#0b0e14", border: "1px solid #232a3a", fontSize: 11 }} labelStyle={{ color: "#ece7dc" }} />
              <ReferenceLine y={req.maxDarkH} stroke={SUN} strokeDasharray="4 4" strokeOpacity={0.7} />
              {marks}
              <Line dataKey="dark" name="Longest dark (h)" stroke={SUN} strokeOpacity={0.6} dot={false} strokeWidth={1.6} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
