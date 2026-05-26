import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { DataSnapshot } from "firebase/database";
import { db, onValue, ref, update } from "@/firebase";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, PackageX, Wrench, Filter } from "lucide-react";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts - MediStock" },
      { name: "description", content: "System alerts: missed doses, low stock, faults, and confirmations." },
    ],
  }),
  component: AlertsPage,
});

type AlertSeverity = "info" | "warning" | "critical";
type AlertFilter = "all" | "unresolved" | "resolved";

interface RealtimeAlert {
  id: string;
  path: string;
  type: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  resolved: boolean;
  timeMs?: number;
  timestampS?: number;
}

const iconFor = (type: string) => {
  const normalized = type.toUpperCase();
  if (normalized === "JAM" || normalized === "ERROR" || normalized === "OFFLINE") return AlertTriangle;
  if (normalized === "LOW_STOCK") return PackageX;
  if (normalized === "MAINTENANCE") return Wrench;
  return CheckCircle2;
};

const severityFor = (type: string, severity?: string): AlertSeverity => {
  if (severity === "critical" || severity === "warning" || severity === "info") return severity;

  const normalized = type.toUpperCase();
  if (normalized === "JAM" || normalized === "ERROR" || normalized === "OFFLINE") return "critical";
  if (normalized === "LOW_STOCK") return "warning";
  return "info";
};

const titleFor = (type: string) => {
  const normalized = type.toUpperCase();
  if (normalized === "JAM") return "Jam detected";
  if (normalized === "LOW_STOCK") return "Low stock";
  if (normalized === "DISPENSED") return "Medicine dispensed";
  if (normalized === "ERROR") return "Device error";
  if (normalized === "OFFLINE") return "Device offline";
  if (normalized === "MAINTENANCE") return "Maintenance";
  return type || "Alert";
};

const tintFor = (severity: AlertSeverity) =>
  severity === "critical" ? "border-destructive/40 bg-destructive/10 text-destructive" :
  severity === "warning" ? "border-warning/40 bg-warning/10 text-warning" :
  "border-success/40 bg-success/10 text-success";

const parseTimestamp = (raw: Record<string, unknown>) => {
  const timestamp = Number(raw.timestamp ?? raw.created_at ?? 0);
  const timestampS = Number(raw.timestamp_s ?? 0);

  if (Number.isFinite(timestamp) && timestamp > 0) {
    return timestamp < 2000000000 ? { timeMs: timestamp * 1000 } : { timeMs: timestamp };
  }

  if (Number.isFinite(timestampS) && timestampS > 0) {
    return { timestampS };
  }

  return {};
};

const formatAlertTime = (alert: RealtimeAlert) => {
  if (alert.timeMs) {
    return new Date(alert.timeMs).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (alert.timestampS) return `Device uptime ${Math.round(alert.timestampS)}s`;
  return "Live";
};

const normalizeAlert = (id: string, path: string, raw: unknown): RealtimeAlert | null => {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;
  const type = typeof data.type === "string" ? data.type : "ALERT";
  const message = typeof data.message === "string" ? data.message : "";

  return {
    id,
    path,
    type,
    title: typeof data.title === "string" ? data.title : titleFor(type),
    description: message || titleFor(type),
    severity: severityFor(type, typeof data.severity === "string" ? data.severity : undefined),
    resolved: data.resolved === true,
    ...parseTimestamp(data),
  };
};

function AlertsPage() {
  const [items, setItems] = useState<RealtimeAlert[]>([]);
  const [filter, setFilter] = useState<AlertFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const alertsRef = ref(db, "alerts");
    return onValue(
      alertsRef,
      (snapshot: DataSnapshot) => {
        const raw = snapshot.val() || {};
        const next: RealtimeAlert[] = [];

        const latest = normalizeAlert("latest", "alerts/latest", raw.latest);
        if (latest) next.push(latest);

        if (raw.history && typeof raw.history === "object") {
          Object.entries(raw.history).forEach(([key, value]) => {
            const alert = normalizeAlert(key, `alerts/history/${key}`, value);
            if (alert) next.push(alert);
          });
        }

        Object.entries(raw).forEach(([key, value]) => {
          if (key === "latest" || key === "history") return;
          const alert = normalizeAlert(key, `alerts/${key}`, value);
          if (alert) next.push(alert);
        });

        next.sort((a, b) => (b.timeMs ?? 0) - (a.timeMs ?? 0));
        setItems(next);
        setLoadError(null);
        setLoading(false);
      },
      (error) => {
        setLoadError(error.message);
        setLoading(false);
        toast.error(`Failed to listen to alerts: ${error.message}`);
      }
    );
  }, []);

  const unresolved = useMemo(
    () => items.filter((alert) => !alert.resolved && alert.severity === "critical"),
    [items]
  );
  const visible = useMemo(
    () => items.filter((alert) => filter === "all" ? true : filter === "unresolved" ? !alert.resolved : alert.resolved),
    [filter, items]
  );

  const toggle = async (alert: RealtimeAlert) => {
    try {
      await update(ref(db, alert.path), {
        resolved: !alert.resolved,
        resolved_at: alert.resolved ? null : Date.now(),
      });
    } catch (error) {
      toast.error(`Failed to update alert: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.filter((alert) => !alert.resolved).length} unresolved · {items.length} total
          </p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface p-0.5 text-xs">
          <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
          {(["all", "unresolved", "resolved"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setFilter(mode)}
              className={`rounded-[6px] px-3 py-1.5 capitalize ${filter === mode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load realtime alerts: {loadError}
        </div>
      )}

      {unresolved.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> High-risk alerts require attention
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {unresolved.length} critical alert{unresolved.length > 1 ? "s" : ""} unresolved.
            Resolve them to clear the escalation queue.
          </p>
        </div>
      )}

      <ul className="space-y-2">
        {loading && (
          <li className="panel p-8 text-center text-sm text-muted-foreground">Loading realtime alerts...</li>
        )}
        {!loading && visible.map((alert) => {
          const Icon = iconFor(alert.type);
          return (
            <li key={alert.id} className="panel p-4">
              <div className="flex items-start gap-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${tintFor(alert.severity)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{alert.title}</span>
                    <span className="text-[11px] text-mono text-muted-foreground">
                      {formatAlertTime(alert)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{alert.description}</p>
                </div>
                <button
                  onClick={() => toggle(alert)}
                  className={`shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-surface-2 ${alert.resolved ? "text-muted-foreground" : "text-primary"}`}
                >
                  {alert.resolved ? "Reopen" : "Resolve"}
                </button>
              </div>
            </li>
          );
        })}
        {!loading && visible.length === 0 && (
          <li className="panel p-8 text-center text-sm text-muted-foreground">No realtime alerts in this view.</li>
        )}
      </ul>
    </div>
  );
}
