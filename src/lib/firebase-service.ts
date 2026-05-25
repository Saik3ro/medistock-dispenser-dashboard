// ============================================================
// Firebase Service - MediStock Dispenser
// CRUD operations for all entities
// ============================================================

import {
  db,
  ref,
  set,
  get,
  update,
  remove,
  onValue,
  push,
  query,
  orderByChild,
  equalTo,
} from "../firebase";
import type {
  SlotData,
  ScheduleEntry,
  DispenseLog,
  Alert,
  InventoryLog,
  DeviceStatus,
  DeviceSettings,
  User,
} from "@/types";

// ============================================================
// SLOTS - Real-time data from ESP32
// ============================================================

export function subscribeToSlot(
  slotNumber: 1 | 2 | 3,
  callback: (data: SlotData | null) => void
) {
  const slotRef = ref(db, `/slots/slot${slotNumber}`);
  return onValue(slotRef, (snapshot) => {
    if (snapshot.exists()) {
      callback({ slot_number: slotNumber, ...snapshot.val() });
    } else {
      callback(null);
    }
  });
}

export function subscribeToAllSlots(
  callback: (data: SlotData[]) => void
) {
  const slotsRef = ref(db, "/slots");
  return onValue(slotsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const slots = [
        { slot_number: 1, ...data.slot1 },
        { slot_number: 2, ...data.slot2 },
        { slot_number: 3, ...data.slot3 },
      ].filter((s) => s);
      callback(slots);
    } else {
      callback([]);
    }
  });
}

export async function updateSlotStatus(
  slotNumber: 1 | 2 | 3,
  status: "active" | "low_stock" | "empty" | "disabled"
) {
  const slotRef = ref(db, `/slots/slot${slotNumber}`);
  try {
    await update(slotRef, { status });
    return true;
  } catch (error) {
    console.error(`Failed to update slot ${slotNumber} status:`, error);
    return false;
  }
}

export async function updateSlotMedication(
  slotNumber: 1 | 2 | 3,
  data: Partial<SlotData>
) {
  const slotRef = ref(db, `/slots/slot${slotNumber}`);
  try {
    await update(slotRef, {
      medication_name: data.medication_name,
      dosage: data.dosage,
      stock_max: data.stock_max,
      status: data.status,
      notes: data.notes,
    });
    return true;
  } catch (error) {
    console.error(`Failed to update slot ${slotNumber} medication:`, error);
    return false;
  }
}

export async function updateSlotStock(
  slotNumber: 1 | 2 | 3,
  currentStock: number,
  notes?: string
) {
  const slotRef = ref(db, `/slots/slot${slotNumber}`);
  try {
    // Get current max to calculate new status
    const snapshot = await get(slotRef);
    const slotData = snapshot.val();
    const stockMax = slotData?.stock_max || 100;

    let status: "active" | "low_stock" | "empty" | "disabled" = "active";
    if (currentStock <= 0) status = "empty";
    else if (currentStock <= 10 || currentStock / stockMax <= 0.2)
      status = "low_stock";

    await update(slotRef, {
      stock_current: currentStock,
      status,
    });

    // Log the inventory change
    await logInventoryChange({
      slot: slotNumber,
      medication_name: slotData?.medication_name || "Unknown",
      action: "adjusted",
      quantity: currentStock - (slotData?.stock_current || 0),
      stock_before: slotData?.stock_current || 0,
      stock_after: currentStock,
      timestamp: Date.now(),
      notes,
    });

    return true;
  } catch (error) {
    console.error(`Failed to update slot ${slotNumber} stock:`, error);
    return false;
  }
}

// ============================================================
// SCHEDULE - Medication dispensing schedules
// ============================================================

export function subscribeToSchedule(
  callback: (schedules: ScheduleEntry[]) => void
) {
  const scheduleRef = ref(db, "/schedule");
  return onValue(scheduleRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const schedules = Object.entries(data).map(([key, value]: any) => ({
        key,
        ...value,
      }));
      callback(schedules);
    } else {
      callback([]);
    }
  });
}

export async function addScheduleEntry(schedule: ScheduleEntry) {
  const scheduleRef = ref(db, "/schedule");
  try {
    const newEntryRef = push(scheduleRef);
    await set(newEntryRef, {
      slot: schedule.slot,
      medication_name: schedule.medication_name,
      dosage: schedule.dosage,
      frequency: schedule.frequency,
      times: schedule.times,
      days: schedule.days || [],
      start_date: schedule.start_date,
      active: schedule.active,
      notes: schedule.notes,
    });
    return newEntryRef.key;
  } catch (error) {
    console.error("Failed to add schedule entry:", error);
    return null;
  }
}

export async function updateScheduleEntry(key: string, updates: Partial<ScheduleEntry>) {
  const entryRef = ref(db, `/schedule/${key}`);
  try {
    await update(entryRef, updates);
    return true;
  } catch (error) {
    console.error(`Failed to update schedule entry ${key}:`, error);
    return false;
  }
}

export async function deleteScheduleEntry(key: string) {
  const entryRef = ref(db, `/schedule/${key}`);
  try {
    await remove(entryRef);
    return true;
  } catch (error) {
    console.error(`Failed to delete schedule entry ${key}:`, error);
    return false;
  }
}

// ============================================================
// DISPENSE LOGS - Record of all dispensing events
// ============================================================

export function subscribeToDispenseLog(
  callback: (logs: DispenseLog[]) => void,
  limit = 50
) {
  const logRef = ref(db, "/dispense_log");
  return onValue(logRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const logs = Object.entries(data)
        .map(([key, value]: any) => ({
          key,
          ...value,
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
      callback(logs);
    } else {
      callback([]);
    }
  });
}

export async function logDispense(log: DispenseLog) {
  const logRef = ref(db, "/dispense_log");
  try {
    const newLogRef = push(logRef);
    await set(newLogRef, {
      slot: log.slot,
      medication_name: log.medication_name,
      status: log.status,
      sensor: log.sensor,
      reaction_ms: log.reaction_ms,
      timestamp: Date.now(),
      triggered_by: log.triggered_by,
    });
    return newLogRef.key;
  } catch (error) {
    console.error("Failed to log dispense event:", error);
    return null;
  }
}

export async function getDispenseLogByDate(
  startDate: number,
  endDate: number
): Promise<DispenseLog[]> {
  const logRef = ref(db, "/dispense_log");
  try {
    const snapshot = await get(logRef);
    if (snapshot.exists()) {
      const data = snapshot.val();
      return Object.entries(data)
        .map(([key, value]: any) => ({
          key,
          ...value,
        }))
        .filter(
          (log) => log.timestamp >= startDate && log.timestamp <= endDate
        );
    }
    return [];
  } catch (error) {
    console.error("Failed to get dispense logs:", error);
    return [];
  }
}

// ============================================================
// ALERTS - Real-time alerts
// ============================================================

export function subscribeToLatestAlert(callback: (alert: Alert | null) => void) {
  const alertRef = ref(db, "/alerts/latest");
  return onValue(alertRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    } else {
      callback(null);
    }
  });
}

export function subscribeToAlerts(
  callback: (alerts: Alert[]) => void,
  limit = 50
) {
  const alertsRef = ref(db, "/alerts/history");
  return onValue(alertsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const alerts = Object.entries(data)
        .map(([key, value]: any) => ({
          key,
          ...value,
        }))
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
      callback(alerts);
    } else {
      callback([]);
    }
  });
}

export async function createAlert(alert: Alert) {
  const alertsRef = ref(db, "/alerts/history");
  const latestRef = ref(db, "/alerts/latest");

  try {
    // Add to history
    const newAlertRef = push(alertsRef);
    await set(newAlertRef, {
      type: alert.type,
      slot: alert.slot,
      message: alert.message,
      severity: alert.severity,
      timestamp: Date.now(),
      resolved: false,
    });

    // Update latest
    await set(latestRef, {
      type: alert.type,
      slot: alert.slot,
      message: alert.message,
      severity: alert.severity,
      timestamp: Date.now(),
    });

    return newAlertRef.key;
  } catch (error) {
    console.error("Failed to create alert:", error);
    return null;
  }
}

export async function resolveAlert(alertKey: string, resolvedBy?: string) {
  const alertRef = ref(db, `/alerts/history/${alertKey}`);
  try {
    await update(alertRef, {
      resolved: true,
      resolved_at: Date.now(),
      resolved_by: resolvedBy,
    });
    return true;
  } catch (error) {
    console.error(`Failed to resolve alert ${alertKey}:`, error);
    return false;
  }
}

// ============================================================
// INVENTORY LOG - Stock change history
// ============================================================

export async function logInventoryChange(log: InventoryLog) {
  const logRef = ref(db, "/inventory_log");
  try {
    const newLogRef = push(logRef);
    await set(newLogRef, log);
    return newLogRef.key;
  } catch (error) {
    console.error("Failed to log inventory change:", error);
    return null;
  }
}

export async function getInventoryLog(slotNumber?: number): Promise<InventoryLog[]> {
  const logRef = ref(db, "/inventory_log");
  try {
    const snapshot = await get(logRef);
    if (snapshot.exists()) {
      const data = snapshot.val();
      let logs = Object.entries(data).map(([key, value]: any) => value);

      if (slotNumber) {
        logs = logs.filter((log) => log.slot === slotNumber);
      }

      return logs.sort((a, b) => b.timestamp - a.timestamp);
    }
    return [];
  } catch (error) {
    console.error("Failed to get inventory log:", error);
    return [];
  }
}

// ============================================================
// DEVICE STATUS - ESP32 heartbeat & connectivity
// ============================================================

export function subscribeToDeviceStatus(callback: (status: DeviceStatus) => void) {
  const deviceRef = ref(db, "/device");
  return onValue(deviceRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    }
  });
}

export async function updateDeviceStatus(
  status: Partial<DeviceStatus>
) {
  const deviceRef = ref(db, "/device");
  try {
    await update(deviceRef, {
      ...status,
      last_heartbeat: Date.now(),
    });
    return true;
  } catch (error) {
    console.error("Failed to update device status:", error);
    return false;
  }
}

// ============================================================
// DEVICE SETTINGS - Configuration from dashboard
// ============================================================

export async function getDeviceSettings(): Promise<DeviceSettings | null> {
  const settingsRef = ref(db, "/device/settings");
  try {
    const snapshot = await get(settingsRef);
    return snapshot.val() || null;
  } catch (error) {
    console.error("Failed to get device settings:", error);
    return null;
  }
}

export function subscribeToDeviceSettings(callback: (settings: DeviceSettings) => void) {
  const settingsRef = ref(db, "/device/settings");
  return onValue(settingsRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val());
    }
  });
}

export async function updateDeviceSettings(updates: Partial<DeviceSettings>) {
  const settingsRef = ref(db, "/device/settings");
  try {
    await update(settingsRef, updates);
    return true;
  } catch (error) {
    console.error("Failed to update device settings:", error);
    return false;
  }
}

// ============================================================
// HELPER - Get dashboard summary
// ============================================================

export async function getDashboardSummary() {
  try {
    // Get today's dispense count
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dispenseLogs = await getDispenseLogByDate(
      today.getTime(),
      tomorrow.getTime()
    );
    const dispensedToday = dispenseLogs.filter(
      (log) => log.status === "dispensed"
    ).length;

    // Get device status
    const deviceRef = ref(db, "/device");
    const deviceSnapshot = await get(deviceRef);
    const deviceStatus = deviceSnapshot.val();
    const isOnline = deviceStatus?.status === "online";
    const uptime =
      deviceStatus?.uptime_s && deviceStatus?.boot_time_s
        ? Math.round(
            (deviceStatus.uptime_s /
              (deviceStatus.uptime_s + deviceStatus.boot_time_s)) *
              100
          )
        : 100;

    // Get latest alert
    const alertRef = ref(db, "/alerts/latest");
    const alertSnapshot = await get(alertRef);
    const latestAlert = alertSnapshot.val();

    // Get slot data
    const slotsRef = ref(db, "/slots");
    const slotsSnapshot = await get(slotsRef);
    const slots = slotsSnapshot.val() || {};
    const lowStockSlots = Object.values(slots).filter(
      (slot: any) => slot.status === "low_stock" || slot.status === "empty"
    ).length;

    return {
      total_dispensed_today: dispensedToday,
      pending_doses: 0, // Calculate from schedule
      low_stock_slots: lowStockSlots,
      device_status: isOnline ? "online" : "offline",
      last_alert: latestAlert,
      uptime_percentage: uptime,
    };
  } catch (error) {
    console.error("Failed to get dashboard summary:", error);
    return null;
  }
}
