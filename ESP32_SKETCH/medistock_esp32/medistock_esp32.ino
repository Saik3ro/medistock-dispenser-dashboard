// ============================================================
// MediStock - ESP32 Queue-Based Dispenser v3.2
// ESP32 | Firebase Realtime Database | 2x IR TCRT5000 + 3x SG90
// SH1106 128x64 OLED | NTP Time Sync
// Pattern: Queue-based sequential dispensing + sensor debounce + jam detection
// Course: CPE 323 - Microprocessor | USTP-CDO
// ============================================================

#include <Arduino.h>
#include <WiFi.h>
#include <Firebase_ESP_Client.h>  
#include <ESP32Servo.h>
#include <Wire.h>
#include "SH1106Wire.h"
#include "time.h"

// ========== WiFi Credentials ==========
#define WIFI_SSID      "Syker"
#define WIFI_PASSWORD  "ulolconnectpamore123"

// ========== Firebase Credentials ==========
#define FIREBASE_HOST    "https://medistock-dispenser-default-rtdb.asia-southeast1.firebasedatabase.app"
#define FIREBASE_API_KEY "AIzaSyAjymvK0UrpvnPm-P231496JJPhfNGLzzo"

// ========== Firebase Auth ==========
#define USER_EMAIL    "test@example.com"
#define USER_PASSWORD "password123"

// ========== Pin Definitions ==========
#define IR1_PIN    22
#define IR2_PIN    23
#define SERVO1_PIN 13
#define SERVO2_PIN 12
#define SERVO3_PIN 14
#define SERVO1_GREEN_LED_PIN 15
#define SERVO1_RED_LED_PIN   2
#define SERVO2_GREEN_LED_PIN 4
#define SERVO2_RED_LED_PIN   16
#define SERVO3_GREEN_LED_PIN 17
#define SERVO3_RED_LED_PIN   5
#define BUZZER_PIN           18

// ========== OLED Config ==========
#define OLED_SDA        26
#define OLED_SCL        27
#define OLED_REFRESH_MS 500

// ========== NTP Config ==========
#define NTP_SERVER  "pool.ntp.org"
#define GMT_OFFSET  28800
#define DAYLIGHT    0

// ========== Jam Detection ==========
#define JAM_TIMEOUT_MS 5000

// ========== Schedule Polling ==========
#define SCHEDULE_POLL_MS 15000
#define FIREBASE_JSON_OBJECT_TYPE 1

// ========== Dashboard IR Status ==========
#define IR_STATUS_POLL_MS 100
#define MEDICINE_SENSOR_PATH "/components/sensor1/status/medicine_detected"

// ========== OLED Object ==========
SH1106Wire display(0x3C, OLED_SDA, OLED_SCL);
unsigned long lastOledUpdate = 0;

// ========== Servo Objects ==========
Servo servo1, servo2, servo3;
Servo* servos[3]         = {&servo1, &servo2, &servo3};
const int servoPins[3]   = {SERVO1_PIN, SERVO2_PIN, SERVO3_PIN};
const int greenLedPins[3] = {SERVO1_GREEN_LED_PIN, SERVO2_GREEN_LED_PIN, SERVO3_GREEN_LED_PIN};
const int redLedPins[3]   = {SERVO1_RED_LED_PIN, SERVO2_RED_LED_PIN, SERVO3_RED_LED_PIN};

// ========== Firebase Objects ==========
FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;

// ========== State Variables ==========
bool isDispensing[3]     = {false, false, false};
bool medicineDetected[3] = {false, false, false};
bool jamDetected[3]      = {false, false, false};
int  dispenseSpeed       = 45;

unsigned long lastIRRead       = 0;
unsigned long lastIRStatusRead = 0;
unsigned long dispenseStart[3] = {0, 0, 0};
unsigned long lastHeartbeat    = 0;
unsigned long lastSchedulePoll = 0;
String lastScheduleFireKey[3]  = {"", "", ""};
bool lastPublishedMedicineDetected = false;
bool medicineSensorStatusInitialized = false;

// ========== Queue System ==========
int dispenseQueue[3] = {-1, -1, -1};
int queueHead        = 0;
int queueTail        = 0;
int activeSlot       = -1;

// ========== Sensor Debounce ==========
bool sensorCleared = true;

// ============================================================
// LED + Buzzer Helpers
// ============================================================
void updateSlotIndicators(int slotIdx) {
  bool running = isDispensing[slotIdx];
  digitalWrite(greenLedPins[slotIdx], running ? HIGH : LOW);
  digitalWrite(redLedPins[slotIdx], running ? LOW : HIGH);
}

void updateBuzzerState() {
  bool anyJam = false;
  for (int i = 0; i < 3; i++) {
    if (jamDetected[i]) {
      anyJam = true;
      break;
    }
  }
  digitalWrite(BUZZER_PIN, anyJam ? HIGH : LOW);
}

bool isMedicineDetectedByIR() {
  return digitalRead(IR1_PIN) == LOW || digitalRead(IR2_PIN) == LOW;
}

void publishMedicineSensorStatus(bool detected) {
  if (!Firebase.ready()) return;
  if (medicineSensorStatusInitialized && detected == lastPublishedMedicineDetected) return;

  Firebase.RTDB.setBool(&fbdo, MEDICINE_SENSOR_PATH, detected);
  lastPublishedMedicineDetected = detected;
  medicineSensorStatusInitialized = true;

  Serial.print("[Firebase] ");
  Serial.print(MEDICINE_SENSOR_PATH);
  Serial.print(" -> ");
  Serial.println(detected ? "true" : "false");
}

void pollMedicineSensorStatus() {
  if (millis() - lastIRStatusRead < IR_STATUS_POLL_MS) return;
  lastIRStatusRead = millis();

  publishMedicineSensorStatus(isMedicineDetectedByIR());
}

// ============================================================
// OLED: Get slot status string
// ============================================================
String getSlotStatus(int slotIdx) {
  if (jamDetected[slotIdx])      return "JAMMED";
  if (medicineDetected[slotIdx]) return "DONE";
  if (isDispensing[slotIdx])     return "RUNNING";
  if (activeSlot == slotIdx)     return "RUNNING";
  for (int i = queueHead; i < queueTail; i++) {
    if (dispenseQueue[i % 3] == slotIdx) return "QUEUED";
  }
  return "IDLE";
}

// ============================================================
// OLED: Get elapsed time string
// ============================================================
String getElapsed(int slotIdx) {
  if (!isDispensing[slotIdx]) return "";
  unsigned long elapsed = (millis() - dispenseStart[slotIdx]) / 1000;
  return String(elapsed) + "s";
}

// ============================================================
// OLED: Draw divider line
// ============================================================
void drawDivider(int y) {
  display.drawLine(0, y, 128, y);
}

// ============================================================
// OLED: Draw header
// ============================================================
void drawHeader() {
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 0, "MediStock");
  int qSize = queueTail - queueHead;
  display.drawString(100, 0, "Q:" + String(qSize));
  if (activeSlot != -1) {
    display.drawString(80, 0, ">" + String(activeSlot + 1));
  }
  drawDivider(12);
}

// ============================================================
// OLED: Draw slot row
// ============================================================
void drawSlotRow(int slotIdx, int y) {
  String label   = "S" + String(slotIdx + 1) + ":";
  String status  = getSlotStatus(slotIdx);
  String elapsed = getElapsed(slotIdx);

  display.setFont(ArialMT_Plain_10);
  display.drawString(0, y, label);

  int statusX = 20;

  if (status == "RUNNING") {
    display.drawRect(statusX - 1, y - 1, 48, 13);
    display.drawString(statusX + 1, y, status);
  } else if (status == "JAMMED") {
    display.fillRect(statusX - 1, y - 1, 48, 13);
    display.setColor(BLACK);
    display.drawString(statusX + 1, y, status);
    display.setColor(WHITE);
  } else {
    display.drawString(statusX, y, status);
  }

  if (elapsed != "") {
    display.drawString(90, y, elapsed);
  }

  if (status == "QUEUED") {
    int pos = 0;
    for (int i = queueHead; i < queueTail; i++) {
      if (dispenseQueue[i % 3] == slotIdx) {
        pos = i - queueHead + 1;
        break;
      }
    }
    display.drawString(100, y, "#" + String(pos));
  }
}

// ============================================================
// OLED: Draw date and time at bottom
// ============================================================
void drawDateTime() {
  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    display.setFont(ArialMT_Plain_10);
    display.drawString(0, 53, "Time: syncing...");
    return;
  }

  char dateBuf[20];
  char timeBuf[10];
  strftime(dateBuf, sizeof(dateBuf), "%a, %b %d %Y", &timeinfo);
  strftime(timeBuf, sizeof(timeBuf), "%H:%M:%S",      &timeinfo);

  display.setFont(ArialMT_Plain_10);
  display.drawString(0,  53, String(dateBuf));
  display.drawString(95, 53, String(timeBuf));
}

// ============================================================
// OLED: Setup
// ============================================================
void oledSetup() {
  display.init();
  display.flipScreenVertically();
  display.clear();
  display.setFont(ArialMT_Plain_10);
  display.drawString(0, 0,  "MediStock v3.2");
  display.drawString(0, 14, "Initializing...");
  display.display();

  configTime(GMT_OFFSET, DAYLIGHT, NTP_SERVER);

  Serial.print("[OLED] Syncing NTP time");
  struct tm timeinfo;
  unsigned long ntpStart = millis();
  while (!getLocalTime(&timeinfo)) {
    if (millis() - ntpStart >= 10000) {
      Serial.println("\n[OLED] NTP sync failed");
      break;
    }
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[OLED] NTP synced!");

  display.clear();
  display.drawString(0, 0,  "MediStock v3.2");
  display.drawString(0, 14, "Ready!");
  display.display();
  delay(1000);
}

// ============================================================
// OLED: Update every 500ms
// ============================================================
void oledUpdate() {
  if (millis() - lastOledUpdate < OLED_REFRESH_MS) return;
  lastOledUpdate = millis();

  display.clear();
  drawHeader();
  drawSlotRow(0, 15);
  drawSlotRow(1, 27);
  drawSlotRow(2, 39);
  drawDivider(51);
  drawDateTime();
  display.display();
}

// ============================================================
// FUNCTION: Enqueue a slot
// ============================================================
void enqueueSlot(int slotIdx) {
  if (slotIdx == activeSlot) {
    Serial.print("[Queue] Slot ");
    Serial.print(slotIdx + 1);
    Serial.println(" is already running, skipped.");
    return;
  }

  for (int i = queueHead; i < queueTail; i++) {
    if (dispenseQueue[i % 3] == slotIdx) {
      Serial.print("[Queue] Slot ");
      Serial.print(slotIdx + 1);
      Serial.println(" already in queue, skipped.");
      return;
    }
  }

  dispenseQueue[queueTail % 3] = slotIdx;
  queueTail++;

  Serial.print("[Queue] Slot ");
  Serial.print(slotIdx + 1);
  Serial.print(" added. Queue size: ");
  Serial.println(queueTail - queueHead);
}

// ============================================================
// FUNCTION: Process queue
// ============================================================
void processQueue() {
  if (activeSlot != -1) return;
  if (queueHead >= queueTail) return;

  int nextSlot = dispenseQueue[queueHead % 3];
  queueHead++;
  activeSlot = nextSlot;

  Serial.println("\n==========================================");
  Serial.print("[Queue] Starting Slot ");
  Serial.println(activeSlot + 1);
  Serial.println("==========================================");
}

// ============================================================
// FUNCTION: Push dispense START to Firebase
// ============================================================
void pushDispenseStart(int slotIdx) {
  if (!Firebase.ready()) return;

  int slot    = slotIdx + 1;
  String path = "/slots/slot" + String(slot);

  Firebase.RTDB.setString(&fbdo, path + "/status",            "dispensing");
  Firebase.RTDB.setBool(&fbdo,   path + "/is_running",        true);
  Firebase.RTDB.setBool(&fbdo,   path + "/medicine_detected", false);
  Firebase.RTDB.setBool(&fbdo,   path + "/jammed",            false);
  publishMedicineSensorStatus(isMedicineDetectedByIR());

  Serial.print("[Firebase] Slot ");
  Serial.print(slot);
  Serial.println(" status -> dispensing");
}

// ============================================================
// FUNCTION: Push dispense COMPLETE to Firebase
// ============================================================
void pushToFirebase(int slotIdx, String event, float reactionMs, String sensor) {
  if (!Firebase.ready()) return;

  int slot    = slotIdx + 1;
  String path = "/slots/slot" + String(slot);

  Firebase.RTDB.setString(&fbdo, path + "/status",             event);
  Firebase.RTDB.setBool(&fbdo,   path + "/is_running",         false);
  Firebase.RTDB.setBool(&fbdo,   path + "/medicine_detected",  true);
  Firebase.RTDB.setBool(&fbdo,   path + "/jammed",             false);
  Firebase.RTDB.setFloat(&fbdo,  path + "/last_reaction_ms",   reactionMs);
  Firebase.RTDB.setString(&fbdo, path + "/triggered_by",       sensor);
  Firebase.RTDB.setInt(&fbdo,    path + "/last_dispense_time", (int)(millis() / 1000));
  publishMedicineSensorStatus(true);

  FirebaseJson log;
  log.set("slot",        "slot" + String(slot));
  log.set("status",      event);
  log.set("sensor",      sensor);
  log.set("reaction_ms", reactionMs);
  log.set("timestamp_s", (int)(millis() / 1000));
  Firebase.RTDB.pushJSON(&fbdo, "/dispense_log", &log);

  Firebase.RTDB.setString(&fbdo, "/alerts/latest/type",        "DISPENSED");
  Firebase.RTDB.setString(&fbdo, "/alerts/latest/message",
                           "Medicine dispensed from Slot " + String(slot));
  Firebase.RTDB.setInt(&fbdo,    "/alerts/latest/timestamp_s", (int)(millis() / 1000));

  Serial.print("[Firebase] Push complete for Slot ");
  Serial.println(slot);
}

// ============================================================
// FUNCTION: Push JAM alert to Firebase
// ============================================================
void pushJamAlert(int slotIdx) {
  if (!Firebase.ready()) return;

  int slot    = slotIdx + 1;
  String path = "/slots/slot" + String(slot);

  Firebase.RTDB.setString(&fbdo, path + "/status",             "jammed");
  Firebase.RTDB.setBool(&fbdo,   path + "/is_running",         false);
  Firebase.RTDB.setBool(&fbdo,   path + "/medicine_detected",  false);
  Firebase.RTDB.setBool(&fbdo,   path + "/jammed",             true);
  Firebase.RTDB.setInt(&fbdo,    path + "/last_dispense_time", (int)(millis() / 1000));
  publishMedicineSensorStatus(isMedicineDetectedByIR());

  Firebase.RTDB.setString(&fbdo, "/alerts/latest/type",        "JAM");
  Firebase.RTDB.setString(&fbdo, "/alerts/latest/message",
                           "JAMMED - No medicine detected from Slot " + String(slot));
  Firebase.RTDB.setInt(&fbdo,    "/alerts/latest/timestamp_s", (int)(millis() / 1000));

  FirebaseJson log;
  log.set("slot",        "slot" + String(slot));
  log.set("status",      "jammed");
  log.set("sensor",      "none");
  log.set("reaction_ms", -1);
  log.set("timestamp_s", (int)(millis() / 1000));
  Firebase.RTDB.pushJSON(&fbdo, "/dispense_log", &log);

  Serial.print("[Firebase] Jam alert pushed for Slot ");
  Serial.println(slot);
}

// ============================================================
// FUNCTION: Stop Servo
// ============================================================
void stopServo(int slotIdx) {
  isDispensing[slotIdx] = false;

  if (servos[slotIdx]->attached()) {
    servos[slotIdx]->write(90);
    delay(50);
    servos[slotIdx]->detach();
  }

  pinMode(servoPins[slotIdx], OUTPUT);
  digitalWrite(servoPins[slotIdx], LOW);
  updateSlotIndicators(slotIdx);
  updateBuzzerState();

  if (activeSlot == slotIdx) activeSlot = -1;

  Serial.print("[Servo ");
  Serial.print(slotIdx + 1);
  Serial.print("] STOPPED | Elapsed: ");
  Serial.print(millis() - dispenseStart[slotIdx]);
  Serial.println(" ms");
}

// ============================================================
// FUNCTION: Start Servo
// ============================================================
void startDispense(int slotIdx) {
  isDispensing[slotIdx]     = true;
  medicineDetected[slotIdx] = false;
  jamDetected[slotIdx]      = false;
  dispenseStart[slotIdx]    = millis();

  if (!servos[slotIdx]->attached()) {
    servos[slotIdx]->attach(servoPins[slotIdx]);
    delay(15);
  }

  servos[slotIdx]->write(dispenseSpeed);
  updateSlotIndicators(slotIdx);
  updateBuzzerState();

  Serial.print("[Servo ");
  Serial.print(slotIdx + 1);
  Serial.print("] DISPENSING | write value: ");
  Serial.println(dispenseSpeed);

  pushDispenseStart(slotIdx);
}

// ============================================================
// FUNCTION: Print help
// ============================================================
void printHelp() {
  Serial.println("\n========== COMMANDS ==========");
  Serial.println("  1  -> QUEUE Slot 1");
  Serial.println("  2  -> QUEUE Slot 2");
  Serial.println("  3  -> QUEUE Slot 3");
  Serial.println("  Firebase /schedule times also auto-queue slots");
  Serial.println("  s  -> STOP all & CLEAR queue");
  Serial.println("  q  -> Show queue status");
  Serial.println("  h  -> Show this help menu");
  Serial.println("==============================\n");
}

// ============================================================
// FUNCTION: Print queue status
// ============================================================
void printQueueStatus() {
  Serial.println("\n--- Queue Status ---");
  Serial.print("Active Slot  : ");
  if (activeSlot == -1) Serial.println("None");
  else Serial.println(activeSlot + 1);

  Serial.print("Queue size   : ");
  Serial.println(queueTail - queueHead);

  for (int i = queueHead; i < queueTail; i++) {
    Serial.print("  Waiting -> Slot ");
    Serial.println(dispenseQueue[i % 3] + 1);
  }

  Serial.print("Sensor clear : ");
  Serial.println(sensorCleared ? "YES - ready" : "NO - waiting for clear");

  if (activeSlot != -1) {
    unsigned long elapsed   = millis() - dispenseStart[activeSlot];
    unsigned long remaining = (elapsed >= JAM_TIMEOUT_MS) ? 0 : (JAM_TIMEOUT_MS - elapsed);
    Serial.print("Jam timeout  : ");
    Serial.print(remaining / 1000);
    Serial.println("s remaining");
  }
  Serial.println("--------------------\n");
}

// ============================================================
// Firebase Schedule Helpers
// ============================================================
String readJsonString(FirebaseJson &json, const String &path, const String &fallback = "") {
  FirebaseJsonData data;
  if (!json.get(data, path)) return fallback;

  String value = data.stringValue;
  if (value.length() == 0) value = data.to<String>();
  value.trim();
  return value.length() > 0 ? value : fallback;
}

bool readJsonBool(FirebaseJson &json, const String &path, bool fallback) {
  FirebaseJsonData data;
  if (!json.get(data, path)) return fallback;
  return data.to<bool>();
}

int slotValueToIndex(String slotValue) {
  slotValue.trim();
  slotValue.toLowerCase();

  if (slotValue == "1" || slotValue == "slot1") return 0;
  if (slotValue == "2" || slotValue == "slot2") return 1;
  if (slotValue == "3" || slotValue == "slot3") return 2;
  return -1;
}

bool scheduleHasCurrentTime(FirebaseJson &scheduleJson, const String &currentTime) {
  for (int i = 0; i < 6; i++) {
    String timePath = "times/[" + String(i) + "]";
    String scheduledTime = readJsonString(scheduleJson, timePath);

    if (scheduledTime.length() == 0) {
      timePath = "times/" + String(i);
      scheduledTime = readJsonString(scheduleJson, timePath);
    }

    if (scheduledTime == currentTime) return true;
  }
  return false;
}

bool scheduleStarted(FirebaseJson &scheduleJson, const String &today) {
  String startDate = readJsonString(scheduleJson, "start_date");
  if (startDate.length() == 0) return true;
  return today >= startDate;
}

bool weeklyScheduleMatchesToday(FirebaseJson &scheduleJson, const String &currentDay) {
  String frequency = readJsonString(scheduleJson, "frequency", "daily");
  if (frequency != "weekly") return true;

  bool hasAnyDay = false;
  for (int i = 0; i < 7; i++) {
    String dayPath = "days/[" + String(i) + "]";
    String scheduledDay = readJsonString(scheduleJson, dayPath);

    if (scheduledDay.length() == 0) {
      dayPath = "days/" + String(i);
      scheduledDay = readJsonString(scheduleJson, dayPath);
    }

    if (scheduledDay.length() > 0) hasAnyDay = true;
    if (scheduledDay == currentDay) return true;
  }

  return !hasAnyDay;
}

void checkFirebaseSchedules() {
  if (millis() - lastSchedulePoll < SCHEDULE_POLL_MS) return;
  lastSchedulePoll = millis();

  if (!Firebase.ready()) return;

  struct tm timeinfo;
  if (!getLocalTime(&timeinfo)) {
    Serial.println("[Schedule] NTP time unavailable; skipping schedule check.");
    return;
  }

  char timeBuf[6];
  char dateBuf[11];
  char dayBuf[4];
  strftime(timeBuf, sizeof(timeBuf), "%H:%M", &timeinfo);
  strftime(dateBuf, sizeof(dateBuf), "%Y-%m-%d", &timeinfo);
  strftime(dayBuf, sizeof(dayBuf), "%a", &timeinfo);

  String currentTime = String(timeBuf);
  String today       = String(dateBuf);
  String currentDay  = String(dayBuf);

  if (!Firebase.RTDB.getJSON(&fbdo, "/schedule")) {
    Serial.print("[Schedule] Read failed: ");
    Serial.println(fbdo.errorReason());
    return;
  }

  FirebaseJson schedulesJson = fbdo.jsonObject();
  size_t count = schedulesJson.iteratorBegin();

  for (size_t i = 0; i < count; i++) {
    FirebaseJson::IteratorValue item = schedulesJson.valueAt(i);
    if (item.type != FIREBASE_JSON_OBJECT_TYPE) continue;

    FirebaseJson scheduleJson;
    scheduleJson.setJsonData(item.value);

    bool active = readJsonBool(scheduleJson, "active", true);
    if (!active) continue;

    String slotValue = readJsonString(scheduleJson, "slot");
    int slotIdx = slotValueToIndex(slotValue);
    if (slotIdx < 0) continue;

    if (!scheduleStarted(scheduleJson, today)) continue;
    if (!weeklyScheduleMatchesToday(scheduleJson, currentDay)) continue;
    if (!scheduleHasCurrentTime(scheduleJson, currentTime)) continue;

    String fireKey = today + "|" + currentTime + "|slot" + String(slotIdx + 1);
    if (lastScheduleFireKey[slotIdx] == fireKey) continue;

    lastScheduleFireKey[slotIdx] = fireKey;

    Serial.print("[Schedule] Matched ");
    Serial.print(currentTime);
    Serial.print(" -> QUEUE Slot ");
    Serial.println(slotIdx + 1);
    enqueueSlot(slotIdx);
  }

  schedulesJson.iteratorEnd();
}

// ============================================================
// SETUP
// ============================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n==========================================");
  Serial.println("  MediStock v3.2 - Queue + Debounce + Jam");
  Serial.println("==========================================");

  pinMode(IR1_PIN, INPUT_PULLUP);
  pinMode(IR2_PIN, INPUT_PULLUP);
  Serial.println("[IR] S1 (GPIO22) S2 (GPIO23) ready");

  for (int i = 0; i < 3; i++) {
    pinMode(greenLedPins[i], OUTPUT);
    pinMode(redLedPins[i], OUTPUT);
  }
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  for (int i = 0; i < 3; i++) stopServo(i);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("[WiFi] Connecting");
  unsigned long wifiStart = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - wifiStart >= 15000) {
      Serial.println("\n[WiFi] FAILED - Check SSID/Password");
      Serial.print("[WiFi] Status code: ");
      Serial.println(WiFi.status());
      while (true) delay(1000);
    }
    delay(500);
    Serial.print(".");
  }
  Serial.println("\n[WiFi] Connected! IP: " + WiFi.localIP().toString());

  config.host        = FIREBASE_HOST;
  config.api_key     = FIREBASE_API_KEY;
  auth.user.email    = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  Firebase.begin(&config, &auth);
  Firebase.reconnectWiFi(true);

  Serial.print("[Firebase] Authenticating");
  unsigned long fbStart = millis();
  while (auth.token.uid == "") {
    if (millis() - fbStart >= 15000) {
      Serial.println("\n[Firebase] Auth TIMEOUT - check credentials");
      break;
    }
    delay(300);
    Serial.print(".");
  }
  Serial.println("\n[Firebase] Authenticated!");

  Firebase.RTDB.setString(&fbdo, "/device/status",       "online");
  Firebase.RTDB.setInt(&fbdo,    "/device/wifi_strength", WiFi.RSSI());
  Firebase.RTDB.setInt(&fbdo,    "/device/boot_time_s",   (int)(millis() / 1000));
  publishMedicineSensorStatus(isMedicineDetectedByIR());

  for (int i = 0; i < 3; i++) {
    String path = "/slots/slot" + String(i + 1);
    Firebase.RTDB.setString(&fbdo, path + "/status",            "idle");
    Firebase.RTDB.setBool(&fbdo,   path + "/is_running",        false);
    Firebase.RTDB.setBool(&fbdo,   path + "/medicine_detected", false);
    Firebase.RTDB.setBool(&fbdo,   path + "/jammed",            false);
  }

  Serial.println("[Setup] Complete.\n");
  printHelp();

  oledSetup();
}

// ============================================================
// LOOP
// ============================================================
void loop() {

  // --- 0. Publish global IR state for dashboard dose tracking ---
  pollMedicineSensorStatus();

  // --- 1. Firebase schedule check ---
  checkFirebaseSchedules();

  // --- 2. Process queue ---
  if (activeSlot == -1 && queueHead < queueTail) {
    processQueue();
    if (activeSlot != -1) startDispense(activeSlot);
  }

  // --- 3. Serial Commands ---
  if (Serial.available()) {
    char input = Serial.read();

    if      (input == '1') { Serial.println("[CMD] QUEUE -> Slot 1"); enqueueSlot(0); }
    else if (input == '2') { Serial.println("[CMD] QUEUE -> Slot 2"); enqueueSlot(1); }
    else if (input == '3') { Serial.println("[CMD] QUEUE -> Slot 3"); enqueueSlot(2); }
    else if (input == 's' || input == 'S') {
      Serial.println("[CMD] STOP all & CLEAR queue");
      for (int i = 0; i < 3; i++) stopServo(i);
      queueHead     = 0;
      queueTail     = 0;
      activeSlot    = -1;
      sensorCleared = true;
      for (int i = 0; i < 3; i++) {
        dispenseQueue[i] = -1;
        jamDetected[i]   = false;
        medicineDetected[i] = false;
        updateSlotIndicators(i);
      }
      updateBuzzerState();
      Serial.println("[Queue] Cleared.");
    }
    else if (input == 'q' || input == 'Q') printQueueStatus();
    else if (input == 'h' || input == 'H') printHelp();
  }

  // --- 4. IR Sensor scan during active dispense (every 50ms) ---
  if (activeSlot != -1 && millis() - lastIRRead >= 50) {
    lastIRRead = millis();

    bool s1 = digitalRead(IR1_PIN);
    bool s2 = digitalRead(IR2_PIN);

    bool dropDetected = (s1 == LOW || s2 == LOW);

    if (!dropDetected) sensorCleared = true;

    Serial.print("[Sensor] S1: ");
    Serial.print(s1 == LOW ? "DETECTED" : "clear");
    Serial.print(" | S2: ");
    Serial.print(s2 == LOW ? "DETECTED" : "clear");
    Serial.print(" | SensorCleared: ");
    Serial.println(sensorCleared ? "YES" : "NO - waiting");

    if (dropDetected && sensorCleared && !medicineDetected[activeSlot] && !jamDetected[activeSlot]) {
      sensorCleared                = false;
      medicineDetected[activeSlot] = true;

      int justFinished = activeSlot;
      float reactionMs = millis() - dispenseStart[justFinished];
      String triggered = (s1 == LOW) ? "IR1_GPIO22" : "IR2_GPIO23";

      stopServo(justFinished);

      Serial.println("==========================================");
      Serial.print("[DETECTION] Slot ");
      Serial.print(justFinished + 1);
      Serial.print(" | Reaction: ");
      Serial.print(reactionMs);
      Serial.print(" ms | Sensor: ");
      Serial.println(triggered);
      Serial.print("[Queue] Remaining: ");
      Serial.println(queueTail - queueHead);
      Serial.println("==========================================\n");

      pushToFirebase(justFinished, "dispensed", reactionMs, triggered);
    }
  }

  // --- 5. Jam Detection ---
  if (activeSlot != -1 && isDispensing[activeSlot] && !jamDetected[activeSlot] && !medicineDetected[activeSlot]) {
    unsigned long elapsed = millis() - dispenseStart[activeSlot];

    if (elapsed >= JAM_TIMEOUT_MS) {
      jamDetected[activeSlot] = true;

      int jammedSlot = activeSlot;
      stopServo(jammedSlot);
      updateBuzzerState();

      Serial.println("==========================================");
      Serial.print("[JAM] Slot ");
      Serial.print(jammedSlot + 1);
      Serial.println(" - No medicine detected! JAMMED.");
      Serial.print("[Queue] Remaining: ");
      Serial.println(queueTail - queueHead);
      Serial.println("==========================================\n");

      pushJamAlert(jammedSlot);
      sensorCleared = true;
    }
  }

  // --- 6. Heartbeat every 30s ---
  if (millis() - lastHeartbeat >= 30000) {
    lastHeartbeat = millis();
    if (Firebase.ready()) {
      Firebase.RTDB.setString(&fbdo, "/device/status",       "online");
      Firebase.RTDB.setInt(&fbdo,    "/device/wifi_strength", WiFi.RSSI());
      Firebase.RTDB.setInt(&fbdo,    "/device/uptime_s",      (int)(millis() / 1000));
      Serial.println("[Heartbeat] Device status pushed to Firebase");
    }
  }

  // --- 7. OLED Update ---
  oledUpdate();
}
