# Missed Medication Notification System

## Overview

This system automatically monitors medication schedules and sends email notifications to caregivers when a patient hasn't taken their medication 30 seconds after the scheduled time.

## Features

- ✅ **30-Second Timer**: Automatically checks after 30 seconds if medicine was taken
- ✅ **Email Notifications**: Sends customizable emails to all assigned caregivers
- ✅ **Real-Time Monitoring**: Continuously monitors pending medications from Firebase
- ✅ **Duplicate Prevention**: Prevents duplicate notifications for the same medication
- ✅ **Patient & Caregiver Linking**: Automatically finds caregivers linked to the patient
- ✅ **Easy Integration**: Simple React hook for quick implementation

## Files Added/Modified

### New Files
1. **`src/lib/medication-monitor.ts`** - Core monitoring logic
2. **`src/hooks/use-missed-medication-monitoring.tsx`** - React hook for easy integration

### Modified Files
1. **`src/lib/emailjs.ts`** - Added `sendMissedMedicationEmail()` function

## Setup

### 1. Configure EmailJS (Required)

Add a new template ID in your EmailJS dashboard for missed medication notifications:

```env
VITE_EMAILJS_SERVICE_ID=your_service_id
VITE_EMAILJS_TEMPLATE_ID=your_template_id
VITE_EMAILJS_MISSED_MEDICATION_TEMPLATE_ID=your_missed_medication_template_id
VITE_EMAILJS_PUBLIC_KEY=your_public_key
```

### 2. EmailJS Template Variables

Create a template in EmailJS with these variables:
- `{{to_email}}` - Caregiver email address
- `{{caregiver_name}}` - Caregiver name
- `{{patient_name}}` - Patient name
- `{{medication_name}}` - Name of the medication
- `{{dosage}}` - Medication dosage
- `{{scheduled_time}}` - Time it was scheduled (e.g., "09:00")
- `{{current_time}}` - Current time when notification sent

**Example Template:**
```
Subject: Medication Reminder - {{patient_name}}

Dear {{caregiver_name}},

{{patient_name}} was scheduled to take {{medication_name}} ({{dosage}}) at {{scheduled_time}}, 
but the medication hasn't been taken yet (checked at {{current_time}}).

Please check on them if needed.

MediStock Dispenser Team
```

## Usage

### Basic Integration (Dashboard)

Add to your dashboard component:

```tsx
import { useMissedMedicationMonitoring } from "@/hooks/use-missed-medication-monitoring";
import { useAuth } from "@/hooks/useAuth"; // or however you get the patient ID

export function DashboardPage() {
  const { user } = useAuth();
  const patientId = user?.uid;

  // Automatically monitors and sends notifications
  useMissedMedicationMonitoring(patientId);

  return (
    // Your dashboard component
  );
}
```

### Advanced Usage with Callback

Monitor and handle missed medications with custom logic:

```tsx
import { useMissedMedicationMonitoring } from "@/hooks/use-missed-medication-monitoring";
import { toast } from "sonner";
import type { ScheduledDispense } from "@/types";

export function SchedulePage() {
  const patientId = "patient_123"; // Get from auth/context

  const handleMissedMedication = (dispense: ScheduledDispense) => {
    // Custom handling when missed medication is detected
    toast.warning(`⚠️ Reminder: ${dispense.medication_name} at ${dispense.scheduled_time}`);
    console.log("Missed medication detected:", dispense);
  };

  useMissedMedicationMonitoring(patientId, true, handleMissedMedication);

  return (
    // Your schedule component
  );
}
```

### Enable/Disable Monitoring

```tsx
const [monitoringEnabled, setMonitoringEnabled] = useState(true);

useMissedMedicationMonitoring(patientId, monitoringEnabled);

// Later disable monitoring
setMonitoringEnabled(false);
```

### Manual Monitoring (Without Hook)

```tsx
import {
  monitorMissedMedication,
  cancelMedicationMonitor,
} from "@/lib/medication-monitor";
import type { ScheduledDispense } from "@/types";

// Start monitoring a specific dispense
const dispense: ScheduledDispense = {
  id: "dispense_001",
  slot: 1,
  medication_name: "Aspirin",
  dosage: "500mg",
  scheduled_time: "09:00",
  date: "2025-05-26",
  status: "pending",
};

const monitorId = monitorMissedMedication(dispense, "patient_123", 30);

// Cancel before notification is sent
cancelMedicationMonitor(monitorId);
```

## How It Works

1. **Monitoring Starts**: When a medication is dispensed or when the page loads, the system tracks it
2. **30-Second Wait**: System waits 30 seconds from the scheduled time
3. **Status Check**: After 30 seconds, it checks if medication status is still "pending"
4. **Notification**: If still pending, it:
   - Fetches all caregivers linked to the patient
   - Gets patient information
   - Sends email to each caregiver via EmailJS
   - Logs the notification to prevent duplicates
5. **Taken or Skipped**: If status changes to "dispensed" or "skipped" before 30 seconds, no notification is sent

## Firebase Schema Requirements

The system expects the following Firebase structure:

```
├── caregivers/
│   └── [uid]/
│       ├── email: "caregiver@example.com"
│       ├── name: "John Caregiver"
│       └── patient_ids: ["patient_123", ...]  or  {patient_123: true, ...}
│
├── patients/
│   └── patient_123/
│       └── name: "Jane Patient"
│
└── dispense_logs/
    └── [dispenseId]/
        ├── id: "dispense_001"
        ├── slot: 1
        ├── medication_name: "Aspirin"
        ├── dosage: "500mg"
        ├── scheduled_time: "09:00"
        ├── date: "2025-05-26"
        └── status: "pending" | "dispensed" | "skipped" | "missed"
```

## Medication Status Values

- `pending` - Medication scheduled but not yet taken
- `dispensed` - Medication was successfully dispensed and taken
- `skipped` - Patient intentionally skipped the dose
- `missed` - Notification was sent (optional status to track)

## Error Handling

The system includes built-in error handling:

- ❌ Missing EmailJS configuration: Logs warning, skips email notification
- ❌ No caregivers found: Logs warning, no notification sent
- ❌ Patient info not found: Logs warning, no notification sent
- ❌ Email send fails: Logs error, gracefully continues
- ✅ All errors are non-blocking and won't crash the app

## Testing

### Test the Notification Flow

1. Create a scheduled medication for today
2. Note the scheduled time
3. The system will automatically check 30 seconds after the time
4. Check caregiver's email for the notification

### Console Logs

You'll see logs like:
```
Starting missed medication monitoring for patient: patient_123
Missed medication notification sent for Aspirin at 09:00
Cleaning up missed medication monitoring
```

## Performance Considerations

- **Memory**: Active monitors are stored in a Map; cleaned up on component unmount
- **Real-Time Updates**: Uses Firebase's real-time listener; automatically syncs
- **Notification Deduplication**: Tracks sent notifications to prevent spam
- **Throttling**: Only checks medications within 2 hours of scheduled time

## Troubleshooting

### Emails Not Sending

1. Verify EmailJS configuration in `.env`
2. Check EmailJS dashboard for template ID
3. Verify caregiver email is correct in Firebase
4. Check browser console for error messages

### Notifications Sending Multiple Times

- System prevents duplicates with `sentNotifications` Map
- If needed, restart the browser to reset the tracker

### Monitoring Not Working

1. Verify patient ID is set correctly
2. Confirm Firebase is connected
3. Check that `dispense_logs` exist in Firebase
4. Verify caregiver has email and is linked to patient

## Future Enhancements

- [ ] SMS notifications as fallback
- [ ] Customizable delay before notification
- [ ] Notification preferences per caregiver
- [ ] Push notifications via Firebase Cloud Messaging
- [ ] Notification history and analytics
- [ ] Skip reason tracking
- [ ] Medication compliance reports

## API Reference

### `monitorMissedMedication(dispense, patientId, delaySeconds?)`

**Parameters:**
- `dispense` (ScheduledDispense): The medication dispense record
- `patientId` (string): Patient ID to monitor
- `delaySeconds` (number): Delay before checking (default: 30)

**Returns:** `string` - Monitor ID for cancellation

---

### `cancelMedicationMonitor(monitorId)`

**Parameters:**
- `monitorId` (string): ID returned from `monitorMissedMedication()`

---

### `setupMissedMedicationMonitoring(patientId, onMissedMedicationDetected?)`

**Parameters:**
- `patientId` (string): Patient ID to monitor
- `onMissedMedicationDetected` (function, optional): Callback when missed medication detected

**Returns:** `() => void` - Unsubscribe function

---

### `useMissedMedicationMonitoring(patientId, enabled?, onMissedMedicationDetected?)`

**Parameters:**
- `patientId` (string | null): Patient ID to monitor
- `enabled` (boolean): Enable/disable monitoring (default: true)
- `onMissedMedicationDetected` (function, optional): Callback when missed medication detected

**Returns:** `{ isMonitoring: boolean }`

---

### `sendMissedMedicationEmail(options)`

**Parameters:**
- `toEmail` (string): Recipient email
- `caregiverName` (string): Name to address in email
- `patientName` (string): Patient's name
- `medicationName` (string): Medication name
- `dosage` (string): Dosage information
- `scheduledTime` (string): Scheduled time (HH:MM format)

**Returns:** `Promise<boolean>`
