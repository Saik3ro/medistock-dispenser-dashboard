import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { db } from "@/firebase";
import { get, onValue, push, ref, runTransaction, set, update } from "firebase/database";

type SlotKey = "slot1" | "slot2" | "slot3";

type ScheduleEntry = {
  key: string;
  slot?: number | string;
  medication_name?: string;
  dosage?: string;
  frequency?: string;
  times?: string[];
  days?: string[];
  start_date?: string;
  active?: boolean;
};

type DoseOccurrence = {
  id: string;
  date: string;
  time: string;
  slotKey: SlotKey;
  slotNumber: 1 | 2 | 3;
  schedule: ScheduleEntry;
  scheduledAt: number;
};

const SENSOR_PATH = "/components/sensor1/status/medicine_detected";
const LOW_STOCK_THRESHOLD = 3;
const MISSED_DOSE_MS = 30_000;
const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysToDateKey(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function normalizeSlot(slot: ScheduleEntry["slot"]): DoseOccurrence["slotNumber"] | null {
  if (slot === 1 || slot === "1" || slot === "slot1") return 1;
  if (slot === 2 || slot === "2" || slot === "slot2") return 2;
  if (slot === 3 || slot === "3" || slot === "slot3") return 3;
  return null;
}

function scheduledTimeMs(date: Date, time: string) {
  const [hours = "0", minutes = "0"] = time.split(":");
  const scheduled = new Date(date);
  scheduled.setHours(Number(hours), Number(minutes), 0, 0);
  return scheduled.getTime();
}

function isWeeklyMatch(schedule: ScheduleEntry, date: Date) {
  if (schedule.frequency !== "weekly") return true;
  const days = schedule.days || [];
  return days.length === 0 || days.includes(WEEK_DAYS[date.getDay()]);
}

function isStarted(schedule: ScheduleEntry, today: string) {
  return !schedule.start_date || schedule.start_date <= today;
}

function normalizeEventId(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function findDueOccurrence(schedules: ScheduleEntry[], now = new Date()): DoseOccurrence | null {
  const today = dateKey(now);
  const nowMs = now.getTime();

  const due = schedules
    .filter((schedule) => schedule.active !== false && isStarted(schedule, today) && isWeeklyMatch(schedule, now))
    .flatMap((schedule) => {
      const slotNumber = normalizeSlot(schedule.slot);
      if (!slotNumber) return [];

      return (schedule.times?.length ? schedule.times : ["08:00"]).map((time) => {
        const scheduledAt = scheduledTimeMs(now, time);
        return {
          id: normalizeEventId(`${schedule.key}_${today}_${time}`),
          date: today,
          time,
          slotKey: `slot${slotNumber}` as SlotKey,
          slotNumber,
          schedule,
          scheduledAt,
        };
      });
    })
    .filter((occurrence) => occurrence.scheduledAt <= nowMs)
    .sort((a, b) => b.scheduledAt - a.scheduledAt);

  return due[0] || null;
}

async function writeAlert(type: string, slot: number, message: string, severity: "info" | "warning" | "critical") {
  const timestamp = Date.now();
  const alert = { type, slot, message, severity, timestamp, resolved: false };
  const historyRef = push(ref(db, "/alerts/history"));

  await set(historyRef, alert);
  await set(ref(db, "/alerts/latest"), alert);
}

async function logDispense(occurrence: DoseOccurrence, status: "dispensed" | "missed") {
  const logRef = push(ref(db, "/dispense_log"));
  await set(logRef, {
    slot: occurrence.slotNumber,
    medication_name: occurrence.schedule.medication_name || `Slot ${occurrence.slotNumber}`,
    status,
    sensor: "IR",
    reaction_ms: Date.now() - occurrence.scheduledAt,
    timestamp: Date.now(),
    triggered_by: "ir_sensor",
    scheduled_dose_id: occurrence.id,
  });
}

async function logInventory(occurrence: DoseOccurrence, before: number, after: number) {
  const logRef = push(ref(db, "/inventory_log"));
  await set(logRef, {
    slot: occurrence.slotNumber,
    medication_name: occurrence.schedule.medication_name || `Slot ${occurrence.slotNumber}`,
    action: "dispensed",
    quantity: -1,
    stock_before: before,
    stock_after: after,
    timestamp: Date.now(),
    notes: `Counted by IR sensor for ${occurrence.date} ${occurrence.time}`,
  });
}

async function rescheduleMissedDoseOnce(occurrence: DoseOccurrence, missedAt: number) {
  const scheduleRef = ref(db, `/schedule/${occurrence.schedule.key}`);

  const result = await runTransaction(scheduleRef, (current) => {
    if (!current) return current;
    if (current.last_missed_dose_id === occurrence.id) return current;

    const baseStartDate = current.start_date || occurrence.schedule.start_date || occurrence.date;
    const newStartDate = addDaysToDateKey(baseStartDate, 1);

    return {
      ...current,
      start_date: newStartDate,
      last_missed_at: missedAt,
      last_missed_dose_id: occurrence.id,
      rescheduled_from: occurrence.date,
      rescheduled_to: newStartDate,
    };
  });

  if (result.committed) {
    console.log(`[Reschedule] Moved ${occurrence.date} → ${result.snapshot.val()?.start_date} for ${occurrence.schedule.medication_name}`);
  }
}

async function countInventoryOnce(occurrence: DoseOccurrence) {
  const doseRef = ref(db, `/scheduled_doses/${occurrence.id}`);
  const doseResult = await runTransaction(doseRef, (current) => {
    if (current?.inventory_counted) return;

    return {
      ...current,
      date: occurrence.date,
      time: occurrence.time,
      slot: occurrence.slotNumber,
      schedule_key: occurrence.schedule.key,
      inventory_counted: true,
      inventory_counted_at: Date.now(),
      status: "dispensed",
    };
  });

  if (!doseResult.committed) return null;

  let stockBefore = 0;
  let stockAfter = 0;
  const slotRef = ref(db, `/slots/${occurrence.slotKey}`);
  const slotResult = await runTransaction(slotRef, (slot) => {
    if (!slot) return slot;

    const currentStock = Math.max(0, Number(slot.stock_current ?? 0));
    const nextStock = Math.max(0, currentStock - 1);
    stockBefore = currentStock;
    stockAfter = nextStock;

    return {
      ...slot,
      stock_current: nextStock,
      status: nextStock <= 0 ? "empty" : nextStock < LOW_STOCK_THRESHOLD ? "low_stock" : slot.status || "active",
      last_dispense: Date.now(),
    };
  });

  if (!slotResult.committed) return null;

  await update(doseRef, {
    stock_before: stockBefore,
    stock_after: stockAfter,
  });
  await logInventory(occurrence, stockBefore, stockAfter);
  await logDispense(occurrence, "dispensed");

  if (stockAfter < LOW_STOCK_THRESHOLD) {
    const name = occurrence.schedule.medication_name || `Slot ${occurrence.slotNumber}`;
    const message = `${name} is low on stock (${stockAfter} remaining).`;
    toast.warning("Low storage", { description: message });
    await writeAlert("LOW_STOCK", occurrence.slotNumber, message, stockAfter <= 0 ? "critical" : "warning");
  }

  return { stockBefore, stockAfter };
}

async function markMissedOnce(occurrence: DoseOccurrence) {
  const doseRef = ref(db, `/scheduled_doses/${occurrence.id}`);
  const missedAt = Date.now();
  const missedResult = await runTransaction(doseRef, (current) => {
    if (current?.missed_reported) return;

    return {
      ...current,
      status: "missed",
      missed_reported: true,
      missed_reported_at: missedAt,
    };
  });

  // Update schedule with missed count
  const scheduleRef = ref(db, `/schedule/${occurrence.schedule.key}`);
  await runTransaction(scheduleRef, (current) => {
    if (!current) return current;
    const missedCount = (current.missed_count || 0) + 1;
    return {
      ...current,
      missed_count: missedCount,
    };
  });

  await rescheduleMissedDoseOnce(occurrence, missedAt);

  if (!missedResult.committed) return;

  const name = occurrence.schedule.medication_name || `Slot ${occurrence.slotNumber}`;
  const message = `${name} dose was still detected by the IR sensor after 30 seconds.`;

  toast.error("Missed dose", { description: message });
  await writeAlert("MISSED_DOSE", occurrence.slotNumber, message, "warning");
  await logDispense(occurrence, "missed");
}

export function DoseSensorMonitor() {
  const schedulesRef = useRef<ScheduleEntry[]>([]);
  const lastSensorValue = useRef<boolean | null>(null);
  const missedTimers = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const unsubscribe = onValue(ref(db, "/schedule"), (snapshot) => {
      const raw = snapshot.val() || {};
      schedulesRef.current = Object.entries(raw).map(([key, value]) => ({
        key,
        ...(value as Omit<ScheduleEntry, "key">),
      }));
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribe = onValue(ref(db, SENSOR_PATH), async (snapshot) => {
      const detected = snapshot.val() === true;
      const wasDetected = lastSensorValue.current;
      lastSensorValue.current = detected;

      if (!detected || wasDetected === true) return;

      const occurrence = findDueOccurrence(schedulesRef.current);
      if (!occurrence) return;

      try {
        await countInventoryOnce(occurrence);

        if (missedTimers.current.has(occurrence.id)) return;

        const timer = window.setTimeout(async () => {
          missedTimers.current.delete(occurrence.id);
          const latest = await get(ref(db, SENSOR_PATH));
          if (latest.val() === true) {
            await markMissedOnce(occurrence);
          }
        }, MISSED_DOSE_MS);

        missedTimers.current.set(occurrence.id, timer);
      } catch (error) {
        toast.error(`Failed to process IR sensor event: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    return () => {
      unsubscribe();
      missedTimers.current.forEach((timer) => window.clearTimeout(timer));
      missedTimers.current.clear();
    };
  }, []);

  return null;
}
