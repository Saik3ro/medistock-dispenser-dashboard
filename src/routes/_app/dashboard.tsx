import { useEffect, useState } from "react";
import type { DataSnapshot } from "firebase/database";
import { createFileRoute, Link } from "@tanstack/react-router";
import { db, ref, onValue } from "../../firebase";
import { StockBar } from "@/components/medi/StockBar";
import { toast } from "sonner";
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
import type { DispenseLog, InventoryLog, ScheduleEntry } from "@/types";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview - MediStock" },
      { name: "description", content: "Today's doses, dispenser slots, and device status at a glance." },
    ],
  }),
  component: DashboardPage,
});

const slotTint: Record<string, string> = {
  active: "border-l-success",
  low: "border-l-warning",
  low_stock: "border-l-destructive",
  empty: "border-l-destructive",
  unknown: "border-l-border",
};

type SlotId = "slot1" | "slot2" | "slot3";

type SlotState = {
  medication_name: string;
  stock_current: number;
  stock_max: number;
  status: string;
  loaded: boolean;
};

type Alert = {
  type: string;
  slot?: string | number;
  message: string;
  timestamp: string | number;
  resolved: boolean;
  title?: string;
};

type RecentActivityItem = {
  id: string;
  timestamp: number;
  label: string;
  action: string;
  tone: "primary" | "success" | "warning" | "destructive";
};

type TimelineItem = {
  id: string;
  time: string;
  label: string;
  state: "done" | "now" | "next";
};

type DeviceHeartbeatState = {
  rawStatus: string;
  firstSeenAt: number | null;
  lastSnapshotAt: number | null;
  lastAdvanceAt: number | null;
  lastHeartbeatValue: number | null;
  uptimeValue: number | null;
};

const slotIds: SlotId[] = ["slot1", "slot2", "slot3"];

const initialSlotState: SlotState = {
  medication_name: "",
  stock_current: 0,
  stock_max: 100,
  status: "unknown",
  loaded: false,
};

const DEVICE_HEARTBEAT_TIMEOUT_MS = 45000;

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
    <div className="panel p-4 animate-fade-in">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="mt-1.5 text-2xl font-semibold text-mono">{value}</div>
        </div>
        <div className={`grid h-8 w-8 place-items-center rounded-md ${accentMap[accent]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {hint ? <div className="mt-3 text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function DashboardPage() {
  const [slotsState, setSlotsState] = useState<Record<SlotId, SlotState>>({
    slot1: { ...initialSlotState },
    slot2: { ...initialSlotState },
    slot3: { ...initialSlotState },
  });
  const [deviceStatus, setDeviceStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [unresolvedAlerts, setUnresolvedAlerts] = useState<Alert[]>([]);
  const [firebaseConnected, setFirebaseConnected] = useState<"Yes" | "No" | "Error">("No");
  const [deviceLoaded, setDeviceLoaded] = useState(false);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [slotsError, setSlotsError] = useState<Record<SlotId, string | null>>({
    slot1: null,
    slot2: null,
    slot3: null,
  });
  const [debugDeviceStatus, setDebugDeviceStatus] = useState<string | null>(null);
  const [debugSlot1Medication, setDebugSlot1Medication] = useState<string | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<Record<string, unknown>>({});
  const [deviceWifiName, setDeviceWifiName] = useState("Unavailable");
  const [dispenseLogs, setDispenseLogs] = useState<DispenseLog[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [deviceHeartbeatState, setDeviceHeartbeatState] = useState<DeviceHeartbeatState>({
    rawStatus: "offline",
    firstSeenAt: null,
    lastSnapshotAt: null,
    lastAdvanceAt: null,
    lastHeartbeatValue: null,
    uptimeValue: null,
  });
  const [heartbeatClock, setHeartbeatClock] = useState(Date.now());

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    const deviceRef = ref(db, "device");
    const deviceUnsubscribe = onValue(
      deviceRef,
      (snapshot: DataSnapshot) => {
        const deviceData = snapshot.val() || {};
        const status = typeof deviceData.status === "string" ? deviceData.status : "offline";
        const heartbeatValue = toFiniteNumber(deviceData.last_heartbeat);
        const uptimeValue = toFiniteNumber(deviceData.uptime_s);
        const now = Date.now();
        setDeviceHeartbeatState((prev) => {
          const heartbeatAdvanced =
            heartbeatValue !== null
            && prev.lastHeartbeatValue !== null
            && heartbeatValue > prev.lastHeartbeatValue;
          const uptimeAdvanced =
            uptimeValue !== null
            && prev.uptimeValue !== null
            && uptimeValue > prev.uptimeValue;

          return {
            rawStatus: status,
            firstSeenAt: prev.firstSeenAt ?? now,
            lastSnapshotAt: now,
            lastAdvanceAt: heartbeatAdvanced || uptimeAdvanced
              ? now
              : prev.lastAdvanceAt,
            lastHeartbeatValue: heartbeatValue,
            uptimeValue,
          };
        });
        setDebugDeviceStatus(status ?? "(no value)");
        setDeviceInfo(deviceData);
        setDeviceWifiName(resolveDeviceWifiName(deviceData));
        setDeviceLoaded(true);
        setDeviceError(null);
        setFirebaseConnected("Yes");
      },
      (error) => {
        setFirebaseConnected("Error");
        setDeviceError(error.message);
        setDeviceLoaded(true);
        toast.error(`Failed to listen to device status: ${error.message}`);
      }
    );
    unsubscribers.push(deviceUnsubscribe);

    slotIds.forEach((slotId, index) => {
      const slotRef = ref(db, `slots/${slotId}`);
      const slotUnsubscribe = onValue(
        slotRef,
        (snapshot: DataSnapshot) => {
          const raw = snapshot.val() || {};
          setSlotsState((prev) => ({
            ...prev,
            [slotId]: {
              loaded: true,
              medication_name: typeof raw.medication_name === "string" ? raw.medication_name : "",
              stock_current: raw.stock_current !== undefined ? Number(raw.stock_current) : 0,
              stock_max: raw.stock_max !== undefined ? Number(raw.stock_max) : 100,
              status: typeof raw.status === "string" ? raw.status : "unknown",
            },
          }));
          setSlotsError((prev) => ({ ...prev, [slotId]: null }));
          if (slotId === "slot1") {
            setDebugSlot1Medication(raw.medication_name ?? "(no value)");
          }
          setFirebaseConnected("Yes");
        },
        (error) => {
          setFirebaseConnected("Error");
          setSlotsError((prev) => ({ ...prev, [slotId]: error.message }));
          toast.error(`Failed to listen to Slot ${index + 1}: ${error.message}`);
        }
      );
      unsubscribers.push(slotUnsubscribe);
    });

    const alertsRef = ref(db, "alerts");
    const alertsUnsubscribe = onValue(
      alertsRef,
      (snapshot: DataSnapshot) => {
        const raw = snapshot.val();
        const items: Alert[] = raw
          ? Array.isArray(raw)
            ? raw.filter(Boolean)
            : Object.values(raw)
          : [];
        const unresolved = items.filter((item: Alert) => item?.resolved === false);

        unresolved.sort((a, b) => {
          const valA = typeof a.timestamp === "number" ? a.timestamp : new Date(a.timestamp).getTime() || 0;
          const valB = typeof b.timestamp === "number" ? b.timestamp : new Date(b.timestamp).getTime() || 0;
          return valB - valA;
        });

        setUnresolvedAlerts(unresolved);
        setAlertsError(null);
        setAlertsLoaded(true);
        setFirebaseConnected("Yes");
      },
      (error) => {
        setFirebaseConnected("Error");
        setAlertsError(error.message);
        setAlertsLoaded(true);
        toast.error(`Failed to listen to alerts: ${error.message}`);
      }
    );
    unsubscribers.push(alertsUnsubscribe);

    const dispenseRef = ref(db, "dispense_log");
    const dispenseUnsubscribe = onValue(dispenseRef, (snapshot: DataSnapshot) => {
      const raw = snapshot.val();
      const items: DispenseLog[] = raw
        ? Object.entries(raw).map(([key, value]: [string, any]) => ({
            key,
            ...value,
          }))
        : [];
      items.sort((a, b) => b.timestamp - a.timestamp);
      setDispenseLogs(items);
      setFirebaseConnected("Yes");
    });
    unsubscribers.push(dispenseUnsubscribe);

    const inventoryRef = ref(db, "inventory_log");
    const inventoryUnsubscribe = onValue(inventoryRef, (snapshot: DataSnapshot) => {
      const raw = snapshot.val();
      const items: InventoryLog[] = raw
        ? Object.entries(raw).map(([, value]: [string, any]) => value)
        : [];
      items.sort((a, b) => b.timestamp - a.timestamp);
      setInventoryLogs(items);
      setFirebaseConnected("Yes");
    });
    unsubscribers.push(inventoryUnsubscribe);

    const scheduleRef = ref(db, "schedule");
    const scheduleUnsubscribe = onValue(scheduleRef, (snapshot: DataSnapshot) => {
      const raw = snapshot.val();
      const items: ScheduleEntry[] = raw
        ? Object.entries(raw).map(([key, value]: [string, any]) => ({
            key,
            ...value,
          }))
        : [];
      setSchedules(items);
      setFirebaseConnected("Yes");
    });
    unsubscribers.push(scheduleUnsubscribe);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setHeartbeatClock(Date.now());
    }, 5000);

    return () => {
      window.clearInterval(timer);
    };
  }, []);

  const unresolvedCount = unresolvedAlerts.length;
  const latestAlertMessage = unresolvedAlerts[0]?.message || unresolvedAlerts[0]?.title || "";

  const derivedDeviceStatus = getDerivedDeviceStatus(deviceHeartbeatState, heartbeatClock);
  const deviceStatusReason = getDeviceStatusReason(deviceHeartbeatState, heartbeatClock);
  const deviceActivityLabel = derivedDeviceStatus === "online" ? "Heartbeat Active" : "No Heartbeat Activity";
  const hasLiveWifiSignal = derivedDeviceStatus === "online" && deviceWifiName !== "Unavailable";

  useEffect(() => {
    setDeviceStatus(derivedDeviceStatus);
  }, [derivedDeviceStatus]);

  const getStatusBadge = () => {
    if (!deviceLoaded) {
      return "text-muted-foreground animate-pulse";
    }
    if (derivedDeviceStatus === "online") {
      return "text-success font-semibold";
    }
    return "text-destructive font-semibold";
  };

  const getStatusLabel = () => {
    if (!deviceLoaded) return "Loading...";
    if (derivedDeviceStatus === "online") return "Online";
    return "Offline";
  };

  const getSlotStatus = (stock: number, max: number, dbStatus?: string) => {
    if (dbStatus) {
      const lower = dbStatus.toLowerCase();
      if (lower === "low_stock") return "low_stock";
      if (lower === "active" || lower === "low" || lower === "empty") {
        return lower as "active" | "low" | "empty" | "low_stock";
      }
    }
    if (stock <= 0) return "empty";
    if (stock <= 10 || stock / max <= 0.2) return "low";
    return "active";
  };

  const today = new Date();
  const todayKey = toDateKey(today);
  const activeSchedules = schedules.filter((schedule) => schedule.active !== false);
  const todaysTimeline = buildTodayTimeline(activeSchedules, dispenseLogs, today);
  const scheduledToday = todaysTimeline.length;
  const takenToday = todaysTimeline.filter((item) => item.state === "done").length;
  const missedToday = dispenseLogs.filter((log) => (
    toDateKey(new Date(log.timestamp)) === todayKey && log.status === "missed"
  )).length;
  const pendingToday = Math.max(scheduledToday - takenToday - missedToday, 0);
  const complianceToday = scheduledToday > 0 ? Math.round((takenToday / scheduledToday) * 100) : 0;
  const recentActivity = buildRecentActivity(dispenseLogs, inventoryLogs).slice(0, 8);
  const headerDate = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good Morning, Eleanor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {headerDate} · {scheduledToday} doses scheduled today across 3 slots.
          </p>
        </div>
        <Link
          to="/schedule"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs hover:bg-surface-2 transition-colors duration-200"
        >
          Review Schedule <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="panel rounded-lg border border-dashed border-secondary/50 bg-secondary/5 p-4 text-sm text-muted-foreground transition-all duration-300">
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium text-foreground">Firebase Connection</span>
          <span
            className={`rounded-full px-2 py-1 text-[11px] font-semibold transition-colors duration-300 ${
              firebaseConnected === "Yes"
                ? "bg-success/10 text-success"
                : firebaseConnected === "Error"
                  ? "bg-destructive/10 text-destructive animate-pulse"
                  : "bg-warning/10 text-warning animate-pulse"
            }`}
          >
            {firebaseConnected === "Yes" ? "Connected" : firebaseConnected === "Error" ? "Connection Error" : "Connecting..."}
          </span>
        </div>
        <div className="mt-3 grid gap-2 text-[13px]">
          <div>
            <span className="font-medium text-foreground">Device Status:</span>{" "}
            {debugDeviceStatus
              ? debugDeviceStatus.charAt(0).toUpperCase() + debugDeviceStatus.slice(1)
              : "Loading..."}
          </div>
          <div>
            <span className="font-medium text-foreground">Slot 1 Medication:</span> {debugSlot1Medication ?? "Loading..."}
          </div>
        </div>
      </div>

      {alertsError ? (
        <div className="rounded-md border border-destructive/20 bg-destructive/5 px-4 py-3 text-xs text-destructive flex items-center justify-between">
          <span>Failed to load alerts: {alertsError}</span>
          <CircleDot className="h-4 w-4 text-destructive shrink-0" />
        </div>
      ) : !alertsLoaded ? (
        <div className="flex items-center gap-3 rounded-md border border-border bg-muted/20 px-4 py-3 text-sm animate-pulse">
          <div className="h-4 w-4 rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-28 rounded bg-muted" />
            <div className="h-2.5 w-48 rounded bg-muted" />
          </div>
        </div>
      ) : unresolvedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm transition-all duration-300 hover:bg-destructive/10">
          <CircleDot className="h-4 w-4 text-destructive animate-pulse" />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground">
              {unresolvedCount} Unresolved Alert{unresolvedCount > 1 ? "s" : ""}
            </p>
            {latestAlertMessage ? (
              <p className="text-muted-foreground text-xs truncate mt-0.5">
                Latest: {latestAlertMessage}
              </p>
            ) : null}
          </div>
          <Link to="/alerts" className="ml-auto text-xs font-medium text-primary hover:underline">
            View All →
          </Link>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Scheduled Today" value={scheduledToday} hint="Across 3 Dispenser Slots" Icon={TimerReset} accent="primary" />
        <StatTile label="Taken" value={takenToday} hint={`${pendingToday} Pending Later Today`} Icon={Check} accent="success" />
        <StatTile label="Missed" value={missedToday} hint="From Today's Dispense Logs" Icon={X} accent="destructive" />
        <StatTile label="Compliance" value={`${complianceToday}%`} hint="Today's Scheduled Dose Completion" Icon={ActivityIcon} accent="warning" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Dispenser Slots</h2>
              <p className="text-[11px] text-muted-foreground">Live State From MediStock</p>
            </div>
            <Link to="/inventory" className="text-[11px] text-primary hover:underline">Manage Inventory</Link>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {slotIds.map((slotId, index) => {
              const error = slotsError[slotId];
              const slot = slotsState[slotId];

              if (error) {
                return (
                  <article key={slotId} className="panel border-l-2 border-l-destructive p-4 bg-destructive/5 transition-all duration-300">
                    <div className="flex items-center justify-between text-destructive">
                      <span className="text-[11px] font-semibold uppercase tracking-wider">Slot 0{index + 1} Error</span>
                      <X className="h-4 w-4 animate-pulse" />
                    </div>
                    <p className="mt-3 text-xs text-muted-foreground">{error}</p>
                  </article>
                );
              }

              if (!slot.loaded) {
                return (
                  <article key={slotId} className="panel border-l-2 border-l-border p-4 animate-pulse">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-md bg-muted/50" />
                        <div className="h-3 w-12 rounded bg-muted/50" />
                      </div>
                      <div className="h-4 w-4 rounded-full bg-muted/50" />
                    </div>
                    <div className="mt-4 h-5 w-3/4 rounded bg-muted/50" />
                    <div className="mt-2 h-3 w-1/3 rounded bg-muted/50" />
                    <div className="mt-4 h-1.5 w-full rounded bg-muted/50" />
                  </article>
                );
              }

              const maxCapacity = slot.stock_max || 100;
              const status = getSlotStatus(slot.stock_current, maxCapacity, slot.status);
              const displayName = slot.medication_name || "Unknown Medication";
              const stockValue = Math.max(0, slot.stock_current);
              const isLowStock = slot.status === "low_stock";

              return (
                <article key={slotId} className={`panel border-l-2 ${slotTint[status]} p-4 transition-all duration-300 hover:shadow-md`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                        0{index + 1}
                      </span>
                      {isLowStock ? (
                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive uppercase tracking-wider">
                          Low Stock
                        </span>
                      ) : (
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {status === "active" ? "Active" : status === "low" ? "Low Stock" : status === "empty" ? "Empty" : status}
                        </span>
                      )}
                    </div>
                    <Pill className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-medium leading-tight">{displayName}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">Stock: {stockValue}</div>
                  </div>
                  <div className="mt-4">
                    <StockBar value={Math.min(stockValue, maxCapacity)} capacity={maxCapacity} />
                  </div>
                </article>
              );
            })}
          </div>

          <div className="panel mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-semibold">Recent Activity</h3>
              <span className="text-[11px] text-muted-foreground">Live Firebase Events</span>
            </div>
            <ul className="divide-y divide-border">
              {recentActivity.length > 0 ? recentActivity.map((item) => {
                const cls =
                  item.tone === "primary" ? "text-primary" :
                  item.tone === "destructive" ? "text-destructive" :
                  item.tone === "warning" ? "text-warning" : "text-success";
                return (
                  <li key={item.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 px-4 py-2.5 text-xs hover:bg-muted/10 transition-colors duration-150">
                    <span className="text-mono text-muted-foreground">
                      {new Date(item.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="truncate">{item.label}</span>
                    <span className={`text-[11px] font-medium ${cls}`}>{item.action}</span>
                  </li>
                );
              }) : (
                <li className="px-4 py-4 text-xs text-muted-foreground">No Recent Activity</li>
              )}
            </ul>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Device</h3>
              {deviceError ? (
                <span className="text-[11px] text-destructive font-semibold">Error Loading</span>
              ) : (
                <span className={`text-[11px] ${getStatusBadge()}`}>● {getStatusLabel()}</span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="text-muted-foreground">Name</div>
              <div className="text-right text-mono">MediStock</div>
              <div className="text-muted-foreground">Wi-Fi Name</div>
              <div className="flex items-center justify-end gap-1.5 text-mono">
                <Wifi className="h-3 w-3" /> {hasLiveWifiSignal ? deviceWifiName : "No Signal"}
              </div>
              <div className="text-muted-foreground">Device Id</div>
              <div className="text-right text-mono">{String(deviceInfo.device_id ?? "Unavailable")}</div>
              <div className="text-muted-foreground">Activity</div>
              <div className={`text-right text-mono ${derivedDeviceStatus === "online" ? "text-success" : "text-destructive"}`}>
                {deviceActivityLabel}
              </div>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">{deviceStatusReason}</p>
          </div>

          <div className="panel p-4">
            <h3 className="text-sm font-semibold">Today's Timeline</h3>
            <ol className="mt-3 space-y-3">
              {todaysTimeline.length > 0 ? todaysTimeline.map((item) => (
                <li key={item.id} className="flex items-start gap-3">
                  <span className="mt-1 grid h-2 w-2 shrink-0 place-items-center">
                    <span className={`h-2 w-2 rounded-full ${item.state === "done" ? "bg-success" : item.state === "now" ? "bg-primary animate-pulse" : "bg-muted-foreground/40"}`} />
                  </span>
                  <div className="flex-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-mono text-muted-foreground">{item.time}</span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{item.state}</span>
                    </div>
                    <div className="text-sm">{item.label}</div>
                  </div>
                </li>
              )) : (
                <li className="text-sm text-muted-foreground">No Scheduled Doses For Today</li>
              )}
            </ol>
          </div>
        </aside>
      </div>
    </div>
  );
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeSlot(slot: number | string | undefined | null) {
  if (slot === 1 || slot === "1" || slot === "slot1") return 1;
  if (slot === 2 || slot === "2" || slot === "slot2") return 2;
  if (slot === 3 || slot === "3" || slot === "slot3") return 3;
  return null;
}

function normalizeScheduleDays(days: ScheduleEntry["days"]) {
  const weekDayMap: Record<string, number> = {
    sun: 0,
    mon: 1,
    tue: 2,
    wed: 3,
    thu: 4,
    fri: 5,
    sat: 6,
  };
  if (!Array.isArray(days)) return [];
  return days
    .map((day) => {
      if (typeof day === "number") return day;
      const namedDay = weekDayMap[String(day).slice(0, 3).toLowerCase()];
      if (namedDay !== undefined) return namedDay;
      const numericDay = Number(day);
      return Number.isNaN(numericDay) ? -1 : numericDay;
    })
    .filter((day) => day >= 0 && day <= 6);
}

function scheduleRunsOnDate(schedule: ScheduleEntry, date: Date) {
  const dateKey = toDateKey(date);
  if (schedule.active === false) return false;
  if (schedule.start_date && schedule.start_date > dateKey) return false;
  if (schedule.end_date && schedule.end_date < dateKey) return false;
  if (schedule.frequency === "weekly") {
    return normalizeScheduleDays(schedule.days).includes(date.getDay());
  }
  return true;
}

function buildTodayTimeline(
  schedules: ScheduleEntry[],
  dispenseLogs: DispenseLog[],
  date: Date
): TimelineItem[] {
  const nowMinutes = date.getHours() * 60 + date.getMinutes();
  const todayKey = toDateKey(date);
  const dispensedToday = dispenseLogs.filter((log) => (
    log.status === "dispensed" && toDateKey(new Date(log.timestamp)) === todayKey
  ));

  return schedules
    .filter((schedule) => scheduleRunsOnDate(schedule, date))
    .flatMap((schedule) => {
      const times = Array.isArray(schedule.times) && schedule.times.length > 0 ? schedule.times : ["00:00"];
      return times.map((time, index) => {
        const [hours, minutes] = time.split(":").map((value) => Number(value) || 0);
        const scheduleMinutes = hours * 60 + minutes;
        const matchingDispense = dispensedToday.find((log) => (
          normalizeSlot(log.slot) === normalizeSlot(schedule.slot)
          && log.medication_name === schedule.medication_name
        ));

        let state: TimelineItem["state"] = "next";
        if (matchingDispense) {
          state = "done";
        } else if (scheduleMinutes <= nowMinutes) {
          state = "now";
        }

        return {
          id: `${schedule.key ?? schedule.medication_name}-${time}-${index}`,
          time,
          label: `${schedule.medication_name} · Slot ${normalizeSlot(schedule.slot) ?? "?"}`,
          state,
        };
      });
    })
    .sort((a, b) => a.time.localeCompare(b.time));
}

function buildRecentActivity(
  dispenseLogs: DispenseLog[],
  inventoryLogs: InventoryLog[]
): RecentActivityItem[] {
  const dispenseItems: RecentActivityItem[] = dispenseLogs.map((log, index) => ({
    id: `dispense-${log.key ?? index}`,
    timestamp: log.timestamp,
    label: `${log.medication_name} · Slot ${log.slot}`,
    action: toTitleCase(log.status),
    tone: log.status === "missed" || log.status === "jammed" ? "destructive" : "primary",
  }));

  const inventoryItems: RecentActivityItem[] = inventoryLogs.map((log, index) => ({
    id: `inventory-${index}-${log.timestamp}`,
    timestamp: log.timestamp,
    label: `${log.medication_name} · Slot ${log.slot}`,
    action: log.action === "added" ? "Refilled" : toTitleCase(log.action),
    tone: log.action === "added" ? "warning" : "success",
  }));

  return [...dispenseItems, ...inventoryItems].sort((a, b) => b.timestamp - a.timestamp);
}

function toTitleCase(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toFiniteNumber(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeHeartbeatTimestamp(value: number | null) {
  if (value === null || value <= 0) return null;
  if (value > 1_000_000_000_000) return value;
  if (value > 1_000_000_000) return value * 1000;
  return null;
}

function getDerivedDeviceStatus(state: DeviceHeartbeatState, now: number) {
  const rawOnline = state.rawStatus.toLowerCase() === "online";
  if (!rawOnline) return "offline";

  const normalizedHeartbeat = normalizeHeartbeatTimestamp(state.lastHeartbeatValue);
  if (normalizedHeartbeat !== null) {
    return now - normalizedHeartbeat <= DEVICE_HEARTBEAT_TIMEOUT_MS ? "online" : "offline";
  }

  if (state.lastAdvanceAt !== null) {
    return now - state.lastAdvanceAt <= DEVICE_HEARTBEAT_TIMEOUT_MS ? "online" : "offline";
  }

  return "offline";
}

function getDeviceStatusReason(state: DeviceHeartbeatState, now: number) {
  const rawOnline = state.rawStatus.toLowerCase() === "online";
  if (!rawOnline) {
    return "Firebase currently reports the ESP32 as offline.";
  }

  const normalizedHeartbeat = normalizeHeartbeatTimestamp(state.lastHeartbeatValue);
  if (normalizedHeartbeat !== null) {
    const staleFor = now - normalizedHeartbeat;
    if (staleFor <= DEVICE_HEARTBEAT_TIMEOUT_MS) {
      return "Recent heartbeat detected from Firebase.";
    }
    return "No recent ESP32 heartbeat was detected in Firebase.";
  }

  if (state.lastAdvanceAt !== null) {
    return now - state.lastAdvanceAt <= DEVICE_HEARTBEAT_TIMEOUT_MS
      ? "Live ESP32 heartbeat activity is changing in Firebase."
      : "Firebase heartbeat values stopped changing, so the device is treated as offline.";
  }

  return "Firebase has not shown live heartbeat activity from the ESP32.";
}

function resolveDeviceWifiName(deviceData: Record<string, unknown>) {
  const settings = typeof deviceData.settings === "object" && deviceData.settings !== null
    ? deviceData.settings as Record<string, unknown>
    : {};
  const wifiFields = [
    deviceData.ssid,
    deviceData.wifi_name,
    deviceData.wifi_ssid,
    settings.ssid,
    settings.wifi_name,
    settings.wifi_ssid,
  ];
  const match = wifiFields.find((value) => typeof value === "string" && value.trim().length > 0);
  return typeof match === "string" ? match : "Unavailable";
}
