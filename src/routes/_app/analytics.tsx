import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, AreaChart, Area, Legend,
} from "recharts";
import { complianceTrend, perSlotHistory, stockHistory } from "@/lib/mock-data";

export const Route = createFileRoute("/_app/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics — MediStock" },
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

function AnalyticsPage() {
  const [range, setRange] = useState<typeof ranges[number]>("30d");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">Adherence and inventory patterns across all slots.</p>
        </div>
        <div className="inline-flex rounded-md border border-border bg-surface p-0.5 text-xs">
          {ranges.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`rounded-[6px] px-3 py-1.5 transition-colors ${range === r ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {r === "7d" ? "Last 7 days" : r === "30d" ? "Last 30 days" : "Custom"}
            </button>
          ))}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Avg compliance", value: "87%", delta: "+4.2", positive: true },
          { label: "Doses dispensed", value: "126", delta: "+12", positive: true },
          { label: "Missed doses", value: "9", delta: "-3", positive: true },
          { label: "Refills needed", value: "1", delta: "Slot 2", positive: false },
        ].map((k) => (
          <div key={k.label} className="panel p-4">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-2xl font-semibold text-mono">{k.value}</span>
              <span className={`text-[11px] text-mono ${k.positive ? "text-success" : "text-warning"}`}>{k.delta}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="panel p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold">Compliance trend</h3>
              <p className="text-[11px] text-muted-foreground">Daily adherence rate</p>
            </div>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={complianceTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.78 0.13 185)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.78 0.13 185)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="oklch(0.28 0.012 260)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="compliance" stroke="oklch(0.78 0.13 185)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4">
          <h3 className="text-sm font-semibold">Missed doses</h3>
          <p className="text-[11px] text-muted-foreground">Trend over time</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={complianceTrend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.28 0.012 260)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} tickFormatter={(d) => d.slice(8)} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="missed" fill="oklch(0.66 0.20 25)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4 lg:col-span-2">
          <h3 className="text-sm font-semibold">Stock level history</h3>
          <p className="text-[11px] text-muted-foreground">Inventory depletion per slot</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={stockHistory} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.28 0.012 260)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} tickFormatter={(d) => d.slice(5)} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="slot1" stroke="oklch(0.78 0.13 185)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="slot2" stroke="oklch(0.82 0.15 80)" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="slot3" stroke="oklch(0.70 0.13 270)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel p-4">
          <h3 className="text-sm font-semibold">Per-slot dispensing</h3>
          <p className="text-[11px] text-muted-foreground">Doses dispensed this week</p>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={perSlotHistory} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid stroke="oklch(0.28 0.012 260)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <YAxis tick={{ fill: "oklch(0.68 0.02 255)", fontSize: 11 }} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="slot1" stackId="a" fill="oklch(0.78 0.13 185)" />
                <Bar dataKey="slot2" stackId="a" fill="oklch(0.82 0.15 80)" />
                <Bar dataKey="slot3" stackId="a" fill="oklch(0.70 0.13 270)" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
