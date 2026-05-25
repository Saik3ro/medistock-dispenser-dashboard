import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Filter, PackageX, PlugZap, Wrench } from "lucide-react";
import { db, onValue, ref } from "@/firebase";
import { resolveAlert, subscribeToAlerts } from "@/lib/firebase-service";
import type { Alert as FirebaseAlert, SlotData } from "@/types";

export const Route = createFileRoute("/_app/alerts")({
  head: () => ({
    meta: [
      { title: "Alerts - MediStock" },
      { name: "description", content: "System alerts: missed doses, low stock, faults, and confirmations." },
    ],
  }),
  component: AlertsPage,
});

type FilterKey = "all" | "unresolved" | "resolved";

type DisplayAlert = {
  id: string;
  type: "missed" | "low_stock" | "fault" | "dispensed" | "device";
  title: string;
  description: string;
  timestamp: number;
  severity: "critical" | "warning" | "info";
  resolved: boolean;
  source: "firebase" | "inventory" | "device";
  actionLabel?: string;
  alertKey?: string;
};

type DeviceHeartbeatState = {
  rawStatus: string;
  firstSeenAt: number | null;
  lastSnapshotAt: number | null;
  lastAdvanceAt: number | null;
  lastHeartbeatValue: number | null;
  uptimeValue: number | null;
};

const DEVICE_HEARTBEAT_TIMEOUT_MS = 45000;

function AlertsPage() {
  const [items, setItems] = useState<DisplayAlert[]>([]);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [deviceHeartbeatState, setDeviceHeartbeatState] = useState<DeviceHeartbeatState>({
    rawStatus: "offline",
    firstSeenAt: null,
    lastSnapshotAt: null,
    lastAdvanceAt: null,
    lastHeartbeatValue: null,
    uptimeValue: null,
  });
  const [heartbeatClock, setHeartbeatClock] = useState(Date.now());
  const [isResolving, setIsResolving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const unsubscribeAlerts = subscribeToAlerts((alerts) => {
      setItems((prev) => {
        const liveAlerts = prev.filter((item) => item.source !== "firebase");
        return [...mapFirebaseAlerts(alerts), ...liveAlerts];
      });
    }, 100);

    const slotsRef = ref(db, "/slots");
    const unsubscribeSlots = onValue(slotsRef, (snapshot) => {
      if (!snapshot.exists()) {
        setSlots([]);
        return;
      }

      const data = snapshot.val();
      const nextSlots: SlotData[] = [
        { slot_number: 1, ...data.slot1 },
        { slot_number: 2, ...data.slot2 },
        { slot_number: 3, ...data.slot3 },
      ].filter(Boolean);
      setSlots(nextSlots);
    });

    const deviceRef = ref(db, "/device");
    const unsubscribeDevice = onValue(deviceRef, (snapshot) => {
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
          lastAdvanceAt: heartbeatAdvanced || uptimeAdvanced ? now : prev.lastAdvanceAt,
          lastHeartbeatValue: heartbeatValue,
          uptimeValue,
        };
      });
    });

    return () => {
      unsubscribeAlerts();
      unsubscribeSlots();
      unsubscribeDevice();
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

  useEffect(() => {
    setItems((prev) => {
      const firebaseItems = prev.filter((item) => item.source === "firebase");
      const inventoryItems = buildInventoryAlerts(slots);
      const deviceItems = buildDeviceAlerts(deviceHeartbeatState, heartbeatClock);
      return [...firebaseItems, ...inventoryItems, ...deviceItems]
        .sort((a, b) => b.timestamp - a.timestamp);
    });
  }, [slots, deviceHeartbeatState, heartbeatClock]);

  const unresolved = items.filter((item) => !item.resolved);
  const criticalUnresolved = unresolved.filter((item) => item.severity === "critical");
  const visible = items.filter((item) => (
    filter === "all" ? true : filter === "unresolved" ? !item.resolved : item.resolved
  ));

  const toggle = async (item: DisplayAlert) => {
    if (!item.alertKey) return;

    setIsResolving((prev) => ({ ...prev, [item.id]: true }));
    try {
      if (item.resolved) {
        return;
      }
      await resolveAlert(item.alertKey);
    } finally {
      setIsResolving((prev) => ({ ...prev, [item.id]: false }));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
          <p className="mt-1 text-sm text-muted-foreground">{unresolved.length} Unresolved · {items.length} Total</p>
        </div>
        <div className="inline-flex items-center gap-2 rounded-md border border-border bg-surface p-0.5 text-xs">
          <Filter className="ml-2 h-3.5 w-3.5 text-muted-foreground" />
          {(["all", "unresolved", "resolved"] as const).map((entry) => (
            <button
              key={entry}
              onClick={() => setFilter(entry)}
              className={`rounded-[6px] px-3 py-1.5 capitalize ${filter === entry ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {entry}
            </button>
          ))}
        </div>
      </div>

      {criticalUnresolved.length > 0 ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" /> High-Risk Alerts Require Attention
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {criticalUnresolved.length} critical alert{criticalUnresolved.length > 1 ? "s" : ""} unresolved. Inventory status and ESP32 activity are reflected here in real time.
          </p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {visible.map((item) => {
          const Icon = iconFor(item.type);
          const canResolve = item.source === "firebase" && Boolean(item.alertKey);
          return (
            <li key={item.id} className="panel p-4">
              <div className="flex items-start gap-3">
                <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-md border ${tintFor(item.severity)}`}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-sm font-medium">{item.title}</span>
                    <span className="text-[11px] text-mono text-muted-foreground">
                      {new Date(item.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p>
                </div>
                {canResolve ? (
                  <button
                    onClick={() => toggle(item)}
                    disabled={item.resolved || isResolving[item.id]}
                    className={`shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-surface-2 disabled:opacity-60 ${item.resolved ? "text-muted-foreground" : "text-primary"}`}
                  >
                    {item.resolved ? "Resolved" : isResolving[item.id] ? "Resolving..." : "Resolve"}
                  </button>
                ) : (
                  <span className={`shrink-0 rounded-md border border-border px-2.5 py-1 text-[11px] ${item.resolved ? "text-muted-foreground" : "text-primary"}`}>
                    {item.actionLabel ?? (item.resolved ? "Resolved" : "Live")}
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {visible.length === 0 ? (
          <li className="panel p-8 text-center text-sm text-muted-foreground">No Alerts In This View.</li>
        ) : null}
      </ul>
    </div>
  );
}

function iconFor(type: DisplayAlert["type"]) {
  if (type === "missed") return AlertTriangle;
  if (type === "low_stock") return PackageX;
  if (type === "fault") return Wrench;
  if (type === "device") return PlugZap;
  return CheckCircle2;
}

function tintFor(severity: DisplayAlert["severity"]) {
  if (severity === "critical") return "border-destructive/40 bg-destructive/10 text-destructive";
  if (severity === "warning") return "border-warning/40 bg-warning/10 text-warning";
  return "border-success/40 bg-success/10 text-success";
}

function mapFirebaseAlerts(alerts: FirebaseAlert[]): DisplayAlert[] {
  return alerts.map((alert, index) => {
    const mappedType = mapFirebaseType(alert.type);
    const title = buildFirebaseAlertTitle(alert, mappedType);
    return {
      id: `firebase-${alert.key ?? index}`,
      alertKey: alert.key,
      type: mappedType,
      title,
      description: alert.message,
      timestamp: Number(alert.timestamp) || Date.now(),
      severity: mapFirebaseSeverity(alert.severity),
      resolved: Boolean(alert.resolved),
      source: "firebase",
    };
  });
}

function buildInventoryAlerts(slots: SlotData[]): DisplayAlert[] {
  return slots
    .filter((slot) => slot.status === "low_stock" || slot.status === "empty")
    .map((slot) => {
      const medicationName = slot.medication_name || `Slot ${slot.slot_number}`;
      const isEmpty = slot.status === "empty";
      return {
        id: `inventory-slot-${slot.slot_number}`,
        type: "low_stock" as const,
        title: isEmpty ? `Slot ${slot.slot_number} Empty` : `Slot ${slot.slot_number} Low Stock`,
        description: isEmpty
          ? `${medicationName} has no remaining stock in inventory.`
          : `${medicationName} is running low with ${slot.stock_current} item${slot.stock_current === 1 ? "" : "s"} remaining.`,
        timestamp: Date.now(),
        severity: isEmpty ? "critical" : "warning",
        resolved: false,
        source: "inventory",
        actionLabel: "Live Inventory",
      };
    });
}

function buildDeviceAlerts(state: DeviceHeartbeatState, now: number): DisplayAlert[] {
  const status = getDerivedDeviceStatus(state, now);
  const description = getDeviceStatusReason(state, now);
  return [{
    id: "device-status-alert",
    type: "device",
    title: status === "online" ? "ESP32 Device Connected" : "ESP32 Device Offline",
    description,
    timestamp: state.lastSnapshotAt ?? state.firstSeenAt ?? now,
    severity: status === "online" ? "info" : "critical",
    resolved: status === "online",
    source: "device",
    actionLabel: status === "online" ? "Live Status" : "Needs Attention",
  }];
}

function mapFirebaseType(type: string): DisplayAlert["type"] {
  const upper = String(type).toUpperCase();
  if (upper.includes("LOW")) return "low_stock";
  if (upper.includes("JAM") || upper.includes("ERROR") || upper.includes("FAULT")) return "fault";
  if (upper.includes("DISPENSED")) return "dispensed";
  return "missed";
}

function mapFirebaseSeverity(severity: string): DisplayAlert["severity"] {
  const lower = String(severity).toLowerCase();
  if (lower === "critical") return "critical";
  if (lower === "warning") return "warning";
  return "info";
}

function buildFirebaseAlertTitle(alert: FirebaseAlert, type: DisplayAlert["type"]) {
  if (type === "low_stock") {
    return alert.slot ? `Low Stock - Slot ${alert.slot}` : "Low Stock Alert";
  }
  if (type === "fault") {
    return alert.slot ? `Device Fault - Slot ${alert.slot}` : "Device Fault";
  }
  if (type === "dispensed") {
    return alert.slot ? `Dose Dispensed - Slot ${alert.slot}` : "Dose Dispensed";
  }
  return alert.slot ? `Missed Dose - Slot ${alert.slot}` : "Missed Dose";
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
    return now - normalizedHeartbeat <= DEVICE_HEARTBEAT_TIMEOUT_MS
      ? "Recent ESP32 heartbeat detected in Firebase."
      : "No recent ESP32 heartbeat was detected in Firebase.";
  }

  if (state.lastAdvanceAt !== null) {
    return now - state.lastAdvanceAt <= DEVICE_HEARTBEAT_TIMEOUT_MS
      ? "ESP32 heartbeat values are actively updating in Firebase."
      : "Firebase heartbeat values stopped changing, so the ESP32 is treated as offline.";
  }

  return "Firebase has not shown ESP32 heartbeat activity yet.";
}
