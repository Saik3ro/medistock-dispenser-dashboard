import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { device } from "@/lib/mock-data";
import { ShieldAlert, Mail, X } from "lucide-react";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — MediStock" },
      { name: "description", content: "Configure patient profile, notifications, device, and thresholds." },
    ],
  }),
  component: SettingsPage,
});

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between rounded-md border border-border px-3 py-2.5 text-left text-sm hover:bg-surface-2"
    >
      <span>{label}</span>
      <span className={`relative h-5 w-9 rounded-full transition-colors ${checked ? "bg-primary" : "bg-muted"}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition-all ${checked ? "left-[18px]" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </label>
  );
}

function SettingsPage() {
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(false);
  const [emails, setEmails] = useState<string[]>(["eleanor@example.com", "dr.morrison@clinic.org"]);
  const [newEmail, setNewEmail] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const inputCls = "w-full rounded-md border border-input bg-input/40 px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Patient, device, and notification preferences.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Patient profile */}
          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Patient profile</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Patient name"><input className={inputCls} defaultValue="Harold Pierce" /></Field>
              <Field label="Age"><input type="number" className={inputCls} defaultValue={72} /></Field>
              <Field label="Caregiver name"><input className={inputCls} defaultValue="Eleanor Morrison" /></Field>
              <Field label="Contact email"><input type="email" className={inputCls} defaultValue="eleanor@example.com" /></Field>
            </div>
          </section>

          {/* Notifications */}
          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Notification preferences</h2>
            <div className="mt-4 space-y-2">
              <Toggle checked={emailAlerts} onChange={setEmailAlerts} label="Email alerts" />
              <Toggle checked={pushAlerts} onChange={setPushAlerts} label="Push notifications" />
            </div>
            <div className="mt-5">
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Registered caregiver emails</div>
              <ul className="mt-2 space-y-1.5">
                {emails.map((e) => (
                  <li key={e} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                    <span className="flex items-center gap-2"><Mail className="h-3.5 w-3.5 text-muted-foreground" />{e}</span>
                    <button onClick={() => setEmails(emails.filter((x) => x !== e))} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="caregiver@example.com" className={inputCls} />
                <button
                  onClick={() => { if (newEmail) { setEmails([...emails, newEmail]); setNewEmail(""); } }}
                  className="shrink-0 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
                >
                  Add
                </button>
              </div>
            </div>
          </section>

          {/* Thresholds */}
          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Thresholds</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Low stock threshold" hint="Triggers a Low Stock alert at or below this number">
                <input type="number" min={1} defaultValue={3} className={inputCls} />
              </Field>
              <Field label="Missed dose window (min)" hint="Time before escalation to caregiver">
                <input type="number" min={5} defaultValue={30} className={inputCls} />
              </Field>
            </div>
          </section>
        </div>

        {/* Right column */}
        <aside className="space-y-4">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Device</h2>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex justify-between"><dt className="text-muted-foreground">Device name</dt><dd className="text-mono">{device.name}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Wi-Fi SSID</dt><dd className="text-mono">{device.ssid}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Firebase</dt><dd className="text-success">Connected</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Firmware</dt><dd className="text-mono">v1.4.2</dd></div>
            </dl>
          </section>

          <section className="panel border-destructive/30 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <ShieldAlert className="h-4 w-4" /> Danger zone
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Reset clears schedules, alerts, and history from the device.</p>
            <button
              onClick={() => setConfirmReset(true)}
              className="mt-3 w-full rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20"
            >
              Reset device data
            </button>
          </section>
        </aside>
      </div>

      {confirmReset && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm rounded-md border border-border bg-popover p-5 shadow-xl">
            <h3 className="text-sm font-semibold">Confirm device reset</h3>
            <p className="mt-1 text-xs text-muted-foreground">This will erase all schedules, alerts, and dispensing history from MediStock-A1. This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmReset(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2">Cancel</button>
              <button onClick={() => setConfirmReset(false)} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90">Reset device</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
