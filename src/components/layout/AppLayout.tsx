import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  CalendarDays,
  BarChart3,
  Bell,
  Settings,
  Boxes,
  Activity,
  Wifi,
  WifiOff,
} from "lucide-react";
import { device, alerts } from "@/lib/mock-data";

const nav = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { to: "/schedule", label: "Schedule", icon: CalendarDays },
  { to: "/inventory", label: "Inventory", icon: Boxes },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function NavItem({ to, label, Icon }: { to: string; label: string; Icon: React.ComponentType<{ className?: string }> }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to;
  return (
    <Link
      to={to}
      className={`group flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      }`}
    >
      <Icon className={`h-4 w-4 ${active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"}`} />
      <span className="truncate">{label}</span>
      {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  );
}

export function AppLayout() {
  const unresolved = alerts.filter((a) => !a.resolved).length;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = nav.find((n) => n.to === pathname);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <div className="flex items-center gap-2 px-4 pt-5 pb-4">
          <div className="relative">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-sidebar" />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">MediStock</div>
            <div className="text-[11px] text-muted-foreground">Dispenser console</div>
          </div>
        </div>

        <div className="px-3 pb-2 pt-1">
          <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Device</span>
              <span className={device.online ? "text-success" : "text-destructive"}>
                {device.online ? "Online" : "Offline"}
              </span>
            </div>
            <div className="mt-1 truncate text-sm font-medium">{device.name}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              {device.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
              <span className="truncate">{device.ssid} · {device.signal}%</span>
            </div>
          </div>
        </div>

        <nav className="mt-2 flex-1 space-y-0.5 px-2">
          {nav.map((n) => (
            <NavItem key={n.to} to={n.to} label={n.label} Icon={n.icon} />
          ))}
        </nav>

        <div className="border-t border-sidebar-border px-4 py-3 text-[11px] text-muted-foreground">
          Last sync · {new Date(device.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur lg:pl-60">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">MediStock</span>
          </div>
          <div className="hidden flex-col leading-tight lg:flex">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Section</span>
            <span className="text-sm font-medium">{current?.label ?? "Overview"}</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-muted-foreground sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Realtime · Firebase
            </div>
            <Link
              to="/alerts"
              className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface hover:bg-surface-2"
              aria-label="Alerts"
            >
              <Bell className="h-4 w-4" />
              {unresolved > 0 && (
                <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">
                  {unresolved}
                </span>
              )}
            </Link>
            <div className="hidden h-9 items-center gap-2 rounded-md border border-border bg-surface px-2.5 sm:flex">
              <div className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary">
                EM
              </div>
              <div className="leading-tight">
                <div className="text-xs font-medium">Eleanor M.</div>
                <div className="text-[10px] text-muted-foreground">Caregiver</div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="lg:pl-60">
        <div className="mx-auto w-full max-w-[1400px] px-4 pb-24 pt-6 sm:px-6 lg:pb-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-sidebar/95 backdrop-blur lg:hidden">
        <ul className="grid grid-cols-6">
          {nav.map((n) => {
            const active = pathname === n.to;
            const Icon = n.icon;
            return (
              <li key={n.to}>
                <Link
                  to={n.to}
                  className={`flex flex-col items-center gap-1 py-2 text-[10px] ${
                    active ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="leading-none">{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
