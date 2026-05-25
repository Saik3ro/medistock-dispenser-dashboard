# AGENTS.md - MediStock Dispenser Dashboard
> Project Constitution for Codex AI Assistant

## 🎯 Project Identity
- **Name:** MediStock Smart Medicine Dispenser
- **Stack:** React + Vite + Firebase Realtime Database + TailwindCSS
- **Hardware:** ESP32 with Servos (x3) + Ultrasonic Sensor (HC-SR04)
- **Repo Branch:** dean (main development branch)

## 📁 Critical File Structure
src/
├── firebase.js # Firebase config (DO NOT MODIFY .env)
├── components/
│ ├── Dashboard.tsx # Main overview
│ ├── Inventory.tsx # Slot management
│ ├── Schedule.tsx # Calendar + dosing times
│ ├── Alerts.tsx # Notification feed
│ └── Settings.tsx # Caregiver + thresholds
├── hooks/
│ └── useFirebase.ts # Realtime listeners
└── lib/
└── firebase-helpers.ts


## 🔥 Firebase Paths (Read-Only Reference)
| Path | Purpose |
|------|---------|
| `/components/servo1/control/command` | DISPENSE / STOP |
| `/components/sensor1/status/medicine_detected` | true/false |
| `/slots/slot1/stock_current` | Update on dispense |
| `/schedules` | Read by ESP32 |
| `/alerts` | Write on low stock/missed dose |

## 🧠 Core Rules (Always Apply)
1. **No full-file reads** - Use `grep` or `head/tail` first
2. **No repeated context** - Reference previous answers via `as we discussed`
3. **Parallel tool calls** - Read multiple files simultaneously
4. **Use `/compact`** before context exceeds 50k tokens
5. **Start fresh sessions** for unrelated tasks (auth vs. hardware)

## 🛠️ On-Demand Skills (Activate via @mention)
- `@refactor` - Restructure component without changing behavior
- `@debug` - Find bugs using console logs + Firebase checks
- `@test-servo` - Generate ESP32 test command sequence
- `@security` - Review Firebase rules + auth flow

## ⚡ Common Commands (Use These)
```bash
npm run dev          # Start dashboard on localhost:8080
git checkout dean    # Switch to main branch
pio run -t upload    # Build ESP32 firmware

