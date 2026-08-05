// A plain horizontal meter for a 0-1 score - no chart library, per the design
// brief. Renders "-" for null (no evidence yet) rather than a zero-width bar,
// so "unproved" stays visually distinct from "proved at zero".
export function Meter({ value, label }: { value: number | null; label?: string }) {
  if (value === null) return <span className="meter-empty">-</span>;
  const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
  return (
    <div className="meter" role="img" aria-label={`${label ?? 'score'}: ${pct}%`}>
      <div className="meter-track">
        <div className="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="meter-text">{pct}%</span>
    </div>
  );
}
