# MediStock ESP32 - Complete Setup Guide

## 📋 Overview

You now have a complete ESP32 firmware package to connect your MediStock hardware to the Firebase-connected dashboard. Follow this guide to get your dispenser online.

---

## 📂 What You Have

```
ESP32_SKETCH/
├── medistock_esp32.ino         ← Upload THIS file
├── platformio.ini              ← Build configuration
├── README.md                   ← Detailed setup instructions
├── QUICK_REFERENCE.md          ← Function reference & debugging
├── HARDWARE_SETUP.md           ← Wiring diagrams & pin mapping
└── SETUP_CHECKLIST.md          ← This file
```

---

## 🎯 Quick Start (5 Steps)

### Step 1: Get Firebase Credentials ⏱️ 5 min

1. Go to https://console.firebase.google.com
2. Select your project
3. Click **Project Settings** (gear icon) → **Service Accounts**
4. Copy the **Database Secret** - this is your `FIREBASE_API_KEY`
5. Go to **Realtime Database** and copy the URL - this is your `FIREBASE_HOST`

### Step 2: Update Code ⏱️ 2 min

Open `ESP32_SKETCH/medistock_esp32.ino` and update lines 20-28:

```cpp
#define WIFI_SSID "your_wifi_name"
#define WIFI_PASSWORD "your_wifi_password"
#define FIREBASE_HOST "https://your-project-default-rtdb.region.firebasedatabase.app"
#define FIREBASE_API_KEY "AIzaSy1234567890..."
#define USER_EMAIL "esp32@example.com"
#define USER_PASSWORD "esp32_password_123"
```

### Step 3: Setup Hardware ⏱️ 15 min

Follow [HARDWARE_SETUP.md](HARDWARE_SETUP.md):
- Connect 3 servos to GPIO 14, 15, 16
- Connect 3 IR sensors to GPIO 34, 35, 32
- Connect OLED to GPIO 21, 22
- Wire all grounds together
- Connect external 5V power supply

### Step 4: Upload Firmware ⏱️ 5 min

**Option A: PlatformIO (Recommended)**
```bash
# Install VS Code + PlatformIO extension
# Open ESP32_SKETCH folder in VS Code
# Click "Build" then "Upload"
```

**Option B: Arduino IDE**
```bash
# Open medistock_esp32.ino in Arduino IDE
# Select Tools > Board > ESP32 Dev Module
# Click Upload
```

### Step 5: Verify Connection ⏱️ 2 min

1. Open Serial Monitor (115200 baud)
2. Should see "Firebase connected!" message
3. Go to Firebase Console → Realtime Database
4. Should see `/device` with status "online"
5. Open dashboard at http://localhost:5174/inventory
6. Should see real-time slot data!

---

## 📚 Detailed Setup Guides

| Document | Purpose | Time |
|----------|---------|------|
| [README.md](README.md) | Complete step-by-step setup | 20 min |
| [HARDWARE_SETUP.md](HARDWARE_SETUP.md) | Wiring, pins, power | 15 min |
| [QUICK_REFERENCE.md](QUICK_REFERENCE.md) | Functions, debugging | 5 min |

---

## 🔌 Hardware Verification

Before uploading, verify connections:

```
ESP32 Pins Check:
□ GPIO14 → Servo 1 Signal
□ GPIO15 → Servo 2 Signal  
□ GPIO16 → Servo 3 Signal
□ GPIO34 → IR Sensor 1
□ GPIO35 → IR Sensor 2
□ GPIO32 → IR Sensor 3
□ GPIO21 → OLED SDA
□ GPIO22 → OLED SCL
□ GND    → All grounds connected
□ 5V PSU → All servo power rails
```

---

## 📱 Firebase Setup

### 1. Database Structure (Auto-created by ESP32)

The firmware will automatically create this structure:

```json
{
  "device": {
    "device_id": "medistock-esp32-001",
    "status": "online",
    "last_heartbeat": 1234567890,
    "wifi_strength": -45,
    "settings": { ... }
  },
  "slots": {
    "slot1": { "medication_name": "", "stock_current": 0 },
    "slot2": { "medication_name": "", "stock_current": 0 },
    "slot3": { "medication_name": "", "stock_current": 0 }
  },
  "schedule": { },
  "dispense_log": { },
  "alerts": { },
  "inventory_log": { }
}
```

### 2. Security Rules (For Development)

Go to Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    ".read": true,
    ".write": true
  }
}
```

⚠️ **Note:** This is insecure. Use proper auth in production.

---

## ✅ Upload Instructions

### Using PlatformIO (Recommended)

1. **Install:**
   - Download [VS Code](https://code.visualstudio.com/)
   - Install PlatformIO IDE extension

2. **Setup:**
   ```bash
   code ESP32_SKETCH
   ```

3. **Configure:**
   - Edit `medistock_esp32.ino` (WiFi & Firebase credentials)
   - Edit `platformio.ini` if using different ESP32 board

4. **Build:**
   - Click ✓ icon or `Ctrl+Alt+B`

5. **Upload:**
   - Click → icon or `Ctrl+Alt+U`

6. **Monitor:**
   - Click Serial Monitor or `Ctrl+Alt+A`

### Using Arduino IDE

1. **Install:**
   - Download [Arduino IDE](https://www.arduino.cc/en/software)
   - Add ESP32 boards: File → Preferences → Add URL:
     ```
     https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json
     ```

2. **Install Libraries:** Sketch → Include Library → Manage Libraries
   - Search: `firebase esp8266 and esp32` → Install
   - Search: `esp32servo` → Install
   - Search: `adafruit ssd1306` → Install
   - Search: `adafruit gfx` → Install

3. **Configure:**
   - Edit `medistock_esp32.ino`

4. **Select Board:** Tools → Board → ESP32 → ESP32 Dev Module

5. **Upload:** Click Upload button

---

## 🧪 Testing Checklist

After uploading, verify each step:

```
□ Serial Monitor shows:
  □ "=== MediStock ESP32 Initialization ==="
  □ "[Setup] Servos initialized"
  □ "[Setup] IR sensors initialized"
  □ "Connecting to WiFi..."
  □ "WiFi connected!"
  □ "Firebase connected!"

□ OLED Display shows:
  □ "Initializing..." during boot
  □ "WiFi OK" after connecting
  □ "Firebase OK" after authentication
  □ Real-time slot status and stock levels

□ Firebase Console shows:
  □ /device → status: "online"
  □ /device → uptime_s increasing
  □ /device → last_heartbeat updating
  □ /slots/slot1-3 → with your data

□ Dashboard (http://localhost:5174) shows:
  □ Slot cards with data
  □ Real-time updates when you refresh
  □ Edit button works on slot cards
```

---

## 🔧 Troubleshooting

### "Board not found" during upload
- Install CH340 driver: https://sparks.gogo.co.nz/ch340.html
- Try different USB port
- Check cable is data cable (not charging-only)

### "Firebase connection failed"
- Check WiFi credentials
- Verify FIREBASE_API_KEY is correct
- Ensure Firebase Database URL is complete with https://
- Check database security rules allow read/write

### "Servo doesn't move"
- Verify GPIO pin numbers match hardware
- Check external 5V power supply is connected
- Test servo manually with a servo tester
- Ensure servo power/ground are separate from ESP32

### "Serial shows garbage"
- Set baud rate to **115200**
- Try different USB cable
- Restart Arduino IDE/PlatformIO

### "No data in Firebase"
- Check WiFi is connected (Serial shows IP address)
- Verify Firebase credentials are correct
- Check database exists and is accessible
- Restart ESP32 (unplug USB and plug back in)

---

## 🚀 Next Steps

### 1. Dashboard Integration ✓
- Check Real-time Inventory tab shows slot data
- Try editing medication details
- Verify changes save to Firebase

### 2. Manual Testing
- Use dashboard to edit slot medication names
- ESP32 should receive updates in real-time
- Test "Edit Medication & Schedule" button

### 3. Automated Dispensing
- Configure schedules in dashboard
- ESP32 will check schedule every 10 seconds
- Medication auto-dispenses at scheduled times

### 4. Production Setup
- Change Firebase security rules
- Add proper user authentication
- Set up backup/logging
- Configure alerts

---

## 📊 Feature Summary

Your ESP32 now:

✅ Connects to WiFi and Firebase  
✅ Syncs real-time sensor data (IR sensors)  
✅ Controls 3 servo motors for dispensing  
✅ Logs all dispense events  
✅ Reports device status every 30 seconds  
✅ Displays status on OLED screen  
✅ Receives commands from dashboard  
✅ Auto-dispenses on schedule  
✅ Creates alerts for jams and low stock  
✅ Fully integrated with React dashboard  

---

## 📞 Support Resources

### Documentation
- [Firebase ESP Client Wiki](https://github.com/mobizt/Firebase-ESP-Client/wiki)
- [ESP32 Documentation](https://docs.espressif.com/projects/esp-idf/)
- [Arduino Reference](https://www.arduino.cc/reference/)

### Useful Files
- `QUICK_REFERENCE.md` - Function reference & debugging
- `HARDWARE_SETUP.md` - Pin mapping & wiring
- `README.md` - Detailed setup steps

### Common Issues
See `QUICK_REFERENCE.md` Troubleshooting section

---

## ⚡ Power Requirements

- **5V Supply**: 2A minimum (for 3 servos)
- **ESP32**: 80-160mA
- **IR Sensors**: 60mA total
- **OLED**: 20mA
- **Servos**: 500mA each (peak during movement)

---

## 📋 Final Checklist

Before going live:

- [ ] WiFi SSID and password updated
- [ ] Firebase credentials verified
- [ ] Hardware connections complete
- [ ] Firmware uploaded successfully
- [ ] Serial Monitor shows "Firebase connected!"
- [ ] Firebase shows `/device` as "online"
- [ ] Dashboard displays real-time data
- [ ] Test dispense works from dashboard
- [ ] OLED display shows correct status
- [ ] Power supply rated for 2A+

---

## 🎉 You're Ready!

Your MediStock ESP32 is now connected to the cloud and ready to dispense medication on schedule!

**Next**: Open the dashboard at http://localhost:5174 and test the system.

Questions? Check the relevant documentation file above, or refer to the serial monitor output for error messages.

Happy dispensing! 💊
