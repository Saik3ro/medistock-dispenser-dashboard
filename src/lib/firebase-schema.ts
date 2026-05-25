// ============================================================
// MediStock Firebase Realtime Database Structure
// ============================================================
// This document defines the complete database schema for the
// MediStock Dispenser system, mapping ESP32 data with the
// React dashboard and user management.
// ============================================================

/*
├── device/                              [Device & Settings]
│   ├── device_id: "medistock-esp32-001"
│   ├── status: "online" | "offline"
│   ├── last_heartbeat: 1719456123000
│   ├── wifi_strength: -45
│   ├── uptime_s: 345600
│   ├── boot_time_s: 1609459200
│   ├── version: "3.2"
│   ├── ip_address: "192.168.1.100"
│   └── settings/
│       ├── dispense_speed: 45
│       ├── jam_timeout_ms: 5000
│       ├── ir_sensitivity: 100
│       ├── auto_reorder_threshold: 20
│       ├── maintenance_interval_days: 30
│       ├── ntp_server: "pool.ntp.org"
│       └── timezone: "Asia/Manila"
│
├── slots/                               [Medication Slots]
│   ├── slot1/
│   │   ├── medication_name: "Aspirin"
│   │   ├── dosage: "500mg"
│   │   ├── stock_current: 45
│   │   ├── stock_max: 100
│   │   ├── status: "active" | "low_stock" | "empty" | "disabled"
│   │   ├── loaded: true
│   │   ├── last_dispense: 1719456000000
│   │   ├── is_running: false
│   │   ├── medicine_detected: false
│   │   ├── jammed: false
│   │   ├── last_reaction_ms: 1250
│   │   ├── triggered_by: "IR1_GPIO34"
│   │   └── notes: "Replace every 30 days"
│   │
│   ├── slot2/
│   │   └── [Same structure as slot1]
│   │
│   └── slot3/
│       └── [Same structure as slot1]
│
├── schedule/                            [Medication Schedule]
│   ├── {key1}/
│   │   ├── slot: 1
│   │   ├── medication_name: "Aspirin"
│   │   ├── dosage: "500mg"
│   │   ├── frequency: "daily" | "twice_daily" | "weekly" | "custom"
│   │   ├── times: ["08:00", "20:00"]
│   │   ├── days: [0, 1, 2, 3, 4, 5, 6]  // 0=Sun, 6=Sat (for weekly)
│   │   ├── start_date: "2024-06-01"
│   │   ├── end_date: "2024-12-31"
│   │   ├── active: true
│   │   ├── patient: "patient_id_001"
│   │   └── notes: "Take with food"
│   │
│   └── {key2}/
│       └── [Additional schedule entries]
│
├── dispense_log/                        [Dispense Events]
│   ├── {key1}/
│   │   ├── slot: 1
│   │   ├── medication_name: "Aspirin"
│   │   ├── status: "dispensed" | "jammed" | "missed"
│   │   ├── sensor: "IR1_GPIO34"
│   │   ├── reaction_ms: 1250
│   │   ├── timestamp: 1719456000000
│   │   └── triggered_by: "schedule"
│   │
│   └── {key2}/
│       └── [Additional dispense events]
│
├── inventory_log/                       [Stock Changes]
│   ├── {key1}/
│   │   ├── slot: 1
│   │   ├── medication_name: "Aspirin"
│   │   ├── action: "added" | "dispensed" | "adjusted"
│   │   ├── quantity: 50
│   │   ├── stock_before: 20
│   │   ├── stock_after: 70
│   │   ├── timestamp: 1719456000000
│   │   └── notes: "Refill - delivered by pharmacy"
│   │
│   └── {key2}/
│       └── [Additional inventory changes]
│
├── alerts/                              [Alert System]
│   ├── latest/
│   │   ├── type: "JAM" | "LOW_STOCK" | "DISPENSED" | "ERROR" | "OFFLINE"
│   │   ├── slot: 1
│   │   ├── message: "Medicine jammed in Slot 1"
│   │   ├── severity: "info" | "warning" | "critical"
│   │   └── timestamp: 1719456000000
│   │
│   └── history/
│       ├── {key1}/
│       │   ├── type: "JAM"
│       │   ├── slot: 1
│       │   ├── message: "JAMMED - No medicine detected from Slot 1"
│       │   ├── severity: "critical"
│       │   ├── timestamp: 1719456000000
│       │   ├── resolved: true
│       │   ├── resolved_at: 1719456300000
│       │   └── resolved_by: "admin_user_id"
│       │
│       └── {key2}/
│           └── [Additional alerts]
│
├── users/                               [User Accounts]
│   ├── {uid1}/
│   │   ├── email: "caregiver@example.com"
│   │   ├── displayName: "John Smith"
│   │   ├── role: "caregiver" | "admin" | "patient"
│   │   ├── phone: "+63-9XX-XXX-XXXX"
│   │   ├── avatar: "https://..."
│   │   ├── createdAt: 1709456000000
│   │   └── lastLogin: 1719456000000
│   │
│   └── {uid2}/
│       └── [Additional users]
│
└── invites/                             [User Invitations]
    ├── {code1}/
    │   ├── email: "caregiver@example.com"
    │   ├── role: "caregiver"
    │   ├── createdAt: 1719456000000
    │   ├── expiresAt: 1719542400000
    │   ├── used: false
    │   └── usedBy: null
    │
    └── {code2}/
        └── [Additional invites]
*/

// ============================================================
// Database Rules (Firebase Security Rules)
// ============================================================

/*
{
  "rules": {
    "device": {
      ".read": true,
      ".write": false,
      "$uid": {
        ".write": "auth.uid === 'esp32_device_id'"
      }
    },
    "slots": {
      ".read": true,
      ".write": "auth.uid === 'esp32_device_id'"
    },
    "schedule": {
      ".read": true,
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "dispense_log": {
      ".read": true,
      ".write": "auth.uid === 'esp32_device_id' || root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "inventory_log": {
      ".read": true,
      ".write": "auth.uid === 'esp32_device_id' || root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "alerts": {
      ".read": true,
      ".write": "auth.uid === 'esp32_device_id' || root.child('users').child(auth.uid).child('role').val() === 'admin'"
    },
    "users": {
      ".read": false,
      ".write": false,
      "$uid": {
        ".read": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "auth.uid === $uid || root.child('users').child(auth.uid).child('role').val() === 'admin'"
      }
    },
    "invites": {
      ".read": false,
      ".write": "root.child('users').child(auth.uid).child('role').val() === 'admin'"
    }
  }
}
*/

// ============================================================
// Dashboard Views & Queries
// ============================================================

export const FIREBASE_SCHEMA = {
  version: "1.0",
  lastUpdated: "2024-06-25",
  
  // Common queries from dashboard
  queries: {
    // Get all slots
    allSlots: "/slots",
    
    // Get slot by number
    slotByNumber: (num: number) => `/slots/slot${num}`,
    
    // Get today's dispense log
    todayDispenseLog: (startTime: number, endTime: number) =>
      `/dispense_log?orderByChild=timestamp&startAt=${startTime}&endAt=${endTime}`,
    
    // Get active schedule
    activeSchedule: "/schedule?orderByChild=active&equalTo=true",
    
    // Get latest alert
    latestAlert: "/alerts/latest",
    
    // Get device status
    deviceStatus: "/device",
    
    // Get low stock slots
    lowStockSlots: "/slots?orderByChild=status&equalTo=low_stock",
    
    // Get empty slots
    emptySlots: "/slots?orderByChild=status&equalTo=empty",
  },

  // API endpoints for reference
  endpoints: {
    getSlots: "GET /slots",
    updateSlot: "PUT /slots/slot{N}",
    addSchedule: "POST /schedule",
    deleteSchedule: "DELETE /schedule/{key}",
    getDispenseLog: "GET /dispense_log",
    getAlerts: "GET /alerts/history",
    resolveAlert: "PUT /alerts/history/{key}",
    getDeviceStatus: "GET /device",
    updateDeviceSettings: "PUT /device/settings",
  },

  // Real-time listener subscriptions
  subscriptions: {
    slotUpdates: "/slots",
    scheduleUpdates: "/schedule",
    dispenseLogUpdates: "/dispense_log",
    alertUpdates: "/alerts/latest",
    deviceStatusUpdates: "/device",
  },
};

// ============================================================
// Example: Creating Initial Data
// ============================================================

export const INITIAL_DATA = {
  device: {
    device_id: "medistock-esp32-001",
    status: "offline",
    last_heartbeat: 0,
    wifi_strength: -100,
    uptime_s: 0,
    boot_time_s: Math.floor(Date.now() / 1000),
    version: "3.2",
    settings: {
      dispense_speed: 45,
      jam_timeout_ms: 5000,
      ir_sensitivity: 100,
      auto_reorder_threshold: 20,
      maintenance_interval_days: 30,
      ntp_server: "pool.ntp.org",
      timezone: "Asia/Manila",
    },
  },

  slots: {
    slot1: {
      medication_name: "Aspirin",
      dosage: "500mg",
      stock_current: 0,
      stock_max: 100,
      status: "empty",
      loaded: false,
      is_running: false,
      medicine_detected: false,
      jammed: false,
    },
    slot2: {
      medication_name: "Ibuprofen",
      dosage: "200mg",
      stock_current: 0,
      stock_max: 100,
      status: "empty",
      loaded: false,
      is_running: false,
      medicine_detected: false,
      jammed: false,
    },
    slot3: {
      medication_name: "Paracetamol",
      dosage: "500mg",
      stock_current: 0,
      stock_max: 100,
      status: "empty",
      loaded: false,
      is_running: false,
      medicine_detected: false,
      jammed: false,
    },
  },
};
