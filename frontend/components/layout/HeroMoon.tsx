"use client";

import { useEffect, useRef, useState } from "react";

/** Real LROC WAC sphere for the landing page. Drag to turn; it coasts on its own. */
export default function HeroMoon() {
  const host = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState("Aligning LROC WAC…");

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let dead = false;
    const bag = { dispose: () => {} };

    (async () => {
      const THREE = await import("three");
      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const { loadTrekAlbedo } = await import("@/utils/trekMoon");
      if (dead || !host.current) return;

      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      renderer.domElement.style.display = "block";
      el.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 20);
      camera.position.set(0.12, 0.18, 4.15);

      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableZoom = false;
      controls.autoRotate = !reduce;
      controls.autoRotateSpeed = 0.6;
      controls.enableDamping = true;
      controls.rotateSpeed = 0.45;

      scene.add(new THREE.AmbientLight(0xc8c4b8, 0.2));
      const sun = new THREE.DirectionalLight(0xfff1d2, 1.65);
      sun.position.set(3.4, 1.5, 2.1);
      scene.add(sun);
      const earthFill = new THREE.DirectionalLight(0x8ec8ff, 0.18);
      earthFill.position.set(-2.6, 0.2, -1.4);
      scene.add(earthFill);

      const mat = new THREE.MeshStandardMaterial({ color: 0xb7b3aa, roughness: 0.97, metalness: 0 });
      const moon = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 128), mat);
      moon.rotation.y = 0.9;
      scene.add(moon);

      const fit = () => {
        const w = el.clientWidth || 480;
        const h = el.clientHeight || 480;
        renderer.setSize(w, h, false);
        camera.aspect = w / Math.max(h, 1);
        camera.updateProjectionMatrix();
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(el);

      loadTrekAlbedo()
        .then((canvas) => {
          if (dead) return;
          const tex = new THREE.CanvasTexture(canvas);
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = 8;
          mat.map = tex;
          mat.color.set(0xffffff);
          mat.needsUpdate = true;
          setStatus("LROC WAC · NASA Trek");
        })
        .catch(() => {
          if (!dead) setStatus("Limb only · Trek unavailable");
        });

      let raf = 0;
      const tick = () => {
        raf = requestAnimationFrame(tick);
        controls.update();
        renderer.render(scene, camera);
      };
      tick();

      bag.dispose = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        mat.map?.dispose();
        mat.dispose();
        moon.geometry.dispose();
        renderer.dispose();
        if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
      };
    })();

    return () => {
      dead = true;
      bag.dispose();
    };
  }, []);

  return (
    <div className="relative mx-auto w-full max-w-[34rem]">
      <div
        className="pointer-events-none absolute inset-[8%] rounded-full bg-[radial-gradient(circle_at_38%_34%,rgba(255,241,210,0.18),transparent_58%)] blur-2xl"
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-[2%] rounded-full border border-bone/10" aria-hidden />
      <div className="pointer-events-none absolute inset-0 rounded-full border border-dashed border-bone/[0.07]" aria-hidden />
      <div ref={host} className="relative aspect-square w-full cursor-grab active:cursor-grabbing" />
      <div className="mt-2 flex items-center justify-center gap-4 text-[10px] uppercase tracking-label text-bone-faint">
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-sun" /> Sun</span>
        <span>{status}</span>
        <span className="flex items-center gap-1.5"><i className="h-1.5 w-1.5 rounded-full bg-earth" /> Earth</span>
      </div>
    </div>
  );
}
