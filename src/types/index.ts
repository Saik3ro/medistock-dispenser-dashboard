// ============================================================
// MediStock Data Types & Interfaces
// ============================================================

// ─── User & Authentication ────────────────────────────────

export interface User {
  uid: string;
  email: string;
  displayName: string;
  role: "admin" | "caregiver" | "patient";
  phone?: string;
  avatar?: string;
  createdAt: number;
  lastLogin?: number;
}

export interface UserInvite {
  code: string;
  email: string;
  role: "caregiver" | "patient";
  createdAt: number;
  expiresAt: number;
  used: boolean;
  usedBy?: string;
  usedAt?: number;
}

// ─── Slot & Medication ────────────────────────────────

export interface Medication {
  name: string;
  dosage: string;
  unit: string; // "mg", "ml", "tablets", etc.
  description?: string;
}

export interface SlotData {
  slot_number: number; // 1, 2, or 3
  medication_name: string;
  dosage: string;
  stock_current: number;
  stock_max: number;
  status: "active" | "low_stock" | "empty" | "disabled";
  loaded: boolean;
  last_dispense?: number; // timestamp
  is_running: boolean;
  medicine_detected: boolean;
  jammed: boolean;
  last_reaction_ms?: number;
  triggered_by?: string;
  notes?: string;
}

// ─── Inventory & Stock ────────────────────────────────

export interface InventoryLog {
  slot: number;
  medication_name: string;
  action: "added" | "dispensed" | "adjusted";
  quantity: number;
  stock_before: number;
  stock_after: number;
  timestamp: number;
  notes?: string;
}

// ─── Schedule & Dispense ────────────────────────────────

export interface ScheduleEntry {
  key?: string;
  slot: number; // 1, 2, or 3
  medication_name: string;
  dosage: string;
  frequency: "daily" | "twice_daily" | "weekly" | "custom";
  times: string[]; // HH:MM format
  days?: number[]; // 0-6, Sunday-Saturday (only for weekly)
  start_date: string; // YYYY-MM-DD
  end_date?: string;
  active: boolean;
  patient?: string; // optional patient identifier
  notes?: string;
}

export interface ScheduledDispense {
  id: string;
  slot: number;
  medication_name: string;
  dosage: string;
  scheduled_time: string; // HH:MM
  date: string; // YYYY-MM-DD
  status: "pending" | "dispensed" | "missed" | "skipped";
  dispensed_at?: number; // timestamp
  reaction_time_ms?: number;
  sensor_triggered?: string;
}

// ─── Alerts & Events ────────────────────────────────

export interface Alert {
  key?: string;
  type: "JAM" | "LOW_STOCK" | "DISPENSED" | "ERROR" | "OFFLINE" | "MAINTENANCE";
  slot?: number;
  message: string;
  severity: "info" | "warning" | "critical";
  timestamp: number;
  resolved: boolean;
  resolved_at?: number;
  resolved_by?: string;
}

export interface DispenseLog {
  key?: string;
  slot: number;
  medication_name: string;
  status: "dispensed" | "jammed" | "missed" | "cancelled";
  sensor: string;
  reaction_ms: number;
  timestamp: number;
  triggered_by?: string;
}

// ─── Device Status ────────────────────────────────

export interface DeviceStatus {
  device_id: string;
  status: "online" | "offline";
  last_heartbeat: number;
  wifi_strength: number; // RSSI
  uptime_s: number;
  boot_time_s: number;
  version: string;
  ip_address?: string;
}

// ─── Dashboard Summary ────────────────────────────────

export interface DashboardSummary {
  total_dispensed_today: number;
  pending_doses: number;
  low_stock_slots: number;
  device_status: "online" | "offline";
  last_alert?: Alert;
  uptime_percentage: number;
}

export interface SlotSummary {
  slot: number;
  medication_name: string;
  status: string;
  stock_current: number;
  stock_max: number;
  next_dose?: string; // time HH:MM
  jam_count?: number;
}

// ─── Settings & Configuration ────────────────────────────────

export interface DeviceSettings {
  device_id: string;
  dispense_speed: number; // 0-90
  jam_timeout_ms: number;
  ir_sensitivity: number;
  auto_reorder_threshold: number; // percentage
  maintenance_interval_days: number;
  ntp_server: string;
  timezone: string;
}

export interface NotificationPreferences {
  email_on_jam: boolean;
  email_on_low_stock: boolean;
  email_on_offline: boolean;
  sms_critical_alerts: boolean;
  phone_number?: string;
  quiet_hours_start?: string; // HH:MM
  quiet_hours_end?: string;
}
