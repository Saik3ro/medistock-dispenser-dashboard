import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { schedules } from "@/lib/mock-data";
import { ChevronLeft, ChevronRight, Plus, Pencil, Power } from "lucide-react";

export const Route = createFileRoute("/_app/schedule")({
  head: () => ({
    meta: [
      { title: "Schedule — MediStock" },
      { name: "description", content: "Manage medication schedules and view a monthly compliance calendar." },
    ],
  }),
  component: SchedulePage,
});

const slotColor: Record<number, string> = {
  1: "bg-primary",
  2: "bg-warning",
  3: "bg-chart-4",
};

function buildMonth(year: number, month: number) {
  const first = new Date(year, month, 1);
  const offset = first.getDay();
  const daysIn = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ day: number | null; date?: Date }> = [];
  for (let i = 0; i < offset; i++) cells.push({ day: null });
  for (let d = 1; d <= daysIn; d++) cells.push({ day: d, date: new Date(year, month, d) });
  while (cells.length % 7) cells.push({ day: null });
  return cells;
}

function dayStatus(d: number) {
  if (d % 9 === 0) return "missed";
  if (d % 5 === 0) return "partial";
  return "ok";
}

function SchedulePage() {
  const [cursor, setCursor] = useState(new Date(2026, 4, 1));
  const cells = buildMonth(cursor.getFullYear(), cursor.getMonth());
  const monthLabel = cursor.toLocaleString([], { month: "long", year: "numeric" });
  const today = 22;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
          <p className="mt-1 text-sm text-muted-foreground">Monthly view, color-coded by dispenser slot.</p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> New schedule
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Calendar */}
        <div className="panel">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-surface-2">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-medium">{monthLabel}</span>
              <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-surface-2">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> All taken</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-warning" /> Partial</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-destructive" /> Missed</span>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} className="py-2">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {cells.map((c, i) => {
              if (!c.day) return <div key={i} className="h-24 border-b border-r border-border/60 bg-background/40 last:border-r-0" />;
              const status = dayStatus(c.day);
              const isToday = c.day === today && cursor.getMonth() === 4;
              const dotColor = status === "ok" ? "bg-success" : status === "partial" ? "bg-warning" : "bg-destructive";
              return (
                <div key={i} className={`relative h-24 border-b border-r border-border/60 p-2 last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}>
                  <div className="flex items-start justify-between">
                    <span className={`text-mono text-xs ${isToday ? "font-semibold text-primary" : "text-foreground/80"}`}>{c.day}</span>
                    <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
                  </div>
                  <div className="mt-2 space-y-1">
                    {[1,2,3].map((slot) => (
                      <div key={slot} className="flex items-center gap-1">
                        <span className={`h-1 w-3 rounded-sm ${slotColor[slot]}`} />
                        <span className="text-[10px] text-muted-foreground">{slot === 1 ? "08:00" : slot === 2 ? "12:30" : "21:00"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Side panel */}
        <aside className="space-y-3">
          <div className="panel p-4">
            <h3 className="text-sm font-semibold">Active schedules</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">Tap a row to edit timing or dosage.</p>
            <ul className="mt-3 divide-y divide-border">
              {schedules.map((s) => (
                <li key={s.id} className="py-3">
                  <div className="flex items-center gap-2">
                    <span className={`h-6 w-1 rounded-sm ${slotColor[s.slot]}`} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{s.medication}</div>
                      <div className="text-[11px] text-muted-foreground">Slot 0{s.slot} · {s.frequency} · {s.times.join(", ")}</div>
                    </div>
                    <button className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-surface-2" aria-label="Edit">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button className="grid h-7 w-7 place-items-center rounded-md border border-border hover:bg-surface-2" aria-label="Toggle">
                      <Power className={`h-3.5 w-3.5 ${s.enabled ? "text-success" : "text-muted-foreground"}`} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="panel p-4">
            <h3 className="text-sm font-semibold">Quick add</h3>
            <form className="mt-3 space-y-2 text-xs">
              <input placeholder="Medication name" className="w-full rounded-md border border-input bg-input/40 px-3 py-2 outline-none focus:border-primary" />
              <div className="grid grid-cols-2 gap-2">
                <select className="rounded-md border border-input bg-input/40 px-2 py-2">
                  <option>Slot 1</option><option>Slot 2</option><option>Slot 3</option>
                </select>
                <select className="rounded-md border border-input bg-input/40 px-2 py-2">
                  <option>Daily</option><option>Twice daily</option><option>Weekly</option><option>Custom</option>
                </select>
              </div>
              <input placeholder="Dosage (e.g. 1 tablet)" className="w-full rounded-md border border-input bg-input/40 px-3 py-2" />
              <input type="time" className="w-full rounded-md border border-input bg-input/40 px-3 py-2" />
              <button type="button" className="w-full rounded-md bg-primary py-2 text-xs font-medium text-primary-foreground hover:opacity-90">
                Save schedule
              </button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
