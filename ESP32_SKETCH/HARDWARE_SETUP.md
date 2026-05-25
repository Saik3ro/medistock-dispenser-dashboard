# ESP32 Hardware Setup & Wiring Guide

## 🔧 Quick Parts List

### Essential Components
- 1× ESP32 Development Board (DOIT DevKit V1 or similar)
- 3× Servo Motors (SG90 or MG90S recommended)
- 3× IR Proximity Sensors (analog output)
- 1× SSD1306 OLED Display (0.96" 128x64)
- 1× Micro-USB cable (for programming)

### Power & Connectors
- 5V Power Supply (minimum 2A for servos)
- Breadboard or PCB
- Jumper wires (M-M and M-F)
- USB Power Bank (optional, for portability)

---

## 📍 Pin Connections

### Servo Motors
```
Servo 1 (Slot 1)
├─ Signal (Orange) ──→ GPIO14
├─ Power (Red)     ──→ 5V
└─ Ground (Brown)  ──→ GND

Servo 2 (Slot 2)
├─ Signal (Orange) ──→ GPIO15
├─ Power (Red)     ──→ 5V
└─ Ground (Brown)  ──→ GND

Servo 3 (Slot 3)
├─ Signal (Orange) ──→ GPIO16
├─ Power (Red)     ──→ 5V
└─ Ground (Brown)  ──→ GND
```

### IR Proximity Sensors
```
Sensor 1 (Slot 1)
├─ Signal (Analog) ──→ GPIO34 (ADC1_CH6)
├─ Power           ──→ 5V
└─ Ground          ──→ GND

Sensor 2 (Slot 2)
├─ Signal (Analog) ──→ GPIO35 (ADC1_CH7)
├─ Power           ──→ 5V
└─ Ground          ──→ GND

Sensor 3 (Slot 3)
├─ Signal (Analog) ──→ GPIO32 (ADC1_CH4)
├─ Power           ──→ 5V
└─ Ground          ──→ GND
```

### SSD1306 OLED Display
```
Display
├─ SDA (Data)   ──→ GPIO21 (I2C SDA)
├─ SCL (Clock)  ──→ GPIO22 (I2C SCL)
├─ Power (VCC)  ──→ 3.3V
└─ Ground (GND) ──→ GND
```

---

## 🔌 ESP32 Pinout Reference

```
        USB
         ↓
    ┌────────┐
    │        │
GND │        │ EN   (Reset)
23  │        │ SVP  (GPIO36 - Input only)
22  │ SCL    │ 39   (GPIO39 - Input only)
21  │ SDA    │ 34   (GPIO34 - ADC1_CH6)
17  │        │ 35   (GPIO35 - ADC1_CH7)
16  │ Servo3 │ 32   (GPIO32 - ADC1_CH4)
4   │        │ 33   (GPIO33 - ADC1_CH5)
0   │        │ 25
2   │        │ 26
15  │ Servo2 │ 27
13  │        │ 14   (Servo1)
12  │        │ 12   (Strapping - must be LOW to boot)
14  │        │ 11   (SPICS0 - Flash CS)
27  │        │ 6    (SPICLK - Flash Clock)
26  │        │ 7    (SPID - Flash Data)
25  │        │ 8    (SPIQ - Flash Data)
3V3 │ 3V3    │ 9    (SPIHD - Flash Data)
GND │ GND    │ 10   (SPIWP - Flash Data)
5V  │ 5V     │ 5    (LED)
    └────────┘
```

### ADC Pins (Analog Input)
- **GPIO34** (ADC1_CH6) - IR Sensor 1 ✓
- **GPIO35** (ADC1_CH7) - IR Sensor 2 ✓
- **GPIO32** (ADC1_CH4) - IR Sensor 3 ✓
- **GPIO33** (ADC1_CH5) - Available

### I2C Pins (OLED)
- **GPIO21** (SDA) - I2C Data
- **GPIO22** (SCL) - I2C Clock

### PWM Pins (Servos)
- **GPIO14** - Servo 1 ✓
- **GPIO15** - Servo 2 ✓
- **GPIO16** - Servo 3 ✓

---

## 🔋 Power Distribution

### Critical: Servo Power Supply

**⚠️ DO NOT power servos from ESP32's 5V pin!**

The on-board 5V regulator can only supply ~500mA. Three servos can draw 2-3A during operation.

**Correct Setup:**
```
External 5V Power Supply
├─ Positive (+5V) ──→ Servo Power Rails
├─ Negative (GND) ──→ Servo Ground Rails
└─ Also connect to:
   ├─ ESP32 GND (for common ground)
   └─ ESP32 5V (for OLED pull-up resistors)
```

### Wiring Diagram
```
┌──────────────────────────────────┐
│ External 5V Power Supply         │
│ (2A minimum)                     │
└────┬────────────────────────┬────┘
     │ +5V                    │ GND
     │                        │
     ├──→ Servo 1 Power       │
     ├──→ Servo 2 Power       │
     ├──→ Servo 3 Power       │
     ├──→ OLED VCC (optional) │
     └──→ IR Sensor Power ────┼──→ GND Rails
                              │
                              ├──→ ESP32 GND (pin 38 or 39)
                              └──→ Common Ground Rails
```

---

## 🛠️ Assembly Steps

### Step 1: Prepare Breadboard
1. Place ESP32 in center
2. Add power rails on both sides
3. Connect GND rail to ESP32 GND pins (x2)
4. Connect 3.3V rail to ESP32 3.3V pin

### Step 2: Connect IR Sensors
```
For each sensor:
1. Connect 5V to power rail
2. Connect GND to ground rail
3. Connect Signal to ADC pin:
   - Sensor 1 → GPIO34
   - Sensor 2 → GPIO35
   - Sensor 3 → GPIO32
```

### Step 3: Connect Servos
```
For each servo:
1. Connect Orange (Signal) to GPIO:
   - Servo 1 → GPIO14
   - Servo 2 → GPIO15
   - Servo 3 → GPIO16
2. Connect Red (5V) to external power 5V
3. Connect Brown (GND) to common ground
```

### Step 4: Connect OLED Display
```
1. Connect VCC to ESP32 3.3V
2. Connect GND to common ground
3. Connect SDA to GPIO21
4. Connect SCL to GPIO22
```

### Step 5: Connect Power Supply
```
1. Connect external 5V PSU to 5V rail
2. Connect external PSU GND to GND rail
3. Connect to ESP32 GND (common ground reference)
4. Do NOT connect external 5V directly to ESP32 5V pin
```

---

## 🔍 Verification Checklist

- [ ] ESP32 powers on when USB connected
- [ ] OLED displays "Initializing..." message
- [ ] Serial monitor shows boot logs at 115200 baud
- [ ] All three servos respond to movement commands
- [ ] IR sensors read different values with/without object
- [ ] WiFi connects successfully (check Serial)
- [ ] Firebase shows device as "online"

---

## 🧪 Testing Each Component

### Test Servos
```cpp
// Temporary test code - add to setup()
servo1.write(0);   delay(500);
servo1.write(90);  delay(500);
servo1.write(180); delay(500);
servo1.write(0);
```

### Test IR Sensors
```cpp
// Add to loop()
Serial.print("Sensor 1: ");
Serial.println(analogRead(IR_SENSOR_1));
Serial.print("Sensor 2: ");
Serial.println(analogRead(IR_SENSOR_2));
Serial.print("Sensor 3: ");
Serial.println(analogRead(IR_SENSOR_3));
delay(500);
```

### Test OLED
```cpp
// Display should show initialization message
displayMessage("Test Line 1", "Test Line 2");
delay(2000);
```

---

## ⚡ Power Consumption

### Per Component
- ESP32: ~80mA (idle), ~160mA (WiFi active)
- Servo (idle): ~10mA per servo
- Servo (moving): ~500mA per servo (peak)
- IR Sensor: ~20mA per sensor
- OLED Display: ~20mA

### Total Typical
- Idle: ~200mA
- WiFi Active: ~300mA
- During Dispense: ~2000mA (3 servos moving)

**Recommendation:** Use 5A power supply for safety margin

---

## 🔧 Troubleshooting Connection Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| Servo doesn't move | Wrong GPIO pin | Check PIN definition matches hardware |
| Servo moves but weak | Insufficient power | Use external 5V supply |
| IR sensor always reads max | Sensor facing wrong way | Rotate sensor 180° |
| I2C device not found | Wrong address | Run I2C scanner example |
| Frequent disconnections | Noisy power supply | Add 0.1µF capacitor near servo power |
| OLED shows garbage | Wrong I2C address | Check 0x3C vs 0x3D |

---

## 📦 Final Setup Checklist

- [ ] All components soldered/connected
- [ ] Power supply rated for 2A minimum
- [ ] Common ground between all components
- [ ] No shorts between power and ground
- [ ] Servo signal wires separate from power wires
- [ ] OLED address verified (0x3C default)
- [ ] WiFi credentials updated in code
- [ ] Firebase credentials updated in code
- [ ] USB cable connected to PC
- [ ] Ready to upload firmware!

---

## 📞 Support

If something doesn't work:
1. Check all connections match the wiring diagram
2. Verify component specifications match requirements
3. Test each component individually
4. Check Serial Monitor output for error messages
5. Refer to QUICK_REFERENCE.md for debugging
