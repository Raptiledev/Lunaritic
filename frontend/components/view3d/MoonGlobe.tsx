"use client";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { api, globeAlbedoUrl, globeBumpUrl, layerUrl } from "@/services/api";
import { loadTrekAlbedo } from "@/utils/trekMoon";
import { MOON_RADIUS_M, latLonToCartesian, xyToLatLon } from "@/utils/geo";
import type { MeshGrid, SiteInfo } from "@/types/api";

const R_KM = MOON_RADIUS_M / 1000;

/** Local east/north axes of the polar-stereographic tile, tangent at its centre. Heights then go straight up, not along diverging radii. */
function siteFrame(site: SiteInfo) {
  const [xmin, ymin, xmax, ymax] = site.bounds_xy_m;
  const cx = (xmin + xmax) / 2, cy = (ymin + ymax) / 2;
  const { lat, lon } = xyToLatLon(cx, cy);
  const o = latLonToCartesian(lat, lon, R_KM + 0.05);
  const origin = new THREE.Vector3(o.x, o.y, o.z);
  const at = (x: number, y: number) => {
    const ll = xyToLatLon(x, y);
    const p = latLonToCartesian(ll.lat, ll.lon, R_KM + 0.05);
    return new THREE.Vector3(p.x, p.y, p.z);
  };
  const up = origin.clone().normalize();
  const ax = at(cx + 2000, cy).sub(origin);
  ax.addScaledVector(up, -ax.dot(up)).normalize();
  const north = at(cx, cy + 2000).sub(origin);
  north.addScaledVector(up, -north.dot(up)).normalize();
  if (new THREE.Vector3().crossVectors(ax, up).dot(north) < 0) ax.negate();
  const az = new THREE.Vector3().crossVectors(ax, up).normalize();
  return { origin, ax, up, az, cx, cy, lat, lon, spanKm: Math.max(xmax - xmin, ymax - ymin) / 1000 };
}

/** OrbitControls measures polar angle from the up vector it saw at construction (world +Y). Site01's outward normal is nearly −Y, so a camera parked above the ridge is treated as upside-down and clamped onto the horizon. Rebind the orbit frame whenever the up axis changes. */
function bindOrbitUp(controls: OrbitControls, up: THREE.Vector3, east: THREE.Vector3) {
  const priv = controls as OrbitControls & { _quat: THREE.Quaternion; _quatInverse: THREE.Quaternion; _sphericalDelta: THREE.Spherical };
  const y = up.clone().normalize();
  const x = east.clone().addScaledVector(y, -east.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  priv._quat.copy(q).invert();
  priv._quatInverse.copy(q);
  priv._sphericalDelta.set(0, 0, 0);
}

function buildAoiPatch(mesh: MeshGrid, exaggerate: number): THREE.BufferGeometry {
  const { nx, ny, x_m, y_m, z_m, z_mean_m } = mesh;
  const mean = z_mean_m ?? 0;
  const cx = (x_m[0] + x_m[nx - 1]) / 2, cy = (y_m[0] + y_m[ny - 1]) / 2;
  const positions = new Float32Array(nx * ny * 3);
  const uvs = new Float32Array(nx * ny * 2);
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i, z = z_m[k], p = k * 3;
      // Kilometres in the tile plane: x = stereo easting, y = height, z = stereo northing.
      positions[p] = (x_m[i] - cx) / 1000;
      positions[p + 1] = (((z == null ? mean : z) - mean) * exaggerate) / 1000;
      positions[p + 2] = (y_m[j] - cy) / 1000;
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

interface SceneApi {
  setExaggerate: (v: number) => void;
  setWire: (v: boolean) => void;
  setTarget: (t: { lat: number; lon: number } | null) => void;
  focusAoi: () => void;
  focusGlobe: () => void;
}

export default function MoonGlobe({ site, target }: {
  site: SiteInfo;
  target?: { lat: number; lon: number } | null;
}) {
  const host = useRef<HTMLDivElement>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const [mesh, setMesh] = useState<MeshGrid | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("Loading NASA WAC globe…");
  const [exaggerate, setExaggerate] = useState(6);
  const exRef = useRef(6);
  exRef.current = exaggerate;
  const [wire, setWire] = useState(false);
  const [hasWac, setHasWac] = useState(false);

  useEffect(() => {
    setLoading(true); setErr(null);
    Promise.all([
      api.mesh(site.site_id, 128),
      api.globeManifest().then(() => true).catch(() => false),
    ])
      .then(([m, ok]) => { setMesh(m); setHasWac(ok); })
      .catch((e) => setErr(e instanceof Error ? e.message : "Globe failed"))
      .finally(() => setLoading(false));
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
    const camera = new THREE.PerspectiveCamera(42, w0 / h0, 1, R_KM * 20);
    camera.position.set(R_KM * 2.2, R_KM * 0.55, R_KM * 1.4);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = R_KM * 6;
    const globeUp = new THREE.Vector3(0, 1, 0);
    const frame = siteFrame(site);

    scene.add(new THREE.AmbientLight(0xc8c4b8, 0.34));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.35);
    sun.position.set(R_KM * 3, R_KM * 1.2, R_KM * 0.8);
    scene.add(sun);
    // Raking light for the south-polar patch. The globe sun sits in the +Y hemisphere, so it never reaches a surface whose normal points at −Y.
    const rake = new THREE.DirectionalLight(0xfff4e0, 1.7);
    rake.position.copy(frame.origin).addScaledVector(frame.up, 50).addScaledVector(frame.ax, 36).addScaledVector(frame.az, -18);
    rake.target.position.copy(frame.origin);
    rake.visible = false;
    scene.add(rake, rake.target);

    const moonMat = new THREE.MeshStandardMaterial({
      color: 0xb0aea8, roughness: 0.96, metalness: 0.0,
      bumpScale: 12,
    });
    // Dense sphere so bump + texture look Earth-globe-like.
    const moon = new THREE.Mesh(new THREE.SphereGeometry(R_KM, 160, 160), moonMat);
    // Three.js sphere UVs: match equirectangular lon 0 at +Z seam; rotate so lon=0 faces +Z.
    moon.rotation.y = Math.PI;
    scene.add(moon);

    const loader = new THREE.TextureLoader();
    loader.crossOrigin = "anonymous";
    let albedoTex: THREE.Texture | null = null;
    let bumpTex: THREE.Texture | null = null;
    let hill: THREE.Texture | null = null;

    const applyAlbedo = (url: string) => {
      setStatus("Loading WAC albedo…");
      loader.load(
        url,
        (t) => {
          t.colorSpace = THREE.SRGBColorSpace;
          t.anisotropy = 8;
          t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
          albedoTex?.dispose();
          albedoTex = t;
          moonMat.map = t;
          moonMat.color.set(0xffffff);
          moonMat.needsUpdate = true;
          setStatus("WAC albedo ready");
        },
        undefined,
        () => setStatus("WAC albedo missing — using shaded sphere"),
      );
    };
    const applyBump = (url: string) => {
      loader.load(url, (t) => {
        t.anisotropy = 4;
        bumpTex?.dispose();
        bumpTex = t;
        moonMat.bumpMap = t;
        moonMat.needsUpdate = true;
      });
    };
    let cancelled = false;
    setStatus("Loading LROC WAC from NASA Trek…");
    loadTrekAlbedo()
      .then((canvas) => {
        if (cancelled) return;
        const t = new THREE.CanvasTexture(canvas);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
        albedoTex?.dispose();
        albedoTex = t;
        moonMat.map = t;
        moonMat.color.set(0xffffff);
        moonMat.needsUpdate = true;
        setStatus("LROC WAC (NASA Trek)");
      })
      .catch(() => {
        if (cancelled) return;
        if (hasWac) applyAlbedo(globeAlbedoUrl());
        else setStatus("NASA Trek mosaic unavailable");
      });
    if (hasWac) applyBump(globeBumpUrl());

    const patchMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide,
    });
    let patchGeo = buildAoiPatch(mesh, exRef.current);
    const patch = new THREE.Mesh(patchGeo, patchMat);
    const patchGroup = new THREE.Group();
    patchGroup.matrixAutoUpdate = false;
    patchGroup.matrix.compose(frame.origin, new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(frame.ax, frame.up, frame.az)), new THREE.Vector3(1, 1, 1));
    patchGroup.add(patch);
    const [xmin, ymin, xmax, ymax] = site.bounds_xy_m;
    const corners = [
      new THREE.Vector3((xmin - frame.cx) / 1000, 0.04, (ymin - frame.cy) / 1000),
      new THREE.Vector3((xmax - frame.cx) / 1000, 0.04, (ymin - frame.cy) / 1000),
      new THREE.Vector3((xmax - frame.cx) / 1000, 0.04, (ymax - frame.cy) / 1000),
      new THREE.Vector3((xmin - frame.cx) / 1000, 0.04, (ymax - frame.cy) / 1000),
      new THREE.Vector3((xmin - frame.cx) / 1000, 0.04, (ymin - frame.cy) / 1000),
    ];
    const outline = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(corners),
      new THREE.LineBasicMaterial({ color: 0xffb547 }),
    );
    patchGroup.add(outline);
    scene.add(patchGroup);
    loader.load(layerUrl(site.site_id, "hillshade", 1024), (t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      hill = t;
      patchMat.map = t;
      patchMat.needsUpdate = true;
    });

    let marker: THREE.Object3D | null = null;
    const placeMarker = (t: { lat: number; lon: number } | null) => {
      if (marker) { scene.remove(marker); marker = null; }
      if (!t) return;
      const p = latLonToCartesian(t.lat, t.lon, R_KM * 1.012);
      const g = new THREE.Group();
      const tip = new THREE.Mesh(new THREE.SphereGeometry(R_KM * 0.004, 12, 12), new THREE.MeshBasicMaterial({ color: 0xffb547 }));
      tip.position.set(p.x, p.y, p.z);
      g.add(tip);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(R_KM * 0.0012, R_KM * 0.0012, R_KM * 0.02, 8),
        new THREE.MeshBasicMaterial({ color: 0xece7dc }),
      );
      stem.position.set(p.x, p.y, p.z);
      stem.lookAt(0, 0, 0);
      stem.rotateX(Math.PI / 2);
      g.add(stem);
      scene.add(g);
      marker = g;
    };
    placeMarker(target ?? null);

    const applyClip = (near: number, far: number, minD: number, maxD: number, polar: number) => {
      camera.near = near;
      camera.far = far;
      camera.updateProjectionMatrix();
      controls.minDistance = minD;
      controls.maxDistance = maxD;
      controls.maxPolarAngle = polar;
    };
    const focusAoi = () => {
      const reliefKm = Math.max(0.4, (((mesh.z_max_m ?? 0) - (mesh.z_min_m ?? 0)) * exRef.current) / 1000);
      const span = Math.max(frame.spanKm, reliefKm * 2.2);
      const dist = span * 1.15;
      const look = frame.origin.clone();
      camera.up.copy(frame.up);
      // Oblique, same family as the Site01 tile camera: high enough to read the ridge, low enough to show slope.
      camera.position.copy(look)
        .addScaledVector(frame.up, dist * 0.48)
        .addScaledVector(frame.ax, dist * 0.62)
        .addScaledVector(frame.az, dist * 0.5);
      controls.target.copy(look);
      bindOrbitUp(controls, frame.up, frame.ax);
      // A 160-segment globe has ~30 km polar triangles. Left visible, that photo map smears into rays behind a 16 km tile.
      moon.visible = false;
      rake.visible = true;
      applyClip(0.3, R_KM * 4, Math.max(span * 0.22, 2), Math.max(span * 8, 80), Math.PI * 0.46);
      controls.update();
      setStatus("Site01 · local vertical");
    };
    const focusGlobe = () => {
      camera.up.copy(globeUp);
      camera.position.set(R_KM * 2.2, R_KM * 0.55, R_KM * 1.4);
      controls.target.set(0, 0, 0);
      bindOrbitUp(controls, globeUp, new THREE.Vector3(1, 0, 0));
      moon.visible = true;
      rake.visible = false;
      applyClip(1, R_KM * 20, 2, R_KM * 6, Math.PI);
      controls.update();
      setStatus("LROC WAC (NASA Trek)");
    };

    apiRef.current = {
      setExaggerate: (v) => {
        const next = buildAoiPatch(mesh, v);
        patch.geometry.dispose();
        patch.geometry = next;
        patchGeo = next;
      },
      setWire: (v) => { patchMat.wireframe = v; moonMat.wireframe = v; },
      setTarget: placeMarker,
      focusAoi,
      focusGlobe,
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
      cancelled = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      apiRef.current = null;
      controls.dispose();
      patchGeo.dispose();
      outline.geometry.dispose();
      (outline.material as THREE.Material).dispose();
      patchMat.dispose();
      moon.geometry.dispose();
      moonMat.dispose();
      albedoTex?.dispose();
      bumpTex?.dispose();
      hill?.dispose();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh, site.site_id, hasWac]);

  useEffect(() => { apiRef.current?.setExaggerate(exaggerate); }, [exaggerate]);
  useEffect(() => { apiRef.current?.setWire(wire); }, [wire]);
  useEffect(() => { apiRef.current?.setTarget(target ?? null); }, [target]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="seg" role="group" aria-label="Camera">
          <button type="button" className="seg-item" onClick={() => apiRef.current?.focusGlobe()}>View full Moon</button>
          <button type="button" className="seg-item" onClick={() => apiRef.current?.focusAoi()}>Focus Site01 AOI</button>
        </div>
        <label className="flex items-center gap-2 text-[11px] text-bone-muted">
          AOI relief × <input type="range" min={1} max={40} value={exaggerate} onChange={(e) => setExaggerate(Number(e.target.value))} />
          <span className="num text-bone">{exaggerate}</span>
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-bone-muted">
          <input type="checkbox" checked={wire} onChange={(e) => setWire(e.target.checked)} /> Wireframe
        </label>
        <span className="text-[11px] text-bone-faint">{status}</span>
      </div>
      <div ref={host} className="relative h-[min(70vh,640px)] overflow-hidden rounded-md border border-night-700 bg-night-950">
        {loading && <div className="absolute inset-0 grid place-items-center text-xs text-bone-muted">Building full-Moon view…</div>}
        {err && <div className="absolute inset-0 grid place-items-center p-4 text-sm text-haz-high">{err}</div>}
      </div>
      {mesh && (
        <div className="space-y-1 text-[11px] text-bone-faint">
       
        </div>
      )}
    </div>
  );
}
