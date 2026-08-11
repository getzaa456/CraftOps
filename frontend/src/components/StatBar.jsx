const SEGMENTS = 10;

function colorFor(pct) {
  if (pct >= 90) return 'var(--redstone)';
  if (pct >= 70) return 'var(--gold)';
  return 'var(--grass)';
}

export function StatBar({ label, value, unit = '%' }) {
  const known = typeof value === 'number' && !Number.isNaN(value);
  const pct = known ? Math.max(0, Math.min(100, value)) : 0;
  const filledCount = Math.round((pct / 100) * SEGMENTS);

  return (
    <div className="stat-row">
      <div className="stat-label">
        <span>{label}</span>
        <span>{known ? `${Math.round(value)}${unit}` : '—'}</span>
      </div>
      <div className="stat-track">
        {Array.from({ length: SEGMENTS }).map((_, i) => (
          <div
            key={i}
            className={`stat-segment ${i < filledCount ? 'filled' : ''}`}
            style={{ '--fill-color': colorFor(pct) }}
          />
        ))}
      </div>
    </div>
  );
}
