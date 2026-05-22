import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { alerts as initialAlerts, type AlertItem } from "@/lib/mock-data";
import { AlertTriangle, CheckCircle2, PackageX, Wrench, Filter } from "lucide-react";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts — MediStock" },
      { name: "description", content: "System alerts: missed doses, low stock, faults, and confirmations." },
    ],
  }),
  component: AlertsPage,
});

const iconFor = (t: AlertItem["type"]) =>
  t === "missed" ? AlertTriangle :
  t === "low_stock" ? PackageX :
  t === "fault" ? Wrench : CheckCircle2;

const tintFor = (sev: AlertItem["severity"]) =>
  sev === "critical" ? "border-destructive/40 bg-destructive/10 text-destructive" :
  sev === "warning" ? "border-warning/40 bg-warning/10 text-warning" :
  "border-success/40 bg-success/10 text-success";

function AlertsPage() {
  const [items, setItems] = useState(initialAlerts);
  const [filter, setFilter] = useState<"all" | "unresolved" | "resolved">("all");
  const unresolved = items.filter((a) => !a.resolved && a.severity === "critical");
  const visible = items.filter((a) => filter === "all" ? true : filter === "unresolved" ? !a.resolved : a.resolved);

  const toggle = (id: string) =>
    setItems((arr) => arr.map((a) => (a.id === id ? { ...a, resolved: !a.resolved } : a)));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">{items.filter(a => !a.resolved).length} unresolved · {items.length} total</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface p-0.5 text-xs">
          <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
          {(["all","unresolved","resolved"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-[6px] px-3 py-1.5 capitalize ${filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {f}
            </button>
          ))}
        </div>
      </div>

      {unresolved.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> High-risk alerts require attention
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {unresolved.length} critical alert{unresolved.length > 1 ? "s" : ""} unresolved. Resolve them to clear the escalation queue.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {visible.map((a) => {
          const Icon = iconFor(a.type);
          return (
            <li key={a.id} className="panel p-4">
              <div className="flex items-start gap-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${tintFor(a.severity)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{a.title}</span>
                    <span className="text-[11px] text-mono text-muted-foreground">
                      {new Date(a.time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.description}</p>
                </div>
                <button
                  onClick={() => toggle(a.id)}
                  className={`shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-surface-2 ${a.resolved ? "text-muted-foreground" : "text-primary"}`}
                >
                  {a.resolved ? "Reopen" : "Resolve"}
                </button>
              </div>
            </li>
          );
        })}
        {visible.length === 0 && (
          <li className="panel p-8 text-center text-sm text-muted-foreground">No alerts in this view.</li>
        )}
      </ul>
    </div>
  );
}
