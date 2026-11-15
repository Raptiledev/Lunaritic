"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import Link from "next/link";
import DemLoader from "@/components/layout/DemLoader";
import { api } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { missionStartIso, useMission } from "@/context/mission";
import { useAnalysis } from "@/context/analysis";

const Terrain3D = dynamic(() => import("@/components/view3d/Terrain3D"), { ssr: false, loading: () => <p className="text-sm text-bone-muted">Loading the 3D view…</p> });
const MoonGlobe = dynamic(() => import("@/components/view3d/MoonGlobe"), { ssr: false, loading: () => <p className="text-sm text-bone-muted">Loading the Moon globe…</p> });

type Mode = "globe" | "site";

export default function View3DPage() {
  const { data, error, loading } = useApi(api.sites);
  const { mission } = useMission();
  const a = useAnalysis();
  const site = data?.sites[0];
  const [mode, setMode] = useState<Mode>("globe");
  const [sun, setSun] = useState<{ az: number; el: number } | null>(null);
  const start = missionStartIso(mission);
  const lat = Number(mission.latitude), lon = Number(mission.longitude);
  const hasTarget = Number.isFinite(lat) && Number.isFinite(lon) && mission.latitude !== "" && mission.longitude !== "";

  useEffect(() => {
    if (!hasTarget || !start) { setSun(null); return; }
    const stop = new Date(Date.parse(start) + 60e3).toISOString();
    const h = (a.site ? a.result?.ground_elevation_m : null) ?? 0;
    api.ephemeris(lat, lon, h + a.observerHeight, start, stop, 60)
      .then((r) => {
        const s = r.tracks.find((t) => t.body === "sun");
        if (s) setSun({ az: s.azimuth_deg[0], el: s.elevation_deg[0] });
      })
      .catch(() => setSun(null));
  }, [hasTarget, start, lat, lon, a.observerHeight, a.site, a.result?.ground_elevation_m]);

  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">See the Moon, then the ridge</h1>
        <p className="mt-2 text-sm leading-relaxed text-bone-muted">
          Whole Moon shows the entire Moon using NASA&apos;s real photo map, so you can see where the landing area sits near the south pole.
          Switch to Site01 close-up for that area in detail, built from NASA&apos;s 5 m terrain data.
        </p>
      </div>

      <div className="seg" role="tablist" aria-label="3D view">
        <button type="button" role="tab" aria-selected={mode === "globe"} className="seg-item" onClick={() => setMode("globe")}>Whole Moon</button>
        <button type="button" role="tab" aria-selected={mode === "site"} className="seg-item" onClick={() => setMode("site")}>Site01 close-up</button>
      </div>

      {loading && (
        <div className="panel relative min-h-[28rem] overflow-hidden" aria-busy="true">
          <DemLoader title="Loading the terrain data" detail="The Site01 terrain is downloading from NASA. The 3D view opens when it is ready." />
        </div>
      )}
      {error && <p className="panel p-4 text-sm text-haz-high">{error}</p>}
      {!loading && !site && <p className="panel p-4 text-sm text-bone-muted">No terrain data loaded. Put the Site01 GeoTIFF files in <span className="num">backend/app/data/dem/</span>.</p>}
      {site && mode === "globe" && (
        <MoonGlobe site={site} target={hasTarget ? { lat, lon } : null} />
      )}
      {site && mode === "site" && (
        <Terrain3D site={site} target={hasTarget ? { lat, lon } : null} sun={sun} />
      )}
      {site && (
        <p className="text-[11px] text-bone-faint">
          {mode === "site" && (sun
            ? <>Sun at mission start: direction <span className="num text-sun">{sun.az.toFixed(1)}°</span>, height <span className="num text-sun">{sun.el.toFixed(2)}°</span> above the horizon. </>
            : <>Set a mission target and date to light this view from the real Sun position. </>)}
          <Link href="/explorer" className="link">2D Explorer</Link>
          {" · "}
          <Link href="/dashboard" className="link">Edit mission</Link>
        </p>
      )}
    </div>
  );
}
