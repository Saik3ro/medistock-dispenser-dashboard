# How to Install Libraries for MediStock ESP32

## 📦 Required Libraries

Here are the libraries you need to install:

1. **Firebase ESP8266 and ESP32** - For Firebase connectivity
2. **ESP32Servo** - For controlling servo motors
3. **Adafruit SSD1306** - For OLED display
4. **Adafruit GFX Library** - Graphics library (required for SSD1306)
5. **ArduinoJson** - For JSON parsing (optional, built-in to Firebase library)

---

## 🚀 Method 1: Using PlatformIO (Easiest)

If you're using PlatformIO, libraries are automatically installed from `platformio.ini`.

### Steps:

1. **Open ESP32_SKETCH in VS Code:**
   ```bash
   code ESP32_SKETCH
   ```

2. **Check `platformio.ini` file** - It already has all dependencies:
   ```ini
   lib_deps =
       Firebase ESP8266 and ESP32 by Mobizt @ ^4.4.0
       ESP32Servo @ ^0.12.0
       Adafruit SSD1306 @ ^2.5.7
       Adafruit GFX Library @ ^1.11.9
       ArduinoJson @ ^6.21.0
   ```

3. **Just click "Build"** - PlatformIO will automatically download and install all libraries

✅ **Done!** No manual installation needed.

---

## 🛠️ Method 2: Using Arduino IDE

### Step 1: Open Library Manager

1. Open **Arduino IDE**
2. Go to **Sketch** → **Include Library** → **Manage Libraries**

### Step 2: Install Each Library

#### Library 1: Firebase ESP8266 and ESP32

1. Search for: `firebase esp8266 and esp32`
2. Find the one by **Mobizt**
3. Click **Install** (version 4.4.0 or higher)

**Full name:** Firebase ESP8266 and ESP32 Client Library  
**Author:** Mobizt

#### Library 2: ESP32Servo

1. Search for: `esp32servo`
2. Click **Install** (version 0.12.0 or higher)

**Full name:** ESP32Servo  
**Author:** Kevin Harrington

#### Library 3: Adafruit SSD1306

1. Search for: `adafruit ssd1306`
2. Click **Install** (version 2.5.7 or higher)

**Full name:** Adafruit SSD1306  
**Author:** Adafruit

#### Library 4: Adafruit GFX Library

1. Search for: `adafruit gfx`
2. Click **Install** (version 1.11.9 or higher)

**Full name:** Adafruit GFX Library  
**Author:** Adafruit

#### Library 5: ArduinoJson (Optional)

1. Search for: `arduinojson`
2. Click **Install** (version 6.21.0 or higher)

**Full name:** ArduinoJson  
**Author:** Benoit Blanchon

### Step 3: Verify Installation

1. Go to **Sketch** → **Include Library**
2. You should see all these libraries listed:
   - Adafruit GFX Library
   - Adafruit SSD1306
   - ArduinoJson
   - ESP32Servo
   - Firebase ESP8266 and ESP32 Client Library

✅ **All libraries installed!**

---

## 🔍 Verify Installation

### In Arduino IDE:

Open the sketch `medistock_esp32.ino` and try to compile:
- **Sketch** → **Verify/Compile** (Ctrl+R)
- Should show "Done compiling" with no errors

### In PlatformIO:

1. Open the project
2. Click the **Build** button (checkmark icon)
3. Should show "SUCCESS" message

---

## 📍 Manual Installation (If Needed)

If automatic installation fails, you can manually install libraries:

### For Arduino IDE:

1. Download each library as ZIP file
2. **Sketch** → **Include Library** → **Add .ZIP Library**
3. Select the downloaded ZIP file

**Download Links:**
- [Firebase ESP8266/ESP32](https://github.com/mobizt/Firebase-ESP-Client)
- [ESP32Servo](https://github.com/jkb-git/ESP32Servo)
- [Adafruit SSD1306](https://github.com/adafruit/Adafruit_SSD1306)
- [Adafruit GFX](https://github.com/adafruit/Adafruit-GFX-Library)
- [ArduinoJson](https://github.com/bblanchon/ArduinoJson)

### For PlatformIO:

1. Edit `platformio.ini`
2. Add under `lib_deps`:
   ```ini
   lib_deps =
       Firebase ESP8266 and ESP32 by Mobizt
       ESP32Servo
       Adafruit SSD1306
       Adafruit GFX Library
       ArduinoJson
   ```
3. Save and build - libraries will auto-download

---

## ⚙️ Troubleshooting Library Installation

### "Library not found" error

**Solution:**
1. Close Arduino IDE completely
2. Go to Documents → Arduino → libraries
3. Check if library folders exist
4. Delete and reinstall if corrupted
5. Restart Arduino IDE

### "Compilation errors" after installing

**Solution:**
1. Make sure you installed the correct library (check author name)
2. Go to **Tools** → **Board** → Select **ESP32 Dev Module**
3. Delete corrupted libraries manually:
   - Windows: `Documents\Arduino\libraries\`
   - Mac: `~/Documents/Arduino/libraries/`
   - Linux: `~/Arduino/libraries/`
4. Reinstall fresh

### Dependencies not auto-installing

**Solution (PlatformIO):**
1. Delete `.pio` folder in project
2. Click **Build** again
3. Wait for all dependencies to download

**Solution (Arduino IDE):**
1. Install Adafruit GFX first
2. Then install Adafruit SSD1306
3. Libraries may depend on each other

---

## 📝 What Each Library Does

| Library | Purpose | Used For |
|---------|---------|----------|
| **Firebase ESP Client** | Cloud data sync | Firebase Realtime Database connection |
| **ESP32Servo** | Motor control | 3 servo motors (GPIO 14, 15, 16) |
| **Adafruit SSD1306** | OLED driver | 0.96" display control |
| **Adafruit GFX** | Graphics | Text/shapes on OLED |
| **ArduinoJson** | JSON parsing | Firebase data parsing |

---

## 🎯 Quick Reference - Installation Steps

### Arduino IDE:
```
1. Sketch → Include Library → Manage Libraries
2. Search "firebase esp"     → Install by Mobizt
3. Search "esp32servo"       → Install
4. Search "adafruit ssd1306" → Install
5. Search "adafruit gfx"     → Install
6. Search "arduinojson"      → Install
7. Close and reopen IDE
8. Sketch → Verify (should compile)
```

### PlatformIO:
```
1. Open ESP32_SKETCH in VS Code
2. Check platformio.ini has all lib_deps
3. Click Build button
4. Libraries auto-install
5. Done!
```

---

## ✅ Verification Commands

### Test if libraries are installed (Arduino IDE):

Create a new sketch and paste:

```cpp
#include <Firebase_ESP_Client.h>
#include <ESP32Servo.h>
#include <Adafruit_SSD1306.h>
#include <Adafruit_GFX.h>
#include <ArduinoJson.h>

void setup() {
  Serial.begin(115200);
  Serial.println("All libraries loaded successfully!");
}

void loop() {
  delay(1000);
}
```

- If it compiles without errors → ✅ All libraries are installed!
- If it shows red errors → ❌ A library is missing

---

## 🔧 Common Issues & Solutions

| Issue | Cause | Fix |
|-------|-------|-----|
| `#include errors` | Library not installed | Reinstall from Library Manager |
| `Version conflict` | Old version installed | Check version matches requirements |
| `Multiple definitions` | Duplicate libraries | Check `Documents/Arduino/libraries/` for duplicates |
| `Cannot find file` | Wrong library name | Search again with correct name (see table above) |

---

## 📱 After Installing Libraries

1. ✅ Open `medistock_esp32.ino` in Arduino IDE or PlatformIO
2. ✅ Update WiFi and Firebase credentials (lines 20-28)
3. ✅ Click **Verify/Build** to compile
4. ✅ Connect ESP32 via USB
5. ✅ Click **Upload**
6. ✅ Open Serial Monitor (115200 baud)
7. ✅ Should see "Firebase connected!" message

---

## 💡 Pro Tips

- **Always install Adafruit GFX BEFORE Adafruit SSD1306** (it's a dependency)
- **Use PlatformIO if possible** - automatic dependency management is easier
- **Check Serial Monitor for compilation errors** - they tell you exactly what's wrong
- **Keep libraries updated** - newer versions have bug fixes

---

## 🆘 Still Having Issues?

1. Check you're on the latest Arduino IDE or PlatformIO
2. Verify you have the correct ESP32 board selected
3. Look at the exact error message - it usually tells you the problem
4. Try the manual installation method if automatic fails
5. Check the library GitHub pages for documentation

---

## ✨ Next Steps

Once all libraries are installed:

1. Update WiFi/Firebase credentials in `medistock_esp32.ino`
2. Build the project (should have 0 errors)
3. Upload to ESP32
4. Open Serial Monitor to verify connection
5. Check Firebase console for device status
6. View real-time data in dashboard!

You're ready to go! 🚀
