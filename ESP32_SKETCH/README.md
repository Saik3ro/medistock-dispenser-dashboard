# MediStock ESP32 Firmware - Upload Instructions

## Quick Start Guide

### Option 1: Using PlatformIO (Recommended)

#### Prerequisites
1. Install [Visual Studio Code](https://code.visualstudio.com/)
2. Install [PlatformIO IDE Extension](https://platformio.org/install/ide?install=vscode)

#### Steps

1. **Open this folder in VS Code**
   ```bash
   code ESP32_SKETCH
   ```

2. **Update Configuration**
   - Open `medistock_esp32.ino`
   - Update WiFi and Firebase credentials (Lines 20-28):
     ```cpp
     #define WIFI_SSID "your_wifi_name"
     #define WIFI_PASSWORD "your_wifi_password"
     #define FIREBASE_HOST "https://your_project-default-rtdb.region.firebasedatabase.app"
     #define FIREBASE_API_KEY "AIzaSy..."
     #define USER_EMAIL "esp32@example.com"
     #define USER_PASSWORD "esp32_password"
     ```

3. **Get Firebase Credentials**
   - Go to [Firebase Console](https://console.firebase.google.com)
   - Select your project
   - Go to **Project Settings** → **Service Accounts**
   - Click **Database Secrets** tab
   - Copy the secret (this is your API_KEY)
   - Get Database URL from **Realtime Database** section

4. **Verify Hardware Connections**
   - Servo 1 → GPIO 14
   - Servo 2 → GPIO 15
   - Servo 3 → GPIO 16
   - IR Sensor 1 → GPIO 34 (ADC)
   - IR Sensor 2 → GPIO 35 (ADC)
   - IR Sensor 3 → GPIO 32 (ADC)
   - OLED SDA → GPIO 21
   - OLED SCL → GPIO 22

5. **Connect ESP32 to Computer**
   - Use micro-USB cable

6. **Build & Upload**
   - Click **Build** icon (checkmark) in PlatformIO toolbar
   - Click **Upload** icon (arrow) in PlatformIO toolbar
   - Or use keyboard shortcuts:
     - `Ctrl+Alt+B` (Build)
     - `Ctrl+Alt+U` (Upload)

7. **Monitor Serial Output**
   - Click **Serial Monitor** icon or press `Ctrl+Alt+A`
   - Should see connection logs

---

### Option 2: Using Arduino IDE

#### Prerequisites
1. Install [Arduino IDE](https://www.arduino.cc/en/software)
2. Add ESP32 board support

#### Steps

1. **Add ESP32 Board Support**
   - Go to **File** → **Preferences**
   - Add to "Additional Boards Manager URLs":
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```
   - Go to **Tools** → **Board Manager**
   - Search "esp32" and install "esp32 by Espressif Systems"

2. **Install Libraries**
   - **Sketch** → **Include Library** → **Manage Libraries**
   - Search and install:
     - `Firebase ESP8266 and ESP32` by Mobizt
     - `ESP32Servo`
     - `Adafruit SSD1306`
     - `Adafruit GFX Library`
     - `ArduinoJson`

3. **Open Sketch**
   - **File** → **Open** → Select `medistock_esp32.ino`

4. **Update Configuration**
   - Lines 20-28: Update WiFi and Firebase credentials

5. **Select Board**
   - **Tools** → **Board** → **ESP32** → **ESP32 Dev Module**
   - **Tools** → **Port** → Select COM port

6. **Upload**
   - Click **Upload** button (arrow icon)
   - Wait for "Leaving... Hard resetting via RTS pin..."

7. **Monitor**
   - **Tools** → **Serial Monitor** (9600 baud)

---

## Troubleshooting

### "Board not found"
- Check USB cable connection
- Install CH340 driver: https://sparks.gogo.co.nz/ch340.html
- Try different USB port

### "Firebase connection failed"
- Verify WiFi credentials are correct
- Check Firebase API key and database URL
- Make sure Firebase Database has correct security rules:
  ```json
  {
    "rules": {
      ".read": true,
      ".write": true
    }
  }
  ```

### "Serial monitor shows garbage"
- Ensure baud rate is **115200**

### "Compilation errors"
- Delete `.pio` folder and rebuild
- Ensure all libraries are installed

---

## Hardware Setup

### Wiring Diagram

```
ESP32 DevKit V1
┌─────────────────┐
│ 3V3  GND        │
│ EN   SVP        │ ← Programming pins
│                 │
│ GPIO14 ───┬──→  Servo 1 (Slot 1)
│ GPIO15 ───┼──→  Servo 2 (Slot 2)
│ GPIO16 ───┼──→  Servo 3 (Slot 3)
│           └──→  GND (all servos)
│                 
│ GPIO34 ─────→  IR Sensor 1
│ GPIO35 ─────→  IR Sensor 2
│ GPIO32 ─────→  IR Sensor 3
│ GND  ─────────→ All sensors
│                
│ GPIO21 (SDA) ──┐
│ GPIO22 (SCL) ──┼──→ OLED SSD1306
│ 3V3  ──────────┼─→  OLED Power
│ GND  ──────────┘─→  OLED GND
└─────────────────┘
```

### Component Requirements

- 3× SG90 Servo Motors (or similar)
- 3× IR Proximity Sensors (Analog output)
- 1× SSD1306 OLED Display (0.96" 128x64)
- ESP32 Development Board
- Micro-USB cable for programming

---

## Testing

Once uploaded:

1. **Watch Serial Monitor** - Should show initialization logs
2. **Check OLED Display** - Should show "Ready! Connected"
3. **Check Firebase** - Go to Firebase Console → Realtime Database
   - Should see `/device` with status "online"
   - Should see `/slots/slot1`, `/slots/slot2`, `/slots/slot3`

4. **Manual Test** - Uncomment this in `loop()` to test dispensing:
   ```cpp
   if (Serial.available() > 0) {
     int slot = Serial.read() - '0'; // 0, 1, or 2
     if (slot >= 0 && slot < 3) {
       dispenseFromSlot(slot);
     }
   }
   ```
   Then send `0`, `1`, or `2` via Serial Monitor

---

## Dashboard Integration

After uploading, the ESP32 will:

✅ Connect to WiFi  
✅ Authenticate with Firebase  
✅ Send device status every 30 seconds  
✅ Update slot data in real-time  
✅ Log all dispense events  
✅ Create alerts for jams and low stock  

Your React Dashboard should immediately show live data from the ESP32!

---

## Further Customization

### Change Dispense Angle
Line 37:
```cpp
const int DISPENSE_ANGLE = 120;  // Change this value (0-180)
```

### Change Servo Speed
Line 38:
```cpp
const int DISPENSE_SPEED = 45;   // Degrees per update
```

### Change IR Sensor Threshold
Line 40:
```cpp
const int IR_THRESHOLD = 2000;   // Adjust based on your sensors
```

### Change Heartbeat Interval
Line 41:
```cpp
const int HEARTBEAT_INTERVAL = 30000;  // Milliseconds
```

---

## Support

For issues:
1. Check Serial Monitor output
2. Verify all credentials in configuration
3. Check Firebase database structure
4. Review INTEGRATION_GUIDE.md in parent directory
