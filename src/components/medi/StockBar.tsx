export function StockBar({ value, capacity }: { value: number; capacity: number }) {
  const pct = Math.max(0, Math.min(100, (value / capacity) * 100));
  const color =
    pct > 50 ? "bg-success" : pct >= 20 ? "bg-warning" : "bg-destructive";
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
        <span>{value} / {capacity} pills</span>
        <span className="text-mono">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
