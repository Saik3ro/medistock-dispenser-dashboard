# MediStock API Quick Reference

## 🎯 Common Tasks

### Monitor Slot Status (Dashboard)
```typescript
import { subscribeToAllSlots } from "@/lib/firebase-service";

subscribeToAllSlots((slots) => {
  slots.forEach(slot => {
    console.log(`Slot ${slot.slot_number}: ${slot.medication_name}`);
    console.log(`Stock: ${slot.stock_current}/${slot.stock_max}`);
    console.log(`Status: ${slot.status}`);
  });
});
```

### Update Medication Stock
```typescript
import { updateSlotStock } from "@/lib/firebase-service";

// Update stock to 45 units
await updateSlotStock(1, 45, "Refilled by pharmacy");
```

### Add Medication to Slot
```typescript
import { updateSlotMedication } from "@/lib/firebase-service";

await updateSlotMedication(1, {
  medication_name: "Aspirin",
  dosage: "500mg",
  stock_max: 100,
  status: "active",
});
```

### Create Medication Schedule
```typescript
import { addScheduleEntry } from "@/lib/firebase-service";

const key = await addScheduleEntry({
  slot: 1,
  medication_name: "Aspirin",
  dosage: "500mg",
  frequency: "daily",
  times: ["08:00", "14:00", "20:00"],
  start_date: "2024-06-01",
  active: true,
});
```

### Handle Dispense Events
```typescript
import { subscribeToDispenseLog } from "@/lib/firebase-service";

subscribeToDispenseLog((logs) => {
  logs.forEach(log => {
    console.log(`${log.medication_name} - ${log.status}`);
    console.log(`Reaction: ${log.reaction_ms}ms`);
  });
});
```

### Monitor Alerts
```typescript
import { subscribeToLatestAlert } from "@/lib/firebase-service";

subscribeToLatestAlert((alert) => {
  if (alert) {
    console.log(`[${alert.severity}] ${alert.message}`);
    if (alert.severity === "critical") {
      // Show error notification
    }
  }
});
```

### Get Dashboard Stats
```typescript
import { getDashboardSummary } from "@/lib/firebase-service";

const stats = await getDashboardSummary();
console.log(`Dispensed today: ${stats.total_dispensed_today}`);
console.log(`Low stock: ${stats.low_stock_slots}`);
console.log(`Device: ${stats.device_status}`);
```

### Check Device Status
```typescript
import { subscribeToDeviceStatus } from "@/lib/firebase-service";

subscribeToDeviceStatus((status) => {
  console.log(`Status: ${status.status}`); // "online" | "offline"
  console.log(`WiFi: ${status.wifi_strength} dBm`);
  console.log(`Uptime: ${status.uptime_s}s`);
});
```

---

## 📊 Data Types

### SlotData
```typescript
{
  slot_number: 1 | 2 | 3,
  medication_name: string,
  dosage: string,
  stock_current: number,
  stock_max: number,
  status: "active" | "low_stock" | "empty" | "disabled",
  loaded: boolean,
  is_running: boolean,
  medicine_detected: boolean,
  jammed: boolean,
  last_reaction_ms?: number,
  triggered_by?: string,
  last_dispense?: number,
}
```

### ScheduleEntry
```typescript
{
  slot: 1 | 2 | 3,
  medication_name: string,
  dosage: string,
  frequency: "daily" | "twice_daily" | "weekly" | "custom",
  times: string[], // ["08:00", "20:00"]
  days?: number[], // [0-6] for weekly
  start_date: string, // "2024-06-01"
  active: boolean,
}
```

### DispenseLog
```typescript
{
  slot: 1 | 2 | 3,
  medication_name: string,
  status: "dispensed" | "jammed" | "missed",
  sensor: string,
  reaction_ms: number,
  timestamp: number,
  triggered_by?: string,
}
```

### Alert
```typescript
{
  type: "JAM" | "LOW_STOCK" | "DISPENSED" | "ERROR" | "OFFLINE",
  slot?: number,
  message: string,
  severity: "info" | "warning" | "critical",
  timestamp: number,
  resolved?: boolean,
}
```

---

## 🔌 ESP32 Functions

### Log Dispense (ESP32)
```cpp
// When medicine is detected
pushDispenseComplete(slotIdx, reactionMs, sensorTriggered);
```

### Alert on Jam (ESP32)
```cpp
// When JAM_TIMEOUT_MS exceeded
pushJamAlert(slotIdx);
```

### Send Heartbeat (ESP32)
```cpp
// Every 30 seconds
sendDeviceHeartbeat();
```

### Update Stock (ESP32)
```cpp
// When refilled
updateSlotStockStatus(slotIdx, currentStock, maxStock);
```

---

## 🔄 Real-Time Subscriptions

All `subscribe*` functions return an unsubscribe function:

```typescript
useEffect(() => {
  const unsubscribe = subscribeToSlot(1, (slot) => {
    console.log("Slot updated:", slot);
  });

  return () => unsubscribe?.(); // Cleanup
}, []);
```

---

## 📍 Firebase Paths

```
/device                    Device status & settings
/slots/slot1-3            Slot data
/schedule/{key}           Schedules
/dispense_log/{key}       Dispense events
/inventory_log/{key}      Stock history
/alerts/latest            Current alert
/alerts/history/{key}     Alert history
/users/{uid}              User profiles
/invites/{code}           Invites
```

---

## ⚠️ Common Errors

### "Device Offline"
- Check ESP32 WiFi connection
- Verify Firebase credentials
- Check device heartbeat interval

### "Missing medication_name"
- Use `updateSlotMedication()` to set it
- Check Firebase data structure

### "Stock not updating"
- Verify write permissions in Firebase rules
- Check `updateSlotStock()` completes
- Look for inventory log entry

### "Alerts not showing"
- Check `subscribeToLatestAlert()` is active
- Verify `/alerts/latest` path has data
- Monitor network requests

---

## 🎨 TypeScript Usage

Import types for type safety:

```typescript
import type { SlotData, ScheduleEntry, Alert } from "@/types";

const slot: SlotData = {
  slot_number: 1,
  medication_name: "Aspirin",
  // ... rest of properties
};
```

---

## 💾 Async/Promise Handling

Some functions return promises:

```typescript
// Await for completion
const success = await updateSlotStock(1, 50);
if (success) {
  console.log("Stock updated");
}

// Get data one-time
const logs = await getDispenseLogByDate(startTime, endTime);
```

---

## 🔐 Security Notes

- ESP32 uses device authentication
- Dashboard uses user authentication
- All writes have permission checks
- Sensitive data (passwords) never logged

---

## 📱 React Hooks Example

```typescript
import { useEffect, useState } from "react";
import { subscribeToAllSlots, updateSlotStock } from "@/lib/firebase-service";

export function SlotManager() {
  const [slots, setSlots] = useState([]);

  useEffect(() => {
    const unsubscribe = subscribeToAllSlots(setSlots);
    return () => unsubscribe?.();
  }, []);

  const refillSlot = async (slotNum) => {
    await updateSlotStock(slotNum, 100);
    // slots will update automatically
  };

  return (
    <div>
      {slots.map(slot => (
        <div key={slot.slot_number}>
          <h3>{slot.medication_name}</h3>
          <p>{slot.stock_current} / {slot.stock_max}</p>
          <button onClick={() => refillSlot(slot.slot_number)}>
            Refill
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## 📞 Where to Find More Info

| Topic | File |
|-------|------|
| Types | `src/types/index.ts` |
| API Docs | `src/lib/firebase-service.ts` |
| DB Schema | `src/lib/firebase-schema.ts` |
| ESP32 Code | `src/lib/esp32-firebase-integration.cpp` |
| Setup Guide | `INTEGRATION_GUIDE.md` |

---

**Quick Reference v1.0**  
**For Full Documentation:** See `INTEGRATION_GUIDE.md`
