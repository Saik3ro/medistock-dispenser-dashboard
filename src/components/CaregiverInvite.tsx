import { useEffect, useState } from "react";
import { db, ref, push, set, onValue } from "../firebase";
import { sendInvitationEmail } from "../lib/emailjs";
import { toast } from "sonner";

function getPatientIdFallback() {
  if (typeof window !== "undefined") {
    const fromLs = window.localStorage.getItem("patient_id") || window.localStorage.getItem("uid");
    if (fromLs) return fromLs;
  }
  if (import.meta.env.VITE_PATIENT_ID) return import.meta.env.VITE_PATIENT_ID;
  return null;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function normalizeName(value: string) {
  return value
    .replace(/[^a-zA-Z\s]/g, "")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export default function CaregiverInvite({ patientId, patientName }: { patientId?: string; patientName?: string }) {
  const resolvedPatientId = patientId ?? getPatientIdFallback();
  const resolvedPatientName = patientName ?? "";

  const [familyName, setFamilyName] = useState("");
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [members, setMembers] = useState<Array<any>>([]);

  useEffect(() => {
    if (!resolvedPatientId) return;

    const caregiversRef = ref(db, "caregivers");
    const unsubscribe = onValue(caregiversRef, (snapshot) => {
      const raw = snapshot.val() || {};
      const list = Object.entries(raw)
        .map(([key, value]) => ({ uid: key, ...(value as any) }))
        .filter((entry) => (
          Array.isArray(entry.patient_ids)
            ? entry.patient_ids.includes(resolvedPatientId)
            : entry.patient_ids && entry.patient_ids[resolvedPatientId]
        ))
        .sort((a, b) => Number(b.invited_at || 0) - Number(a.invited_at || 0));
      setMembers(list);
    });

    return () => {
      unsubscribe();
    };
  }, [resolvedPatientId]);

  const handleSend = async () => {
    const normalizedFamilyName = normalizeName(familyName);

    if (!resolvedPatientId) {
      toast.error("Missing patient id. Set localStorage.patient_id or pass as prop.");
      return;
    }
    if (!normalizedFamilyName) {
      toast.error("Family member name is required.");
      return;
    }
    if (!isValidEmail(email)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setSending(true);
    try {
      const token = crypto?.randomUUID ? crypto.randomUUID() : `tk_${Date.now().toString(36)}`;
      const now = Date.now();
      const expires = now + 7 * 24 * 60 * 60 * 1000;

      const invitationsRef = ref(db, "invitations");
      const newRef = push(invitationsRef);
      await set(newRef, {
        email: email.toLowerCase(),
        patient_id: resolvedPatientId,
        patient_name: resolvedPatientName,
        family_name: normalizedFamilyName,
        role: "family_member",
        notification_access: true,
        status: "pending",
        token,
        created_at: now,
        expires_at: expires,
      });

      const inviteLink = `${location.origin}/accept-invitation?token=${encodeURIComponent(token)}`;
      const expiryDate = new Date(expires).toISOString().slice(0, 10);
      try {
        await sendInvitationEmail({
          toEmail: email,
          patientName: resolvedPatientName || normalizedFamilyName,
          inviteLink,
          expiryDate,
        });
        toast.success("Family member invitation sent.");
      } catch (error: any) {
        toast.error(`Invitation saved but email failed: ${error?.message ?? String(error)}`);
      }

      setFamilyName("");
      setEmail("");
    } catch (error: any) {
      toast.error(`Failed to create invitation: ${error?.message ?? String(error)}`);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="panel p-4">
        <h3 className="text-sm font-semibold">Invite Family Member</h3>
        <p className="mt-1 text-xs text-muted-foreground">Add a family member who can receive the same alerts and notifications as the caregiver.</p>

        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input
            value={familyName}
            onChange={(event) => setFamilyName(normalizeName(event.target.value).slice(0, 40))}
            className="w-full rounded-md border border-input bg-input/40 px-3 py-2 text-sm outline-none"
            aria-label="Family Member Name"
          />
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="w-full rounded-md border border-input bg-input/40 px-3 py-2 text-sm outline-none"
            aria-label="Family Member Email"
          />
          <button onClick={handleSend} disabled={sending} className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
            {sending ? "Sending..." : "Send Invitation"}
          </button>
        </div>
      </div>

      <div className="panel p-4">
        <h4 className="text-xs font-semibold">Recent Family Members Added</h4>
        <ul className="mt-3 space-y-2 text-sm">
          {members.length === 0 ? <li className="text-muted-foreground">No family members added yet.</li> : null}
          {members.slice(0, 8).map((member) => (
            <li key={member.uid} className="flex items-center justify-between">
              <div>
                <div className="font-medium">{member.displayName || member.family_name || member.email || member.uid}</div>
                <div className="text-xs text-muted-foreground">{member.email || "No Email Available"}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {member.invited_at ? new Date(member.invited_at).toLocaleDateString() : "Added Recently"}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
