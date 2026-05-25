# MediStock Integration Setup Checklist

Complete this checklist to fully integrate your ESP32 dispenser with the dashboard.

## ✅ Phase 1: Dashboard Setup (20 minutes)

### Step 1: Update Environment Variables
- [ ] Open `.env.local` file (create if missing)
- [ ] Add your Firebase credentials:
  ```env
  VITE_FIREBASE_API_KEY=your_key_here
  VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID=your_project
  VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
  VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
  VITE_FIREBASE_APP_ID=your_app_id
  VITE_FIREBASE_DATABASE_URL=https://your-project-default-rtdb.region.firebasedatabase.app
  ```
- [ ] Save file

### Step 2: Update Vite Config (if needed)
- [ ] Open `vite.config.js`
- [ ] Verify Firebase sub-packages are in optimizeDeps:
  ```javascript
  optimizeDeps: {
    include: [
      'firebase/app',
      'firebase/auth',
      'firebase/database',
      // ... other packages
    ],
  }
  ```
- [ ] Save file

### Step 3: Review New Files
- [ ] ✅ `src/types/index.ts` - Type definitions (created)
- [ ] ✅ `src/lib/firebase-service.ts` - API functions (created)
- [ ] ✅ `src/lib/firebase-schema.ts` - Database docs (created)
- [ ] ✅ `src/routes/_app/dashboard-updated.tsx` - Enhanced dashboard (created)

### Step 4: Test Dashboard Locally
- [ ] Run `npm run dev`
- [ ] Navigate to http://localhost:5173
- [ ] Dashboard loads without errors
- [ ] Check browser console (F12) for any errors
- [ ] Close dev server with Ctrl+C

---

## ✅ Phase 2: Firebase Database Setup (15 minutes)

### Step 1: Open Firebase Console
- [ ] Go to https://console.firebase.google.com
- [ ] Select your MediStock project
- [ ] Go to Realtime Database

### Step 2: Create Initial Structure
- [ ] Go to Data tab
- [ ] Click the "+" button next to root to add:
  ```
  device/
    device_id: "medistock-esp32-001"
    status: "offline"
    last_heartbeat: 0
    
  slots/
    slot1/
      medication_name: ""
      dosage: ""
      stock_current: 0
      stock_max: 100
      status: "empty"
      is_running: false
      medicine_detected: false
      jammed: false
    slot2/ [same as slot1]
    slot3/ [same as slot1]
    
  schedule/
  dispense_log/
  inventory_log/
  
  alerts/
    latest/ {}
    history/ {}
  ```

Or copy from `src/lib/firebase-schema.ts` INITIAL_DATA

### Step 3: Set Security Rules
- [ ] Go to Rules tab
- [ ] Copy rules from `src/lib/firebase-schema.ts`
- [ ] Paste into Rules editor
- [ ] Click Publish
- [ ] Confirm the changes

### Step 4: Verify Structure
- [ ] Go back to Data tab
- [ ] Expand "device" - should see device_id, status
- [ ] Expand "slots" - should see slot1, slot2, slot3
- [ ] Each slot should have default values

---

## ✅ Phase 3: ESP32 Code Updates (30 minutes)

### Step 1: Backup Current Code
- [ ] Save your current ESP32 sketch as `medistock_v3.1_backup.ino`
- [ ] This is your safety net

### Step 2: Update Firebase Credentials
In your ESP32 code, update:
```cpp
#define FIREBASE_HOST    "https://your-project-default-rtdb.region.firebasedatabase.app"
#define FIREBASE_API_KEY "AIzaSy..."
#define USER_EMAIL       "your_device@example.com"
#define USER_PASSWORD    "device_password"
```

- [ ] FIREBASE_HOST updated
- [ ] FIREBASE_API_KEY updated
- [ ] Credentials verified in Firebase Console

### Step 3: Replace Firebase Functions
- [ ] Open `src/lib/esp32-firebase-integration.cpp`
- [ ] Copy the following functions into your sketch:
  - [ ] `initializeFirebaseDevice()`
  - [ ] `initializeSlots()`
  - [ ] `pushDispenseStart()`
  - [ ] `pushDispenseComplete()`
  - [ ] `pushJamAlert()`
  - [ ] `sendDeviceHeartbeat()`
  - [ ] `updateSlotStockStatus()`

- [ ] Update your existing functions or add as new

### Step 4: Update Setup Function
- [ ] Replace Firebase initialization code with:
  ```cpp
  setupFirebaseIntegration();
  ```

### Step 5: Update Main Loop
- [ ] Add to your `loop()` function:
  ```cpp
  unsigned long lastScheduleCheck = 0;
  unsigned long lastHeartbeat = 0;

  // Every 60 seconds check schedule
  if (millis() - lastScheduleCheck >= 60000) {
    lastScheduleCheck = millis();
    checkScheduleForDispensing();
  }

  // Every 30 seconds send heartbeat
  if (millis() - lastHeartbeat >= 30000) {
    lastHeartbeat = millis();
    sendDeviceHeartbeat();
  }
  ```

- [ ] Loop code updated
- [ ] Verified no compilation errors

### Step 6: Test Compilation
- [ ] Open code in Arduino IDE or PlatformIO
- [ ] Click Verify/Compile
- [ ] No errors (warnings OK)
- [ ] Note any modifications needed

### Step 7: Upload to ESP32
- [ ] Connect ESP32 to USB
- [ ] Select correct COM port
- [ ] Click Upload
- [ ] Wait for upload complete
- [ ] Check for upload success message

### Step 8: Monitor Serial Output
- [ ] Open Serial Monitor (115200 baud)
- [ ] Observe startup sequence:
  ```
  MediStock v3.2 - Queue + Debounce + Jam
  [WiFi] Connecting...
  [WiFi] Connected! IP: 192.168.1.X
  [Firebase] Authenticating...
  [Firebase] Authenticated!
  [Setup] Complete.
  ```
- [ ] If errors, troubleshoot (see below)

---

## ✅ Phase 4: Verify Real-Time Integration (15 minutes)

### Step 1: Check Device Online Status
- [ ] ESP32 serial output shows "Authenticated"
- [ ] Go to Firebase Console → Realtime Database
- [ ] Look at `/device/status` - should be "online"
- [ ] Check `/device/last_heartbeat` - should update every 30s

- [ ] Device status shows "online" ✓

### Step 2: Test Stock Update
- [ ] In Firebase Console, manually set:
  ```
  /slots/slot1/medication_name: "Aspirin"
  /slots/slot1/dosage: "500mg"
  /slots/slot1/stock_current: 50
  /slots/slot1/stock_max: 100
  ```
- [ ] Run `npm run dev`
- [ ] Dashboard loads and displays Slot 1
- [ ] Shows "Aspirin 500mg"
- [ ] Stock bar shows 50/100
- [ ] Real-time update ✓

### Step 3: Test Inventory Update from Dashboard
- [ ] In dashboard, navigate to Inventory
- [ ] Update Slot 1 stock to 75
- [ ] Check Firebase Console:
  - [ ] `/slots/slot1/stock_current` = 75
  - [ ] `/inventory_log/` has new entry
- [ ] Dashboard update ✓

### Step 4: Test Schedule Creation
- [ ] In dashboard, go to Schedule
- [ ] Create new schedule:
  - Slot: 1
  - Medication: Aspirin
  - Frequency: Daily
  - Times: 08:00, 14:00, 20:00
  - Start: Today
- [ ] Click Save
- [ ] Check Firebase `/schedule/` has new entry
- [ ] Schedule creation ✓

### Step 5: Monitor Dispense Log
- [ ] In Firebase Console, manually test by:
  - [ ] Triggering a dispense on ESP32 (press button or serial command)
  - [ ] Check `/dispense_log/` for new entry
  - [ ] Dashboard Activity shows recent event
- [ ] Dispense logging ✓

### Step 6: Test Alert System
- [ ] Manually create alert in Firebase Console:
  ```
  /alerts/latest: {
    type: "TEST",
    message: "Test alert",
    severity: "warning",
    timestamp: current_time
  }
  ```
- [ ] Dashboard shows notification toast
- [ ] Alert appears in UI
- [ ] Alert system ✓

---

## ✅ Phase 5: Advanced Features (10 minutes)

### Step 1: Set Device Settings
- [ ] Create `/device/settings/`:
  ```
  dispense_speed: 45
  jam_timeout_ms: 5000
  ir_sensitivity: 100
  ```
- [ ] ESP32 can read these for configuration

- [ ] Settings created ✓

### Step 2: Configure Alerts
- [ ] Go to Schedule in dashboard
- [ ] Verify you can enable/disable schedules
- [ ] Add multiple medications in different slots
- [ ] Test queue system

- [ ] Alerts configured ✓

### Step 3: Set Up Inventory Thresholds
- [ ] For each slot, set reorder threshold
- [ ] When stock < 20%, alert appears
- [ ] Test by reducing stock in dashboard

- [ ] Thresholds set ✓

---

## ✅ Phase 6: Deployment (15 minutes)

### Step 1: Build Dashboard
- [ ] Run `npm run build`
- [ ] Check for errors
- [ ] `dist/` folder created

- [ ] Build successful ✓

### Step 2: Deploy to Production
Choose one:

**Option A: Vercel (Recommended)**
- [ ] Push to GitHub
- [ ] Connect to Vercel
- [ ] Set environment variables in Vercel dashboard
- [ ] Deploy

**Option B: Firebase Hosting**
- [ ] Install Firebase CLI: `npm install -g firebase-tools`
- [ ] Run `firebase init hosting`
- [ ] Set public directory to `dist/`
- [ ] Run `firebase deploy`

**Option C: Manual Server**
- [ ] Copy `dist/` folder to server
- [ ] Configure web server for SPA routing
- [ ] Set environment variables

- [ ] Deployed ✓

### Step 3: Verify Production
- [ ] Open production URL
- [ ] Dashboard loads
- [ ] Real-time updates work
- [ ] No console errors

- [ ] Production verified ✓

---

## ✅ Phase 7: Final Checks

### Dashboard Checklist
- [ ] [ ] Dashboard displays all 3 slots
- [ ] [ ] Real-time updates work
- [ ] [ ] Inventory updates sync
- [ ] [ ] Schedules can be created/edited
- [ ] [ ] Alerts display correctly
- [ ] [ ] Device status shows online/offline
- [ ] [ ] Recent activity log shows events

### ESP32 Checklist
- [ ] [ ] Serial output shows successful auth
- [ ] [ ] Device appears online in Firebase
- [ ] [ ] Heartbeat sends every 30 seconds
- [ ] [ ] Dispense events log to Firebase
- [ ] [ ] Jam detection creates alerts
- [ ] [ ] Schedule reading implemented
- [ ] [ ] Servos respond to commands

### Firebase Checklist
- [ ] [ ] Database structure complete
- [ ] [ ] Security rules applied
- [ ] [ ] Device data updates in real-time
- [ ] [ ] Schedule entries readable
- [ ] [ ] Alerts created and cleared
- [ ] [ ] Logs accumulating properly

### Integration Checklist
- [ ] [ ] One-way sync (ESP32 → Dashboard) works
- [ ] [ ] Two-way sync (Dashboard ↔ ESP32) works
- [ ] [ ] Real-time updates < 1 second
- [ ] [ ] No console errors on dashboard
- [ ] [ ] No Firebase warnings
- [ ] [ ] No connectivity issues

---

## 🆘 Troubleshooting

### Device Shows Offline
```
❌ Problem: Device status is "offline" in Firebase
✅ Solution:
  1. Check ESP32 serial output for errors
  2. Verify WiFi SSID/password correct
  3. Confirm Firebase credentials match
  4. Check firewall not blocking port 5433 (CoAP)
  5. Restart ESP32
```

### Dashboard Not Updating
```
❌ Problem: Dashboard displays old data, not real-time
✅ Solution:
  1. Check browser console (F12) for errors
  2. Verify .env.local has correct Firebase config
  3. Check Firebase rules allow reads
  4. Hard refresh: Ctrl+Shift+R
  5. Clear browser cache
```

### Dispense Not Logging
```
❌ Problem: pushDispenseComplete() not creating log entry
✅ Solution:
  1. Check Firebase.ready() returns true
  2. Verify /dispense_log path exists in Firebase
  3. Check permissions in security rules
  4. Monitor Firebase Console for write errors
  5. Check timestamp is valid (not 0)
```

### Compilation Errors
```
❌ Problem: ESP32 code won't compile
✅ Solution:
  1. Check all #include paths match your library structure
  2. Verify required libraries installed:
     - firebase-esp-client
     - esp32-servo
     - esp32-ssd1306
  3. Confirm proper type definitions (int vs long)
  4. Check no duplicate function definitions
```

---

## 📞 Quick Support

| Issue | Check |
|-------|-------|
| Device offline | WiFi connection, Firebase auth |
| No data in dashboard | Firebase rules, subscription setup |
| Alerts not showing | Latest alert exists, subscription active |
| Stock not updating | updateSlotStock() called, permissions |
| Dispense not logging | Firebase.ready(), valid timestamp |

---

## 🎉 Success Criteria

You're done when:
- ✅ Dashboard shows real-time slot data
- ✅ ESP32 connects and goes online
- ✅ Stock updates sync both directions
- ✅ Schedules can be managed
- ✅ Dispense events appear in dashboard
- ✅ Alerts trigger on jam/low stock
- ✅ No console errors
- ✅ System runs stable for 24 hours

---

**Estimated Total Time:** 1.5 - 2 hours  
**Last Updated:** June 25, 2024  
**Version:** 3.2

Once complete, refer to `API_QUICK_REFERENCE.md` for common tasks.
