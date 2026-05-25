import { useEffect } from "react";
import { setupMissedMedicationMonitoring, cleanupAllMonitors } from "@/lib/medication-monitor";
import type { ScheduledDispense } from "@/types";

/**
 * Hook to monitor for missed medications and send caregiver notifications
 * Automatically sends email notifications after 30 seconds if medicine isn't taken
 *
 * @param patientId - The patient ID to monitor
 * @param enabled - Whether to enable monitoring (default: true)
 * @param onMissedMedicationDetected - Optional callback when a missed medication is detected
 *
 * @example
 * ```tsx
 * const { isMonitoring } = useMissedMedicationMonitoring(patientId);
 * ```
 */
export function useMissedMedicationMonitoring(
  patientId: string | null,
  enabled: boolean = true,
  onMissedMedicationDetected?: (dispense: ScheduledDispense) => void
) {
  useEffect(() => {
    if (!enabled || !patientId) {
      return;
    }

    console.log("Starting missed medication monitoring for patient:", patientId);

    const unsubscribe = setupMissedMedicationMonitoring(
      patientId,
      onMissedMedicationDetected
    );

    return () => {
      console.log("Cleaning up missed medication monitoring");
      unsubscribe();
      cleanupAllMonitors();
    };
  }, [patientId, enabled, onMissedMedicationDetected]);

  return {
    isMonitoring: enabled && !!patientId,
  };
}
