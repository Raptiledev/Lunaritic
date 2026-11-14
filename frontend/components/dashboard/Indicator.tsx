const TONE = {
  sun: { bar: "bg-sun", dot: "bg-sun", soft: "shadow-glow-sun", wash: "from-sun/10" },
  earth: { bar: "bg-earth", dot: "bg-earth", soft: "shadow-glow-earth", wash: "from-earth/10" },
  terrain: { bar: "bg-bone-muted", dot: "bg-bone-muted", soft: "", wash: "from-bone/5" },
  overall: { bar: "bg-bone", dot: "bg-bone", soft: "", wash: "from-bone/8" },
} as const;

export default function Indicator({
  title,
  question,
  tone,
  source,
  children,
}: {
  title: string;
  question: string;
  tone: keyof typeof TONE;
  source: string;
  children?: React.ReactNode;
}) {
  const t = TONE[tone];
  return (
    <div className={`panel relative overflow-hidden p-4 transition-shadow duration-300 hover:shadow-panel-hover ${t.soft}`}>
      <span className={`absolute inset-y-0 left-0 w-0.5 ${t.bar}`} aria-hidden />
      <span className={`pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b ${t.wash} to-transparent`} aria-hidden />
      <div className="relative flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} aria-hidden />
        <h3 className="text-sm font-medium tracking-tight">{title}</h3>
      </div>
      <p className="relative mt-1 text-xs leading-relaxed text-bone-muted">{question}</p>
      <div className="relative mt-4">
        {children ?? (
          <>
            <p className="num text-lg text-bone-faint">Not computed</p>
            <p className="mt-1 text-[11px] text-bone-faint">Available after {source}.</p>
          </>
        )}
      </div>
    </div>
  );
}
