import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { slots as initialSlots, refillHistory } from "@/lib/mock-data";
import { StockBar } from "@/components/medi/StockBar";
import { Plus, PackagePlus, Clock } from "lucide-react";

export const Route = createFileRoute("/_app/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory — MediStock" },
      { name: "description", content: "Track pill stock and refill history per dispenser slot." },
    ],
  }),
  component: InventoryPage,
});

function InventoryPage() {
  const [slots, setSlots] = useState(initialSlots);
  const [refillFor, setRefillFor] = useState<number | null>(null);
  const [amount, setAmount] = useState(30);

  const applyRefill = () => {
    if (refillFor == null) return;
    setSlots((arr) => arr.map((s) =>
      s.id === refillFor
        ? { ...s, stock: Math.min(s.capacity, s.stock + amount), lastRefilled: new Date().toISOString().slice(0, 10), status: "active" }
        : s
    ));
    setRefillFor(null);
    setAmount(30);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="mt-1 text-sm text-muted-foreground">Slot-level stock control and refill history.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {slots.map((s) => (
          <article key={s.id} className="panel p-5">
            <header className="flex items-start justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Slot 0{s.id}</div>
                <input
                  defaultValue={s.medication}
                  className="mt-1 w-full bg-transparent text-base font-medium outline-none focus:border-b focus:border-primary"
                />
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                s.status === "active" ? "bg-success/15 text-success" :
                s.status === "low" ? "bg-warning/15 text-warning" : "bg-destructive/15 text-destructive"
              }`}>{s.status}</span>
            </header>

            <div className="mt-4">
              <StockBar value={s.stock} capacity={s.capacity} />
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-y-1.5 text-xs">
              <dt className="text-muted-foreground">Max capacity</dt>
              <dd className="text-right text-mono">{s.capacity} pills</dd>
              <dt className="text-muted-foreground">Last refilled</dt>
              <dd className="text-right text-mono">{new Date(s.lastRefilled).toLocaleDateString()}</dd>
            </dl>

            <button
              onClick={() => setRefillFor(s.id)}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:opacity-90"
            >
              <PackagePlus className="h-3.5 w-3.5" /> Refill slot
            </button>

            <div className="mt-5 border-t border-border pt-4">
              <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground">Refill history</h4>
              <ul className="mt-2 space-y-1.5">
                {refillHistory[s.id]?.map((r) => (
                  <li key={r.date} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="h-3 w-3" /> {new Date(r.date).toLocaleDateString()}
                    </span>
                    <span className="text-mono">+{r.amount}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
      </div>

      {refillFor != null && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-md border border-border bg-popover p-5 shadow-xl">
            <h3 className="text-sm font-semibold">Refill Slot 0{refillFor}</h3>
            <p className="mt-1 text-xs text-muted-foreground">Enter the number of pills you're adding. Stock will be capped at slot capacity.</p>
            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Pills to add</div>
              <div className="mt-1.5 flex items-center gap-2">
                <button onClick={() => setAmount(Math.max(1, amount - 1))} className="grid h-9 w-9 place-items-center rounded-md border border-border">−</button>
                <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className="w-full rounded-md border border-input bg-input/40 px-3 py-2 text-center text-mono outline-none focus:border-primary" />
                <button onClick={() => setAmount(amount + 1)} className="grid h-9 w-9 place-items-center rounded-md border border-border"><Plus className="h-3.5 w-3.5" /></button>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRefillFor(null)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2">Cancel</button>
              <button onClick={applyRefill} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90">Confirm refill</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
