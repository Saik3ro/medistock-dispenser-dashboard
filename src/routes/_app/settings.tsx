import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { device } from "@/lib/mock-data";
import { ShieldAlert, Mail, X } from "lucide-react";
import { toast } from "sonner";
import CaregiverInvite from "@/components/CaregiverInvite";

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

function Field({ label, children, hint, error }: { label: string; children: React.ReactNode; hint?: string; error?: string | null }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1 text-[11px] text-destructive animate-fade-in">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>
      ) : null}
    </label>
  );
}

function SettingsPage() {
  // Patient Profile States
  const [patientName, setPatientName] = useState("Harold Pierce");
  const [patientNameError, setPatientNameError] = useState<string | null>(null);

  const [age, setAge] = useState<string>("72");
  const [ageError, setAgeError] = useState<string | null>(null);

  const [caregiverName, setCaregiverName] = useState("Eleanor Morrison");
  const [caregiverNameError, setCaregiverNameError] = useState<string | null>(null);

  const [contactEmail, setContactEmail] = useState("eleanor@example.com");
  const [contactEmailError, setContactEmailError] = useState<string | null>(null);

  // Other Settings States
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [pushAlerts, setPushAlerts] = useState(false);
  const [emails, setEmails] = useState<string[]>(["eleanor@example.com", "dr.morrison@clinic.org"]);
  const [newEmail, setNewEmail] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);

  const inputCls = (hasError: boolean) =>
    `w-full rounded-md border bg-input/40 px-3 py-2 text-sm outline-none transition-all duration-200 ${
      hasError
        ? "border-destructive text-destructive focus:border-destructive focus:ring-1 focus:ring-destructive"
        : "border-input focus:border-primary text-foreground focus:ring-1 focus:ring-primary/20"
    }`;

  // Capitalize first letter of each word dynamically
  const capitalizeWords = (str: string) => {
    return str
      .split(" ")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const handlePatientNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Check if the user tried to enter numbers or special characters
    const hasInvalid = /[^a-zA-Z\s]/.test(val);
    if (hasInvalid) {
      setPatientNameError("Name must contain letters only.");
    } else {
      setPatientNameError(null);
    }
    
    // Realtime filtering: keep letters and spaces only
    val = val.replace(/[^a-zA-Z\s]/g, "");
    
    // Max length to prevent UI overflow
    if (val.length <= 40) {
      setPatientName(val);
    }
  };

  const handleCaregiverNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    const hasInvalid = /[^a-zA-Z\s]/.test(val);
    if (hasInvalid) {
      setCaregiverNameError("Name must contain letters only.");
    } else {
      setCaregiverNameError(null);
    }
    
    val = val.replace(/[^a-zA-Z\s]/g, "");
    
    // Capitalize words dynamically while typing
    const capitalized = capitalizeWords(val);
    
    if (capitalized.length <= 40) {
      setCaregiverName(capitalized);
    }
  };

  const handleAgeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Disable non-numeric characters (e, +, -, symbols, etc.)
    const allowedKeys = ["Backspace", "Delete", "Tab", "Escape", "Enter", "ArrowLeft", "ArrowRight"];
    if (allowedKeys.includes(e.key)) {
      return;
    }
    if (!/^\d$/.test(e.key)) {
      e.preventDefault();
    }
  };

  const handleAgeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let val = e.target.value;
    
    // Strip non-digits
    val = val.replace(/\D/g, "");
    
    if (val === "") {
      setAge("");
      setAgeError("Age is required.");
      return;
    }
    
    const parsedAge = parseInt(val, 10);
    
    // Prevent entering a value greater than 130
    if (parsedAge > 130) {
      setAgeError("Age cannot exceed 130.");
      return;
    }
    
    if (parsedAge < 0) {
      setAgeError("Age must be at least 0.");
      return;
    }
    
    setAgeError(null);
    setAge(val);
  };

  const handleContactEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setContactEmail(val);
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (val && !emailRegex.test(val)) {
      setContactEmailError("Please enter a valid email address.");
    } else {
      setContactEmailError(null);
    }
  };

  const handleSaveProfile = () => {
    if (!patientName.trim()) {
      setPatientNameError("Patient name is required.");
      return;
    }
    if (!caregiverName.trim()) {
      setCaregiverNameError("Caregiver name is required.");
      return;
    }
    if (!age) {
      setAgeError("Age is required.");
      return;
    }
    if (!contactEmail.trim()) {
      setContactEmailError("Contact email is required.");
      return;
    }

    if (patientNameError || caregiverNameError || ageError || contactEmailError) {
      toast.error("Please fix the validation errors before saving.");
      return;
    }

    toast.success("Patient profile saved successfully!");
  };

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
              <Field label="Patient name" error={patientNameError}>
                <input
                  type="text"
                  value={patientName}
                  onChange={handlePatientNameChange}
                  className={inputCls(!!patientNameError)}
                  placeholder="e.g. Harold Pierce"
                />
              </Field>
              <Field label="Age" error={ageError}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={age}
                  onKeyDown={handleAgeKeyDown}
                  onChange={handleAgeChange}
                  className={inputCls(!!ageError)}
                  placeholder="e.g. 72"
                />
              </Field>
              <Field label="Caregiver name" error={caregiverNameError}>
                <input
                  type="text"
                  value={caregiverName}
                  onChange={handleCaregiverNameChange}
                  className={inputCls(!!caregiverNameError)}
                  placeholder="e.g. Eleanor Morrison"
                />
              </Field>
              <Field label="Contact email" error={contactEmailError}>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={handleContactEmailChange}
                  className={inputCls(!!contactEmailError)}
                  placeholder="e.g. eleanor@example.com"
                />
              </Field>
            </div>
            
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!!patientNameError || !!caregiverNameError || !!ageError || !!contactEmailError}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save profile
              </button>
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
              <CaregiverInvite patientName={patientName} />
            </div>
          </section>

          {/* Thresholds */}
          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Thresholds</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Low stock threshold" hint="Triggers a Low Stock alert at or below this number">
                <input type="number" min={1} defaultValue={3} className={inputCls(false)} />
              </Field>
              <Field label="Missed dose window (min)" hint="Time before escalation to caregiver">
                <input type="number" min={5} defaultValue={30} className={inputCls(false)} />
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
              <div className="flex justify-between"><dt className="text-muted-foreground">Firebase</dt><dd className="text-success font-medium">Connected</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Firmware</dt><dd className="text-mono">v1.4.2</dd></div>
            </dl>
          </section>

          <section className="panel border-destructive/30 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <ShieldAlert className="h-4 w-4 animate-pulse" /> Danger zone
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Reset clears schedules, alerts, and history from the device.</p>
            <button
              onClick={() => setConfirmReset(true)}
              className="mt-3 w-full rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 transition-all"
            >
              Reset device data
            </button>
          </section>
        </aside>
      </div>

      {confirmReset && (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-md border border-border bg-popover p-5 shadow-xl animate-scale-in">
            <h3 className="text-sm font-semibold">Confirm device reset</h3>
            <p className="mt-1 text-xs text-muted-foreground">This will erase all schedules, alerts, and dispensing history from MediStock-A1. This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmReset(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors">Cancel</button>
              <button onClick={() => setConfirmReset(false)} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 transition-opacity">Reset device</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
