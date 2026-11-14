"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Glyph({ size = 26, animated = true }: { size?: number; animated?: boolean }) {
  // Moon limb cut by a horizon, with the Sun (amber) and Earth (blue) grazing it: the polar problem in one mark.
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="9.5" fill="none" stroke="#efe9dc" strokeWidth="1.25" opacity="0.92" />
      <path
        d="M2.5 14.2 L7 12.6 L10 13.6 L14 11.4 L17.5 13 L21.5 12.2"
        fill="none"
        stroke="#efe9dc"
        strokeWidth="1.3"
        strokeLinejoin="round"
        strokeDasharray="48"
        className={animated ? "animate-horizon-draw" : undefined}
      />
      <circle cx="6.4" cy="10.4" r="1.7" fill="#ffb547" className={animated ? "animate-pulse-soft" : undefined} style={{ transformOrigin: "6.4px 10.4px" }} />
      <circle cx="17.6" cy="9.6" r="1.3" fill="#5aaeff" />
    </svg>
  );
}

const NAV = [
  { href: "/explorer", label: "Explorer" },
  { href: "/dashboard", label: "Dashboard" },
] as const;

function UtcClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  return (
    <span className="num hidden text-[11px] text-bone-muted xl:inline">
      {now.toISOString().slice(0, 19).replace("T", " ")} <span className="text-bone-faint">UTC</span>
    </span>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-night-700/80 bg-night-950/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-[96rem] items-center gap-3 px-4 lg:gap-4 lg:px-6">
          <Link href="/" className="group flex shrink-0 items-center gap-2.5">
            <Glyph />
            <span className="font-display text-[13px] font-semibold tracking-brand text-bone transition-colors group-hover:text-white">
              LUNARIS
            </span>
          </Link>

          <nav aria-label="Main" className="ml-1 flex items-center gap-0.5 sm:ml-3 sm:gap-1">
            {NAV.map(({ href, label }) => {
              const active = pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-2.5 py-1.5 text-xs font-medium tracking-wide transition-colors sm:px-3 ${
                    active
                      ? "bg-night-800 text-bone"
                      : "text-bone-muted hover:bg-night-900 hover:text-bone"
                  }`}
                >
                  {label}
                </Link>
              );
            })}
          </nav>

          <div className="flex-1" />
          <UtcClock />
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-night-800/80">
        <div className="mx-auto flex w-full max-w-[96rem] flex-col items-center justify-between gap-2 px-4 py-4 text-[11px] text-bone-faint sm:flex-row lg:px-6">
          <span className="font-display tracking-brand text-bone/70">LUNARIS</span>
          <span className="text-center">Team Alpha 8 · NASA Space Apps Challenge 2026 · Lunar Landing Site Navigator</span>
          <span>Not an official NASA tool</span>
        </div>
      </footer>
    </div>
  );
}
