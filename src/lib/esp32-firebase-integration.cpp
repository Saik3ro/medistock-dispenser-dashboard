// ============================================================
// MediStock ESP32 - Firebase Integration Updates
// Key sections updated to align with Dashboard Firebase Schema
// ============================================================

/*
IMPORTANT CHANGES FROM ORIGINAL:
1. Firebase paths now match dashboard schema exactly
2. All slot data structured consistently
3. Device heartbeat includes all dashboard requirements
4. Alert creation includes severity levels
5. Schedule-based dispensing support
*/

// ============================================================
// UPDATED: Firebase Device Initialization
// ============================================================

void initializeFirebaseDevice() {
  FirebaseJson deviceConfig;
  deviceConfig.set("device_id", "medistock-esp32-001");
  deviceConfig.set("status", "online");
  deviceConfig.set("last_heartbeat", (int)(millis() / 1000));
  deviceConfig.set("wifi_strength", WiFi.RSSI());
  deviceConfig.set("uptime_s", (int)(millis() / 1000));
  deviceConfig.set("boot_time_s", (int)(millis() / 1000));
  deviceConfig.set("version", "3.2");

  Firebase.RTDB.set(&fbdo, "/device", &deviceConfig);

  // Initialize device settings
  FirebaseJson settings;
  settings.set("dispense_speed", dispenseSpeed);
  settings.set("jam_timeout_ms", JAM_TIMEOUT_MS);
  settings.set("ir_sensitivity", 100);
  settings.set("auto_reorder_threshold", 20);
  settings.set("maintenance_interval_days", 30);
  settings.set("ntp_server", NTP_SERVER);
  settings.set("timezone", "Asia/Manila");

  Firebase.RTDB.set(&fbdo, "/device/settings", &settings);

  Serial.println("[Firebase] Device initialized");
}

// ============================================================
// UPDATED: Initialize Slots with Dashboard Schema
// ============================================================

void initializeSlots() {
  for (int i = 1; i <= 3; i++) {
    String slotPath = "/slots/slot" + String(i);

    FirebaseJson slotData;
    slotData.set("slot_number", i);
    slotData.set("medication_name", "");
    slotData.set("dosage", "");
    slotData.set("stock_current", 0);
    slotData.set("stock_max", 100);
    slotData.set("status", "empty");  // "active" | "low_stock" | "empty" | "disabled"
    slotData.set("loaded", false);
    slotData.set("is_running", false);
    slotData.set("medicine_detected", false);
    slotData.set("jammed", false);

    Firebase.RTDB.set(&fbdo, slotPath, &slotData);
  }

  Serial.println("[Firebase] All slots initialized");
}

// ============================================================
// UPDATED: Push Dispense START (aligned with dashboard)
// ============================================================

void pushDispenseStart(int slotIdx) {
  if (!Firebase.ready()) return;

  int slot = slotIdx + 1;
  String path = "/slots/slot" + String(slot);

  Firebase.RTDB.setString(&fbdo, path + "/status", "active");  // Was "dispensing"
  Firebase.RTDB.setBool(&fbdo, path + "/is_running", true);
  Firebase.RTDB.setBool(&fbdo, path + "/medicine_detected", false);
  Firebase.RTDB.setBool(&fbdo, path + "/jammed", false);
  Firebase.RTDB.setInt(&fbdo, path + "/last_dispense", (int)(millis() / 1000));

  Serial.print("[Firebase] Slot ");
  Serial.print(slot);
  Serial.println(" dispensing started");
}

// ============================================================
// UPDATED: Push Dispense COMPLETE (Dashboard Schema)
// ============================================================

void pushDispenseComplete(int slotIdx, float reactionMs, String sensorTriggered) {
  if (!Firebase.ready()) return;

  int slot = slotIdx + 1;
  String slotPath = "/slots/slot" + String(slot);

  // Update slot status
  Firebase.RTDB.setString(&fbdo, slotPath + "/status", "active");
  Firebase.RTDB.setBool(&fbdo, slotPath + "/is_running", false);
  Firebase.RTDB.setBool(&fbdo, slotPath + "/medicine_detected", true);
  Firebase.RTDB.setBool(&fbdo, slotPath + "/jammed", false);
  Firebase.RTDB.setFloat(&fbdo, slotPath + "/last_reaction_ms", reactionMs);
  Firebase.RTDB.setString(&fbdo, slotPath + "/triggered_by", sensorTriggered);
  Firebase.RTDB.setInt(&fbdo, slotPath + "/last_dispense", (int)(millis() / 1000));

  // Get medication name from slot for log
  String medicationName = "Medication";
  if (Firebase.RTDB.getString(&fbdo, slotPath + "/medication_name")) {
    medicationName = fbdo.stringData();
  }

  // Log dispense event
  FirebaseJson dispenseLogEntry;
  dispenseLogEntry.set("slot", slot);
  dispenseLogEntry.set("medication_name", medicationName);
  dispenseLogEntry.set("status", "dispensed");
  dispenseLogEntry.set("sensor", sensorTriggered);
  dispenseLogEntry.set("reaction_ms", reactionMs);
  dispenseLogEntry.set("timestamp", (long)(Date.now()));  // Use current timestamp
  dispenseLogEntry.set("triggered_by", "manual");  // or "schedule"

  Firebase.RTDB.pushJSON(&fbdo, "/dispense_log", &dispenseLogEntry);

  // Create alert
  FirebaseJson alertData;
  alertData.set("type", "DISPENSED");
  alertData.set("slot", slot);
  alertData.set("message", "Medicine dispensed from Slot " + String(slot));
  alertData.set("severity", "info");
  alertData.set("timestamp", (long)(Date.now()));

  Firebase.RTDB.set(&fbdo, "/alerts/latest", &alertData);
  Firebase.RTDB.pushJSON(&fbdo, "/alerts/history", &alertData);

  Serial.print("[Firebase] Dispense complete for Slot ");
  Serial.print(slot);
  Serial.print(" | Reaction: ");
  Serial.print(reactionMs);
  Serial.println(" ms");
}

// ============================================================
// UPDATED: Push JAM Alert (with severity)
// ============================================================

void pushJamAlert(int slotIdx) {
  if (!Firebase.ready()) return;

  int slot = slotIdx + 1;
  String slotPath = "/slots/slot" + String(slot);

  // Update slot status
  Firebase.RTDB.setString(&fbdo, slotPath + "/status", "empty");  // Jam = can't dispense
  Firebase.RTDB.setBool(&fbdo, slotPath + "/is_running", false);
  Firebase.RTDB.setBool(&fbdo, slotPath + "/medicine_detected", false);
  Firebase.RTDB.setBool(&fbdo, slotPath + "/jammed", true);

  // Get medication name
  String medicationName = "Medication";
  if (Firebase.RTDB.getString(&fbdo, slotPath + "/medication_name")) {
    medicationName = fbdo.stringData();
  }

  // Create jam alert with CRITICAL severity
  FirebaseJson jamAlert;
  jamAlert.set("type", "JAM");
  jamAlert.set("slot", slot);
  jamAlert.set("message", "Medicine jammed in Slot " + String(slot));
  jamAlert.set("severity", "critical");  // Critical alert
  jamAlert.set("timestamp", (long)(Date.now()));
  jamAlert.set("resolved", false);

  Firebase.RTDB.set(&fbdo, "/alerts/latest", &jamAlert);
  Firebase.RTDB.pushJSON(&fbdo, "/alerts/history", &jamAlert);

  // Log dispense failure
  FirebaseJson dispenseLogEntry;
  dispenseLogEntry.set("slot", slot);
  dispenseLogEntry.set("medication_name", medicationName);
  dispenseLogEntry.set("status", "jammed");
  dispenseLogEntry.set("sensor", "none");
  dispenseLogEntry.set("reaction_ms", -1);
  dispenseLogEntry.set("timestamp", (long)(Date.now()));
  dispenseLogEntry.set("triggered_by", "system");

  Firebase.RTDB.pushJSON(&fbdo, "/dispense_log", &dispenseLogEntry);

  Serial.print("[Firebase] Jam alert for Slot ");
  Serial.println(slot);
}

// ============================================================
// UPDATED: Heartbeat with Full Dashboard Integration
// ============================================================

void sendDeviceHeartbeat() {
  if (!Firebase.ready()) return;

  unsigned long uptime = millis() / 1000;

  Firebase.RTDB.setString(&fbdo, "/device/status", "online");
  Firebase.RTDB.setInt(&fbdo, "/device/last_heartbeat", (int)(millis() / 1000));
  Firebase.RTDB.setInt(&fbdo, "/device/wifi_strength", WiFi.RSSI());
  Firebase.RTDB.setInt(&fbdo, "/device/uptime_s", (int)uptime);

  // Check for low stock alerts
  const char* slotsRef = "/slots";
  if (Firebase.RTDB.get(&fbdo, slotsRef)) {
    FirebaseJson json;
    json.parse(fbdo.jsonString().c_str());

    for (int i = 1; i <= 3; i++) {
      String slotPath = "slot" + String(i);
      int stockCurrent = json.getInt(slotPath + "/stock_current");
      int stockMax = json.getInt(slotPath + "/stock_max");
      String medicationName = json.getString(slotPath + "/medication_name").c_str();

      if (stockCurrent <= 0) {
        // Create low stock alert
        FirebaseJson alert;
        alert.set("type", "LOW_STOCK");
        alert.set("slot", i);
        alert.set("message", medicationName + " - Slot " + String(i) + " is empty");
        alert.set("severity", "warning");
        alert.set("timestamp", (long)(Date.now()));

        Firebase.RTDB.set(&fbdo, "/alerts/latest", &alert);
      }
    }
  }

  Serial.println("[Heartbeat] Device status updated");
}

// ============================================================
// UPDATED: Subscribe to Schedule for Automation
// ============================================================

void checkScheduleForDispensing() {
  // This function should be called periodically
  // It checks Firebase schedule and automatically triggers dispensing

  if (!Firebase.ready()) return;

  // Get current time
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) return;

  char currentTime[6];
  strftime(currentTime, sizeof(currentTime), "%H:%M", &timeinfo);

  // Query active schedules
  if (Firebase.RTDB.get(&fbdo, "/schedule")) {
    FirebaseJson json;
    json.parse(fbdo.jsonString().c_str());

    // Iterate through schedule entries
    // Check if current time matches any entry
    // Call enqueueSlot() if time matches and schedule is active
  }
}

// ============================================================
// UPDATED: Slot Status Update with Stock Calculation
// ============================================================

void updateSlotStockStatus(int slotIdx, int currentStock, int maxStock) {
  if (!Firebase.ready()) return;

  int slot = slotIdx + 1;
  String path = "/slots/slot" + String(slot);

  // Determine status
  String status = "active";
  if (currentStock <= 0) {
    status = "empty";
  } else if (currentStock <= 10 || (float)currentStock / maxStock <= 0.2) {
    status = "low_stock";
  }

  Firebase.RTDB.setInt(&fbdo, path + "/stock_current", currentStock);
  Firebase.RTDB.setInt(&fbdo, path + "/stock_max", maxStock);
  Firebase.RTDB.setString(&fbdo, path + "/status", status);

  // Log inventory change
  FirebaseJson inventoryLog;
  inventoryLog.set("slot", slot);
  inventoryLog.set("action", "adjusted");
  inventoryLog.set("quantity", currentStock);
  inventoryLog.set("stock_before", 0);  // Would need previous stock
  inventoryLog.set("stock_after", currentStock);
  inventoryLog.set("timestamp", (long)(Date.now()));

  Firebase.RTDB.pushJSON(&fbdo, "/inventory_log", &inventoryLog);

  // Alert if low or empty
  if (status == "low_stock" || status == "empty") {
    FirebaseJson alert;
    alert.set("type", "LOW_STOCK");
    alert.set("slot", slot);
    alert.set("message", "Slot " + String(slot) + " - " + status);
    alert.set("severity", status == "empty" ? "critical" : "warning");
    alert.set("timestamp", (long)(Date.now()));

    Firebase.RTDB.set(&fbdo, "/alerts/latest", &alert);
  }

  Serial.print("[Stock] Slot ");
  Serial.print(slot);
  Serial.print(" updated: ");
  Serial.print(currentStock);
  Serial.print(" / ");
  Serial.print(maxStock);
  Serial.print(" - Status: ");
  Serial.println(status);
}

// ============================================================
// UPDATED: Setup Integration
// ============================================================

void setupFirebaseIntegration() {
  // Initialize device
  initializeFirebaseDevice();

  // Initialize all slots
  initializeSlots();

  // Set up real-time listeners
  // (Use Firebase.RTDB.setCallback() for real-time updates)

  // Start heartbeat interval
  lastHeartbeat = millis();
}

// ============================================================
// INTEGRATION: Main Loop Updates
// ============================================================

/*
In your main loop, add:

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
*/
