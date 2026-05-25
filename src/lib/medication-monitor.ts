// ============================================================
// Medication Monitor - Track and notify missed medications
// ============================================================

import { db, ref, get, onValue } from "../firebase";
import { sendMissedMedicationEmail } from "./emailjs";
import type { ScheduledDispense } from "@/types";

interface MissedMedicationNotification {
  dispenseId: string;
  slot: number;
  medicationName: string;
  dosage: string;
  scheduledTime: string;
  scheduledDate: string;
  patientId: string;
  notificationSentAt?: number;
}

// Track active monitors to avoid duplicate notifications
const activeMonitors = new Map<string, NodeJS.Timeout>();
const sentNotifications = new Map<string, number>();

/**
 * Get caregiver information for a specific patient
 */
async function getCaregiverEmails(patientId: string): Promise<Array<{ email: string; name: string }>> {
  try {
    const caregiversRef = ref(db, "caregivers");
    const snapshot = await get(caregiversRef);

    if (!snapshot.exists()) {
      return [];
    }

    const caregivers: Array<{ email: string; name: string }> = [];
    const caregiversData = snapshot.val();

    Object.entries(caregiversData).forEach(([uid, caregiver]: [string, any]) => {
      // Check if caregiver is linked to this patient
      const isLinkedToPatient = Array.isArray(caregiver.patient_ids)
        ? caregiver.patient_ids.includes(patientId)
        : caregiver.patient_ids && caregiver.patient_ids[patientId];

      if (isLinkedToPatient && caregiver.email) {
        caregivers.push({
          email: caregiver.email,
          name: caregiver.name || "Caregiver",
        });
      }
    });

    return caregivers;
  } catch (error) {
    console.error("Failed to fetch caregiver information:", error);
    return [];
  }
}

/**
 * Get patient information
 */
async function getPatientInfo(patientId: string): Promise<{ name: string } | null> {
  try {
    const patientRef = ref(db, `patients/${patientId}`);
    const snapshot = await get(patientRef);

    if (snapshot.exists()) {
      return snapshot.val();
    }

    return null;
  } catch (error) {
    console.error("Failed to fetch patient information:", error);
    return null;
  }
}

/**
 * Check if medication was taken and send notification if missed
 */
async function checkAndNotifyMissedMedication(
  dispense: ScheduledDispense,
  patientId: string
): Promise<boolean> {
  const notificationKey = `${patientId}_${dispense.date}_${dispense.slot}_${dispense.scheduled_time}`;

  // Avoid sending duplicate notifications
  if (sentNotifications.has(notificationKey)) {
    return false;
  }

  try {
    // Check current status of the dispense
    const dispenseRef = ref(db, `dispense_logs/${dispense.id}`);
    const snapshot = await get(dispenseRef);

    if (!snapshot.exists()) {
      console.warn("Dispense record not found:", dispense.id);
      return false;
    }

    const currentDispense = snapshot.val() as ScheduledDispense;

    // If medication was taken or already skipped, don't notify
    if (currentDispense.status !== "pending") {
      return false;
    }

    // Get caregiver and patient info
    const caregivers = await getCaregiverEmails(patientId);
    const patientInfo = await getPatientInfo(patientId);

    if (!caregivers.length) {
      console.warn("No caregivers found for patient:", patientId);
      return false;
    }

    if (!patientInfo) {
      console.warn("Patient information not found:", patientId);
      return false;
    }

    // Send notification emails to all caregivers
    const emailPromises = caregivers.map((caregiver) =>
      sendMissedMedicationEmail({
        toEmail: caregiver.email,
        caregiverName: caregiver.name,
        patientName: patientInfo.name,
        medicationName: dispense.medication_name,
        dosage: dispense.dosage,
        scheduledTime: dispense.scheduled_time,
      })
    );

    await Promise.all(emailPromises);

    // Mark notification as sent
    sentNotifications.set(notificationKey, Date.now());

    // Log the notification event
    console.log(`Missed medication notification sent for ${dispense.medication_name} at ${dispense.scheduled_time}`);

    return true;
  } catch (error) {
    console.error("Error checking and notifying missed medication:", error);
    return false;
  }
}

/**
 * Monitor a scheduled dispense for 30 seconds and notify if not taken
 * @param dispense - The scheduled dispense record
 * @param patientId - The patient ID
 * @param delaySeconds - How long to wait before checking (default: 30)
 */
export function monitorMissedMedication(
  dispense: ScheduledDispense,
  patientId: string,
  delaySeconds: number = 30
): string {
  const monitorId = `${patientId}_${dispense.id}`;

  // Clear any existing monitor for this dispense
  if (activeMonitors.has(monitorId)) {
    clearTimeout(activeMonitors.get(monitorId)!);
  }

  // Set up 30-second delay before checking
  const timeoutId = setTimeout(() => {
    checkAndNotifyMissedMedication(dispense, patientId).catch((error) => {
      console.error("Monitor check failed:", error);
    });

    activeMonitors.delete(monitorId);
  }, delaySeconds * 1000);

  activeMonitors.set(monitorId, timeoutId);

  return monitorId;
}

/**
 * Cancel a monitor before it sends notification
 */
export function cancelMedicationMonitor(monitorId: string): void {
  if (activeMonitors.has(monitorId)) {
    clearTimeout(activeMonitors.get(monitorId)!);
    activeMonitors.delete(monitorId);
  }
}

/**
 * Set up real-time monitoring for all pending dispenses
 * Automatically triggers when medicine hasn't been taken after 30 seconds
 */
export function setupMissedMedicationMonitoring(
  patientId: string,
  onMissedMedicationDetected?: (dispense: ScheduledDispense) => void
): () => void {
  const dispenseLogsRef = ref(db, "dispense_logs");

  const unsubscribe = onValue(dispenseLogsRef, (snapshot) => {
    if (!snapshot.exists()) {
      return;
    }

    const dispensesData = snapshot.val();

    Object.entries(dispensesData).forEach(([dispenseId, dispenseData]: [string, any]) => {
      const dispense = {
        id: dispenseId,
        ...dispenseData,
      } as ScheduledDispense;

      // Only monitor pending dispenses for this patient that are within the monitoring window
      if (dispense.status === "pending") {
        const [year, month, day] = (dispense.date || "").split("-").map(Number);
        const [hours, minutes] = (dispense.scheduled_time || "").split(":").map(Number);

        const scheduledDateTime = new Date(year, month - 1, day, hours, minutes);
        const now = new Date();
        const secondsSinceScheduled = (now.getTime() - scheduledDateTime.getTime()) / 1000;

        // Monitor if scheduled time has passed but within a reasonable window (e.g., within 2 hours)
        if (secondsSinceScheduled >= 0 && secondsSinceScheduled < 7200) {
          // Set a timer to check 30 seconds after the scheduled time
          const delayUntilCheck = Math.max(0, 30 - secondsSinceScheduled);

          if (!activeMonitors.has(`${patientId}_${dispense.id}`)) {
            monitorMissedMedication(dispense, patientId, delayUntilCheck / 1000);

            if (onMissedMedicationDetected) {
              onMissedMedicationDetected(dispense);
            }
          }
        }
      }
    });
  });

  return unsubscribe;
}

/**
 * Clean up all active monitors (call on component unmount)
 */
export function cleanupAllMonitors(): void {
  activeMonitors.forEach((timeoutId) => {
    clearTimeout(timeoutId);
  });
  activeMonitors.clear();
}
