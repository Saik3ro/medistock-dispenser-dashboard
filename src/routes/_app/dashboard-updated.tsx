import { useEffect, useState, useCallback } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Pill,
  Check,
  X,
  AlertTriangle,
  Wifi,
  Activity,
  CircleDot,
  Clock,
  TrendingDown,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { StockBar } from "@/components/medi/StockBar";
import {
  subscribeToAllSlots,
  subscribeToLatestAlert,
  subscribeToDeviceStatus,
  subscribeToDispenseLog,
  getDashboardSummary,
} from "@/lib/firebase-service";
import type { SlotData, Alert, DeviceStatus, DispenseLog } from "@/types";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Overview — MediStock" },
      {
        name: "description",
        content:
          "Today's doses, dispenser slots, and device status at a glance.",
      },
    ],
  }),
  component: DashboardPage,
});

// ─── Types ────────────────────────────────────────────────────────────────

type SlotSummary = {
  slot: number;
  medication_name: string;
  dosage: string;
  stock_current: number;
  stock_max: number;
  status: "active" | "low_stock" | "empty" | "disabled";
  is_running: boolean;
  jammed: boolean;
  medicine_detected: boolean;
};

// ─── Component ─────────────────────────────────────────────────────────────

function DashboardPage() {
  const [slots, setSlots] = useState<SlotData[]>([]);
  const [latestAlert, setLatestAlert] = useState<Alert | null>(null);
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus | null>(null);
  const [recentDispenses, setRecentDispenses] = useState<DispenseLog[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Subscribe to real-time slot updates
  useEffect(() => {
    const unsubscribe = subscribeToAllSlots((data) => {
      setSlots(data);
      setLoading(false);
    });

    return () => unsubscribe?.();
  }, []);

  // Subscribe to latest alerts
  useEffect(() => {
    const unsubscribe = subscribeToLatestAlert((alert) => {
      setLatestAlert(alert);

      // Show toast notification for new alerts
      if (alert && alert.severity === "critical") {
        toast.error(alert.message, {
          description: `Slot ${alert.slot || "N/A"} - ${alert.type}`,
        });
      } else if (alert && alert.severity === "warning") {
        toast.warning(alert.message);
      }
    });

    return () => unsubscribe?.();
  }, []);

  // Subscribe to device status
  useEffect(() => {
    const unsubscribe = subscribeToDeviceStatus((status) => {
      setDeviceStatus(status);
    });

    return () => unsubscribe?.();
  }, []);

  // Subscribe to recent dispense logs
  useEffect(() => {
    const unsubscribe = subscribeToDispenseLog((logs) => {
      setRecentDispenses(logs.slice(0, 5));
    });

    return () => unsubscribe?.();
  }, []);

  // Load dashboard summary
  useEffect(() => {
    getDashboardSummary().then((data) => {
      setSummary(data);
    });

    // Refresh summary every minute
    const interval = setInterval(() => {
      getDashboardSummary().then((data) => {
        setSummary(data);
      });
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // ─── Render Helpers ────────────────────────────────────────────────────────

  const getSlotStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "text-emerald-400";
      case "low_stock":
        return "text-amber-400";
      case "empty":
        return "text-rose-400";
      default:
        return "text-gray-400";
    }
  };

  const getSlotStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "✓ Active";
      case "low_stock":
        return "⚠ Low Stock";
      case "empty":
        return "✗ Empty";
      case "disabled":
        return "⊘ Disabled";
      default:
        return "Unknown";
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Activity className="w-12 h-12 animate-spin mx-auto mb-4" />
          <p>Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-1">
            Real-time medication dispenser status
          </p>
        </div>
        <div className="flex items-center gap-2">
          {deviceStatus?.status === "online" ? (
            <div className="flex items-center gap-2 px-3 py-2 bg-emerald-900 rounded-lg">
              <CircleDot className="w-4 h-4 text-emerald-400 animate-pulse" />
              <span className="text-sm font-medium">Device Online</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 bg-red-900 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium">Device Offline</span>
            </div>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Dispensed Today</p>
                <p className="text-3xl font-bold mt-1">
                  {summary.total_dispensed_today}
                </p>
              </div>
              <Check className="w-8 h-8 text-emerald-400" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Pending Doses</p>
                <p className="text-3xl font-bold mt-1">
                  {summary.pending_doses}
                </p>
              </div>
              <Clock className="w-8 h-8 text-blue-400" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Low Stock</p>
                <p className="text-3xl font-bold mt-1">
                  {summary.low_stock_slots}
                </p>
              </div>
              <TrendingDown className="w-8 h-8 text-amber-400" />
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Uptime</p>
                <p className="text-3xl font-bold mt-1">
                  {summary.uptime_percentage}%
                </p>
              </div>
              <Activity className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>
      )}

      {/* Latest Alert */}
      {latestAlert && (
        <div
          className={`border rounded-lg p-4 ${
            latestAlert.severity === "critical"
              ? "border-red-500 bg-red-950 bg-opacity-20"
              : latestAlert.severity === "warning"
                ? "border-amber-500 bg-amber-950 bg-opacity-20"
                : "border-blue-500 bg-blue-950 bg-opacity-20"
          }`}
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className={`w-5 h-5 mt-1 ${
                latestAlert.severity === "critical"
                  ? "text-red-400"
                  : latestAlert.severity === "warning"
                    ? "text-amber-400"
                    : "text-blue-400"
              }`}
            />
            <div className="flex-1">
              <p className="font-semibold">
                {latestAlert.type}{" "}
                {latestAlert.slot && `- Slot ${latestAlert.slot}`}
              </p>
              <p className="text-gray-300 text-sm mt-1">{latestAlert.message}</p>
              <p className="text-gray-500 text-xs mt-2">
                {new Date(latestAlert.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Slots Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {slots.map((slot) => (
          <Link
            key={slot.slot_number}
            to="/app/inventory"
            className="block"
          >
            <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors">
              {/* Slot Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">
                  Slot {slot.slot_number}
                </h3>
                {slot.is_running && (
                  <Activity className="w-5 h-5 text-blue-400 animate-spin" />
                )}
                {slot.jammed && (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
              </div>

              {/* Medication Info */}
              <div className="mb-4">
                <p className="text-gray-400 text-sm">Medication</p>
                <p className="text-white font-medium truncate">
                  {slot.medication_name || "Empty"}
                </p>
                {slot.dosage && (
                  <p className="text-gray-500 text-xs">{slot.dosage}</p>
                )}
              </div>

              {/* Stock Bar */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-gray-400 text-sm">Stock Level</p>
                  <p className="text-white text-sm font-medium">
                    {slot.stock_current} / {slot.stock_max}
                  </p>
                </div>
                <StockBar
                  current={slot.stock_current}
                  max={slot.stock_max}
                />
              </div>

              {/* Status */}
              <div className="flex items-center gap-2">
                <div
                  className={`w-2 h-2 rounded-full ${
                    slot.status === "active"
                      ? "bg-emerald-400"
                      : slot.status === "low_stock"
                        ? "bg-amber-400"
                        : slot.status === "empty"
                          ? "bg-rose-400"
                          : "bg-gray-400"
                  }`}
                />
                <span className={`text-sm ${getSlotStatusColor(slot.status)}`}>
                  {getSlotStatusLabel(slot.status)}
                </span>
              </div>

              {/* Medicine Detected */}
              {slot.medicine_detected && slot.last_reaction_ms && (
                <div className="mt-3 text-xs text-emerald-400">
                  Last dispense: {slot.last_reaction_ms}ms
                  {slot.triggered_by && ` (${slot.triggered_by})`}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-slate-900 border border-slate-700 rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">Recent Activity</h2>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {recentDispenses.length > 0 ? (
            recentDispenses.map((dispense, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 bg-slate-800 rounded text-sm"
              >
                <div className="flex items-center gap-3 flex-1">
                  <Pill className="w-4 h-4 text-blue-400" />
                  <div>
                    <p className="font-medium">
                      {dispense.medication_name} - Slot {dispense.slot}
                    </p>
                    <p className="text-gray-400 text-xs">
                      {dispense.status} | {dispense.reaction_ms}ms
                    </p>
                  </div>
                </div>
                <p className="text-gray-400 text-xs">
                  {new Date(dispense.timestamp).toLocaleTimeString()}
                </p>
              </div>
            ))
          ) : (
            <p className="text-gray-400 text-sm text-center py-4">
              No recent activity
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
