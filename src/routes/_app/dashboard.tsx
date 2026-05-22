import { createFileRoute, Link } from "@tanstack/react-router";
import { StockBar } from "@/components/medi/StockBar";
import {
  Pill,
  Check,
  X,
  TimerReset,
  ArrowUpRight,
  Wifi,
  Activity as ActivityIcon,
  CircleDot,
} from "lucide-react";
import { slots, activity, summary, device, alerts } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — MediStock" },
      { name: "description", content: "Today's doses, dispenser slots, and device status at a glance." },
    ],
  }),
  component: DashboardPage,
});

const slotTint: Record<string, string> = {
  active: "border-l-success",
  low: "border-l-warning",
  empty: "border-l-destructive",
};

function StatTile({
  label,
  value,
  hint,
  Icon,
  accent,
}: {
  label: string;
  value: string | number;
  hint?: string;
  Icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "success" | "destructive" | "warning";
}) {
  const accentMap = {
    primary: "text-primary bg-primary/10",
    success: "text-success bg-success/10",
    destructive: "text-destructive bg-destructive/10",
    warning: "text-warning bg-warning/10",
  } as const;
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-2xl font-semibold text-mono">{value}</div>
        </div>
        <div className={`grid h-8 w-8 place-items-center rounded-md ${accentMap[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {hint && <div className="mt-3 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function DashboardPage() {
  const unresolved = alerts.filter((a) => !a.resolved);
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good morning, Eleanor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Friday, May 22 · {summary.scheduled} doses scheduled today across 3 slots.
          </p>
        </div>
        <Link
          to="/schedule"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs hover:bg-surface-2"
        >
          Review schedule <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Critical alert banner */}
      {unresolved.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <CircleDot className="h-4 w-4 text-destructive" />
          <span className="font-medium text-foreground">{unresolved.length} unresolved alert{unresolved.length > 1 ? "s" : ""}</span>
          <span className="text-muted-foreground">Latest: {unresolved[0].title}</span>
          <Link to="/alerts" className="ml-auto text-xs text-primary hover:underline">
            View all →
          </Link>
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Scheduled today" value={summary.scheduled} hint="Across 3 dispenser slots" Icon={TimerReset} accent="primary" />
        <StatTile label="Taken" value={summary.taken} hint={`${summary.pending} pending later today`} Icon={Check} accent="success" />
        <StatTile label="Missed" value={summary.missed} hint="Escalation triggered after 30m" Icon={X} accent="destructive" />
        <StatTile label="Compliance" value={`${summary.compliance}%`} hint="7-day rolling average" Icon={ActivityIcon} accent="warning" />
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Slot cards span 2 cols */}
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Dispenser slots</h2>
              <p className="text-[11px] text-muted-foreground">Live state from MediStock-A1</p>
            </div>
            <Link to="/inventory" className="text-[11px] text-primary hover:underline">Manage inventory</Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {slots.map((s) => (
              <article key={s.id} className={`panel border-l-2 ${slotTint[s.status]} p-4`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                      0{s.id}
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                      {s.status === "active" ? "Active" : s.status === "low" ? "Low stock" : "Empty"}
                    </span>
                  </div>
                  <Pill className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-3">
                  <div className="text-sm font-medium leading-tight">{s.medication}</div>
                  <div className="mt-1 text-[11px] text-muted-foreground">Next dose · {s.nextDose}</div>
                </div>
                <div className="mt-4">
                  <StockBar value={s.stock} capacity={s.capacity} />
                </div>
              </article>
            ))}
          </div>

          {/* Activity table */}
          <div className="panel mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-semibold">Recent activity</h3>
              <span className="text-[11px] text-muted-foreground">Last 24 hours</span>
            </div>
            <ul className="divide-y divide-border">
              {activity.slice(0, 8).map((e) => {
                const cls =
                  e.action === "Dispensed" ? "text-primary" :
                  e.action === "Missed" ? "text-destructive" :
                  e.action === "Refilled" ? "text-warning" : "text-success";
                return (
                  <li key={e.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 px-4 py-2.5 text-xs">
                    <span className="text-mono text-muted-foreground">
                      {new Date(e.time).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="truncate">Slot 0{e.slot} · {slots.find(s => s.id === e.slot)?.medication}</span>
                    <span className={`text-[11px] font-medium ${cls}`}>{e.action}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        {/* Right column: device + today timeline */}
        <aside className="space-y-4">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Device</h3>
              <span className={`text-[11px] ${device.online ? "text-success" : "text-destructive"}`}>
                ● {device.online ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="text-muted-foreground">Name</div>
              <div className="text-right text-mono">{device.name}</div>
              <div className="text-muted-foreground">Wi-Fi</div>
              <div className="flex items-center justify-end gap-1.5 text-mono"><Wifi className="h-3 w-3" /> {device.ssid}</div>
              <div className="text-muted-foreground">Signal</div>
              <div className="text-right text-mono">{device.signal}%</div>
              <div className="text-muted-foreground">Last sync</div>
              <div className="text-right text-mono">{new Date(device.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${device.signal}%` }} />
            </div>
          </div>

          <div className="panel p-4">
            <h3 className="text-sm font-semibold">Today's timeline</h3>
            <ol className="mt-3 space-y-3">
              {[
                { time: "08:00", label: "Metformin · Slot 1", state: "done" },
                { time: "12:30", label: "Lisinopril · Slot 2", state: "now" },
                { time: "21:00", label: "Atorvastatin · Slot 3", state: "next" },
              ].map((t) => (
                <li key={t.time} className="flex items-start gap-3">
                  <span className="mt-1 grid h-2 w-2 shrink-0 place-items-center">
                    <span className={`h-2 w-2 rounded-full ${t.state === "done" ? "bg-success" : t.state === "now" ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
                  </span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-mono text-muted-foreground">{t.time}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.state}</span>
                    </div>
                    <div className="text-sm">{t.label}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}
