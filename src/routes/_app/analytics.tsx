import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from "recharts";
import { db, onValue, ref } from "@/firebase";
import {
  subscribeToAllSlots,
  subscribeToDispenseLog,
  subscribeToSchedule,
} from "@/lib/firebase-service";
import type { DispenseLog, InventoryLog, ScheduleEntry } from "@/types";

export const Route = createFileRoute("/_app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics - MediStock" },
      { name: "description", content: "Compliance trends, per-slot history, and stock depletion analytics." },
    ],
  }),
  component: AnalyticsPage,
});

const tooltipStyle = {
  background: "oklch(0.205 0.013 260)",
  border: "1px solid oklch(0.30 0.012 260)",
  borderRadius: 6,
  fontSize: 12,
};

const ranges = ["7d", "30d", "Custom"] as const;
const slotColors = {
  slot1: "oklch(0.78 0.13 185)",
  slot2: "oklch(0.82 0.15 80)",
  slot3: "oklch(0.70 0.13 270)",
} as const;
const slotLabels = {
  slot1: "Slot 1",
  slot2: "Slot 2",
  slot3: "Slot 3",
} as const;
type RangeKey = typeof ranges[number];
type SlotKey = keyof typeof slotColors;
type SlotState = {
  slot_number: 1 | 2 | 3;
  medication_name?: string;
  stock_current?: number;
  stock_max?: number;
  status?: string;
};

function AnalyticsPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [dispenseLogs, setDispenseLogs] = useState<DispenseLog[]>([]);
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([]);
  const [slots, setSlots] = useState<SlotState[]>([]);

  useEffect(() => {
    const unsubscribeSchedule = subscribeToSchedule((nextSchedules) => {
      setSchedules(nextSchedules);
    });
    const unsubscribeDispense = subscribeToDispenseLog((nextLogs) => {
      setDispenseLogs(nextLogs);
    }, 1000);
    const unsubscribeSlots = subscribeToAllSlots((nextSlots) => {
      setSlots(nextSlots as SlotState[]);
    });
    const inventoryRef = ref(db, "/inventory_log");
    const unsubscribeInventory = onValue(inventoryRef, (snapshot) => {
      if (!snapshot.exists()) {
        setInventoryLogs([]);
        return;
      }

      const nextLogs = Object.values(snapshot.val() as Record<string, InventoryLog>)
        .sort((a, b) => b.timestamp - a.timestamp);
      setInventoryLogs(nextLogs);
    });

    return () => {
      unsubscribeSchedule();
      unsubscribeDispense();
      unsubscribeSlots();
      unsubscribeInventory();
    };
  }, []);

  const dayCount = getRangeDayCount(range);
  const bucketDates = buildDateBuckets(dayCount);
  const bucketByDate = new Map(
    bucketDates.map((date) => {
      const key = toDateKey(date);
      return [
        key,
        {
          date: key,
          label: formatBucketLabel(date, range),
          due: 0,
          dispensed: 0,
          missed: 0,
          slot1: 0,
          slot2: 0,
          slot3: 0,
        },
      ] as const;
    })
  );

  const normalizedSchedules = schedules.filter((schedule) => schedule.active !== false);
  for (const schedule of normalizedSchedules) {
    for (const date of bucketDates) {
      const key = toDateKey(date);
      const bucket = bucketByDate.get(key);
      if (!bucket) continue;

      bucket.due += getScheduledDoseCount(schedule, date);
    }
  }

  for (const log of dispenseLogs) {
    const key = toDateKey(new Date(log.timestamp));
    const bucket = bucketByDate.get(key);
    if (!bucket) continue;

    if (log.status === "dispensed") {
      bucket.dispensed += 1;
      const slotKey = normalizeSlotKey(log.slot);
      if (slotKey) {
        bucket[slotKey] += 1;
      }
    }
  }

  const complianceTrend = Array.from(bucketByDate.values()).map((bucket) => {
    const cappedDispensed = Math.min(bucket.dispensed, bucket.due);
    const missed = Math.max(bucket.due - cappedDispensed, 0);
    return {
      date: bucket.date,
      label: bucket.label,
      compliance: bucket.due > 0 ? Math.round((cappedDispensed / bucket.due) * 100) : 0,
      missed,
      dispensed: bucket.dispensed,
      due: bucket.due,
    };
  });

  const perSlotHistory = Array.from(bucketByDate.values()).map((bucket) => ({
    label: bucket.label,
    slot1: bucket.slot1,
    slot2: bucket.slot2,
    slot3: bucket.slot3,
  }));

  const stockHistory = bucketDates.map((date) => {
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return {
      date: toDateKey(date),
      label: formatBucketLabel(date, range),
      slot1: getStockLevelForDate(1, endOfDay, inventoryLogs, slots),
      slot2: getStockLevelForDate(2, endOfDay, inventoryLogs, slots),
      slot3: getStockLevelForDate(3, endOfDay, inventoryLogs, slots),
    };
  });

  const totalDue = complianceTrend.reduce((sum, item) => sum + item.due, 0);
  const totalDispensed = complianceTrend.reduce((sum, item) => sum + item.dispensed, 0);
  const totalMissed = complianceTrend.reduce((sum, item) => sum + item.missed, 0);
  const averageCompliance = totalDue > 0 ? Math.round((Math.min(totalDispensed, totalDue) / totalDue) * 100) : 0;
  const refillSlots = slots.filter((slot) => needsRefill(slot));

  const kpis = [
    {
      label: "Average Compliance",
      value: `${averageCompliance}%`,
      delta: totalDue > 0 ? `${Math.min(totalDispensed, totalDue)} Of ${totalDue} Doses` : "No Scheduled Doses",
      positive: averageCompliance >= 80,
    },
    {
      label: "Doses Dispensed",
      value: String(totalDispensed),
      delta: `${dayCount} Day Range`,
      positive: true,
    },
    {
      label: "Missed Doses",
      value: String(totalMissed),
      delta: totalDue > 0 ? `${Math.max(0, 100 - averageCompliance)}% Gap` : "No Active Schedule",
      positive: totalMissed === 0,
    },
    {
      label: "Refills Needed",
      value: String(refillSlots.length),
      delta: refillSlots.length > 0 ? refillSlots.map((slot) => slotLabels[`slot${slot.slot_number}` as SlotKey]).join(", ") : "All Slots Healthy",
      positive: refillSlots.length === 0,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Adherence And Inventory Patterns Across All Slots.</p>
        </div>
        <div className="inline-flex rounded-md border border-border bg-surface p-0.5 text-xs">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-[6px] px-3 py-1.5 transition-colors ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r === "7d" ? "Last 7 Days" : r === "30d" ? "Last 30 Days" : "Last 90 Days"}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.label} className="panel p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{kpi.label}</div>
            <div className="mt-1 flex items-baseline justify-between gap-3">
              <span className="text-2xl font-semibold text-mono">{kpi.value}</span>
              <span className={`max-w-[9rem] text-right text-[11px] text-mono ${kpi.positive ? "text-success" : "text-warning"}`}>{kpi.delta}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Compliance Trend</h3>
              <p className="text-[11px] text-muted-foreground">Daily Adherence Rate</p>
            </div>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={complianceTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={slotColors.slot1} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={slotColors.slot1} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(0.28 0.012 260)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="compliance" stroke={slotColors.slot1} strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4">
          <h3 className="text-sm font-semibold">Missed Doses</h3>
          <p className="text-[11px] text-muted-foreground">Trend Over Time</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={complianceTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.28 0.012 260)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="missed" fill="oklch(0.66 0.20 25)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold">Stock Level History</h3>
          <p className="text-[11px] text-muted-foreground">Inventory Depletion Per Slot</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stockHistory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.28 0.012 260)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="slot1" name="Slot 1" stroke={slotColors.slot1} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="slot2" name="Slot 2" stroke={slotColors.slot2} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="slot3" name="Slot 3" stroke={slotColors.slot3} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4">
          <h3 className="text-sm font-semibold">Per-Slot Dispensing</h3>
          <p className="text-[11px] text-muted-foreground">Doses Dispensed In Selected Range</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perSlotHistory} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.28 0.012 260)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="slot1" name="Slot 1" stackId="a" fill={slotColors.slot1} />
                <Bar dataKey="slot2" name="Slot 2" stackId="a" fill={slotColors.slot2} />
                <Bar dataKey="slot3" name="Slot 3" stackId="a" fill={slotColors.slot3} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function getRangeDayCount(range: RangeKey) {
  if (range === "7d") return 7;
  if (range === "30d") return 30;
  return 90;
}

function buildDateBuckets(dayCount: number) {
  const today = startOfDay(new Date());
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (dayCount - index - 1));
    return date;
  });
}

function startOfDay(date: Date) {
  const nextDate = new Date(date);
  nextDate.setHours(0, 0, 0, 0);
  return nextDate;
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBucketLabel(date: Date, range: RangeKey) {
  return date.toLocaleDateString(undefined, {
    month: range === "7d" ? undefined : "short",
    day: "numeric",
    weekday: range === "7d" ? "short" : undefined,
  });
}

function normalizeSlotKey(slot: number | string | undefined | null): SlotKey | null {
  if (slot === 1 || slot === "1" || slot === "slot1") return "slot1";
  if (slot === 2 || slot === "2" || slot === "slot2") return "slot2";
  if (slot === 3 || slot === "3" || slot === "slot3") return "slot3";
  return null;
}

function getScheduledDoseCount(schedule: ScheduleEntry, date: Date) {
  const slotKey = normalizeSlotKey(schedule.slot);
  if (!slotKey) return 0;

  const scheduleStart = startOfDay(new Date(schedule.start_date));
  if (Number.isNaN(scheduleStart.getTime()) || date < scheduleStart) return 0;

  if (schedule.end_date) {
    const scheduleEnd = startOfDay(new Date(schedule.end_date));
    if (!Number.isNaN(scheduleEnd.getTime()) && date > scheduleEnd) return 0;
  }

  const timesPerDose = getTimesPerDose(schedule);
  if (schedule.frequency === "weekly") {
    const days = normalizeScheduleDays(schedule.days);
    return days.includes(date.getDay()) ? timesPerDose : 0;
  }

  return timesPerDose;
}

function getTimesPerDose(schedule: ScheduleEntry) {
  if (schedule.frequency === "twice_daily") {
    return Math.max(schedule.times?.length || 0, 2);
  }
  if (schedule.frequency === "custom") {
    return Math.max(schedule.times?.length || 0, 1);
  }
  return Math.max(schedule.times?.length || 0, 1);
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

function getStockLevelForDate(
  slotNumber: 1 | 2 | 3,
  date: Date,
  inventoryLogs: InventoryLog[],
  slots: SlotState[]
) {
  const matchingLog = inventoryLogs.find(
    (log) => log.slot === slotNumber && log.timestamp <= date.getTime()
  );
  if (matchingLog) {
    return matchingLog.stock_after;
  }

  const liveSlot = slots.find((slot) => slot.slot_number === slotNumber);
  return liveSlot?.stock_current ?? 0;
}

function needsRefill(slot: SlotState) {
  const status = String(slot.status || "").toLowerCase();
  if (status === "low_stock" || status === "empty") return true;

  const stockCurrent = Number(slot.stock_current ?? 0);
  const stockMax = Number(slot.stock_max ?? 0);
  if (stockMax <= 0) return stockCurrent <= 0;

  return stockCurrent / stockMax <= 0.2;
}
