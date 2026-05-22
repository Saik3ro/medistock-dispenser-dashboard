export type SlotStatus = "active" | "low" | "empty";

export interface Slot {
  id: 1 | 2 | 3;
  medication: string;
  stock: number;
  capacity: number;
  nextDose: string; // HH:MM
  status: SlotStatus;
  lastRefilled: string; // ISO date
}

export const slots: Slot[] = [
  { id: 1, medication: "Metformin 500mg", stock: 24, capacity: 30, nextDose: "08:00", status: "active", lastRefilled: "2026-05-10" },
  { id: 2, medication: "Lisinopril 10mg", stock: 6, capacity: 30, nextDose: "12:30", status: "low", lastRefilled: "2026-04-28" },
  { id: 3, medication: "Atorvastatin 20mg", stock: 18, capacity: 30, nextDose: "21:00", status: "active", lastRefilled: "2026-05-15" },
];

export interface ActivityEvent {
  id: string;
  time: string; // ISO
  slot: 1 | 2 | 3;
  action: "Dispensed" | "Missed" | "Confirmed" | "Refilled";
}

export const activity: ActivityEvent[] = [
  { id: "a1", time: "2026-05-22T08:00:00", slot: 1, action: "Dispensed" },
  { id: "a2", time: "2026-05-22T08:04:00", slot: 1, action: "Confirmed" },
  { id: "a3", time: "2026-05-21T21:00:00", slot: 3, action: "Dispensed" },
  { id: "a4", time: "2026-05-21T12:30:00", slot: 2, action: "Missed" },
  { id: "a5", time: "2026-05-21T08:00:00", slot: 1, action: "Dispensed" },
  { id: "a6", time: "2026-05-20T21:00:00", slot: 3, action: "Dispensed" },
  { id: "a7", time: "2026-05-20T12:30:00", slot: 2, action: "Dispensed" },
  { id: "a8", time: "2026-05-20T08:00:00", slot: 1, action: "Dispensed" },
];

export const summary = {
  scheduled: 6,
  taken: 4,
  missed: 1,
  pending: 1,
  compliance: 87,
};

export const device = {
  name: "MediStock-A1",
  online: true,
  lastSync: "2026-05-22T08:05:12",
  ssid: "ClinicNet-5G",
  signal: 78, // %
};

export type AlertType = "missed" | "low_stock" | "fault" | "dispensed";
export interface AlertItem {
  id: string;
  type: AlertType;
  title: string;
  description: string;
  time: string;
  resolved: boolean;
  severity: "critical" | "warning" | "info";
}

export const alerts: AlertItem[] = [
  { id: "al1", type: "low_stock", title: "Low stock — Slot 2", description: "Lisinopril 10mg has 6 pills remaining (threshold: 8).", time: "2026-05-22T07:10:00", resolved: false, severity: "critical" },
  { id: "al2", type: "missed", title: "Missed dose — Slot 2", description: "12:30 dose not confirmed within 30 minutes.", time: "2026-05-21T13:00:00", resolved: false, severity: "warning" },
  { id: "al3", type: "fault", title: "Dispenser jam cleared", description: "Slot 3 auto-recovered after 2 attempts.", time: "2026-05-20T21:01:00", resolved: true, severity: "warning" },
  { id: "al4", type: "dispensed", title: "Dose dispensed — Slot 1", description: "Metformin 500mg dispensed and confirmed.", time: "2026-05-22T08:04:00", resolved: true, severity: "info" },
];

export interface ScheduleEntry {
  id: string;
  medication: string;
  slot: 1 | 2 | 3;
  dosage: string;
  frequency: "Daily" | "Twice Daily" | "Weekly" | "Custom";
  times: string[];
  startDate: string;
  endDate?: string;
  enabled: boolean;
}

export const schedules: ScheduleEntry[] = [
  { id: "s1", medication: "Metformin 500mg", slot: 1, dosage: "1 tablet", frequency: "Daily", times: ["08:00"], startDate: "2026-04-01", enabled: true },
  { id: "s2", medication: "Lisinopril 10mg", slot: 2, dosage: "1 tablet", frequency: "Daily", times: ["12:30"], startDate: "2026-04-10", enabled: true },
  { id: "s3", medication: "Atorvastatin 20mg", slot: 3, dosage: "1 tablet", frequency: "Daily", times: ["21:00"], startDate: "2026-03-20", enabled: true },
];

// 14-day compliance data
export const complianceTrend = Array.from({ length: 14 }).map((_, i) => {
  const d = new Date(2026, 4, 9 + i);
  const compliance = 70 + Math.round(Math.sin(i / 2) * 12) + (i % 3 === 0 ? 8 : 0);
  return {
    date: d.toISOString().slice(0, 10),
    compliance: Math.min(100, Math.max(40, compliance)),
    missed: Math.max(0, 6 - Math.round((compliance / 100) * 6)),
  };
});

export const perSlotHistory = [
  { day: "Mon", slot1: 1, slot2: 1, slot3: 1 },
  { day: "Tue", slot1: 1, slot2: 0, slot3: 1 },
  { day: "Wed", slot1: 1, slot2: 1, slot3: 1 },
  { day: "Thu", slot1: 0, slot2: 1, slot3: 1 },
  { day: "Fri", slot1: 1, slot2: 1, slot3: 0 },
  { day: "Sat", slot1: 1, slot2: 1, slot3: 1 },
  { day: "Sun", slot1: 1, slot2: 0, slot3: 1 },
];

export const stockHistory = Array.from({ length: 14 }).map((_, i) => ({
  date: new Date(2026, 4, 9 + i).toISOString().slice(0, 10),
  slot1: 30 - i,
  slot2: Math.max(0, 28 - i * 1.6),
  slot3: 30 - Math.round(i * 0.8),
}));

export const refillHistory: Record<number, { date: string; amount: number }[]> = {
  1: [{ date: "2026-05-10", amount: 30 }, { date: "2026-04-09", amount: 30 }],
  2: [{ date: "2026-04-28", amount: 30 }, { date: "2026-03-29", amount: 30 }],
  3: [{ date: "2026-05-15", amount: 30 }, { date: "2026-04-15", amount: 30 }],
};
