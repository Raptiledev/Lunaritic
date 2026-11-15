import Link from "next/link";
import { ArrowRight, Compass, Globe2, ShieldCheck } from "lucide-react";
import { Glyph } from "@/components/layout/Shell";
import HeroMoon from "@/components/layout/HeroMoon";

const PILLARS = [
  {
    icon: Globe2,
    title: "Real LOLA terrain",
    body: "5 m polar DEM geometry — never a stand-in map. Hazard classes mirror the same grids the backend computes.",
  },
  {
    icon: Compass,
    title: "Sun & Earth horizons",
    body: "SPICE ephemerides against the local terrain rim. Amber for Sun, blue for Earth — colour that means something.",
  },
  {
    icon: ShieldCheck,
    title: "Explainable scores",
    body: "Hard gates first, then transparent weighted factors. Every number can be traced back to method and data.",
  },
] as const;

export default function Landing() {
  return (
    <div className="relative overflow-x-hidden">
      <div
        className="pointer-events-none absolute left-1/2 top-[-18%] h-[70vh] w-[120vw] -translate-x-1/2 rounded-[50%]
          bg-[radial-gradient(closest-side,rgba(236,231,220,0.11),rgba(255,181,71,0.03)_45%,transparent_70%)]"
        aria-hidden
      />

      <section className="relative mx-auto grid min-h-[calc(100vh-8.5rem)] max-w-7xl items-center gap-10 px-5 py-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-6 lg:py-16">
        <div className="stagger order-2 max-w-xl lg:order-1">
          <div className="flex items-center gap-3">
            <Glyph size={34} />
            <p className="eyebrow text-bone-muted">Team Alpha 8 · NASA Space Apps 2026</p>
          </div>

          <h1 className="mt-6 font-display text-[clamp(2.85rem,7.5vw,5.1rem)] font-semibold leading-[0.94] tracking-tightish text-bone">
            LUNARIS
          </h1>

          <p className="mt-5 text-lg leading-snug text-bone sm:text-xl">
            Where the Sun skims the horizon, metres decide everything.
          </p>

          <p className="mt-4 text-sm leading-relaxed text-bone-muted sm:text-[15px]">
            Terrain-aware sunlight and direct-to-Earth visibility for polar landing candidates —
            NASA LOLA geometry, JPL ephemerides, explainable scores.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/dashboard" className="btn btn-primary px-4 py-2 text-sm">
              Open mission console
              <ArrowRight size={15} aria-hidden />
            </Link>
            <Link href="/methodology" className="btn px-4 py-2 text-sm">
              Data & method
            </Link>
            <Link href="/view3d" className="btn px-4 py-2 text-sm">
              Full Moon 3D
            </Link>
          </div>

          <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-night-700/80 pt-5">
            {[
              ["Site01", "LOLA 5 m tile"],
              ["~0.00001°", "Horizons check"],
              ["Explainable", "scoring gates"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="num text-sm text-bone sm:text-base">{k}</dt>
                <dd className="mt-1 text-[11px] text-bone-faint">{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="order-1 animate-fade-in lg:order-2">
          <HeroMoon />
        </div>
      </section>

      <section className="relative border-t border-night-800/80 bg-night-900/35">
        <div className="mx-auto grid max-w-7xl gap-4 px-5 py-12 sm:grid-cols-3 sm:py-14">
          {PILLARS.map(({ icon: Icon, title, body }, i) => (
            <article
              key={title}
              className="panel p-5 transition-shadow duration-300 hover:shadow-panel-hover animate-fade-up"
              style={{ animationDelay: `${120 + i * 90}ms` }}
            >
              <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-night-700 bg-night-950/70 text-bone">
                <Icon size={16} aria-hidden />
              </div>
              <h2 className="font-display text-sm font-semibold tracking-tight text-bone">{title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-bone-muted">{body}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
