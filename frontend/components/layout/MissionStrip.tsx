"use client";
import Link from "next/link";
import { useMission } from "@/context/mission";

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="eyebrow">{label}</span>
      <span className="text-xs text-bone">{children}</span>
    </span>
  );
}

export default function MissionStrip() {
  const { mission: m } = useMission();
  const hasTarget = m.latitude !== "" && m.longitude !== "";
  return (
    <div className="border-t border-night-800/80 bg-night-900/50">
      <div className="no-scrollbar mx-auto flex w-full max-w-[96rem] items-center gap-6 overflow-x-auto px-4 py-1.5 lg:px-6">
        <span className="hidden h-1 w-1 shrink-0 rounded-full bg-sun/80 sm:inline-block" aria-hidden />
        <Item label="Mission">{m.name || <span className="text-bone-faint">Unnamed</span>}</Item>
        <Item label="Target">
          {hasTarget ? (
            <span className="num">
              {Number(m.latitude).toFixed(4)}°, {Number(m.longitude).toFixed(3)}°E
              {m.siteId ? ` · ${m.siteId}` : ""}
            </span>
          ) : (
            <span className="text-bone-faint">Not set · pick a point in Explorer</span>
          )}
        </Item>
        <Item label="Window">
          {m.date && m.time ? (
            <span className="num">
              {m.date} {m.time} UTC + {m.durationDays || "?"} d
            </span>
          ) : (
            <span className="text-bone-faint">Not set</span>
          )}
        </Item>
        <Link
          href="/dashboard"
          className="ml-auto shrink-0 text-[11px] text-bone-muted transition-colors hover:text-bone"
        >
          Edit mission
        </Link>
      </div>
    </div>
  );
}
