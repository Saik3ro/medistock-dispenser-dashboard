export async function sendInvitationEmail({
  toEmail,
  patientName,
  inviteLink,
  expiryDate,
}: {
  toEmail: string;
  patientName: string;
  inviteLink: string;
  expiryDate: string;
}) {
  const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
  const USER_ID = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!SERVICE_ID || !TEMPLATE_ID || !USER_ID) {
    throw new Error("Missing EmailJS environment variables. Set VITE_EMAILJS_* in .env");
  }

  const body = {
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID,
    user_id: USER_ID,
    template_params: {
      to_email: toEmail,
      patient_name: patientName,
      invite_link: inviteLink,
      expiry_date: expiryDate,
    },
  };

  const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EmailJS send failed: ${res.status} ${text}`);
  }

  return true;
}

export async function sendMissedMedicationEmail({
  toEmail,
  caregiverName,
  patientName,
  medicationName,
  dosage,
  scheduledTime,
}: {
  toEmail: string;
  caregiverName: string;
  patientName: string;
  medicationName: string;
  dosage: string;
  scheduledTime: string;
}) {
  const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
  const TEMPLATE_ID_MISSED = import.meta.env.VITE_EMAILJS_MISSED_MEDICATION_TEMPLATE_ID;
  const USER_ID = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;

  if (!SERVICE_ID || !TEMPLATE_ID_MISSED || !USER_ID) {
    console.warn("Missing EmailJS environment variables for missed medication notifications");
    return false;
  }

  const body = {
    service_id: SERVICE_ID,
    template_id: TEMPLATE_ID_MISSED,
    user_id: USER_ID,
    template_params: {
      to_email: toEmail,
      caregiver_name: caregiverName,
      patient_name: patientName,
      medication_name: medicationName,
      dosage: dosage,
      scheduled_time: scheduledTime,
      current_time: new Date().toLocaleTimeString(),
    },
  };

  try {
    const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`EmailJS missed medication notification failed: ${res.status} ${text}`);
      return false;
    }

    return true;
  } catch (error) {
    console.error("Failed to send missed medication email:", error);
    return false;
  }
}
