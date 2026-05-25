import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { db, onValue, ref, set } from "@/firebase";
import CaregiverInvite from "@/components/CaregiverInvite";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings - MediStock" },
      { name: "description", content: "Configure patient, family, notification, and threshold preferences." },
    ],
  }),
  component: SettingsPage,
});

type ProfileSettings = {
  patient_name: string;
  age: string;
  contact_name: string;
  contact_email: string;
};

type NotificationSettings = {
  email_alerts: boolean;
  push_alerts: boolean;
};

type ThresholdSettings = {
  low_stock_threshold: string;
  missed_dose_window_minutes: string;
};

function getPatientIdFallback() {
  if (typeof window !== "undefined") {
    const fromLs = window.localStorage.getItem("patient_id") || window.localStorage.getItem("uid");
    if (fromLs) return fromLs;
  }
  if (import.meta.env.VITE_PATIENT_ID) return import.meta.env.VITE_PATIENT_ID;
  return "default_patient";
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
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

function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string | null;
}) {
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
  const patientId = getPatientIdFallback();
  const [profile, setProfile] = useState<ProfileSettings>({
    patient_name: "",
    age: "",
    contact_name: "",
    contact_email: "",
  });
  const [notifications, setNotifications] = useState<NotificationSettings>({
    email_alerts: true,
    push_alerts: false,
  });
  const [thresholds, setThresholds] = useState<ThresholdSettings>({
    low_stock_threshold: "3",
    missed_dose_window_minutes: "30",
  });
  const [confirmReset, setConfirmReset] = useState(false);
  const [patientNameError, setPatientNameError] = useState<string | null>(null);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [contactNameError, setContactNameError] = useState<string | null>(null);
  const [contactEmailError, setContactEmailError] = useState<string | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    const profileRef = ref(db, `patient_profiles/${patientId}`);
    const notificationsRef = ref(db, `notification_preferences/${patientId}`);
    const thresholdsRef = ref(db, `threshold_settings/${patientId}`);

    const unsubProfile = onValue(profileRef, (snapshot) => {
      if (snapshot.exists()) {
        const value = snapshot.val();
        setProfile({
          patient_name: String(value.patient_name ?? ""),
          age: String(value.age ?? ""),
          contact_name: String(value.contact_name ?? ""),
          contact_email: String(value.contact_email ?? ""),
        });
      }
      setSettingsLoaded(true);
    });

    const unsubNotifications = onValue(notificationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const value = snapshot.val();
        setNotifications({
          email_alerts: Boolean(value.email_alerts),
          push_alerts: Boolean(value.push_alerts),
        });
      }
    });

    const unsubThresholds = onValue(thresholdsRef, (snapshot) => {
      if (snapshot.exists()) {
        const value = snapshot.val();
        setThresholds({
          low_stock_threshold: String(value.low_stock_threshold ?? "3"),
          missed_dose_window_minutes: String(value.missed_dose_window_minutes ?? "30"),
        });
      }
    });

    return () => {
      unsubProfile();
      unsubNotifications();
      unsubThresholds();
    };
  }, [patientId]);

  const inputCls = (hasError: boolean) =>
    `w-full rounded-md border bg-input/40 px-3 py-2 text-sm outline-none transition-all duration-200 ${
      hasError
        ? "border-destructive text-destructive focus:border-destructive focus:ring-1 focus:ring-destructive"
        : "border-input focus:border-primary text-foreground focus:ring-1 focus:ring-primary/20"
    }`;

  const normalizeName = (value: string) =>
    value
      .replace(/[^a-zA-Z\s]/g, "")
      .replace(/\s{2,}/g, " ")
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

  const handlePatientNameChange = (value: string) => {
    const normalized = normalizeName(value).slice(0, 40);
    setProfile((prev) => ({ ...prev, patient_name: normalized }));
    setPatientNameError(normalized ? null : "Patient name is required.");
  };

  const handleContactNameChange = (value: string) => {
    const normalized = normalizeName(value).slice(0, 40);
    setProfile((prev) => ({ ...prev, contact_name: normalized }));
    setContactNameError(normalized ? null : "Contact name is required.");
  };

  const handleAgeChange = (value: string) => {
    const normalized = value.replace(/\D/g, "");
    if (!normalized) {
      setProfile((prev) => ({ ...prev, age: "" }));
      setAgeError("Age is required.");
      return;
    }
    const numericAge = Number(normalized);
    if (numericAge > 130) {
      setAgeError("Age cannot exceed 130.");
      return;
    }
    setProfile((prev) => ({ ...prev, age: normalized }));
    setAgeError(null);
  };

  const handleContactEmailChange = (value: string) => {
    const normalized = value.replace(/\s/g, "");
    setProfile((prev) => ({ ...prev, contact_email: normalized }));
    const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized);
    setContactEmailError(normalized && !isValid ? "Please enter a valid email address." : null);
  };

  const handleSaveProfile = async () => {
    if (!profile.patient_name.trim()) {
      setPatientNameError("Patient name is required.");
      return;
    }
    if (!profile.contact_name.trim()) {
      setContactNameError("Contact name is required.");
      return;
    }
    if (!profile.age.trim()) {
      setAgeError("Age is required.");
      return;
    }
    if (!profile.contact_email.trim()) {
      setContactEmailError("Contact email is required.");
      return;
    }
    if (patientNameError || contactNameError || ageError || contactEmailError) {
      toast.error("Please fix the validation errors before saving.");
      return;
    }

    await set(ref(db, `patient_profiles/${patientId}`), profile);
    toast.success("Patient profile saved successfully.");
  };

  const handleSaveNotifications = async () => {
    await set(ref(db, `notification_preferences/${patientId}`), notifications);
    toast.success("Notification preferences saved successfully.");
  };

  const handleSaveThresholds = async () => {
    await set(ref(db, `threshold_settings/${patientId}`), thresholds);
    toast.success("Threshold settings saved successfully.");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-1 text-sm text-muted-foreground">Patient, family, notification, and threshold preferences.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Patient Profile</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Patient Name" error={patientNameError}>
                <input
                  type="text"
                  value={profile.patient_name}
                  onChange={(event) => handlePatientNameChange(event.target.value)}
                  className={inputCls(!!patientNameError)}
                />
              </Field>
              <Field label="Age" error={ageError}>
                <input
                  type="text"
                  inputMode="numeric"
                  value={profile.age}
                  onChange={(event) => handleAgeChange(event.target.value)}
                  className={inputCls(!!ageError)}
                />
              </Field>
              <Field label="Primary Contact Name" error={contactNameError}>
                <input
                  type="text"
                  value={profile.contact_name}
                  onChange={(event) => handleContactNameChange(event.target.value)}
                  className={inputCls(!!contactNameError)}
                />
              </Field>
              <Field label="Contact Email" error={contactEmailError}>
                <input
                  type="text"
                  inputMode="email"
                  value={profile.contact_email}
                  onChange={(event) => handleContactEmailChange(event.target.value)}
                  className={inputCls(!!contactEmailError)}
                />
              </Field>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={!settingsLoaded}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Profile
              </button>
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Notification Preferences</h2>
            <div className="mt-4 space-y-2">
              <Toggle checked={notifications.email_alerts} onChange={(value) => setNotifications((prev) => ({ ...prev, email_alerts: value }))} label="Email Alerts" />
              <Toggle checked={notifications.push_alerts} onChange={(value) => setNotifications((prev) => ({ ...prev, push_alerts: value }))} label="Push Notifications" />
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSaveNotifications}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:opacity-90"
              >
                Save Notification Preferences
              </button>
            </div>
            <div className="mt-5">
              <CaregiverInvite patientId={patientId} patientName={profile.patient_name} />
            </div>
          </section>

          <section className="panel p-5">
            <h2 className="text-sm font-semibold">Thresholds</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Low Stock Threshold" hint="Triggers a Low Stock alert at or below this number.">
                <input
                  type="number"
                  min={1}
                  value={thresholds.low_stock_threshold}
                  onChange={(event) => setThresholds((prev) => ({ ...prev, low_stock_threshold: event.target.value }))}
                  className={inputCls(false)}
                />
              </Field>
              <Field label="Missed Dose Window (Min)" hint="Time before escalation to a family member.">
                <input
                  type="number"
                  min={5}
                  value={thresholds.missed_dose_window_minutes}
                  onChange={(event) => setThresholds((prev) => ({ ...prev, missed_dose_window_minutes: event.target.value }))}
                  className={inputCls(false)}
                />
              </Field>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSaveThresholds}
                className="rounded-md bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition-all duration-200 hover:opacity-90"
              >
                Save Thresholds
              </button>
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="panel border-destructive/30 p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
              <ShieldAlert className="h-4 w-4 animate-pulse" /> Danger Zone
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Reset clears schedules, alerts, and dispensing history from the device.</p>
            <button
              onClick={() => setConfirmReset(true)}
              className="mt-3 w-full rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/20 transition-all"
            >
              Reset Device Data
            </button>
          </section>
        </aside>
      </div>

      {confirmReset ? (
        <div className="fixed inset-0 z-40 grid place-items-center bg-background/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-md border border-border bg-popover p-5 shadow-xl animate-scale-in">
            <h3 className="text-sm font-semibold">Confirm Device Reset</h3>
            <p className="mt-1 text-xs text-muted-foreground">This will erase all schedules, alerts, and dispensing history from MediStock. This cannot be undone.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setConfirmReset(false)} className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-2 transition-colors">Cancel</button>
              <button onClick={() => setConfirmReset(false)} className="rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-destructive-foreground hover:opacity-90 transition-opacity">Reset Device</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
