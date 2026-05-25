# ESP32 Quick Reference - MediStock Dispenser

## File Overview

```
ESP32_SKETCH/
├── medistock_esp32.ino      ← Main sketch (upload this)
├── platformio.ini           ← Build configuration for PlatformIO
└── README.md                ← Full setup instructions
```

## Key Configuration (Lines 20-28)

```cpp
#define WIFI_SSID "your_wifi_name"
#define WIFI_PASSWORD "your_wifi_password"
#define FIREBASE_HOST "https://your_project-default-rtdb.region.firebasedatabase.app"
#define FIREBASE_API_KEY "AIzaSy..."
#define USER_EMAIL "esp32@example.com"
#define USER_PASSWORD "esp32_password"
```

## Hardware Pin Mapping

| Component | GPIO | Type |
|-----------|------|------|
| Servo 1 (Slot 1) | 14 | Output |
| Servo 2 (Slot 2) | 15 | Output |
| Servo 3 (Slot 3) | 16 | Output |
| IR Sensor 1 | 34 | Analog Input |
| IR Sensor 2 | 35 | Analog Input |
| IR Sensor 3 | 32 | Analog Input |
| OLED SDA | 21 | I2C Data |
| OLED SCL | 22 | I2C Clock |

## Main Functions

### Core Setup
- `setup()` - Initialization (runs once)
- `loop()` - Main program (runs continuously)

### Firebase Functions
- `initializeFirebase()` - Connect to Firebase
- `initializeFirebaseDevice()` - Register device
- `initializeSlots()` - Setup slot data structure
- `sendDeviceHeartbeat()` - Keep-alive signal (every 30s)
- `checkScheduleForDispensing()` - Check for scheduled dispenses

### Servo Control
- `dispenseFromSlot(int slotIdx)` - Dispense from slot (0, 1, or 2)
- `servos[slotIdx].write(angle)` - Move servo directly

### Sensor Reading
- `readSensors()` - Read all IR sensors
- `slotStates[idx].medicineDetected` - Get sensor state

### Firebase Logging
- `pushDispenseStart(int slotIdx)` - Log dispense start
- `pushDispenseComplete(int slotIdx, float ms, String sensor)` - Log success
- `pushJamAlert(int slotIdx)` - Log jam alert
- `updateSlotStockStatus(int idx, int current, int max)` - Update stock

### Display
- `displayMessage(const char* line1, const char* line2)` - Show on OLED

## Testing Commands (Via Serial Monitor)

### Check Device Status
```
Send: status
Shows: Device is online/offline, WiFi RSSI, Firebase status
```

### Test Servo (Uncomment in loop() first)
```
Send: 0  (Dispense from Slot 1)
Send: 1  (Dispense from Slot 2)
Send: 2  (Dispense from Slot 3)
```

### View Slot Data
```
Send: slots
Shows: All slot data from Firebase
```

## Expected Serial Output

### Successful Startup
```
=== MediStock ESP32 Initialization ===
[Setup] Servos initialized
[Setup] IR sensors initialized
Connecting to WiFi: MyNetwork
WiFi connected!
IP address: 192.168.1.100
Initializing Firebase...
Token ready
Firebase connected!
[Firebase] Device initialized
[Firebase] All slots initialized
Setup complete!
```

### Running
```
[Heartbeat] Device status updated
[Firebase] Dispensing starts...
[Firebase] Dispense complete for Slot 1
```

## Troubleshooting Checklist

### WiFi Not Connecting
- [ ] Check SSID and password are correct
- [ ] WiFi is 2.4GHz (ESP32 doesn't support 5GHz)
- [ ] Router is powered on
- [ ] Try moving closer to router

### Firebase Not Connecting
- [ ] Check API key is correct
- [ ] Check database URL format
- [ ] Check email/password credentials
- [ ] Database security rules allow read/write:
  ```json
  {
    "rules": {
      ".read": true,
      ".write": true
    }
  }
  ```

### Servo Not Moving
- [ ] Check GPIO pins are correct
- [ ] Check servo power supply (5V, 2A minimum for 3 servos)
- [ ] Try moving servo manually to verify it works
- [ ] Check servo PWM frequency (should be 50Hz)

### IR Sensor Not Working
- [ ] Check analog pins (34, 35, 32) - no pull-up/pull-down
- [ ] Verify sensor has power and ground
- [ ] Check IR_THRESHOLD value (2000) matches your sensors
- [ ] Print sensor readings to Serial Monitor for debugging

### OLED Not Showing
- [ ] Check I2C address (0x3C default)
- [ ] Verify SDA (21) and SCL (22) connections
- [ ] Scan I2C devices: Load example from Adafruit library

## Common Modifications

### Disable OLED (Save memory)
Comment out line 96:
```cpp
// display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDR);
```

### Change Dispense Angle
```cpp
const int DISPENSE_ANGLE = 120;  // Change this (0-180)
```

### Increase Heartbeat Frequency
```cpp
const int HEARTBEAT_INTERVAL = 10000;  // 10 seconds instead of 30
```

### Add Serial Commands Handler
Insert in `loop()`:
```cpp
if (Serial.available() > 0) {
  String command = Serial.readStringUntil('\n');
  if (command == "dispense1") {
    dispenseFromSlot(0);
  } else if (command == "dispense2") {
    dispenseFromSlot(1);
  } else if (command == "dispense3") {
    dispenseFromSlot(2);
  }
}
```

## Firebase Data Structure

```
/device
  ├── device_id: "medistock-esp32-001"
  ├── status: "online"
  ├── last_heartbeat: 1719456123
  ├── wifi_strength: -45
  ├── uptime_s: 3600
  └── settings
      ├── dispense_speed: 45
      └── jam_timeout_ms: 5000

/slots
  ├── slot1
  │   ├── medication_name: "Aspirin"
  │   ├── stock_current: 45
  │   ├── stock_max: 100
  │   └── status: "active"
  ├── slot2 { ... }
  └── slot3 { ... }

/schedule
  └── (entries for dispensing times)

/dispense_log
  └── (all dispense events)

/alerts
  ├── latest: { ... }
  └── history: { ... }
```

## Debug Mode

Uncomment line 16 in vite.config.js to see Serial output:
```
Serial.println("[DEBUG] Message here");
```

View in Serial Monitor at 115200 baud.

## Libraries Used

- **firebase-esp-client** - Firebase connectivity
- **ESP32Servo** - Servo motor control
- **Adafruit SSD1306** - OLED display
- **Adafruit GFX** - Graphics library
- **WiFi** - Built-in, no install needed
- **time** - Built-in, no install needed

## Important Notes

⚠️ **Power Supply**: Servos need 5V @ 2A minimum
- Use separate power supply for servos
- Do NOT power from ESP32's 5V pin alone

⚠️ **WiFi**: ESP32 only supports 2.4GHz networks
- Not compatible with 5GHz-only routers

⚠️ **Firebase Rules**: Default rules are read/write for all
- Use proper authentication in production
- Restrict access by user/device in security rules

⚠️ **Update Interval**: Heartbeat every 30 seconds
- Reduce for faster response, increase to save bandwidth
- Change HEARTBEAT_INTERVAL constant

## Next Steps

1. ✅ Update WiFi/Firebase credentials
2. ✅ Connect hardware (servos, sensors, OLED)
3. ✅ Upload sketch via PlatformIO or Arduino IDE
4. ✅ Monitor Serial output
5. ✅ Verify Firebase data appears in console
6. ✅ View live data in React Dashboard
7. ✅ Test manual dispense via dashboard
8. ✅ Configure schedules in dashboard

## Support Resources

- [Firebase ESP Client Documentation](https://github.com/mobizt/Firebase-ESP-Client)
- [ESP32 Development Guide](https://docs.espressif.com/projects/esp-idf/en/latest/esp32/)
- [Arduino Reference](https://www.arduino.cc/reference/en/)
- [Adafruit SSD1306 Library](https://github.com/adafruit/Adafruit_SSD1306)
