"use client";
import Link from "next/link";
import TerrainViewer from "@/components/explorer/TerrainViewer";
import DemLoader from "@/components/layout/DemLoader";
import { api } from "@/services/api";
import { useApi } from "@/hooks/useApi";

export default function Explorer() {
  const { data, error, loading } = useApi(api.sites);
  const site = data?.sites[0];
  return (
    <div className="space-y-5">
      <div className="max-w-3xl">
        <p className="eyebrow">Lunar Explorer · 5 m terrain map</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">Site 01 · Connecting ridge</h1>
        <p className="mt-2 text-sm leading-relaxed text-bone-muted">
          A candidate landing area near the Moon&apos;s south pole, mapped by NASA. Every map layer is calculated live from NASA&apos;s terrain files; nothing is simulated.
          {" "}<Link href="/view3d" className="link">Open the 3D terrain view →</Link>
        </p>
      </div>
      {loading && (
        <div className="panel relative min-h-[28rem] overflow-hidden" aria-busy="true">
          <DemLoader title="Loading the terrain data" detail="The Site01 terrain is downloading from NASA. The map appears when it is ready." />
        </div>
      )}
      {error && <p className="panel p-4 text-sm text-haz-high">Could not reach the terrain service ({error}). Is the server running?</p>}
      {data && data.count === 0 && (
        <p className="panel border-dashed p-4 text-sm text-bone-muted">
          No terrain data found. Put the Site01 GeoTIFF files (at least the *_surf.tif) in backend/app/data/dem/ and reload.
        </p>
      )}
      {site && <TerrainViewer site={site} />}
    </div>
  );
}
