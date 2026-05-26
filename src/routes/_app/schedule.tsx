import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useRef, useCallback, memo } from "react";
import type { DataSnapshot } from "firebase/database";
import { db, ref, onValue, update, remove } from "../../firebase";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Pencil,
  PauseCircle,
  PlayCircle,
  Trash2,
  Save,
  X,
  Loader2,
  Clock,
  CalendarDays,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";

export const Route = createFileRoute("/_app/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — MediStock" },
      {
        name: "description",
        content:
          "Manage medication schedules and view a monthly compliance calendar.",
      },
    ],
  }),
  component: SchedulePage,
});

// ─── Types ────────────────────────────────────────────────────────────────────

interface ScheduleEntry {
  key: string;
  slot: string | number;
  medication_name: string;
  dosage?: string;
  frequency: string;
  times: string[];
  days?: string[];
  start_date?: string;
  active: boolean;
}

type SlotKey = "slot1" | "slot2" | "slot3";
type Frequency = "daily" | "twice_daily" | "weekly" | "custom";

interface SlotStock {
  medication_name: string;
  stock_current: number;
}

interface EditDraft {
  medication_name: string;
  dosage: string;
  frequency: Frequency;
  times: string[];
  days: string[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SLOT_COLORS: Record<SlotKey, string> = {
  slot1: "bg-primary",
  slot2: "bg-warning",
  slot3: "bg-chart-4",
};

const SLOT_NUM: Record<SlotKey, number> = {
  slot1: 1,
  slot2: 2,
  slot3: 3,
};

const SLOT_KEYS: SlotKey[] = ["slot1", "slot2", "slot3"];

const WEEK_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const FREQ_LABELS: Record<string, string> = {
  daily: "Daily",
  twice_daily: "Twice Daily",
  weekly: "Weekly",
  custom: "Custom",
};

const FREQ_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "daily", label: "Daily (once)" },
  { value: "twice_daily", label: "Twice Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "custom", label: "Custom" },
];

// ─── Calendar helpers ─────────────────────────────────────────────────────────

function buildMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = first.getDay();
  const daysIn = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null; date?: Date }> = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null });
  for (let d = 1; d <= daysIn; d++)
    cells.push({ day: d, date: new Date(year, month, d) });
  while (cells.length % 7) cells.push({ day: null });
  return cells;
}

function timesForFrequency(freq: Frequency, current: string[]): string[] {
  if (freq === "daily") return [current[0] || "08:00"];
  if (freq === "twice_daily")
    return [current[0] || "08:00", current[1] || "20:00"];
  if (freq === "weekly") return [current[0] || "08:00"];
  return current.length > 0 ? current : ["08:00"];
}

function normalizeSlotKey(slot: string | number | undefined): SlotKey | null {
  if (slot === 1 || slot === "1" || slot === "slot1") return "slot1";
  if (slot === 2 || slot === "2" || slot === "slot2") return "slot2";
  if (slot === 3 || slot === "3" || slot === "slot3") return "slot3";
  return null;
}

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseStartDate(value?: string): Date {
  if (!value) return startOfLocalDay(new Date());
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return startOfLocalDay(new Date(value));
  return new Date(year, month - 1, day);
}

function dosesPerOccurrence(schedule: ScheduleEntry): number {
  if (schedule.frequency === "twice_daily") return Math.max(2, schedule.times?.length || 2);
  if (schedule.frequency === "custom") return Math.max(1, schedule.times?.length || 1);
  return 1;
}

function isWeeklyDoseDay(schedule: ScheduleEntry, date: Date): boolean {
  if (schedule.frequency !== "weekly") return true;
  const days = schedule.days || [];
  if (days.length === 0) return true;
  return days.includes(WEEK_DAYS[date.getDay()]);
}

interface DispensedDose {
  key: string;
  slot: number;
  medication_name: string;
  status: "dispensed" | "jammed" | "missed" | "cancelled";
  timestamp: number;
  scheduled_dose_id?: string;
}

function buildCalendarDoses(
  schedules: ScheduleEntry[],
  slots: Record<SlotKey, SlotStock>,
  monthStart: Date,
  monthEnd: Date,
  missedDoses: Record<string, DispensedDose[]> = {}
) {
  const calendar: Record<string, Array<{ schedule: ScheduleEntry; slotKey: SlotKey; time: string; status?: string; missed?: boolean }>> = {};

  schedules
    .filter((schedule) => schedule.active !== false)
    .forEach((schedule) => {
      const slotKey = normalizeSlotKey(schedule.slot);
      if (!slotKey) return;

      const stock = Math.max(0, Number(slots[slotKey]?.stock_current ?? 0));
      if (stock <= 0) return;

      const occurrenceDoseCount = dosesPerOccurrence(schedule);
      const start = parseStartDate(schedule.start_date);
      const cursor = new Date(start);
      let scheduledDoses = 0;
      let guard = 0;

      while (scheduledDoses < stock && guard < 730) {
        guard += 1;
        if (isWeeklyDoseDay(schedule, cursor)) {
          const dosesToday = Math.min(occurrenceDoseCount, stock - scheduledDoses);
          if (cursor >= monthStart && cursor <= monthEnd) {
            const key = localDateKey(cursor);
            const times = (schedule.times?.length ? schedule.times : ["08:00"]).slice(0, dosesToday);
            calendar[key] = [
              ...(calendar[key] || []),
              ...times.map((time) => {
                // Check if this dose was marked as missed
                const missedForDate = missedDoses[key] || [];
                const isMissed = missedForDate.some(
                  (m) => m.slot === Number(schedule.slot) && m.status === "missed"
                );
                return { schedule, slotKey, time, status: isMissed ? "missed" : undefined, missed: isMissed };
              }),
            ];
          }
          scheduledDoses += dosesToday;
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    });

  return calendar;
}

// ─── Inline Edit Panel ────────────────────────────────────────────────────────

function EditPanel({
  schedule,
  onClose,
}: {
  schedule: ScheduleEntry;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<EditDraft>({
    medication_name: schedule.medication_name || "",
    dosage: schedule.dosage || "",
    frequency: (schedule.frequency as Frequency) || "daily",
    times: schedule.times?.length > 0 ? schedule.times : ["08:00"],
    days: schedule.days || [],
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      nameRef.current?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const setField = <K extends keyof EditDraft>(key: K, value: EditDraft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const handleFrequencyChange = (freq: Frequency) => {
    setDraft((prev) => ({
      ...prev,
      frequency: freq,
      times: timesForFrequency(freq, prev.times),
      days:
        freq === "weekly"
          ? prev.days.length > 0
            ? prev.days
            : ["Mon"]
          : prev.days,
    }));
  };

  const handleTimeChange = (index: number, value: string) => {
    setDraft((prev) => {
      const times = [...prev.times];
      times[index] = value;
      return { ...prev, times };
    });
  };

  const toggleDay = (day: string) => {
    setDraft((prev) => ({
      ...prev,
      days: prev.days.includes(day)
        ? prev.days.filter((d) => d !== day)
        : [...prev.days, day],
    }));
  };

  const validate = (): string | null => {
    if (!draft.medication_name.trim()) return "Medication name is required.";
    if (draft.times.some((t) => !t)) return "Please fill in all time fields.";
    if (draft.frequency === "weekly" && draft.days.length === 0)
      return "Select at least one day for weekly schedule.";
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
      const schedRef = ref(db, `schedule/${schedule.key}`);
      await update(schedRef, {
        medication_name: draft.medication_name.trim(),
        dosage: draft.dosage.trim(),
        frequency: draft.frequency,
        times: draft.times,
        days: draft.frequency === "weekly" ? draft.days : [],
      });
      toast.success("Schedule updated successfully.");
      onClose();
    } catch (e: unknown) {
      toast.error(`Failed to save: ${e instanceof Error ? e.message : e}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const schedRef = ref(db, `schedule/${schedule.key}`);
      await remove(schedRef);
      toast.success("Schedule deleted.");
      onClose();
    } catch (e: unknown) {
      toast.error(`Failed to delete: ${e instanceof Error ? e.message : e}`);
    } finally {
      setDeleting(false);
    }
  };

  const slotKey = normalizeSlotKey(schedule.slot);
  const slotNum = slotKey ? SLOT_NUM[slotKey] : "?";
  const slotColor = slotKey ? SLOT_COLORS[slotKey] : "bg-muted";

  return (
    <div className="rounded-xl border border-primary/30 bg-popover/95 shadow-xl animate-fade-in">
      {/* Edit Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`h-5 w-1.5 rounded-full ${slotColor}`} />
          <span className="text-xs font-semibold text-foreground">
            Editing · Slot 0{slotNum}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="grid h-7 w-7 place-items-center rounded-md border border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
          aria-label="Close edit panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Medication Name */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Medication Name
          </label>
          <input
            ref={nameRef}
            type="text"
            value={draft.medication_name}
            onChange={(e) => setField("medication_name", e.target.value)}
            maxLength={80}
            placeholder="e.g. Metformin 500mg"
            className="w-full rounded-lg border border-input bg-input/40 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </div>

        {/* Dosage */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Dosage
          </label>
          <input
            type="text"
            value={draft.dosage}
            onChange={(e) => setField("dosage", e.target.value)}
            maxLength={60}
            placeholder="e.g. 1 tablet"
            className="w-full rounded-lg border border-input bg-input/40 px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
          />
        </div>

        {/* Frequency */}
        <div>
          <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Frequency
          </label>
          <div className="relative">
            <select
              value={draft.frequency}
              onChange={(e) =>
                handleFrequencyChange(e.target.value as Frequency)
              }
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
        {draft.frequency === "weekly" && (
          <div>
            <label className="mb-2 block text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Days of week
            </label>
            <div className="flex flex-wrap gap-1.5">
              {WEEK_DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                    draft.days.includes(day)
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

        {/* Times */}
        <div className="rounded-lg border border-border bg-surface/50 p-3 space-y-2.5">
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-1">
            <Clock className="h-3.5 w-3.5" />
            <span className="uppercase tracking-wider font-medium">
              Dispense time{draft.times.length > 1 ? "s" : ""}
            </span>
          </div>

          {draft.frequency === "daily" && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Time</span>
              <input
                type="time"
                value={draft.times[0] || "08:00"}
                onChange={(e) => handleTimeChange(0, e.target.value)}
                className="w-32 rounded-md border border-input bg-input/40 px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          {draft.frequency === "twice_daily" && (
            <>
              {["Morning", "Evening"].map((label, i) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3"
                >
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <input
                    type="time"
                    value={draft.times[i] || (i === 0 ? "08:00" : "20:00")}
                    onChange={(e) => handleTimeChange(i, e.target.value)}
                    className="w-32 rounded-md border border-input bg-input/40 px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary transition-colors"
                  />
                </div>
              ))}
            </>
          )}

          {draft.frequency === "weekly" && (
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted-foreground">Time</span>
              <input
                type="time"
                value={draft.times[0] || "08:00"}
                onChange={(e) => handleTimeChange(0, e.target.value)}
                className="w-32 rounded-md border border-input bg-input/40 px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary transition-colors"
              />
            </div>
          )}

          {draft.frequency === "custom" && (
            <>
              {draft.times.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 text-xs text-muted-foreground">
                    Time {i + 1}
                  </span>
                  <input
                    type="time"
                    value={t}
                    onChange={(e) => handleTimeChange(i, e.target.value)}
                    className="w-32 rounded-md border border-input bg-input/40 px-2 py-1.5 text-xs font-mono text-foreground outline-none focus:border-primary transition-colors"
                  />
                  {draft.times.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          times: prev.times.filter((_, idx) => idx !== i),
                        }))
                      }
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-muted-foreground hover:border-destructive hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              ))}
              {draft.times.length < 6 && (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      times: [...prev.times, "12:00"],
                    }))
                  }
                  className="text-xs text-primary hover:underline"
                >
                  + Add another time
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
        {/* Delete */}
        {showDeleteConfirm ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-destructive font-medium">
              Delete this schedule?
            </span>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {deleting && <Loader2 className="h-3 w-3 animate-spin" />}
              Yes, delete
            </button>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Schedule Row ─────────────────────────────────────────────────────────────

const ScheduleRow = memo(function ScheduleRow({
  schedule,
  isEditing,
  onEditToggle,
}: {
  schedule: ScheduleEntry;
  isEditing: boolean;
  onEditToggle: () => void;
}) {
  const [toggling, setToggling] = useState(false);
  const slotKey = normalizeSlotKey(schedule.slot);
  const slotNum = slotKey ? SLOT_NUM[slotKey] : "?";
  const slotColor = slotKey ? SLOT_COLORS[slotKey] : "bg-muted";
  const isActive = schedule.active !== false;

  const handleTogglePause = async () => {
    setToggling(true);
    try {
      const schedRef = ref(db, `schedule/${schedule.key}`);
      await update(schedRef, { active: !isActive });
      toast.success(
        isActive
          ? `Schedule paused for ${schedule.medication_name || "Slot " + slotNum}`
          : `Schedule resumed for ${schedule.medication_name || "Slot " + slotNum}`
      );
    } catch (e: unknown) {
      toast.error(`Failed to update: ${e instanceof Error ? e.message : e}`);
    } finally {
      setToggling(false);
    }
  };

  return (
    <li className={`py-3 transition-opacity duration-200 ${!isActive ? "opacity-50" : ""}`}>
      <div className="flex items-center gap-2">
        <span className={`h-6 w-1 shrink-0 rounded-sm ${slotColor} ${!isActive ? "opacity-40" : ""}`} />
        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-sm font-medium ${!isActive ? "line-through text-muted-foreground" : ""}`}
          >
            {schedule.medication_name || "Unnamed medication"}
          </div>
          <div className="text-[11px] text-muted-foreground">
            Slot 0{slotNum} · {FREQ_LABELS[schedule.frequency] ?? schedule.frequency}
            {schedule.times?.length > 0 && " · " + schedule.times.join(", ")}
            {!isActive && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
                Paused
              </span>
            )}
            {schedule.missed_count && schedule.missed_count > 0 && (
              <span className="ml-1.5 inline-flex items-center rounded-full bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                {schedule.missed_count} missed
              </span>
            )}
          </div>
          {schedule.dosage && (
            <div className="text-[11px] text-muted-foreground/70">
              {schedule.dosage}
            </div>
          )}
        </div>

        {/* Edit button */}
        <button
          type="button"
          onClick={onEditToggle}
          className={`grid h-7 w-7 place-items-center rounded-md border transition-colors ${
            isEditing
              ? "border-primary bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-surface-2 hover:text-foreground"
          }`}
          aria-label="Edit schedule"
          title="Edit schedule"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>

        {/* Pause / Resume button — replaces the confusing Power icon */}
        <button
          type="button"
          onClick={handleTogglePause}
          disabled={toggling}
          className={`grid h-7 w-7 place-items-center rounded-md border transition-colors disabled:opacity-50 ${
            isActive
              ? "border-border text-muted-foreground hover:border-amber-500/60 hover:bg-amber-500/10 hover:text-amber-400"
              : "border-emerald-500/40 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
          }`}
          aria-label={isActive ? "Pause schedule" : "Resume schedule"}
          title={isActive ? "Pause schedule" : "Resume schedule"}
        >
          {toggling ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : isActive ? (
            <PauseCircle className="h-3.5 w-3.5" />
          ) : (
            <PlayCircle className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {/* Inline edit panel */}
      {isEditing && (
        <div className="mt-3">
          <EditPanel schedule={schedule} onClose={onEditToggle} />
        </div>
      )}
    </li>
  );
});

// ─── Main Page ────────────────────────────────────────────────────────────────

function SchedulePage() {
  const [cursor, setCursor] = useState(new Date());
  const cells = buildMonth(cursor.getFullYear(), cursor.getMonth());
  const monthLabel = cursor.toLocaleString([], {
    month: "long",
    year: "numeric",
  });
  const todayDate = new Date().getDate();
  const todayMonth = new Date().getMonth();

  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [slots, setSlots] = useState<Record<SlotKey, SlotStock>>({
    slot1: { medication_name: "", stock_current: 0 },
    slot2: { medication_name: "", stock_current: 0 },
    slot3: { medication_name: "", stock_current: 0 },
  });
  const [missedDoses, setMissedDoses] = useState<Record<string, DispensedDose[]>>({});
  const [loadingSchedules, setLoadingSchedules] = useState(true);
  const [schedulesError, setSchedulesError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);

  useEffect(() => {
    const schedulesRef = ref(db, "schedule");
    const unsub = onValue(
      schedulesRef,
      (snapshot: DataSnapshot) => {
        const raw = snapshot.val() || {};
        const entries: ScheduleEntry[] = Object.entries(raw).map(
          ([key, val]: any) => ({ ...(val as Omit<ScheduleEntry, "key">), key })
        );
        // Sort: active first, then by slot
        entries.sort((a, b) => {
          if (a.active === b.active) {
            return String(a.slot ?? "").localeCompare(String(b.slot ?? ""));
          }
          return a.active ? -1 : 1;
        });
        
        // Log any changes to start_date (indicating rescheduling)
        setSchedules((prevSchedules) => {
          entries.forEach((entry) => {
            const prev = prevSchedules.find((s) => s.key === entry.key);
            if (prev && prev.start_date !== entry.start_date) {
              console.log(
                `[Schedule Updated] ${entry.medication_name}: ${prev.start_date} → ${entry.start_date}`
              );
            }
          });
          return entries;
        });
        
        setLoadingSchedules(false);
        setSchedulesError(null);
      },
      (err) => {
        setSchedulesError(err.message);
        setLoadingSchedules(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const slotsRef = ref(db, "slots");
    const unsub = onValue(slotsRef, (snapshot: DataSnapshot) => {
      const raw = snapshot.val() || {};
      setSlots({
        slot1: {
          medication_name: raw.slot1?.medication_name || "",
          stock_current: Number(raw.slot1?.stock_current ?? 0),
        },
        slot2: {
          medication_name: raw.slot2?.medication_name || "",
          stock_current: Number(raw.slot2?.stock_current ?? 0),
        },
        slot3: {
          medication_name: raw.slot3?.medication_name || "",
          stock_current: Number(raw.slot3?.stock_current ?? 0),
        },
      });
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const dispenseLogRef = ref(db, "dispense_log");
    const unsub = onValue(dispenseLogRef, (snapshot: DataSnapshot) => {
      const raw = snapshot.val() || {};
      const allDoses = Object.entries(raw).map(([key, val]: any) => ({
        key,
        ...val,
      } as DispensedDose));

      // Group missed doses by date (YYYY-MM-DD)
      const missedByDate: Record<string, DispensedDose[]> = {};
      allDoses
        .filter((dose) => dose.status === "missed")
        .forEach((dose) => {
          const dateObj = new Date(dose.timestamp);
          const dateKey = localDateKey(dateObj);
          if (!missedByDate[dateKey]) {
            missedByDate[dateKey] = [];
          }
          missedByDate[dateKey].push(dose);
        });

      console.log("[Missed Doses Loaded]", missedByDate);
      setMissedDoses(missedByDate);
    });

    return () => unsub();
  }, []);

  const handleEditToggle = useCallback((key: string) => {
    setEditingKey((prev) => (prev === key ? null : key));
  }, []);

  const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);

  // Build calendar doses from Firebase inventory stock and schedule frequency.
  const activeSchedules = schedules.filter((s) => s.active !== false);
  const calendarDoses = buildCalendarDoses(activeSchedules, slots, monthStart, monthEnd, missedDoses);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly view, color-coded by dispenser slot.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* ── Calendar ── */}
        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setCursor(
                    new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
                  )
                }
                className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-surface-2 transition-colors"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-medium">{monthLabel}</span>
              <button
                type="button"
                onClick={() =>
                  setCursor(
                    new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
                  )
                }
                className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-surface-2 transition-colors"
                aria-label="Next month"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((c, i) => {
              if (!c.day)
                return (
                  <div
                    key={i}
                    className="h-24 border-b border-r border-border/60 bg-background/40 last:border-r-0"
                  />
                );
              const isToday =
                c.day === todayDate &&
                cursor.getMonth() === todayMonth;

              const doseItems = calendarDoses[localDateKey(c.date)] || [];

              return (
                <div
                  key={i}
                  className={`relative h-24 border-b border-r border-border/60 p-2 last:border-r-0 ${
                    isToday ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <span
                      className={`text-mono text-xs ${
                        isToday
                          ? "font-semibold text-primary"
                          : "text-foreground/80"
                      }`}
                    >
                      {c.day}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    {doseItems.length > 0 &&
                      doseItems.slice(0, 4).map(({ schedule, slotKey, time }, index) => (
                          <div
                            key={`${schedule.key}-${time}-${index}`}
                            className="flex items-center gap-1"
                            title={`${schedule.medication_name} at ${time}`}
                          >
                            <span
                              className={`h-1 w-3 rounded-sm ${SLOT_COLORS[slotKey]}`}
                            />
                            <span className="truncate text-[10px] text-muted-foreground">
                              {time} {schedule.medication_name}
                            </span>
                          </div>
                        ))}
                    {doseItems.length > 4 && (
                      <div className="text-[10px] text-muted-foreground">
                        +{doseItems.length - 4} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Side panel ── */}
        <aside className="space-y-3">
          <div className="panel p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-sm font-semibold">Active schedules</h3>
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <CalendarDays className="h-3.5 w-3.5" />
                <span>{activeSchedules.length} running</span>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Click{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                <Pencil className="h-2.5 w-2.5" /> Edit
              </span>{" "}
              to update timing or dosage.{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-foreground">
                <PauseCircle className="h-2.5 w-2.5" /> Pause
              </span>{" "}
              to temporarily stop dispensing.
            </p>

            {/* Error */}
            {schedulesError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {schedulesError}
              </div>
            )}

            {/* Loading skeleton */}
            {loadingSchedules && !schedulesError && (
              <ul className="mt-3 divide-y divide-border animate-pulse">
                {[1, 2, 3].map((i) => (
                  <li key={i} className="py-3">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-1 rounded-sm bg-muted/60" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-32 rounded bg-muted/60" />
                        <div className="h-2.5 w-48 rounded bg-muted/40" />
                      </div>
                      <div className="h-7 w-7 rounded-md bg-muted/40" />
                      <div className="h-7 w-7 rounded-md bg-muted/40" />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Schedule list */}
            {!loadingSchedules && !schedulesError && (
              <>
                {schedules.length === 0 ? (
                  <div className="mt-4 rounded-lg border border-dashed border-border py-6 text-center text-xs text-muted-foreground">
                    No schedules found.
                    <br />
                    Add medications in the{" "}
                    <span className="text-primary">Inventory</span> page.
                  </div>
                ) : (
                  <ul className="mt-3 divide-y divide-border">
                    {schedules.map((s) => (
                      <ScheduleRow
                        key={s.key}
                        schedule={s}
                        isEditing={editingKey === s.key}
                        onEditToggle={() => handleEditToggle(s.key)}
                      />
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
