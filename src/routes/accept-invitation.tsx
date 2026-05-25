import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { db, ref, onValue, update, set, get, auth } from "../firebase";
import { onAuthStateChanged, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/accept-invitation")({
  head: () => ({ meta: [{ title: "Accept Invitation — MediStock" }] }),
  component: AcceptInvitationPage,
});

function AcceptInvitationPage() {
  const [status, setStatus] = useState<"loading" | "error" | "ok" | "needs-login">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Missing token in URL.");
      return;
    }

    // Find invitation with matching token
    const invRef = ref(db, "invitations");
    const unsub = onValue(invRef, async (snap) => {
      const raw = snap.val() || {};
      const entries = Object.entries(raw).map(([k, v]) => ({ key: k, ...(v as any) }));
      const match = entries.find((e: any) => e.token === token);
      if (!match) {
        setStatus("error");
        setMessage("Invitation not found or invalid.");
        return;
      }

      const now = Date.now();
      if (match.expires_at && Number(match.expires_at) < now) {
        setStatus("error");
        setMessage("Invitation has expired.");
        return;
      }

      // Use Firebase Auth
      const current = auth.currentUser;
      if (!current) {
        setStatus("needs-login");
        setMessage("Please sign in or create an account to accept this invitation.");
        return;
      }

      try {
        // Stop listening to avoid duplicate runs
        unsub();
        await acceptForUid(current.uid, match);
      } catch (err: any) {
        setStatus("error");
        setMessage(`Failed to accept invitation: ${err?.message ?? String(err)}`);
      }
    });

    return () => unsub();
  }, []);

  async function acceptForUid(uid: string, match: any) {
    try {
      const cgRef = ref(db, `caregivers/${uid}`);
      const cgSnap = await get(cgRef);
      const existing = cgSnap.exists() ? (cgSnap.val() as any) : {};
      const existingIds: string[] = Array.isArray(existing.patient_ids) ? existing.patient_ids : Array.isArray(existing.patientIds) ? existing.patientIds : [];
      const merged = Array.from(new Set([...existingIds, match.patient_id]));

      await update(cgRef, {
        email: existing.email || match.email || "",
        patient_ids: merged,
        invited_by: existing.invited_by || match.patient_id,
        invited_at: Date.now(),
      });

      // Update invitation status
      await update(ref(db, `invitations/${match.key}`), { status: "accepted", accepted_at: Date.now() });

      setStatus("ok");
      setMessage(`You are now monitoring ${match.patient_name || "the patient"}.`);
      toast.success("Invitation accepted");
    } catch (err: any) {
      setStatus("error");
      setMessage(`Failed to accept invitation: ${err?.message ?? String(err)}`);
      throw err;
    }
  }

  return (
    <div className="max-w-xl mx-auto py-12">
      <div className="panel p-6 text-center">
        {status === "loading" && <div>Validating invitation…</div>}
        {status === "error" && <div className="text-destructive">{message}</div>}
        {status === "needs-login" && (
          <div>
            <p className="mb-4">{message}</p>
            <div className="flex items-center justify-center gap-3">
              <a href={`/login?next=${encodeURIComponent(location.href)}`} className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign in / Sign up</a>
              <button
                onClick={async () => {
                  try {
                    const provider = new GoogleAuthProvider();
                    await signInWithPopup(auth, provider);
                    // After successful sign in, re-run accept flow by reloading
                    location.reload();
                  } catch (err: any) {
                    toast.error(`Sign-in failed: ${err?.message ?? String(err)}`);
                  }
                }}
                className="rounded-md border border-border px-4 py-2 text-sm font-semibold"
              >
                Sign in with Google
              </button>
            </div>
          </div>
        )}
        {status === "ok" && (
          <div>
            <h3 className="text-lg font-semibold">Accepted</h3>
            <p className="mt-2">{message}</p>
            <a href="/" className="mt-4 inline-block rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Go to dashboard</a>
          </div>
        )}
      </div>
    </div>
  );
}
