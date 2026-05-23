import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef } from "react";
import type { DataSnapshot } from "firebase/database";
import { db, ref, onValue, update, push, set, remove } from "../../firebase";
import { StockBar } from "@/components/medi/StockBar";
import { toast } from "sonner";
import {
  Pill,
  Pencil,
  Trash2,
  X,
  Save,
  Loader2,
  Clock,
  CalendarDays,
  PackagePlus,
  AlertTriangle,
  CheckCircle2,
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

type Frequency = "daily" | "twice_daily" | "weekly" | "custom";

interface EditForm {
  medication_name: string;
  dosage: string;
  stock_current: number;
  stock_max: number;
  status: string;
  frequency: Frequency;
  times: string[];
  days: string[];
}

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_OPTIONS = [
  { value: "active", label: "Active", color: "text-emerald-400" },
  { value: "low_stock", label: "Low Stock", color: "text-amber-400" },
  { value: "empty", label: "Empty", color: "text-rose-400" },
];

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily (once)" },
  { value: "twice_daily", label: "Twice Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom (multiple times)" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function slotLabel(id: SlotId): string {
  return `Slot ${id.replace("slot", "")}`;
}

function derivedStatus(stock: number, max: number): string {
  if (stock <= 0) return "empty";
  if (stock <= 10 || stock / max <= 0.2) return "low_stock";
  return "active";
}

function defaultEditForm(slot: SlotData): EditForm {
  return {
    medication_name: slot.medication_name || "",
    dosage: slot.dosage || "",
    stock_current: slot.stock_current ?? 0,
    stock_max: slot.stock_max ?? 100,
    status: slot.status || "active",
    frequency: "daily",
    times: ["08:00"],
    days: [],
  };
}

function timesForFrequency(freq: Frequency, current: string[]): string[] {
  if (freq === "daily") return [current[0] || "08:00"];
  if (freq === "twice_daily") return [current[0] || "08:00", current[1] || "20:00"];
  if (freq === "weekly") return [current[0] || "08:00"];
  // custom: keep whatever is there (min 1)
  return current.length > 0 ? current : ["08:00"];
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

// ─── Time Picker Row ──────────────────────────────────────────────────────────

function TimePickerRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="min-w-0 flex-1 text-xs text-muted-foreground">{label}</label>
      <input
        type="time"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-32 rounded-md border border-input bg-input/40 px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary transition-colors"
      />
    </div>
  );
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  loading,
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  loading?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
      <div className="w-full max-w-sm rounded-xl border border-border bg-popover p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-destructive/15">
            <AlertTriangle className="h-4 w-4 text-destructive" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={loading}
            className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg bg-destructive px-4 py-2 text-xs font-semibold text-destructive-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            Remove Medication
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────

function EditModal({
  slotId,
  slotNum,
  initialData,
  existingSchedule,
  onClose,
}: {
  slotId: SlotId;
  slotNum: number;
  initialData: SlotData;
  existingSchedule: ScheduleEntry | null;
  onClose: () => void;
}) {
  const [form, setForm] = useState<EditForm>(() => {
    const base = defaultEditForm(initialData);
    if (existingSchedule) {
      base.frequency = (existingSchedule.frequency as Frequency) || "daily";
      base.times = existingSchedule.times?.length > 0 ? existingSchedule.times : ["08:00"];
      base.days = existingSchedule.days || [];
    }
    return base;
  });

  const [saving, setSaving] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showConfirm) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, showConfirm]);

  const setField = <K extends keyof EditForm>(key: K, value: EditForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleFrequencyChange = (freq: Frequency) => {
    setForm((prev) => ({
      ...prev,
      frequency: freq,
      times: timesForFrequency(freq, prev.times),
      days: freq === "weekly" ? (prev.days.length > 0 ? prev.days : ["Mon"]) : prev.days,
    }));
  };

  const handleTimeChange = (index: number, value: string) => {
    setForm((prev) => {
      const times = [...prev.times];
      times[index] = value;
      return { ...prev, times };
    });
  };

  const addCustomTime = () => {
    setForm((prev) => ({ ...prev, times: [...prev.times, "12:00"] }));
  };

  const removeCustomTime = (index: number) => {
    setForm((prev) => ({
      ...prev,
      times: prev.times.filter((_, i) => i !== index),
    }));
  };

  const toggleDay = (day: string) => {
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(day) ? prev.days.filter((d) => d !== day) : [...prev.days, day],
    }));
  };

  const validate = (): string | null => {
    if (!form.medication_name.trim()) return "Medication name is required.";
    if (form.stock_current < 0) return "Stock quantity cannot be negative.";
    if (form.stock_max <= 0) return "Max stock must be greater than 0.";
    if (form.stock_current > form.stock_max) return "Stock quantity cannot exceed max stock.";
    if (form.times.some((t) => !t)) return "Please fill in all time fields.";
    if (form.frequency === "weekly" && form.days.length === 0) return "Select at least one day for weekly schedule.";
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }

    setSaving(true);
    try {
      // 1. Update slot data
      const slotRef = ref(db, `slots/${slotId}`);
      const autoStatus = derivedStatus(form.stock_current, form.stock_max);
      await update(slotRef, {
        medication_name: form.medication_name.trim(),
        dosage: form.dosage.trim(),
        stock_current: form.stock_current,
        stock_max: form.stock_max,
        status: form.status || autoStatus,
      });

      // 2. Create or update schedule
      const scheduleData: ScheduleEntry = {
        slot: slotId,
        medication_name: form.medication_name.trim(),
        dosage: form.dosage.trim(),
        frequency: form.frequency,
        times: form.times,
        days: form.frequency === "weekly" ? form.days : [],
        start_date: new Date().toISOString().slice(0, 10),
        active: true,
      };

      if (existingSchedule?.key) {
        // Update existing schedule
        const schedRef = ref(db, `schedules/${existingSchedule.key}`);
        await update(schedRef, scheduleData);
      } else {
        // Create new schedule
        const schedulesRef = ref(db, "schedules");
        await push(schedulesRef, scheduleData);
      }

      toast.success(`Medication saved for Slot ${slotNum}`, {
        icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      });
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to save: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setRemoving(true);
    try {
      // Clear slot
      const slotRef = ref(db, `slots/${slotId}`);
      await update(slotRef, {
        medication_name: "Empty",
        dosage: "",
        stock_current: 0,
        status: "empty",
      });

      // Deactivate schedule if exists
      if (existingSchedule?.key) {
        const schedRef = ref(db, `schedules/${existingSchedule.key}`);
        await update(schedRef, { active: false });
      }

      toast.success(`Slot ${slotNum} medication removed.`);
      setShowConfirm(false);
      onClose();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Failed to remove: ${message}`);
    } finally {
      setRemoving(false);
    }
  };

  const currentPct = form.stock_max > 0 ? Math.round((form.stock_current / form.stock_max) * 100) : 0;

  return (
    <>
      <ConfirmDialog
        open={showConfirm}
        title={`Remove medication from Slot ${slotNum}?`}
        description="This will clear the medication name, reset stock to 0, and deactivate the schedule. This action cannot be undone."
        onConfirm={handleRemove}
        onCancel={() => setShowConfirm(false)}
        loading={removing}
      />

      <div
        className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div className="w-full max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border border-border bg-popover shadow-2xl">
          {/* Header */}
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-popover/95 backdrop-blur px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15">
                <Pill className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Editing</div>
                <div className="text-sm font-semibold">Slot {slotNum}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-6 px-5 py-5">
            {/* ── Medication Details ── */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Pill className="h-3.5 w-3.5" /> Medication Details
              </h3>

              <div className="space-y-3">
                {/* Medication Name */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">
                    Medication Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    ref={nameRef}
                    type="text"
                    value={form.medication_name}
                    onChange={(e) => setField("medication_name", e.target.value)}
                    placeholder="e.g. Metformin 500mg"
                    maxLength={80}
                    className="w-full rounded-lg border border-input bg-input/40 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                  />
                </div>

                {/* Dosage */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">Dosage</label>
                  <input
                    type="text"
                    value={form.dosage}
                    onChange={(e) => setField("dosage", e.target.value)}
                    placeholder="e.g. 1 tablet, 2 capsules"
                    maxLength={60}
                    className="w-full rounded-lg border border-input bg-input/40 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                  />
                </div>

                {/* Stock + Max */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">
                      Stock Quantity
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={form.stock_max}
                      value={form.stock_current}
                      onChange={(e) => setField("stock_current", Math.max(0, Math.min(form.stock_max, Number(e.target.value))))}
                      className="w-full rounded-lg border border-input bg-input/40 px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-foreground">Max Capacity</label>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={form.stock_max}
                      onChange={(e) => setField("stock_max", Math.max(1, Number(e.target.value)))}
                      className="w-full rounded-lg border border-input bg-input/40 px-3 py-2.5 text-sm font-mono text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                    />
                  </div>
                </div>

                {/* Stock visual */}
                <div className="rounded-lg border border-border bg-surface/50 px-4 py-3">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span>Stock level</span>
                    <span className="font-mono font-medium text-foreground">
                      {form.stock_current} / {form.stock_max} ({currentPct}%)
                    </span>
                  </div>
                  <StockBar value={Math.min(form.stock_current, form.stock_max)} capacity={form.stock_max} />
                </div>

                {/* Status */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">Status</label>
                  <div className="relative">
                    <select
                      value={form.status}
                      onChange={(e) => setField("status", e.target.value)}
                      className="w-full appearance-none rounded-lg border border-input bg-input/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all pr-8"
                    >
                      {STATUS_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>
              </div>
            </section>

            {/* ── Schedule Times ── */}
            <section>
              <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" /> Dispensing Schedule
              </h3>

              <div className="space-y-3">
                {/* Frequency */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-foreground">Frequency</label>
                  <div className="relative">
                    <select
                      value={form.frequency}
                      onChange={(e) => handleFrequencyChange(e.target.value as Frequency)}
                      className="w-full appearance-none rounded-lg border border-input bg-input/40 px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all pr-8"
                    >
                      {FREQ_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  </div>
                </div>

                {/* Weekly day selector */}
                {form.frequency === "weekly" && (
                  <div>
                    <label className="mb-2 block text-xs font-medium text-foreground">Days of week</label>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEK_DAYS.map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleDay(day)}
                          className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                            form.days.includes(day)
                              ? "border-primary bg-primary/20 text-primary"
                              : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground"
                          }`}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Time pickers */}
                <div className="rounded-lg border border-border bg-surface/50 p-3 space-y-2.5">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Dispense time{form.times.length > 1 ? "s" : ""}</span>
                  </div>

                  {form.frequency === "daily" && (
                    <TimePickerRow label="Time" value={form.times[0] || "08:00"} onChange={(v) => handleTimeChange(0, v)} />
                  )}

                  {form.frequency === "twice_daily" && (
                    <>
                      <TimePickerRow label="Morning" value={form.times[0] || "08:00"} onChange={(v) => handleTimeChange(0, v)} />
                      <TimePickerRow label="Evening" value={form.times[1] || "20:00"} onChange={(v) => handleTimeChange(1, v)} />
                    </>
                  )}

                  {form.frequency === "weekly" && (
                    <TimePickerRow label="Time" value={form.times[0] || "08:00"} onChange={(v) => handleTimeChange(0, v)} />
                  )}

                  {form.frequency === "custom" && (
                    <>
                      {form.times.map((t, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <TimePickerRow
                            label={`Time ${i + 1}`}
                            value={t}
                            onChange={(v) => handleTimeChange(i, v)}
                          />
                          {form.times.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeCustomTime(i)}
                              className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                      ))}
                      {form.times.length < 6 && (
                        <button
                          type="button"
                          onClick={addCustomTime}
                          className="mt-1 flex items-center gap-1.5 text-xs text-primary hover:underline"
                        >
                          + Add another time
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-popover/95 backdrop-blur px-5 py-4">
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Remove
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-border px-4 py-2 text-xs font-medium hover:bg-surface-2 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
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

    // Listen to each slot
    SLOT_IDS.forEach((slotId) => {
      const slotRef = ref(db, `slots/${slotId}`);
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

    // Listen to schedules
    const schedulesRef = ref(db, "schedules");
    const schedUnsub = onValue(
      schedulesRef,
      (snapshot: DataSnapshot) => {
        const raw = snapshot.val() || {};
        const entries: Record<string, ScheduleEntry> = {};
        Object.entries(raw).forEach(([key, val]) => {
          entries[key] = { ...(val as ScheduleEntry), key };
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
    const matches = Object.values(schedules).filter(
      (s) => s.slot === slotId && s.active !== false
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
        <EditModal
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
