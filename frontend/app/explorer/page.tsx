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
        <p className="eyebrow">Lunar Explorer · LOLA 5 m/px</p>
        <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">Site 01 · Connecting ridge</h1>
        <p className="mt-2 text-sm leading-relaxed text-bone-muted">
          NASA PGDA candidate south-pole site. Every layer is computed live from the downloaded LOLA files; nothing is simulated.
          {" "}<Link href="/view3d" className="link">Open the 3D terrain view →</Link>
        </p>
      </div>
      {loading && (
        <div className="panel relative min-h-[28rem] overflow-hidden" aria-busy="true">
          <DemLoader title="Fetching the LOLA DEM" detail="Site01 is downloading from NASA PGDA. The map appears when the hillshade layer has loaded." />
        </div>
      )}
      {error && <p className="panel p-4 text-sm text-haz-high">Could not reach the terrain API ({error}). Is the backend running?</p>}
      {data && data.count === 0 && (
        <p className="panel border-dashed p-4 text-sm text-bone-muted">
          No DEM found. Put the Site01 GeoTIFFs (at least the *_surf.tif) in backend/app/data/dem/ and reload.
        </p>
      )}
      {site && <TerrainViewer site={site} />}
    </div>
  );
}
