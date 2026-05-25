// ============================================================
// MediStock ESP32 Firmware - Complete Ready-to-Upload Sketch
// Connects to Firebase and syncs with Dashboard
// ============================================================

#include <WiFi.h>
#include <Firebase_ESP_Client.h>
#include <addons/TokenHelper.h>
#include <addons/RTDBHelper.h>
#include <ESP32Servo.h>
#include <time.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_GFX.h>

// ============================================================
// ⚠️ CONFIGURATION - UPDATE THESE VALUES ⚠️
// ============================================================

// WiFi Configuration
#define WIFI_SSID "your_wifi_name"
#define WIFI_PASSWORD "your_wifi_password"

// Firebase Configuration
#define FIREBASE_HOST "https://your_project-default-rtdb.region.firebasedatabase.app"
#define FIREBASE_API_KEY "AIzaSy..."
#define USER_EMAIL "esp32@example.com"
#define USER_PASSWORD "esp32_password"

// Hardware Pins
#define SERVO_PIN_1 14      // Slot 1 servo
#define SERVO_PIN_2 15      // Slot 2 servo
#define SERVO_PIN_3 16      // Slot 3 servo
#define IR_SENSOR_1 34      // Slot 1 IR sensor (ADC pin)
#define IR_SENSOR_2 35      // Slot 2 IR sensor (ADC pin)
#define IR_SENSOR_3 32      // Slot 3 IR sensor (ADC pin)
#define OLED_SDA 21         // I2C SDA
#define OLED_SCL 22         // I2C SCL

// OLED Display
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDR 0x3C

// ============================================================
// Global Variables
// ============================================================

FirebaseData fbdo;
FirebaseAuth auth;
FirebaseConfig config;
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

Servo servo1, servo2, servo3;
Servo servos[3] = {servo1, servo2, servo3};

// Hardware settings
const int DISPENSE_ANGLE = 120;      // Angle to dispense
const int HOME_ANGLE = 0;            // Home position
const int DISPENSE_SPEED = 45;       // Degrees per update
const int JAM_TIMEOUT_MS = 5000;     // Timeout for jam detection
const int HEARTBEAT_INTERVAL = 30000; // 30 seconds
const int IR_THRESHOLD = 2000;       // Analog threshold for IR sensor
const char* NTP_SERVER = "pool.ntp.org";
const char* TIMEZONE = "Asia/Manila";

// State tracking
unsigned long lastHeartbeat = 0;
unsigned long lastScheduleCheck = 0;
bool isWiFiConnected = false;
bool isFirebaseConnected = false;
int currentSlotDispensing = -1;
unsigned long dispenseStartTime = 0;

struct SlotState {
  int medicineDetected;
  float lastReactionMs;
  String triggeredBy;
  int stockCurrent;
  int stockMax;
  String medicationName;
  String status;
} slotStates[3];

// ============================================================
// Setup Functions
// ============================================================

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n\n=== MediStock ESP32 Initialization ===");

  // Initialize OLED
  initializeDisplay();
  displayMessage("Initializing...", "MediStock ESP32");

  // Initialize servos
  initializeServos();

  // Initialize sensors
  initializeSensors();

  // Connect to WiFi
  connectToWiFi();

  // Initialize Firebase
  initializeFirebase();

  // Set NTP for time sync
  setNTP();

  displayMessage("Ready!", "Connected");
  Serial.println("Setup complete!");
}

void initializeDisplay() {
  if (!display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR)) {
    Serial.println("SSD1306 allocation failed");
    while (1);
  }
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.clearDisplay();
  display.display();
}

void displayMessage(const char* line1, const char* line2) {
  display.clearDisplay();
  display.setTextSize(2);
  display.setCursor(0, 0);
  display.println(line1);
  display.setTextSize(1);
  display.setCursor(0, 20);
  display.println(line2);
  display.display();
}

void initializeServos() {
  servo1.setPeriodHertz(50);
  servo2.setPeriodHertz(50);
  servo3.setPeriodHertz(50);

  servo1.attach(SERVO_PIN_1, 500, 2500);
  servo2.attach(SERVO_PIN_2, 500, 2500);
  servo3.attach(SERVO_PIN_3, 500, 2500);

  servo1.write(HOME_ANGLE);
  servo2.write(HOME_ANGLE);
  servo3.write(HOME_ANGLE);

  Serial.println("[Setup] Servos initialized");
}

void initializeSensors() {
  pinMode(IR_SENSOR_1, INPUT);
  pinMode(IR_SENSOR_2, INPUT);
  pinMode(IR_SENSOR_3, INPUT);
  Serial.println("[Setup] IR sensors initialized");
}

void connectToWiFi() {
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);
  displayMessage("WiFi...", "Connecting");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    isWiFiConnected = true;
    displayMessage("WiFi OK", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("\nFailed to connect to WiFi!");
    displayMessage("WiFi Failed", "Check credentials");
    while (1) delay(1000);
  }
}

void setNTP() {
  configTime(0, 0, NTP_SERVER);
  Serial.println("Waiting for NTP time sync...");
  
  time_t now = time(nullptr);
  int attempts = 0;
  while (now < 24 * 3600 && attempts < 30) {
    delay(500);
    Serial.print(".");
    now = time(nullptr);
    attempts++;
  }
  Serial.println();
  Serial.print("Current time: ");
  Serial.println(ctime(&now));
}

void initializeFirebase() {
  Serial.println("Initializing Firebase...");
  displayMessage("Firebase...", "Connecting");

  config.api_key = FIREBASE_API_KEY;
  auth.user.email = USER_EMAIL;
  auth.user.password = USER_PASSWORD;
  config.database_url = FIREBASE_HOST;

  Firebase.reconnectNetwork(true);
  fbdo.setResponseSize(4096);
  config.token_status_callback = tokenStatusCallback;

  Firebase.begin(&config, &auth);

  // Wait for Firebase connection
  int attempts = 0;
  while (!Firebase.ready() && attempts < 30) {
    delay(500);
    Serial.print(".");
    attempts++;
  }

  if (Firebase.ready()) {
    Serial.println("\nFirebase connected!");
    isFirebaseConnected = true;
    initializeFirebaseDevice();
    initializeSlots();
    displayMessage("Firebase OK", "Ready to sync");
  } else {
    Serial.println("\nFirebase connection failed!");
    displayMessage("Firebase Failed", "Retrying...");
  }
}

void tokenStatusCallback(token_info_t info) {
  if (info.status == token_status_ready) {
    Serial.println("\nToken ready");
  } else if (info.status == token_status_expired) {
    Serial.println("Token expired");
  } else if (info.status == token_status_error) {
    Serial.print("Token error: ");
    Serial.println(info.error.message.c_str());
  }
}

// ============================================================
// Main Loop
// ============================================================

void loop() {
  // Check WiFi connection
  if (WiFi.status() != WL_CONNECTED) {
    connectToWiFi();
  }

  // Reconnect Firebase if needed
  if (!Firebase.ready() && isWiFiConnected) {
    Firebase.begin(&config, &auth);
  }

  // Periodic tasks
  unsigned long now = millis();

  // Send heartbeat every 30 seconds
  if (now - lastHeartbeat > HEARTBEAT_INTERVAL) {
    sendDeviceHeartbeat();
    lastHeartbeat = now;
  }

  // Check schedule every 10 seconds
  if (now - lastScheduleCheck > 10000) {
    checkScheduleForDispensing();
    lastScheduleCheck = now;
  }

  // Read sensors and update states
  readSensors();

  // Update display with current status
  updateDisplay();

  delay(100);
}

// ============================================================
// Sensor Reading
// ============================================================

void readSensors() {
  for (int i = 0; i < 3; i++) {
    int sensorPin = (i == 0) ? IR_SENSOR_1 : (i == 1) ? IR_SENSOR_2 : IR_SENSOR_3;
    int reading = analogRead(sensorPin);

    slotStates[i].medicineDetected = (reading > IR_THRESHOLD) ? 1 : 0;
  }
}

void updateDisplay() {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  // Line 1: Device status
  display.setCursor(0, 0);
  display.print("MediStock | ");
  display.print(WiFi.RSSI());
  display.println(" dBm");

  // Line 2-4: Slot status
  for (int i = 0; i < 3; i++) {
    display.setCursor(0, 12 + (i * 12));
    display.print("Slot ");
    display.print(i + 1);
    display.print(": ");
    display.print(slotStates[i].medicationName.substring(0, 15).c_str());
    display.print(" [");
    display.print(slotStates[i].stockCurrent);
    display.print("/");
    display.print(slotStates[i].stockMax);
    display.println("]");
  }

  display.display();
}

// ============================================================
// Firebase Device Functions
// ============================================================

void initializeFirebaseDevice() {
  if (!Firebase.ready()) return;

  FirebaseJson deviceConfig;
  deviceConfig.set("device_id", "medistock-esp32-001");
  deviceConfig.set("status", "online");
  deviceConfig.set("last_heartbeat", (int)(millis() / 1000));
  deviceConfig.set("wifi_strength", WiFi.RSSI());
  deviceConfig.set("uptime_s", (int)(millis() / 1000));
  deviceConfig.set("version", "3.2");

  Firebase.RTDB.set(&fbdo, "/device", &deviceConfig);

  FirebaseJson settings;
  settings.set("dispense_speed", DISPENSE_SPEED);
  settings.set("jam_timeout_ms", JAM_TIMEOUT_MS);
  settings.set("ir_sensitivity", 100);
  settings.set("auto_reorder_threshold", 20);
  settings.set("timezone", TIMEZONE);

  Firebase.RTDB.set(&fbdo, "/device/settings", &settings);

  Serial.println("[Firebase] Device initialized");
}

void initializeSlots() {
  if (!Firebase.ready()) return;

  for (int i = 1; i <= 3; i++) {
    String slotPath = "/slots/slot" + String(i);

    FirebaseJson slotData;
    slotData.set("slot_number", i);
    slotData.set("medication_name", "");
    slotData.set("dosage", "");
    slotData.set("stock_current", 0);
    slotData.set("stock_max", 100);
    slotData.set("status", "empty");
    slotData.set("is_running", false);
    slotData.set("medicine_detected", false);
    slotData.set("jammed", false);

    Firebase.RTDB.set(&fbdo, slotPath, &slotData);
  }

  Serial.println("[Firebase] All slots initialized");
}

void sendDeviceHeartbeat() {
  if (!Firebase.ready()) {
    Serial.println("[Heartbeat] Firebase not ready");
    return;
  }

  unsigned long uptime = millis() / 1000;

  Firebase.RTDB.setString(&fbdo, "/device/status", "online");
  Firebase.RTDB.setInt(&fbdo, "/device/last_heartbeat", (int)(millis() / 1000));
  Firebase.RTDB.setInt(&fbdo, "/device/wifi_strength", WiFi.RSSI());
  Firebase.RTDB.setInt(&fbdo, "/device/uptime_s", (int)uptime);

  Serial.println("[Heartbeat] Device status updated");
}

void checkScheduleForDispensing() {
  if (!Firebase.ready()) return;

  // This would check Firebase /schedule entries
  // and automatically trigger dispensing at scheduled times
  // Implementation depends on your specific requirements
}

void pushDispenseStart(int slotIdx) {
  if (!Firebase.ready()) return;

  int slot = slotIdx + 1;
  String path = "/slots/slot" + String(slot);

  Firebase.RTDB.setString(&fbdo, path + "/status", "active");
  Firebase.RTDB.setBool(&fbdo, path + "/is_running", true);
  Firebase.RTDB.setBool(&fbdo, path + "/medicine_detected", false);
  Firebase.RTDB.setInt(&fbdo, path + "/last_dispense", (int)(millis() / 1000));

  Serial.print("[Firebase] Slot ");
  Serial.print(slot);
  Serial.println(" dispensing started");
}

void pushDispenseComplete(int slotIdx, float reactionMs, String sensorTriggered) {
  if (!Firebase.ready()) return;

  int slot = slotIdx + 1;
  String slotPath = "/slots/slot" + String(slot);

  Firebase.RTDB.setString(&fbdo, slotPath + "/status", "active");
  Firebase.RTDB.setBool(&fbdo, slotPath + "/is_running", false);
  Firebase.RTDB.setBool(&fbdo, slotPath + "/medicine_detected", true);
  Firebase.RTDB.setFloat(&fbdo, slotPath + "/last_reaction_ms", reactionMs);
  Firebase.RTDB.setString(&fbdo, slotPath + "/triggered_by", sensorTriggered);
  Firebase.RTDB.setInt(&fbdo, slotPath + "/last_dispense", (int)(millis() / 1000));

  // Log dispense event
  FirebaseJson dispenseLogEntry;
  dispenseLogEntry.set("slot", slot);
  dispenseLogEntry.set("status", "dispensed");
  dispenseLogEntry.set("reaction_ms", reactionMs);
  dispenseLogEntry.set("timestamp", (long)(time(nullptr) * 1000));
  dispenseLogEntry.set("triggered_by", "manual");

  Firebase.RTDB.pushJSON(&fbdo, "/dispense_log", &dispenseLogEntry);

  Serial.print("[Firebase] Dispense complete for Slot ");
  Serial.print(slot);
  Serial.println();
}

void pushJamAlert(int slotIdx) {
  if (!Firebase.ready()) return;

  int slot = slotIdx + 1;
  String slotPath = "/slots/slot" + String(slot);

  Firebase.RTDB.setString(&fbdo, slotPath + "/status", "empty");
  Firebase.RTDB.setBool(&fbdo, slotPath + "/is_running", false);
  Firebase.RTDB.setBool(&fbdo, slotPath + "/jammed", true);

  FirebaseJson jamAlert;
  jamAlert.set("type", "JAM");
  jamAlert.set("slot", slot);
  jamAlert.set("message", "Jam detected in Slot " + String(slot));
  jamAlert.set("severity", "critical");
  jamAlert.set("timestamp", (long)(time(nullptr) * 1000));
  jamAlert.set("resolved", false);

  Firebase.RTDB.set(&fbdo, "/alerts/latest", &jamAlert);
  Firebase.RTDB.pushJSON(&fbdo, "/alerts/history", &jamAlert);

  Serial.print("[Firebase] Jam alert for Slot ");
  Serial.println(slot);
}

void updateSlotStockStatus(int slotIdx, int currentStock, int maxStock) {
  if (!Firebase.ready()) return;

  int slot = slotIdx + 1;
  String path = "/slots/slot" + String(slot);

  String status = "active";
  if (currentStock <= 0) {
    status = "empty";
  } else if (currentStock <= 10 || (float)currentStock / maxStock <= 0.2) {
    status = "low_stock";
  }

  Firebase.RTDB.setInt(&fbdo, path + "/stock_current", currentStock);
  Firebase.RTDB.setInt(&fbdo, path + "/stock_max", maxStock);
  Firebase.RTDB.setString(&fbdo, path + "/status", status);

  Serial.print("[Stock] Slot ");
  Serial.print(slot);
  Serial.print(": ");
  Serial.print(currentStock);
  Serial.print("/");
  Serial.println(maxStock);
}

// ============================================================
// Servo Control Functions
// ============================================================

void dispenseFromSlot(int slotIdx) {
  if (slotIdx < 0 || slotIdx > 2) return;

  Serial.print("Dispensing from Slot ");
  Serial.println(slotIdx + 1);

  Servo& servo = servos[slotIdx];
  pushDispenseStart(slotIdx);

  // Move servo to dispense position
  servo.write(DISPENSE_ANGLE);
  delay(500);

  // Check for medicine detection
  unsigned long startTime = millis();
  bool medicineDetected = false;

  while (millis() - startTime < JAM_TIMEOUT_MS) {
    readSensors();
    if (slotStates[slotIdx].medicineDetected) {
      medicineDetected = true;
      break;
    }
    delay(50);
  }

  // Return servo to home
  servo.write(HOME_ANGLE);
  delay(300);

  float reactionTime = medicineDetected ? (float)(millis() - startTime) : -1;

  if (medicineDetected) {
    pushDispenseComplete(slotIdx, reactionTime, "IR_GPIO");
    Serial.println("Dispense successful!");
  } else {
    pushJamAlert(slotIdx);
    Serial.println("Jam detected!");
  }
}

// ============================================================
// Utility Functions
// ============================================================

String getSlotStatus(int slotIdx) {
  return slotStates[slotIdx].status;
}

void setSlotData(int slotIdx, String medName, String dosage, int stockCur, int stockMax) {
  slotStates[slotIdx].medicationName = medName;
  slotStates[slotIdx].stockCurrent = stockCur;
  slotStates[slotIdx].stockMax = stockMax;
}
