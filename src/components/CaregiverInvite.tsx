import { useEffect, useState } from "react";
import { db, ref, push, set, onValue, update } from "../firebase";
import { sendInvitationEmail } from "../lib/emailjs";
import { toast } from "sonner";

function getPatientIdFallback() {
  // Try common locations for patient id: localStorage, env
  if (typeof window !== "undefined") {
    const fromLs = window.localStorage.getItem("patient_id") || window.localStorage.getItem("uid");
    if (fromLs) return fromLs;
  }
  if (import.meta.env.VITE_PATIENT_ID) return import.meta.env.VITE_PATIENT_ID;
  return null;
}

export default function CaregiverInvite({ patientId, patientName }: { patientId?: string; patientName?: string }) {
  const resolvedPatientId = patientId ?? getPatientIdFallback();
  const resolvedPatientName = patientName ?? "";

  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [invitations, setInvitations] = useState<Array<any>>([]);
  const [caregivers, setCaregivers] = useState<Array<any>>([]);

  useEffect(() => {
    if (!resolvedPatientId) return;
    const invRef = ref(db, "invitations");
    const unsubInv = onValue(invRef, (snap) => {
      const raw = snap.val() || {};
      const list: any[] = Object.entries(raw)
        .map(([key, v]) => ({ key, ...(v as any) }))
        .filter((it) => it.patient_id === resolvedPatientId);
      setInvitations(list.sort((a, b) => (a.created_at > b.created_at ? -1 : 1)));
    });

    const cgRef = ref(db, "caregivers");
    const unsubCg = onValue(cgRef, (snap) => {
      const raw = snap.val() || {};
      const list = Object.entries(raw)
        .map(([key, v]) => ({ uid: key, ...(v as any) }))
        .filter((c) => Array.isArray(c.patient_ids) ? c.patient_ids.includes(resolvedPatientId) : (c.patient_ids && c.patient_ids[resolvedPatientId]));
      setCaregivers(list);
    });

    return () => {
      unsubInv();
      unsubCg();
    };
  }, [resolvedPatientId]);

  const validateEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

  const handleSend = async () => {
    if (!resolvedPatientId) {
      toast.error("Missing patient id. Set localStorage.patient_id or pass as prop.");
      return;
    }
    if (!validateEmail(email)) {
      toast.error("Please enter a valid email");
      return;
    }

    setSending(true);
    try {
      const token = crypto?.randomUUID ? crypto.randomUUID() : `tk_${Date.now().toString(36)}`;
      const now = Date.now();
      const expires = now + 7 * 24 * 60 * 60 * 1000; // 7 days

      const invitationsRef = ref(db, `invitations`);
      const newRef = push(invitationsRef);
      const payload = {
        email: email.toLowerCase(),
        patient_id: resolvedPatientId,
        patient_name: resolvedPatientName || "",
        token,
        status: "pending",
        created_at: now,
        expires_at: expires,
      };
      await set(newRef, payload);

      // Send email via EmailJS
      const inviteLink = `${location.origin}/accept-invitation?token=${encodeURIComponent(token)}`;
      const expiryDate = new Date(expires).toISOString().slice(0, 10);
      try {
        await sendInvitationEmail({ toEmail: email, patientName: resolvedPatientName || "", inviteLink, expiryDate });
        toast.success("Invitation sent");
      } catch (err: any) {
        toast.error(`Saved invitation but email failed: ${err?.message ?? String(err)}`);
      }

      setEmail("");
    } catch (err: any) {
      toast.error(`Failed to create invitation: ${err?.message ?? String(err)}`);
    } finally {
      setSending(false);
    }
  };

  const cancelInvitation = async (key: string) => {
    try {
      await update(ref(db, `invitations/${key}`), { status: "expired" });
      toast.success("Invitation cancelled");
    } catch (err: any) {
      toast.error(`Failed to cancel: ${err?.message ?? String(err)}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="text-sm font-semibold">Invite Caregiver</h3>
        <p className="mt-1 text-xs text-muted-foreground">Send a time-limited invitation to a caregiver via email.</p>

        <div className="mt-3 flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="caregiver@example.com"
            className="w-full rounded-md border border-input bg-input/40 px-3 py-2 text-sm outline-none"
          />
          <button onClick={handleSend} disabled={sending} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            {sending ? "Sending…" : "Send Invitation"}
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <h4 className="text-xs font-semibold">Pending invitations</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {invitations.length === 0 && <li className="text-muted-foreground">No pending invitations</li>}
            {invitations.map((inv) => (
              <li key={inv.key} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{inv.email}</div>
                  <div className="text-xs text-muted-foreground">Expires: {new Date(inv.expires_at).toLocaleDateString()}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => (navigator.clipboard?.writeText(`${location.origin}/accept-invitation?token=${inv.token}`))} className="text-xs text-muted-foreground hover:underline">Copy Link</button>
                  <button onClick={() => cancelInvitation(inv.key)} className="text-xs text-destructive">Cancel</button>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="panel p-4">
          <h4 className="text-xs font-semibold">Accepted caregivers</h4>
          <ul className="mt-3 space-y-2 text-sm">
            {caregivers.length === 0 && <li className="text-muted-foreground">No caregivers yet</li>}
            {caregivers.map((c) => (
              <li key={c.uid} className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{c.email || c.uid}</div>
                  <div className="text-xs text-muted-foreground">Added: {c.invited_at ? new Date(c.invited_at).toLocaleDateString() : "—"}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
