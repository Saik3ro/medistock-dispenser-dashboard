import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { DataSnapshot } from "firebase/database";
import { db, ref, onValue } from "../../firebase";
import { StockBar } from "@/components/medi/StockBar";
import { EditMedicationSchedule } from "@/components/EditMedicationSchedule";
import {
  Pill,
  Pencil,
  Clock,
  PackagePlus,
  AlertTriangle,
  ChevronDown,
} from "lucide-react";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — MediStock" },
      { name: "description", content: "Manage medications, stock levels, and dispensing schedules for each slot." },
    ],
  }),
  component: InventoryPage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

type SlotId = "slot1" | "slot2" | "slot3";
const SLOT_IDS: SlotId[] = ["slot1", "slot2", "slot3"];

interface SlotData {
  medication_name: string;
  dosage: string;
  stock_current: number;
  stock_max: number;
  status: string;
  loaded: boolean;
}

interface ScheduleEntry {
  key?: string;
  slot: string;
  medication_name: string;
  dosage: string;
  frequency: string;
  times: string[];
  days?: string[];
  start_date: string;
  active: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotLabel(id: SlotId): string {
  return `Slot ${id.replace("slot", "")}`;
}

// ─── Skeleton Card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="panel p-5 animate-pulse space-y-4">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-12 rounded bg-muted/60" />
          <div className="h-5 w-40 rounded bg-muted/60" />
        </div>
        <div className="h-5 w-16 rounded-full bg-muted/60" />
      </div>
      <div className="h-2 w-full rounded-full bg-muted/60" />
      <div className="grid grid-cols-2 gap-y-1.5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-3 w-20 rounded bg-muted/40" />
        ))}
      </div>
      <div className="h-8 w-full rounded bg-muted/40" />
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    low_stock: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    empty: "bg-rose-500/15 text-rose-400 border-rose-500/30",
    unknown: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  const label: Record<string, string> = {
    active: "Active",
    low_stock: "Low Stock",
    empty: "Empty",
    unknown: "Unknown",
  };
  const cls = map[status] ?? map.unknown;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cls}`}>
      {label[status] ?? status}
    </span>
  );
}

// ─── Slot Card ────────────────────────────────────────────────────────────────

function SlotCard({
  slotId,
  slotNum,
  slot,
  existingSchedule,
  onEdit,
}: {
  slotId: SlotId;
  slotNum: number;
  slot: SlotData;
  existingSchedule: ScheduleEntry | null;
  onEdit: () => void;
}) {
  const stockPct = slot.stock_max > 0
    ? Math.round((slot.stock_current / slot.stock_max) * 100)
    : 0;

  const borderColor = {
    active: "border-l-emerald-500",
    low_stock: "border-l-amber-500",
    empty: "border-l-rose-500",
    unknown: "border-l-border",
  }[slot.status] ?? "border-l-border";

  return (
    <article className={`panel border-l-4 ${borderColor} p-5 flex flex-col gap-4 transition-all duration-300 hover:shadow-lg`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-muted text-[11px] font-bold text-muted-foreground">
              0{slotNum}
            </span>
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Slot {slotNum}</span>
          </div>
          <div className="text-base font-semibold leading-snug truncate text-foreground" title={slot.medication_name || "Empty"}>
            {slot.medication_name || <span className="text-muted-foreground italic">No medication</span>}
          </div>
          {slot.dosage && (
            <div className="mt-0.5 text-xs text-muted-foreground">{slot.dosage}</div>
          )}
        </div>
        <StatusBadge status={slot.status} />
      </div>

      {/* Stock bar */}
      <div>
        <div className="flex items-center justify-between mb-1.5 text-xs text-muted-foreground">
          <span>Stock</span>
          <span className="font-mono text-foreground">{slot.stock_current} / {slot.stock_max} ({stockPct}%)</span>
        </div>
        <StockBar value={Math.min(slot.stock_current, slot.stock_max)} capacity={slot.stock_max} />
      </div>

      {/* Schedule info */}
      {existingSchedule ? (
        <div className="rounded-lg border border-border bg-surface/60 px-3 py-2.5 text-xs">
          <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
            <Clock className="h-3 w-3" />
            <span className="uppercase tracking-wider text-[10px] font-semibold">Schedule</span>
          </div>
          <div className="text-foreground">
            {existingSchedule.frequency?.replace("_", " ")} · {existingSchedule.times?.join(", ")}
          </div>
          {existingSchedule.days?.length > 0 && (
            <div className="text-muted-foreground mt-0.5">{existingSchedule.days.join(", ")}</div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-3 py-2.5 text-center text-xs text-muted-foreground">
          No schedule configured
        </div>
      )}

      {/* Edit button */}
      <button
        onClick={onEdit}
        className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary/10 border border-primary/30 px-3 py-2.5 text-xs font-semibold text-primary hover:bg-primary/20 transition-colors duration-200"
      >
        <Pencil className="h-3.5 w-3.5" />
        Edit Medication &amp; Schedule
      </button>
    </article>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function InventoryPage() {
  const [slotsState, setSlotsState] = useState<Record<SlotId, SlotData>>({
    slot1: { medication_name: "", dosage: "", stock_current: 0, stock_max: 100, status: "unknown", loaded: false },
    slot2: { medication_name: "", dosage: "", stock_current: 0, stock_max: 100, status: "unknown", loaded: false },
    slot3: { medication_name: "", dosage: "", stock_current: 0, stock_max: 100, status: "unknown", loaded: false },
  });

  const [schedules, setSchedules] = useState<Record<string, ScheduleEntry>>({});
  const [editingSlot, setEditingSlot] = useState<SlotId | null>(null);
  const [loadingError, setLoadingError] = useState<string | null>(null);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    // Listen to each slot - NEW SCHEMA: /slots/slot{N}
    SLOT_IDS.forEach((slotId) => {
      const slotRef = ref(db, `/slots/${slotId}`);
      const unsub = onValue(
        slotRef,
        (snapshot: DataSnapshot) => {
          const raw = snapshot.val() || {};
          setSlotsState((prev) => ({
            ...prev,
            [slotId]: {
              loaded: true,
              medication_name: typeof raw.medication_name === "string" ? raw.medication_name : "",
              dosage: typeof raw.dosage === "string" ? raw.dosage : "",
              stock_current: raw.stock_current !== undefined ? Number(raw.stock_current) : 0,
              stock_max: raw.stock_max !== undefined ? Number(raw.stock_max) : 100,
              status: typeof raw.status === "string" ? raw.status : "unknown",
            },
          }));
          setLoadingError(null);
        },
        (err) => {
          setLoadingError(err.message);
          setSlotsState((prev) => ({
            ...prev,
            [slotId]: { ...prev[slotId], loaded: true },
          }));
        }
      );
      unsubs.push(unsub);
    });

    // Listen to schedules - NEW SCHEMA: /schedule/{key}
    const scheduleRef = ref(db, "/schedule");
    const schedUnsub = onValue(
      scheduleRef,
      (snapshot: DataSnapshot) => {
        const raw = snapshot.val() || {};
        const entries: Record<string, ScheduleEntry> = {};
        Object.entries(raw).forEach(([key, val]) => {
          const schedItem = val as any;
          entries[key] = {
            key,
            slot: schedItem.slot,
            medication_name: schedItem.medication_name || "",
            dosage: schedItem.dosage || "",
            frequency: schedItem.frequency || "daily",
            times: Array.isArray(schedItem.times) ? schedItem.times : ["08:00"],
            days: Array.isArray(schedItem.days) ? schedItem.days : [],
            start_date: schedItem.start_date || "",
            active: schedItem.active !== false,
          };
        });
        setSchedules(entries);
      },
      (err) => console.error("Schedules listener error:", err)
    );
    unsubs.push(schedUnsub);

    return () => unsubs.forEach((u) => u());
  }, []);

  // Find most recent active schedule for a given slot
  const getScheduleForSlot = (slotId: SlotId): ScheduleEntry | null => {
    const slotNum = parseInt(slotId.replace("slot", ""), 10);
    const matches = Object.values(schedules).filter(
      (s) => {
        const schedSlotNum = typeof s.slot === "string" ? parseInt(s.slot.replace("slot", ""), 10) : s.slot;
        return schedSlotNum === slotNum && s.active !== false;
      }
    );
    if (matches.length === 0) return null;
    return matches[matches.length - 1];
  };

  const allLoaded = SLOT_IDS.every((id) => slotsState[id].loaded);

  // Summary stats
  const activeCount = SLOT_IDS.filter((id) => slotsState[id].status === "active").length;
  const lowCount = SLOT_IDS.filter((id) => slotsState[id].status === "low_stock").length;
  const emptyCount = SLOT_IDS.filter((id) => slotsState[id].status === "empty").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage medications, stock levels, and dispensing schedules for each slot.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {activeCount} Active
          </span>
          {lowCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 px-2.5 py-1 text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> {lowCount} Low
            </span>
          )}
          {emptyCount > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> {emptyCount} Empty
            </span>
          )}
        </div>
      </div>

      {/* Error state */}
      {loadingError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>Firebase error: {loadingError}</span>
        </div>
      )}

      {/* Slot cards */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {!allLoaded
          ? SLOT_IDS.map((id) => <SkeletonCard key={id} />)
          : SLOT_IDS.map((slotId, index) => (
              <SlotCard
                key={slotId}
                slotId={slotId}
                slotNum={index + 1}
                slot={slotsState[slotId]}
                existingSchedule={getScheduleForSlot(slotId)}
                onEdit={() => setEditingSlot(slotId)}
              />
            ))}
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-border bg-surface/50 px-4 py-3 text-xs text-muted-foreground flex items-center gap-2">
        <PackagePlus className="h-4 w-4 shrink-0 text-primary" />
        Click <strong className="text-foreground">"Edit Medication &amp; Schedule"</strong> on any slot card to update medication details and configure dispensing times. Changes are saved directly to Firebase and reflected on the dashboard in real time.
      </div>

      {/* Edit Modal */}
      {editingSlot && (
        <EditMedicationSchedule
          slotId={editingSlot}
          slotNum={SLOT_IDS.indexOf(editingSlot) + 1}
          initialData={slotsState[editingSlot]}
          existingSchedule={getScheduleForSlot(editingSlot)}
          onClose={() => setEditingSlot(null)}
        />
      )}
    </div>
  );
}
