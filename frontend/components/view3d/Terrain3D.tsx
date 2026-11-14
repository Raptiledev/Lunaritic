"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { api, layerUrl } from "@/services/api";
import { latlonToXy } from "@/utils/geo";
import type { MeshGrid, SiteInfo } from "@/types/api";

const TEXTURES = [
  { id: "hillshade", label: "Hillshade" },
  { id: "elevation", label: "Elevation" },
  { id: "slope", label: "Slope" },
  { id: "hazard", label: "Hazard" },
] as const;
type TexId = (typeof TEXTURES)[number]["id"];

function buildGeometry(mesh: MeshGrid, exaggerate: number): THREE.BufferGeometry {
  const { nx, ny, x_m, y_m, z_m, z_mean_m } = mesh;
  const mean = z_mean_m ?? 0;
  const cx = (x_m[0] + x_m[nx - 1]) / 2, cy = (y_m[0] + y_m[ny - 1]) / 2;
  const positions = new Float32Array(nx * ny * 3);
  const uvs = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, z = z_m[k], p = k * 3;
      positions[p] = x_m[i] - cx;
      positions[p + 1] = ((z == null ? mean : z) - mean) * exaggerate;
      positions[p + 2] = -(y_m[j] - cy);
      uvs[k * 2] = i / Math.max(nx - 1, 1);
      uvs[k * 2 + 1] = 1 - j / Math.max(ny - 1, 1);
    }
  }
  const indices: number[] = [];
  for (let j = 0; j < ny - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      if (z_m[a] == null || z_m[b] == null || z_m[c] == null || z_m[d] == null) continue;
      indices.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

function sunDirection(azDeg: number, elDeg: number): THREE.Vector3 {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.max(0.05, Math.sin(el)), -Math.cos(az) * Math.cos(el)).normalize();
}

interface SceneApi {
  setExaggerate: (v: number) => void;
  setTexture: (id: TexId) => void;
  setWire: (v: boolean) => void;
  setTarget: (t: { lat: number; lon: number } | null) => void;
  setSun: (s: { az: number; el: number } | null) => void;
}

export default function Terrain3D({ site, target, sun }: {
  site: SiteInfo;
  target?: { lat: number; lon: number } | null;
  sun?: { az: number; el: number } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const [mesh, setMesh] = useState<MeshGrid | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tex, setTex] = useState<TexId>("hillshade");
  const [exaggerate, setExaggerate] = useState(6);
  const [wire, setWire] = useState(false);

  useEffect(() => {
    setLoading(true); setErr(null);
    api.mesh(site.site_id, 160).then(setMesh).catch((e) => setErr(e instanceof Error ? e.message : "Mesh failed")).finally(() => setLoading(false));
  }, [site.site_id]);

  useEffect(() => {
    if (!host.current || !mesh) return;
    const el = host.current;
    const w0 = el.clientWidth || 640, h0 = Math.max(el.clientHeight, 420);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w0, h0);
    renderer.setClearColor(0x06080c);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w0 / h0, 10, 200000);
    const span = Math.max(Math.abs(mesh.x_m[mesh.nx - 1] - mesh.x_m[0]), Math.abs(mesh.y_m[mesh.ny - 1] - mesh.y_m[0]));
    camera.position.set(span * 0.55, span * 0.4, span * 0.55);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI * 0.495;

    const ambient = new THREE.AmbientLight(0xb0b8c8, 0.4);
    const sunLight = new THREE.DirectionalLight(0xffe0b0, 1.15);
    scene.add(ambient, sunLight, sunLight.target);

    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.02, side: THREE.DoubleSide });
    let geometry = buildGeometry(mesh, exaggerate);
    const terrain = new THREE.Mesh(geometry, material);
    scene.add(terrain);

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    let currentTex: THREE.Texture | null = null;
    const applyTex = (id: TexId) => {
      loader.load(layerUrl(site.site_id, id, 1024), (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        if (currentTex) currentTex.dispose();
        currentTex = t;
        material.map = t;
        material.needsUpdate = true;
      });
    };
    applyTex(tex);

    let marker: THREE.Group | null = null;
    const cx = (mesh.x_m[0] + mesh.x_m[mesh.nx - 1]) / 2;
    const cy = (mesh.y_m[0] + mesh.y_m[mesh.ny - 1]) / 2;
    const mean = mesh.z_mean_m ?? 0;

    const heightAt = (x: number, y: number, ex: number) => {
      let best = Infinity, z = mean;
      for (let j = 0; j < mesh.ny; j++) for (let i = 0; i < mesh.nx; i++) {
        const zz = mesh.z_m[j * mesh.nx + i];
        if (zz == null) continue;
        const d = Math.hypot(mesh.x_m[i] - x, mesh.y_m[j] - y);
        if (d < best) { best = d; z = zz; }
      }
      return (z - mean) * ex;
    };

    const placeMarker = (t: { lat: number; lon: number } | null, ex: number) => {
      if (marker) { scene.remove(marker); marker = null; }
      if (!t) return;
      const { x, y } = latlonToXy(t.lat, t.lon);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 160, 8), new THREE.MeshBasicMaterial({ color: 0xece7dc })));
      const tip = new THREE.Mesh(new THREE.SphereGeometry(26, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffb547 }));
      tip.position.y = 110;
      g.children[0].position.y = 80;
      g.add(tip);
      g.position.set(x - cx, heightAt(x, y, ex), -(y - cy));
      scene.add(g);
      marker = g;
    };
    placeMarker(target ?? null, exaggerate);

    const placeSun = (s: { az: number; el: number } | null) => {
      const dir = s && s.el > -5 ? sunDirection(s.az, s.el) : new THREE.Vector3(0.45, 0.8, 0.25).normalize();
      sunLight.position.copy(dir.multiplyScalar(span * 0.9));
    };
    placeSun(sun ?? null);

    apiRef.current = {
      setExaggerate: (v) => {
        const next = buildGeometry(mesh, v);
        terrain.geometry.dispose();
        terrain.geometry = next;
        geometry = next;
        if (marker && target) placeMarker(target, v);
      },
      setTexture: applyTex,
      setWire: (v) => { material.wireframe = v; },
      setTarget: (t) => placeMarker(t, /* read from last exaggerate via geometry rebuild path */ exaggerate),
      setSun: placeSun,
    };

    const onResize = () => {
      const w = el.clientWidth, h = Math.max(el.clientHeight, 420);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(el);
    let raf = 0;
    const tick = () => { raf = requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      apiRef.current = null;
      controls.dispose();
      geometry.dispose();
      material.dispose();
      currentTex?.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
    // mesh identity drives a full rebuild; param tweaks go through apiRef
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh, site.site_id]);

  useEffect(() => { apiRef.current?.setExaggerate(exaggerate); }, [exaggerate]);
  useEffect(() => { apiRef.current?.setTexture(tex); }, [tex]);
  useEffect(() => { apiRef.current?.setWire(wire); }, [wire]);
  useEffect(() => { apiRef.current?.setTarget(target ?? null); }, [target, exaggerate]);
  useEffect(() => { apiRef.current?.setSun(sun ?? null); }, [sun]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg" role="tablist" aria-label="3D texture">
          {TEXTURES.map((t) => (
            <button key={t.id} role="tab" aria-selected={tex === t.id} className="seg-item" onClick={() => setTex(t.id)}>{t.label}</button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-[11px] text-bone-muted">
          Vertical × <input type="range" min={1} max={12} value={exaggerate} onChange={(e) => setExaggerate(Number(e.target.value))} />
          <span className="num text-bone">{exaggerate}</span>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-bone-muted">
          <input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} /> Wireframe
        </label>
      </div>
      <div ref={host} className="relative h-[min(70vh,640px)] overflow-hidden rounded-md border border-night-700 bg-night-950">
        {loading && <div className="absolute inset-0 grid place-items-center text-xs text-bone-muted">Building mesh from LOLA…</div>}
        {err && <div className="absolute inset-0 grid place-items-center p-4 text-sm text-haz-high">{err}</div>}
      </div>
      {mesh && (
        <div className="space-y-1 text-[11px] text-bone-faint">
          <p className="num">{mesh.nx}×{mesh.ny} nodes · {mesh.spacing_m.toFixed(0)} m spacing · height {mesh.z_min_m?.toFixed(0)}–{mesh.z_max_m?.toFixed(0)} m</p>
          {mesh.notes.map((n) => <p key={n}>{n}</p>)}
          <p>Drag to orbit · scroll to zoom · right-drag to pan. Amber marker = mission target. Light follows the real Sun when ephemeris is available.</p>
        </div>
      )}
    </div>
  );
}
