import { useEffect, useState, useRef } from "react";
import ReactDOM from "react-dom";
import { db, ref, update, push, set, remove } from "@/firebase";
import { StockBar } from "@/components/medi/StockBar";
import { toast } from "sonner";
import {
  Pill,
  X,
  Save,
  Loader2,
  Clock,
  CalendarDays,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";

type SlotId = "slot1" | "slot2" | "slot3";
type Frequency = "daily" | "twice_daily" | "weekly" | "custom";

interface SlotData {
  medication_name: string;
  dosage: string;
  stock_current: number;
  stock_max: number;
  status: string;
  loaded?: boolean;
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
  return current.length > 0 ? current : ["08:00"];
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

// ─── Confirm Delete Dialog ────────────────────────────────────────────────────

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
  if (!open || typeof document === "undefined") return null;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
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
    </div>,
    document.body
  );
}

// ─── Edit Medication & Schedule Component ─────────────────────────────────────

export function EditMedicationSchedule({
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
      // 1. Update slot data in Firebase
      const slotRef = ref(db, `/slots/${slotId}`);
      const autoStatus = derivedStatus(form.stock_current, form.stock_max);
      await update(slotRef, {
        medication_name: form.medication_name.trim(),
        dosage: form.dosage.trim(),
        stock_current: form.stock_current,
        stock_max: form.stock_max,
        status: form.status || autoStatus,
      });

      // 2. Create or update schedule in Firebase
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
        const schedRef = ref(db, `/schedule/${existingSchedule.key}`);
        await update(schedRef, scheduleData);
      } else {
        const scheduleRef = ref(db, "/schedule");
        await push(scheduleRef, scheduleData);
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
      // Clear slot in Firebase
      const slotRef = ref(db, `/slots/${slotId}`);
      await update(slotRef, {
        medication_name: "",
        dosage: "",
        stock_current: 0,
        status: "empty",
      });

      // Deactivate schedule if exists in Firebase
      if (existingSchedule?.key) {
        const schedRef = ref(db, `/schedule/${existingSchedule.key}`);
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

      {typeof document !== "undefined" &&
        ReactDOM.createPortal(
          <div
            className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in"
            onClick={(e) => {
              if (e.target === e.currentTarget) onClose();
            }}
            role="dialog"
            aria-modal="true"
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
                        <label className="mb-1.5 block text-xs font-medium text-foreground">Stock Quantity</label>
                        <input
                          type="number"
                          min={0}
                          max={form.stock_max}
                          value={form.stock_current}
                          onChange={(e) =>
                            setField("stock_current", Math.max(0, Math.min(form.stock_max, Number(e.target.value))))
                          }
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
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
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
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
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
                        <TimePickerRow
                          label="Time"
                          value={form.times[0] || "08:00"}
                          onChange={(v) => handleTimeChange(0, v)}
                        />
                      )}

                      {form.frequency === "twice_daily" && (
                        <>
                          <TimePickerRow
                            label="Morning"
                            value={form.times[0] || "08:00"}
                            onChange={(v) => handleTimeChange(0, v)}
                          />
                          <TimePickerRow
                            label="Evening"
                            value={form.times[1] || "20:00"}
                            onChange={(v) => handleTimeChange(1, v)}
                          />
                        </>
                      )}

                      {form.frequency === "weekly" && (
                        <TimePickerRow
                          label="Time"
                          value={form.times[0] || "08:00"}
                          onChange={(v) => handleTimeChange(0, v)}
                        />
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
          </div>,
          document.body
        )}
    </>
  );
}
