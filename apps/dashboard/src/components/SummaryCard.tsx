export function SummaryCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: string | number;
  delta?: number;
}) {
  const deltaClass =
    delta !== undefined && delta >= 0 ? "delta positive" : "delta negative";
  const deltaPrefix = delta !== undefined && delta >= 0 ? "+" : "";

  return (
    <div className="summary-card">
      <div className="value">{typeof value === "number" ? value.toLocaleString() : value}</div>
      <div className="label">{label}</div>
      {delta !== undefined && (
        <div className={deltaClass}>
          {deltaPrefix}
          {(delta * 100).toFixed(1)}%
        </div>
      )}
    </div>
  );
}
