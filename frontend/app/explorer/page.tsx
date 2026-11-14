export default function ExplorerPage() {
  return (
    <div className="page-enter mx-auto max-w-7xl px-5 py-10">
      <p className="eyebrow">Map Explorer</p>
      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tightish text-bone">Explorer</h1>
      <p className="mt-3 max-w-xl text-sm text-bone-muted">
        Online NASA Trek LOLA DEM map — click a point for coordinates and nearest site info.
      </p>
      <div className="panel mt-8 flex min-h-[28rem] items-center justify-center p-6 text-sm text-bone-faint">
        Map canvas coming next
      </div>
    </div>
  );
}
