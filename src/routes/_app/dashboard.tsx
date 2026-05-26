import { useEffect, useRef, useState } from "react";
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

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview â€” MediStock" },
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
  jammed: "border-l-destructive",
  unknown: "border-l-border",
};

type SlotId = "slot1" | "slot2" | "slot3";

type SlotState = {
  medication_name: string;
  stock_current: number;
  stock_max: number;
  status: string;
  jammed: boolean;
  loaded: boolean;
};

const slotIds: SlotId[] = ["slot1", "slot2", "slot3"];

const initialSlotState: SlotState = {
  medication_name: "",
  stock_current: 0,
  stock_max: 100,
  status: "unknown",
  jammed: false,
  loaded: false,
};

interface Alert {
  type: string;
  slot?: string | number;
  message: string;
  timestamp: string | number;
  resolved: boolean;
  title?: string;
}

interface RecentActivity {
  id: string;
  slot: number | null;
  action: string;
  status: string;
  timeMs?: number;
  timestampS?: number;
  scheduledDoseId?: string;
}

interface DashboardSchedule {
  key: string;
  slot?: string | number;
  frequency?: string;
  times?: string[];
  days?: string[];
  start_date?: string;
  active?: boolean;
}

interface DashboardDevice {
  name: string;
  ssid: string;
  signal: number;
  lastSyncMs: number | null;
}

interface TimelineItem {
  id: string;
  time: string;
  label: string;
  state: "done" | "missed" | "now" | "next" | "pending";
}

const parseActivityTime = (raw: Record<string, unknown>) => {
  const timestamp = Number(raw.timestamp ?? raw.created_at ?? 0);
  const timestampS = Number(raw.timestamp_s ?? 0);

  if (Number.isFinite(timestamp) && timestamp > 0) {
    return timestamp < 2000000000 ? { timeMs: timestamp * 1000 } : { timeMs: timestamp };
  }

  if (Number.isFinite(timestampS) && timestampS > 0) return { timestampS };
  return {};
};

const parseActivitySlot = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    return match ? Number(match[0]) : null;
  }
  return null;
};

const activityAction = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === "dispensed") return "Dispensed";
  if (normalized === "jammed") return "Jammed";
  if (normalized === "missed") return "Missed";
  if (normalized === "cancelled") return "Cancelled";
  return status ? status.charAt(0).toUpperCase() + status.slice(1) : "Activity";
};

const activityClass = (action: string) =>
  action === "Dispensed" ? "text-primary" :
  action === "Missed" || action === "Jammed" ? "text-destructive" :
  action === "Cancelled" ? "text-warning" :
  "text-success";

const formatActivityTime = (activity: RecentActivity) => {
  if (activity.timeMs) {
    return new Date(activity.timeMs).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  if (activity.timestampS) return `${Math.round(activity.timestampS)}s`;
  return "Live";
};

const normalizeActivity = (id: string, raw: unknown): RecentActivity | null => {
  if (!raw || typeof raw !== "object") return null;

  const data = raw as Record<string, unknown>;
  const status = typeof data.status === "string" ? data.status : "";
  const action = activityAction(status);

  return {
    id,
    slot: parseActivitySlot(data.slot),
    action,
    status,
    scheduledDoseId: typeof data.scheduled_dose_id === "string" ? data.scheduled_dose_id : undefined,
    ...parseActivityTime(data),
  };
};

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function localDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function normalizeDoseId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function scheduledDateTime(date: Date, time: string) {
  const [hours = "0", minutes = "0"] = time.split(":");
  const scheduled = new Date(date);
  scheduled.setHours(Number(hours), Number(minutes), 0, 0);
  return scheduled;
}

function scheduleRunsOnDate(schedule: DashboardSchedule, date: Date) {
  if (schedule.active === false) return false;
  const dateText = localDateKey(date);
  if (schedule.start_date && schedule.start_date > dateText) return false;

  if (schedule.frequency === "weekly") {
    const days = schedule.days || [];
    return days.length === 0 || days.includes(WEEK_DAYS[date.getDay()]);
  }

  return true;
}

function scheduledOccurrencesForDate(schedules: DashboardSchedule[], date: Date) {
  const dateText = localDateKey(date);

  return schedules
    .filter((schedule) => scheduleRunsOnDate(schedule, date))
    .flatMap((schedule) =>
      (schedule.times?.length ? schedule.times : ["08:00"]).map((time) => ({
        id: normalizeDoseId(`${schedule.key}_${dateText}_${time}`),
        schedule,
        time,
        at: scheduledDateTime(date, time),
      }))
    )
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

function normalizeSignalPercent(value: unknown) {
  const signal = Number(value);
  if (!Number.isFinite(signal)) return 0;
  if (signal >= 0 && signal <= 100) return Math.round(signal);
  return Math.max(0, Math.min(100, Math.round(((signal + 100) / 50) * 100)));
}

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
      {hint && <div className="mt-3 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function DashboardPage() {
  const jammedSlotsRef = useRef<Record<SlotId, boolean>>({
    slot1: false,
    slot2: false,
    slot3: false,
  });
  const [slotsState, setSlotsState] = useState<Record<SlotId, SlotState>>({
    slot1: { ...initialSlotState },
    slot2: { ...initialSlotState },
    slot3: { ...initialSlotState },
  });
  const [deviceStatus, setDeviceStatus] = useState<"online" | "offline" | "unknown">("unknown");
  const [unresolvedAlerts, setUnresolvedAlerts] = useState<Alert[]>([]);
  const [recentActivity, setRecentActivity] = useState<RecentActivity[]>([]);
  const [allActivity, setAllActivity] = useState<RecentActivity[]>([]);
  const [schedules, setSchedules] = useState<DashboardSchedule[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<DashboardDevice>({
    name: "Loading...",
    ssid: "Loading...",
    signal: 0,
    lastSyncMs: null,
  });
  const [firebaseConnected, setFirebaseConnected] = useState<"Yes" | "No" | "Error">("No");
  const [now, setNow] = useState(() => new Date());
  
  // Loading and Error states
  const [deviceLoaded, setDeviceLoaded] = useState(false);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [activityLoaded, setActivityLoaded] = useState(false);
  const [schedulesLoaded, setSchedulesLoaded] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const [slotsError, setSlotsError] = useState<Record<SlotId, string | null>>({
    slot1: null,
    slot2: null,
    slot3: null,
  });

  const [debugDeviceStatus, setDebugDeviceStatus] = useState<string | null>(null);
  const [debugSlot1Medication, setDebugSlot1Medication] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const unsubscribers: Array<() => void> = [];

    // 1. Listen to device status
    const statusRef = ref(db, "device");
    const statusUnsubscribe = onValue(
      statusRef,
      (snapshot: DataSnapshot) => {
        const raw = snapshot.val() || {};
        const status = typeof raw.status === "string" ? raw.status : "offline";
        console.log("Firebase /device:", raw);
        setDeviceStatus(status === "online" ? "online" : "offline");
        setDebugDeviceStatus(status ?? "(no value)");
        setDeviceInfo({
          name: raw.name || raw.device_id || "Not reported",
          ssid: raw.ssid || raw.wifi_ssid || "Not reported",
          signal: normalizeSignalPercent(raw.signal ?? raw.wifi_strength),
          lastSyncMs: Date.now(),
        });
        setDeviceLoaded(true);
        setDeviceError(null);
        setFirebaseConnected("Yes");
      },
      (error) => {
        console.error("Firebase status listener error:", error);
        setFirebaseConnected("Error");
        setDeviceError(error.message);
        setDeviceLoaded(true);
        toast.error(`Failed to listen to device status: ${error.message}`);
      }
    );
    unsubscribers.push(statusUnsubscribe);

    // 2. Listen to slots separately
    slotIds.forEach((slotId, index) => {
      const slotRef = ref(db, `slots/${slotId}`);
      const slotUnsubscribe = onValue(
        slotRef,
        (snapshot: DataSnapshot) => {
          const raw = snapshot.val() || {};
          console.log(`Firebase /slots/${slotId}:`, raw);
          const rawStatus = typeof raw.status === "string" ? raw.status : "unknown";
          const isJammed = raw.jammed === true || rawStatus.toLowerCase() === "jammed";

          if (isJammed && !jammedSlotsRef.current[slotId]) {
            toast.error(`Slot ${index + 1} is jammed`, {
              id: `slot-${index + 1}-jammed`,
              description: "No medicine was detected after dispensing. Please check the dispenser.",
              duration: 10000,
            });
          }
          jammedSlotsRef.current[slotId] = isJammed;

          setSlotsState((prev) => ({
            ...prev,
            [slotId]: {
              loaded: true,
              medication_name: typeof raw.medication_name === "string" ? raw.medication_name : "",
              stock_current: raw.stock_current !== undefined ? Number(raw.stock_current) : 0,
              stock_max: raw.stock_max !== undefined ? Number(raw.stock_max) : 100,
              status: rawStatus,
              jammed: isJammed,
            },
          }));
          setSlotsError((prev) => ({ ...prev, [slotId]: null }));
          if (slotId === "slot1") {
            setDebugSlot1Medication(raw.medication_name ?? "(no value)");
          }
          setFirebaseConnected("Yes");
        },
        (error) => {
          console.error(`Firebase slot ${slotId} listener error:`, error);
          setFirebaseConnected("Error");
          setSlotsError((prev) => ({ ...prev, [slotId]: error.message }));
          toast.error(`Failed to listen to Slot ${index + 1}: ${error.message}`);
        }
      );
      unsubscribers.push(slotUnsubscribe);
    });

    // 3. Listen to unresolved alerts
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
        
        // Sort by timestamp descending so the newest alert is first
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
        console.error("Firebase alerts listener error:", error);
        setFirebaseConnected("Error");
        setAlertsError(error.message);
        setAlertsLoaded(true);
        toast.error(`Failed to listen to alerts: ${error.message}`);
      }
    );
    unsubscribers.push(alertsUnsubscribe);

    // 4. Listen to schedules for realtime summary totals
    const schedulesRef = ref(db, "schedule");
    const schedulesUnsubscribe = onValue(
      schedulesRef,
      (snapshot: DataSnapshot) => {
        const raw = snapshot.val();
        const items: DashboardSchedule[] = raw && typeof raw === "object"
          ? Object.entries(raw).map(([key, value]) => ({
              key,
              ...(value as Omit<DashboardSchedule, "key">),
            }))
          : [];

        setSchedules(items);
        setSchedulesLoaded(true);
        setSchedulesError(null);
        setFirebaseConnected("Yes");
      },
      (error) => {
        console.error("Firebase schedule listener error:", error);
        setFirebaseConnected("Error");
        setSchedulesError(error.message);
        setSchedulesLoaded(true);
        toast.error(`Failed to listen to schedules: ${error.message}`);
      }
    );
    unsubscribers.push(schedulesUnsubscribe);

    // 5. Listen to recent dispense activity
    const activityRef = ref(db, "dispense_log");
    const activityUnsubscribe = onValue(
      activityRef,
      (snapshot: DataSnapshot) => {
        const raw = snapshot.val();
        const items: RecentActivity[] = raw && typeof raw === "object"
          ? Object.entries(raw)
              .map(([key, value]) => normalizeActivity(key, value))
              .filter((item): item is RecentActivity => Boolean(item))
          : [];

        items.sort((a, b) => (b.timeMs ?? b.timestampS ?? 0) - (a.timeMs ?? a.timestampS ?? 0));
        setAllActivity(items);
        setRecentActivity(items.slice(0, 8));
        setActivityError(null);
        setActivityLoaded(true);
        setFirebaseConnected("Yes");
      },
      (error) => {
        console.error("Firebase dispense_log listener error:", error);
        setFirebaseConnected("Error");
        setActivityError(error.message);
        setActivityLoaded(true);
        toast.error(`Failed to listen to recent activity: ${error.message}`);
      }
    );
    unsubscribers.push(activityUnsubscribe);

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, []);

  const unresolvedCount = unresolvedAlerts.length;
  const latestAlertMessage = unresolvedAlerts[0]?.message || unresolvedAlerts[0]?.title || "";

  const getStatusBadge = () => {
    if (!deviceLoaded) {
      return "text-muted-foreground animate-pulse";
    }
    if (deviceStatus === "online") {
      return "text-success font-semibold";
    }
    return "text-destructive font-semibold";
  };

  const getStatusLabel = () => {
    if (!deviceLoaded) return "Loading...";
    if (deviceStatus === "online") return "Online";
    return "Offline";
  };

  const getSlotStatus = (stock: number, max: number, dbStatus?: string) => {
    if (dbStatus) {
      const lower = dbStatus.toLowerCase();
      if (lower === "jammed") return "jammed";
      if (lower === "low_stock") return "low_stock";
      if (lower === "active" || lower === "low" || lower === "empty") {
        return lower as "active" | "low" | "empty" | "low_stock" | "jammed";
      }
    }
    if (stock <= 0) return "empty";
    if (stock <= 10 || (stock / max) <= 0.2) return "low";
    return "active";
  };

  const todayStart = startOfDay(now);
  const tomorrowStart = new Date(todayStart);
  tomorrowStart.setDate(tomorrowStart.getDate() + 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);

  const todayOccurrences = scheduledOccurrencesForDate(schedules, now);
  const todayLogs = allActivity.filter(
    (item) => item.timeMs && item.timeMs >= todayStart.getTime() && item.timeMs < tomorrowStart.getTime()
  );
  const missedTodayIds = new Set(
    todayLogs
      .filter((item) => item.status.toLowerCase() === "missed")
      .map((item) => item.scheduledDoseId || item.id)
  );
  const takenTodayIds = new Set(
    todayLogs
      .filter((item) => item.status.toLowerCase() === "dispensed")
      .filter((item) => !missedTodayIds.has(item.scheduledDoseId || item.id))
      .map((item) => item.scheduledDoseId || item.id)
  );
  const pendingLaterToday = Math.max(
    0,
    todayOccurrences.filter((occurrence) => occurrence.at.getTime() > now.getTime()).length
  );

  const rollingLogs = allActivity.filter(
    (item) => item.timeMs && item.timeMs >= weekStart.getTime() && item.timeMs < tomorrowStart.getTime()
  );
  const rollingMissedIds = new Set(
    rollingLogs
      .filter((item) => item.status.toLowerCase() === "missed")
      .map((item) => item.scheduledDoseId || item.id)
  );
  const rollingTakenIds = new Set(
    rollingLogs
      .filter((item) => item.status.toLowerCase() === "dispensed")
      .filter((item) => !rollingMissedIds.has(item.scheduledDoseId || item.id))
      .map((item) => item.scheduledDoseId || item.id)
  );
  const rollingTotal = rollingTakenIds.size + rollingMissedIds.size;
  const compliance = rollingTotal > 0 ? Math.round((rollingTakenIds.size / rollingTotal) * 100) : 0;
  const todayLabel = now.toLocaleDateString([], {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const pendingOccurrences = todayOccurrences.filter(
    (occurrence) => !takenTodayIds.has(occurrence.id) && !missedTodayIds.has(occurrence.id)
  );
  const currentPending = [...pendingOccurrences]
    .filter((occurrence) => occurrence.at.getTime() <= now.getTime())
    .pop();
  const nextPending = pendingOccurrences.find((occurrence) => occurrence.at.getTime() > now.getTime());
  const timelineItems: TimelineItem[] = todayOccurrences.map((occurrence) => {
    let state: TimelineItem["state"] = "pending";
    if (takenTodayIds.has(occurrence.id)) state = "done";
    else if (missedTodayIds.has(occurrence.id)) state = "missed";
    else if (currentPending?.id === occurrence.id) state = "now";
    else if (nextPending?.id === occurrence.id) state = "next";

    const slotText = occurrence.schedule.slot ? `Slot ${parseActivitySlot(occurrence.schedule.slot) ?? occurrence.schedule.slot}` : "Slot";

    return {
      id: occurrence.id,
      time: occurrence.time,
      label: `${occurrence.schedule.medication_name || "Unnamed medication"} · ${slotText}`,
      state,
    };
  });
  const lastSyncLabel = deviceInfo.lastSyncMs
    ? new Date(deviceInfo.lastSyncMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
    : "Waiting...";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Good Morning, Eleanor</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {todayLabel} {"\u00b7"} {todayOccurrences.length} doses scheduled today across 3 slots.
          </p>
        </div>
        <Link
          to="/schedule"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-xs hover:bg-surface-2 transition-colors duration-200"
        >
          Review schedule <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Firebase Connection Status Debug */}
      <div className="panel rounded-lg border border-dashed border-secondary/50 bg-secondary/5 p-4 text-sm text-muted-foreground transition-all duration-300">
        <div className="flex items-center justify-between gap-4">
          <span className="font-medium text-foreground">Firebase Connection</span>
          <span className={
            `rounded-full px-2 py-1 text-[11px] font-semibold transition-colors duration-300 ${
              firebaseConnected === "Yes" ? "bg-success/10 text-success" : 
              firebaseConnected === "Error" ? "bg-destructive/10 text-destructive animate-pulse" : 
              "bg-warning/10 text-warning animate-pulse"
            }`
          }>
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

      {/* Alerts Section (Error -> Loading -> Banner) */}
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
            {latestAlertMessage && (
              <p className="text-muted-foreground text-xs truncate mt-0.5">
                Latest: {latestAlertMessage}
              </p>
            )}
          </div>
          <Link to="/alerts" className="ml-auto text-xs font-medium text-primary hover:underline">
            View all â†’
          </Link>
        </div>
      ) : null}

      {/* Summary tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Scheduled today"
          value={schedulesLoaded ? todayOccurrences.length : "..."}
          hint={schedulesError ? "Schedule listener unavailable" : "Across 3 dispenser slots"}
          Icon={TimerReset}
          accent="primary"
        />
        <StatTile
          label="Taken"
          value={activityLoaded ? takenTodayIds.size : "..."}
          hint={activityError ? "Dispense log unavailable" : `${pendingLaterToday} pending later today`}
          Icon={Check}
          accent="success"
        />
        <StatTile
          label="Missed"
          value={activityLoaded ? missedTodayIds.size : "..."}
          hint="Escalation triggered after 30s"
          Icon={X}
          accent="destructive"
        />
        <StatTile
          label="Compliance"
          value={activityLoaded ? `${compliance}%` : "..."}
          hint="7-day rolling average"
          Icon={ActivityIcon}
          accent="warning"
        />
      </div>

      {/* Main grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Slot cards span 2 cols */}
        <section className="lg:col-span-2 space-y-3">
          <div className="flex items-end justify-between">
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Dispenser Slots</h2>
              <p className="text-[11px] text-muted-foreground">Live state from Firebase</p>
            </div>
            <Link to="/inventory" className="text-[11px] text-primary hover:underline">Manage inventory</Link>
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
                    <p className="mt-3 text-xs text-muted-foreground">
                      {error}
                    </p>
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
              const displayName = slot.medication_name || "Unknown medication";
              const stockValue = Math.max(0, slot.stock_current);
              const isLowStock = slot.status === "low_stock";
              const isJammed = slot.jammed || status === "jammed";

              return (
                <article key={slotId} className={`panel border-l-2 ${slotTint[status]} p-4 transition-all duration-300 hover:shadow-md`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-md bg-muted text-[11px] font-semibold text-muted-foreground">
                        0{index + 1}
                      </span>
                      {isJammed ? (
                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive uppercase tracking-wider">
                          Jammed
                        </span>
                      ) : isLowStock ? (
                        <span className="rounded bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold text-destructive uppercase tracking-wider">
                          Low Stock
                        </span>
                      ) : (
                        <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          {status === "active" ? "Active" : status === "low" ? "Low stock" : status === "empty" ? "Empty" : status}
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

          {/* Activity table */}
          <div className="panel mt-4 overflow-hidden">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <h3 className="text-sm font-semibold">Recent activity</h3>
              <span className="text-[11px] text-muted-foreground">Realtime</span>
            </div>
            <ul className="divide-y divide-border">
              {activityError && (
                <li className="px-4 py-4 text-xs text-destructive">
                  Failed to load recent activity: {activityError}
                </li>
              )}
              {!activityError && !activityLoaded && (
                <li className="px-4 py-4 text-xs text-muted-foreground animate-pulse">
                  Loading realtime activity...
                </li>
              )}
              {!activityError && activityLoaded && recentActivity.length === 0 && (
                <li className="px-4 py-4 text-xs text-muted-foreground">
                  No recent realtime activity yet.
                </li>
              )}
              {!activityError && recentActivity.map((event) => {
                const cls = activityClass(event.action);
                const slotLabel = event.slot ? `Slot 0${event.slot}` : "Device";

                return (
                  <li key={event.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-3 px-4 py-2.5 text-xs hover:bg-muted/10 transition-colors duration-150">
                    <span className="text-mono text-muted-foreground">
                      {formatActivityTime(event)}
                    </span>
                    <span className="truncate">{slotLabel} · {event.action}</span>
                    <span className={`text-[11px] font-medium ${cls}`}>{event.action}</span>
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
              {deviceError ? (
                <span className="text-[11px] text-destructive font-semibold">
                  Error loading
                </span>
              ) : (
                <span className={`text-[11px] ${getStatusBadge()}`}>
                  â— {getStatusLabel()}
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="text-muted-foreground">Name</div>
              <div className="text-right text-mono">{deviceLoaded ? deviceInfo.name : "Loading..."}</div>
              <div className="text-muted-foreground">Wi-Fi</div>
              <div className="flex items-center justify-end gap-1.5 text-mono"><Wifi className="h-3 w-3" /> {deviceLoaded ? deviceInfo.ssid : "Loading..."}</div>
              <div className="text-muted-foreground">Signal</div>
              <div className="text-right text-mono">{deviceLoaded ? `${deviceInfo.signal}%` : "Loading..."}</div>
              <div className="text-muted-foreground">Last sync</div>
              <div className="text-right text-mono">{lastSyncLabel}</div>
            </div>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary" style={{ width: `${deviceInfo.signal}%` }} />
            </div>
          </div>

          <div className="panel p-4">
            <h3 className="text-sm font-semibold">Today's timeline</h3>
            <ol className="mt-3 space-y-3">
              {!schedulesLoaded && (
                <li className="text-xs text-muted-foreground animate-pulse">Loading today's schedule...</li>
              )}
              {schedulesLoaded && timelineItems.length === 0 && (
                <li className="text-xs text-muted-foreground">No doses scheduled today.</li>
              )}
              {timelineItems.map((t) => (
                <li key={t.id} className="flex items-start gap-3">
                  <span className="mt-1 grid h-2 w-2 shrink-0 place-items-center">
                    <span className={`h-2 w-2 rounded-full ${
                      t.state === "done"
                        ? "bg-success"
                        : t.state === "missed"
                        ? "bg-destructive"
                        : t.state === "now"
                        ? "bg-primary animate-pulse"
                        : "bg-muted-foreground/40"
                    }`} />
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

