"use client";
import type { CalendarDay, Requirements } from "@/types/api";
import { CHECK_LABEL, STATUS, failures, pct, statusOf } from "./planner";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** One small month grid per calendar month, each landing day coloured by how many requirements it fails. */
export default function LandingCalendar({ days, req, planned, selected, onSelect }: {
  days: CalendarDay[]; req: Requirements; planned: number; selected: number; onSelect: (i: number) => void;
}) {
  const months: { key: string; title: string; lead: number; cells: (number | null)[] }[] = [];
  days.forEach((d, i) => {
    const t = new Date(d.start_utc), key = `${t.getUTCFullYear()}-${t.getUTCMonth()}`;
    let m = months.find((x) => x.key === key);
    if (!m) {
      const first = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1));
      m = { key, title: t.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }), lead: (first.getUTCDay() + 6) % 7,
        cells: Array(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()).fill(null) };
      months.push(m);
    }
    m.cells[t.getUTCDate() - 1] = i;
  });

  return (
    <div>
      <div className="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(12rem,15rem))]">
        {months.map((m) => (
          <div key={m.key}>
            <div className="mb-2 text-xs text-bone">{m.title}</div>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((w) => <span key={w} className="text-[10px] text-bone-faint">{w}</span>)}
              {Array.from({ length: m.lead }, (_, k) => <span key={`l${k}`} />)}
              {m.cells.map((i, k) => {
                if (i == null) return <span key={k} className="num grid aspect-square place-items-center rounded text-[10px] text-night-600">{k + 1}</span>;
                const f = failures(days[i], req), s = statusOf(f.length);
                const tip = `${days[i].start_utc.slice(0, 10)}: sunlight ${pct(days[i].sun_lit)}, longest dark ${days[i].sun_dark_h} h, Earth ${pct(days[i].earth_view)}` +
                  (f.length ? ` · fails ${f.map((c) => CHECK_LABEL[c].toLowerCase()).join(", ")}` : " · meets all");
                return (
                  <button key={k} title={tip} onClick={() => onSelect(i)} aria-pressed={selected === i}
                    className={`num relative grid aspect-square place-items-center rounded text-[11px] font-medium text-night-950 transition hover:brightness-110
                      ${selected === i ? "ring-2 ring-bone ring-offset-2 ring-offset-night-900" : ""}`}
                    style={{ background: s.color, opacity: f.length ? 0.85 : 1 }}>
                    {k + 1}
                    {i === planned && <span className="absolute -top-1 right-0 h-2 w-2 rounded-full border border-night-950 bg-bone" aria-label="planned date" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-bone-muted">
        {STATUS.map((s) => <span key={s.id} className="flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.label}</span>)}
        <span className="flex items-center gap-1.5"><i className="h-2 w-2 rounded-full bg-bone" />Planned landing date</span>
      </div>
    </div>
  );
}
