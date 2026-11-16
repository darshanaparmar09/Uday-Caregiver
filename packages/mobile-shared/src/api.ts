import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

export const API = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";
const KEY = "uday_token";

// Session token lives in the device keychain (iOS) or keystore (Android). Web preview falls back to localStorage.
export const tokenStore = {
  async get() { try { return Platform.OS === "web" ? localStorage.getItem(KEY) : await SecureStore.getItemAsync(KEY); } catch { return null; } },
  async set(v: string) { try { Platform.OS === "web" ? localStorage.setItem(KEY, v) : await SecureStore.setItemAsync(KEY, v); } catch {} },
  async clear() { try { Platform.OS === "web" ? localStorage.removeItem(KEY) : await SecureStore.deleteItemAsync(KEY); } catch {} },
};

export async function api<T = any>(path: string, body?: unknown, method?: string): Promise<T> {
  const t = await tokenStore.get();
  const r = await fetch(API + path, { method: method ?? (body ? "POST" : "GET"), headers: { "Content-Type": "application/json", ...(t ? { Authorization: "Bearer " + t } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Something went wrong. Please try again."), { status: r.status });
  return j as T;
}

export const inr = (p: number) => "₹" + Math.round(p / 100).toLocaleString("en-IN");
export const TYPE: Record<string, string> = { day: "Day shift", night: "Night shift", live: "24 hour live in" };
export const PLAN: Record<number, string> = { 1: "One day", 7: "One week", 30: "One month", 90: "Three months" };
export const STATUS: Record<string, string> = {
  offered: "Waiting for caregiver", proposal: "Needs your approval", accepted: "Confirmed", enroute: "On the way", arrived: "Arrived",
  active: "Care in progress", completed: "Please rate", closed: "Completed", cancelled: "Cancelled", released: "Cancelled",
};
export function countdown(iso?: string) { if (!iso) return ""; const s = Math.max(0, Math.round((new Date(iso).getTime() - Date.now()) / 1000)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = String(s % 60).padStart(2, "0"); return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`; }

export const READING: Record<string, [string, string]> = { bp_sys: ["BP upper", "mmHg"], bp_dia: ["BP lower", "mmHg"], pulse: ["Pulse", "bpm"], spo2: ["Oxygen", "%"], temp_c: ["Temperature", "°C"],
  glucose: ["Blood sugar", "mg/dL"], weight_kg: ["Weight", "kg"], steps: ["Steps", "steps"], sleep_hours: ["Sleep", "hours"], pain: ["Pain", "of 10"] };
export const SOURCE: Record<string, string> = { caregiver: "Caregiver", family: "Family", device: "Device" };
