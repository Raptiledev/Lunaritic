export default function PhasePlaceholder({ title, phase, needs }: { title: string; phase: string; needs: string[] }) {
  return (
    <div className="mx-auto max-w-2xl py-10">
      <p className="eyebrow">Scheduled · {phase}</p>
      <h1 className="mt-2 font-display text-2xl font-semibold tracking-tightish">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-bone-muted">
        Not built yet. This page shows no results until the calculations behind it exist, so nothing here is simulated.
      </p>
      <div className="panel mt-6">
        <div className="panel-head"><span className="eyebrow">What it needs first</span></div>
        <ul className="divide-y divide-night-800">
          {needs.map((n, i) => (
            <li key={n} className="flex gap-3 px-4 py-2.5 text-sm text-bone-muted">
              <span className="num text-bone-faint">{String(i + 1).padStart(2, "0")}</span>{n}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
