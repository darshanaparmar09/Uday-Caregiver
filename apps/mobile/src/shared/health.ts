// GENERATED from packages/mobile-shared/src/health.ts. Do not edit here; run node scripts/sync-mobile-shared.mjs
import { Platform } from "react-native";
import { api } from "./api";

/**
 * Health devices sync for the senior's phone. Reads Apple Health (iPhone) or Health Connect (Android)
 * and posts new readings to /api/devices/ingest.
 *
 * STATUS: Partial. Reading the phone's health store needs a native module, which needs an Expo
 * development build (not Expo Go). For the agency:
 *   iPhone:  add react-native-health, request read for HeartRate, OxygenSaturation, StepCount,
 *            SleepAnalysis, BloodPressureSystolic/Diastolic, BodyMass.
 *   Android: add react-native-health-connect and expo-health-connect config plugin, request the
 *            same record types.
 * Adapters are written in packages/mobile-shared/native-health (untested on a device). The device build
 * installs the module, imports the adapter and calls registerHealthReader(). Upload and dedupe are done.
 */
export type Sample = { kind: "pulse" | "spo2" | "steps" | "sleep_hours" | "bp_sys" | "bp_dia" | "weight_kg"; value: number; at: string };

type Reader = (since: Date) => Promise<Sample[]>;
let reader: Reader | null = null;
/** The device build registers a reader from packages/mobile-shared/native-health (ios.ts or android.ts). */
export function registerHealthReader(r: Reader) { reader = r; }
async function readStore(since: Date): Promise<Sample[] | null> {
  return reader ? reader(since) : null; // null: native module not in this build
}

export async function syncHealth(device: string, since: Date): Promise<{ supported: boolean; saved?: number; reason?: string }> {
  if (Platform.OS === "web") return { supported: false, reason: "Not available on the web" };
  const items = await readStore(since);
  if (!items) return { supported: false, reason: "Health sync needs the full app build. Coming soon." };
  if (!items.length) return { supported: true, saved: 0 };
  const r = await api<{ saved: number }>("/api/devices/ingest", { device, readings: items });
  return { supported: true, saved: r.saved };
}
