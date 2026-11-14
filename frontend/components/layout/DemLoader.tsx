/** Covers a terrain frame until the DEM request and the layer image are both finished. */
export default function DemLoader({ title, detail }: { title: string; detail?: string }) {
  return (
    <div
      className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-night-950/88 px-6 text-center backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <span className="relative grid h-12 w-12 place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-full border border-bone/15" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-sun border-r-earth/80" />
        <span className="h-1.5 w-1.5 rounded-full bg-bone" />
      </span>
      <p className="text-sm text-bone">{title}</p>
      {detail && <p className="max-w-xs text-[11px] leading-relaxed text-bone-faint">{detail}</p>}
    </div>
  );
}
