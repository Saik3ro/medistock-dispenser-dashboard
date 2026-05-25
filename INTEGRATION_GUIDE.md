
# MediStock Dispenser - Dashboard & ESP32 Integration Guide

## Overview

This guide covers the complete integration between:
- **ESP32 Hardware** - Medication dispenser with IR sensors, servos, and WiFi
- **Firebase Realtime Database** - Cloud backend for all data
- **React Dashboard** - Web interface for management and monitoring

## System Architecture

```
┌─────────────────────┐
│   ESP32 Dispenser   │ (Sends real-time updates)
│  - 3 Servo Motors   │
│  - 2 IR Sensors     │
│  - SH1106 OLED      │
│  - WiFi + NTP       │
└──────────┬──────────┘
           │ Firebase SDK
           │ (CoAP/REST)
           ▼
┌──────────────────────────────────────┐
│  Firebase Realtime Database (RTDB)   │
│ ┌────────────────────────────────┐   │
│ │ /device                        │   │
│ │ /slots (slot1-3)               │   │
│ │ /schedule                      │   │
│ │ /dispense_log                  │   │
│ │ /inventory_log                 │   │
│ │ /alerts                        │   │
│ │ /users                         │   │
│ └────────────────────────────────┘   │
└──────────┬───────────────────────────┘
           │ Firebase Web SDK
           │ (REST/WebSocket)
           ▼
┌──────────────────────────────┐
│   React Dashboard            │
│ - Real-time monitoring       │
│ - Slot management            │
│ - Schedule configuration     │
│ - Inventory tracking         │
│ - Alert notifications        │
└──────────────────────────────┘
```

## Quick Start

### 1. Firebase Setup

#### Create Database Structure

Go to [Firebase Console](https://console.firebase.google.com):

1. Select your project
2. Go to Realtime Database
3. Create database (if not exists)
4. Copy database URL

#### Initialize Data

Use the provided schema in `src/lib/firebase-schema.ts`:

```typescript
import { INITIAL_DATA } from "@/lib/firebase-schema";
// Push INITIAL_DATA to your database
```

Or manually create this structure:

```json
{
  "device": {
    "device_id": "medistock-esp32-001",
    "status": "offline",
    "version": "3.2"
  },
  "slots": {
    "slot1": {},
    "slot2": {},
    "slot3": {}
  },
  "schedule": {},
  "dispense_log": {},
  "alerts": {},
  "inventory_log": {}
}
```

### 2. Dashboard Setup

#### Install Dependencies

```bash
npm install
```

#### Environment Variables

Create `.env.local`:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_FIREBASE_DATABASE_URL=https://your_project-default-rtdb.region.firebasedatabase.app
```

#### Start Development Server

```bash
npm run dev
```

### 3. ESP32 Setup

#### Update Firebase Credentials

In your ESP32 code:

```cpp
#define FIREBASE_HOST    "https://your_project-default-rtdb.region.firebasedatabase.app"
#define FIREBASE_API_KEY "AIzaSy..."
#define USER_EMAIL       "your_device@example.com"
#define USER_PASSWORD    "device_password"
```

#### Integrate ESP32 Code

Replace key functions with updated versions from `src/lib/esp32-firebase-integration.cpp`:

1. `initializeFirebaseDevice()` - Device initialization
2. `initializeSlots()` - Slot setup
3. `pushDispenseStart()` - Start dispensing
4. `pushDispenseComplete()` - Log successful dispense
5. `pushJamAlert()` - Alert on jam detection
6. `sendDeviceHeartbeat()` - Keep-alive signal

#### Upload to ESP32

Use PlatformIO or Arduino IDE with these libraries:

```
firebase-esp-client
esp32-servo
esp32-ssd1306
WiFi
time
```

## Database Schema

### Device (`/device`)

Device status and configuration:

```json
{
  "device_id": "medistock-esp32-001",
  "status": "online",
  "last_heartbeat": 1719456123000,
  "wifi_strength": -45,
  "uptime_s": 345600,
  "version": "3.2",
  "settings": {
    "dispense_speed": 45,
    "jam_timeout_ms": 5000,
    "ir_sensitivity": 100,
    "auto_reorder_threshold": 20
  }
}
```

### Slots (`/slots/slot{N}`)

Real-time slot data from ESP32:

```json
{
  "medication_name": "Aspirin",
  "dosage": "500mg",
  "stock_current": 45,
  "stock_max": 100,
  "status": "active",
  "is_running": false,
  "medicine_detected": false,
  "jammed": false,
  "last_reaction_ms": 1250,
  "triggered_by": "IR1_GPIO34",
  "last_dispense": 1719456000
}
```

**Status Values:**
- `active` - Fully stocked and operational
- `low_stock` - Stock ≤ 20% or ≤ 10 units
- `empty` - No stock or jammed
- `disabled` - Slot disabled by admin

### Schedule (`/schedule/{key}`)

Medication dispensing schedules:

```json
{
  "slot": 1,
  "medication_name": "Aspirin",
  "dosage": "500mg",
  "frequency": "daily",
  "times": ["08:00", "20:00"],
  "start_date": "2024-06-01",
  "active": true
}
```

**Frequency Types:**
- `daily` - Once daily
- `twice_daily` - Two times daily
- `weekly` - Specific days of week
- `custom` - Multiple specific times

### Dispense Log (`/dispense_log/{key}`)

Record of all dispensing events:

```json
{
  "slot": 1,
  "medication_name": "Aspirin",
  "status": "dispensed",
  "sensor": "IR1_GPIO34",
  "reaction_ms": 1250,
  "timestamp": 1719456000000,
  "triggered_by": "schedule"
}
```

**Status Values:**
- `dispensed` - Successfully dispensed
- `jammed` - Jam detected, not dispensed
- `missed` - Scheduled but not dispensed

### Inventory Log (`/inventory_log/{key}`)

Stock change history:

```json
{
  "slot": 1,
  "medication_name": "Aspirin",
  "action": "added",
  "quantity": 50,
  "stock_before": 20,
  "stock_after": 70,
  "timestamp": 1719456000000,
  "notes": "Pharmacy refill"
}
```

### Alerts (`/alerts`)

**Latest Alert** (`/alerts/latest`):

```json
{
  "type": "JAM",
  "slot": 1,
  "message": "Medicine jammed in Slot 1",
  "severity": "critical",
  "timestamp": 1719456000000
}
```

**Alert History** (`/alerts/history/{key}`):

Same as latest + `resolved`, `resolved_at`, `resolved_by`

**Alert Types:**
- `JAM` - Medication jam detected
- `LOW_STOCK` - Stock below threshold
- `DISPENSED` - Successful dispensing
- `ERROR` - System error
- `OFFLINE` - Device offline

**Severity Levels:**
- `info` - Informational
- `warning` - Warning, needs attention
- `critical` - Critical, immediate action needed

## API Reference

### Firebase Service Functions

#### Slots

```typescript
// Subscribe to all slots in real-time
subscribeToAllSlots((slots) => {
  console.log(slots); // SlotData[]
});

// Subscribe to single slot
subscribeToSlot(1, (slot) => {
  console.log(slot); // SlotData
});

// Update slot status
await updateSlotStatus(1, "active");

// Update medication
await updateSlotMedication(1, {
  medication_name: "Aspirin",
  dosage: "500mg",
  stock_max: 100,
});

// Update stock level
await updateSlotStock(1, 45, "Refilled");
```

#### Schedule

```typescript
// Get all schedules
subscribeToSchedule((entries) => {
  console.log(entries); // ScheduleEntry[]
});

// Add schedule
const key = await addScheduleEntry({
  slot: 1,
  medication_name: "Aspirin",
  frequency: "daily",
  times: ["08:00", "20:00"],
  start_date: "2024-06-01",
  active: true,
});

// Update schedule
await updateScheduleEntry(key, { times: ["09:00", "21:00"] });

// Delete schedule
await deleteScheduleEntry(key);
```

#### Dispense Log

```typescript
// Get recent dispenses
subscribeToDispenseLog((logs) => {
  console.log(logs); // DispenseLog[]
});

// Get dispenses by date range
const logs = await getDispenseLogByDate(startTime, endTime);

// Log dispense event (ESP32)
await logDispense({
  slot: 1,
  medication_name: "Aspirin",
  status: "dispensed",
  sensor: "IR1_GPIO34",
  reaction_ms: 1250,
  timestamp: Date.now(),
});
```

#### Alerts

```typescript
// Subscribe to latest alert
subscribeToLatestAlert((alert) => {
  console.log(alert); // Alert
});

// Subscribe to all alerts
subscribeToAlerts((alerts) => {
  console.log(alerts); // Alert[]
});

// Create alert
await createAlert({
  type: "LOW_STOCK",
  slot: 1,
  message: "Slot 1 low stock",
  severity: "warning",
  timestamp: Date.now(),
  resolved: false,
});

// Resolve alert
await resolveAlert(alertKey, "admin_user_id");
```

#### Inventory

```typescript
// Get inventory history
const logs = await getInventoryLog(slotNumber);

// Log inventory change
await logInventoryChange({
  slot: 1,
  medication_name: "Aspirin",
  action: "added",
  quantity: 50,
  stock_before: 20,
  stock_after: 70,
  timestamp: Date.now(),
});
```

#### Device

```typescript
// Get device status
subscribeToDeviceStatus((status) => {
  console.log(status); // DeviceStatus
});

// Get device settings
const settings = await getDeviceSettings();

// Update device settings
await updateDeviceSettings({
  dispense_speed: 50,
  jam_timeout_ms: 6000,
});

// Get dashboard summary
const summary = await getDashboardSummary();
```

## Dashboard Components

### Updated Dashboard
Located: `src/routes/_app/dashboard-updated.tsx`

**Features:**
- Real-time slot monitoring
- Latest alert display
- Device connectivity status
- Summary statistics (dispensed today, pending doses, low stock)
- Recent activity log

**To Use:**
Replace the current dashboard.tsx with dashboard-updated.tsx, or merge components:

```typescript
import { subscribeToAllSlots, subscribeToLatestAlert } from "@/lib/firebase-service";
```

### Inventory Page
Located: `src/routes/_app/inventory.tsx`

**Enhancements with new service:**
```typescript
import { updateSlotMedication, updateSlotStock } from "@/lib/firebase-service";
```

### Schedule Page
Located: `src/routes/_app/schedule.tsx`

**Enhancements:**
```typescript
import { 
  subscribeToSchedule, 
  addScheduleEntry,
  updateScheduleEntry,
  deleteScheduleEntry
} from "@/lib/firebase-service";
```

## ESP32 Implementation

### Update Your Main Loop

```cpp
unsigned long lastScheduleCheck = 0;
unsigned long lastHeartbeat = 0;

void loop() {
  // Check schedule every minute
  if (millis() - lastScheduleCheck >= 60000) {
    lastScheduleCheck = millis();
    checkScheduleForDispensing();
  }

  // Send heartbeat every 30 seconds
  if (millis() - lastHeartbeat >= 30000) {
    lastHeartbeat = millis();
    sendDeviceHeartbeat();
  }

  // ... rest of your loop code
}
```

### Firebase Event Handling

When dispensing completes:

```cpp
// In your IR sensor detection code:
pushDispenseComplete(slotIdx, reactionMs, sensorTriggered);
```

When jam detected:

```cpp
// After JAM_TIMEOUT_MS
pushJamAlert(slotIdx);
```

## Data Flow Examples

### 1. User Adds Medication

```
Dashboard (Inventory) 
  → updateSlotMedication() 
  → Firebase (/slots/slot1) 
  → ESP32 reads via heartbeat 
  → OLED displays new medication
```

### 2. ESP32 Dispenses Medication

```
ESP32 dispenses 
  → IR sensor detects medicine 
  → pushDispenseComplete() 
  → Firebase (/dispense_log) 
  → Firebase (/slots/slot1/last_reaction_ms) 
  → Dashboard updates in real-time
```

### 3. Stock Gets Low

```
updateSlotStock() 
  → Firebase (/slots/slot1/status = "low_stock") 
  → createAlert() 
  → Dashboard shows warning 
  → User notified
```

### 4. Schedule Triggers Dispense

```
ESP32 checks schedule (every minute) 
  → Current time matches schedule entry 
  → enqueueSlot() 
  → startDispense() 
  → Dispense completes normally
```

## File Structure

```
src/
├── types/
│   └── index.ts                          # All TypeScript types
├── lib/
│   ├── firebase-service.ts               # Firebase CRUD functions
│   ├── firebase-schema.ts                # Database structure docs
│   ├── esp32-firebase-integration.cpp    # ESP32 code snippets
│   └── ...
├── routes/
│   └── _app/
│       ├── dashboard-updated.tsx         # Enhanced dashboard
│       ├── inventory.tsx                 # Slot & med management
│       ├── schedule.tsx                  # Medication schedules
│       └── ...
└── components/
    └── ...
```

## Troubleshooting

### Device Shows as Offline

1. Check WiFi connection on ESP32
2. Verify Firebase credentials in ESP32 code
3. Check Firebase rules allow ESP32 writes
4. Monitor ESP32 serial output for errors

### Dispense Not Logging

1. Verify `logDispense()` is called in ESP32
2. Check Firebase permissions for `/dispense_log`
3. Ensure timestamp is correct on ESP32

### Dashboard Not Updating

1. Check browser console for Firebase errors
2. Verify `.env.local` has correct Firebase config
3. Ensure subscription callbacks are set up
4. Check network tab for failed requests

### Alerts Not Appearing

1. Verify `createAlert()` is called
2. Check `/alerts/latest` path in Firebase
3. Ensure subscription to `subscribeToLatestAlert()`

## Next Steps

1. **Test Integration**: Verify ESP32 connects and sends data
2. **Deploy Dashboard**: Deploy React app to Vercel/Firebase Hosting
3. **Set Alerts**: Configure notification preferences
4. **Add Users**: Invite caregivers via invite codes
5. **Monitor Logs**: Review dispense logs for accuracy

## Support

For issues or questions:
1. Check Firebase console for data
2. Monitor ESP32 serial output
3. Review browser console for errors
4. Check this guide's troubleshooting section

---

**Last Updated:** June 25, 2024  
**Version:** 3.2
