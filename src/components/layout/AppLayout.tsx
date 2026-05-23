import { useEffect, useState } from "react";
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
  Menu,
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

function NavItem({
  to,
  label,
  Icon,
  isCollapsed,
  onClick,
}: {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  isCollapsed?: boolean;
  onClick?: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const active = pathname === to;
  return (
    <Link
      to={to}
      onClick={onClick}
      title={isCollapsed ? label : undefined}
      className={`group flex items-center rounded-md px-3 py-2 text-sm transition-all duration-300 ${
        isCollapsed ? "justify-center" : "gap-3"
      } ${
        active
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
      }`}
    >
      <Icon className={`h-4 w-4 shrink-0 transition-transform duration-300 ${active ? "text-primary scale-110" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground"}`} />
      {!isCollapsed && <span className="truncate animate-fade-in">{label}</span>}
      {active && !isCollapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />}
    </Link>
  );
}

function PatientSwitcher() {
  const [patients, setPatients] = useState<Array<{ id: string; name: string }>>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("monitored_patients");
      const list = raw ? JSON.parse(raw) : null;
      if (Array.isArray(list) && list.length > 0) {
        setPatients(list.slice(0, 10));
        const stored = window.localStorage.getItem("current_patient");
        if (stored) setCurrentId(stored);
        else {
          setCurrentId(list[0].id);
          window.localStorage.setItem("current_patient", list[0].id);
        }
      }
    } catch (e) {
      // ignore parse errors
    }
  }, []);

  if (patients.length === 0) return null;

  const current = patients.find((p) => p.id === currentId) ?? patients[0];

  return (
    <div className="flex items-center gap-2">
      <div className="text-xs text-muted-foreground">Patient</div>
      <select
        value={current.id}
        onChange={(e) => {
          const id = e.target.value;
          setCurrentId(id);
          try {
            window.localStorage.setItem("current_patient", id);
          } catch {}
          // reload to let app pick up patient change
          location.reload();
        }}
        className="rounded-md border border-input bg-input/40 px-2 py-1 text-sm"
      >
        {patients.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}

export function AppLayout() {
  const unresolved = alerts.filter((a) => !a.resolved).length;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = nav.find((n) => n.to === pathname);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Collapse state for desktop side menu, persisting to localStorage
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  const handleToggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className={`fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-all duration-300 lg:flex ${
        isCollapsed ? "w-[72px]" : "w-60"
      }`}>
        <div className={`flex items-center gap-2 pt-5 pb-4 px-4 transition-all duration-300 ${
          isCollapsed ? "justify-center px-2" : ""
        }`}>
          <div className="relative shrink-0">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <span className="absolute -right-0.5 -bottom-0.5 h-2 w-2 rounded-full bg-success ring-2 ring-sidebar" />
          </div>
          {!isCollapsed && (
            <div className="leading-tight animate-fade-in">
              <div className="text-sm font-semibold tracking-tight">MediStock</div>
              <div className="text-[11px] text-muted-foreground">Dispenser console</div>
            </div>
          )}
        </div>

        <div className="px-3 pb-2 pt-1 transition-all duration-300">
          {isCollapsed ? (
            <div className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/40 py-3 text-sidebar-foreground">
              <span className={`h-2 w-2 rounded-full ${device.online ? "bg-success" : "bg-destructive animate-pulse"}`} title={device.online ? "Online" : "Offline"} />
              <Wifi className="h-3.5 w-3.5 text-sidebar-foreground/60" title={`${device.ssid} · ${device.signal}%`} />
            </div>
          ) : (
            <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-2.5 animate-fade-in">
              <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
                <span>Device</span>
                <span className={device.online ? "text-success font-medium" : "text-destructive font-medium"}>
                  {device.online ? "Online" : "Offline"}
                </span>
              </div>
              <div className="mt-1 truncate text-sm font-medium">{device.name}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {device.online ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
                <span className="truncate">{device.ssid} · {device.signal}%</span>
              </div>
            </div>
          )}
        </div>

        <nav className="mt-2 flex-1 space-y-0.5 px-2">
          {nav.map((n) => (
            <NavItem key={n.to} to={n.to} label={n.label} Icon={n.icon} isCollapsed={isCollapsed} />
          ))}
        </nav>

        <div className={`border-t border-sidebar-border px-4 py-3 text-[11px] text-muted-foreground transition-all duration-300 ${
          isCollapsed ? "text-center px-1" : ""
        }`}>
          {isCollapsed ? (
            <span>{new Date(device.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          ) : (
            <span>Last sync · {new Date(device.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
          )}
        </div>
      </aside>

      {/* Top bar */}
      <header className={`sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur transition-all duration-300 ${
        isCollapsed ? "lg:pl-[72px]" : "lg:pl-60"
      }`}>
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          {/* Mobile bottom-sidebar overlay launcher */}
          <div className="flex items-center gap-2 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen((value) => !value)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground hover:bg-surface-2 transition-colors duration-200"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/15 text-primary">
              <Activity className="h-4 w-4" />
            </div>
            <span className="text-sm font-semibold">MediStock</span>
          </div>

          {/* Desktop sidebar toggle button */}
          <button
            type="button"
            onClick={handleToggleCollapse}
            className="hidden lg:inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground hover:bg-surface-2 transition-colors duration-200 mr-1"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-5 w-5" />
          </button>

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
              <div className="hidden items-center gap-3 sm:flex">
                <PatientSwitcher />
                <div className="h-9 items-center gap-2 rounded-md border border-border bg-surface px-2.5 flex">
                  <div className="grid h-6 w-6 place-items-center rounded-full bg-primary/20 text-[11px] font-semibold text-primary">EM</div>
                  <div className="leading-tight">
                    <div className="text-xs font-medium">Eleanor M.</div>
                    <div className="text-[10px] text-muted-foreground">Caregiver</div>
                  </div>
                </div>
              </div>
          </div>
        </div>
      </header>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden animate-fade-in">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200" onClick={() => setSidebarOpen(false)} />
          <aside className="relative h-full w-72 overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 shadow-lg animate-slide-in">
            <div className="flex items-center gap-2 px-2 pb-4">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-primary/15 text-primary">
                <Activity className="h-4 w-4" />
              </div>
              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-tight">MediStock</div>
                <div className="text-[11px] text-muted-foreground">Dispenser console</div>
              </div>
            </div>
            <div className="rounded-md border border-sidebar-border bg-sidebar-accent/40 p-3">
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
            <nav className="mt-4 space-y-1 px-1">
              {nav.map((n) => (
                <NavItem key={n.to} to={n.to} label={n.label} Icon={n.icon} onClick={() => setSidebarOpen(false)} />
              ))}
            </nav>
            <div className="border-t border-sidebar-border px-4 py-3 mt-4 text-[11px] text-muted-foreground">
              Last sync · {new Date(device.lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </div>
          </aside>
        </div>
      )}

      {/* Main */}
      <main className={`transition-all duration-300 ${
        isCollapsed ? "lg:pl-[72px]" : "lg:pl-60"
      }`}>
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
