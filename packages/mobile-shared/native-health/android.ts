/**
 * Health Connect reader for Android. UNTESTED ON A DEVICE: needs an Expo development build with
 * react-native-health-connect and the expo-health-connect config plugin (minSdk 26). Usage:
 *   import { readHealthConnect } from "@uday/native-health/android"; registerHealthReader(readHealthConnect);
 */
// @ts-nocheck  (types come from react-native-health-connect once installed)
import { initialize, requestPermission, readRecords } from "react-native-health-connect";
import type { Sample } from "../src/health";

const TYPES = ["HeartRate", "OxygenSaturation", "Steps", "SleepSession", "BloodPressure", "Weight"] as const;

export async function readHealthConnect(since: Date): Promise<Sample[]> {
  if (!(await initialize())) throw new Error("Health Connect is not installed on this phone");
  await requestPermission(TYPES.map((recordType) => ({ accessType: "read", recordType })));
  const timeRangeFilter = { operator: "between", startTime: since.toISOString(), endTime: new Date().toISOString() };
  const get = async (t: string) => (await readRecords(t, { timeRangeFilter })).records ?? [];
  const out: Sample[] = [];
  for (const r of await get("HeartRate")) for (const s of r.samples ?? []) out.push({ kind: "pulse", value: Math.round(s.beatsPerMinute), at: s.time });
  for (const r of await get("OxygenSaturation")) out.push({ kind: "spo2", value: Math.round(r.percentage), at: r.time });
  for (const r of await get("Steps")) out.push({ kind: "steps", value: r.count, at: r.startTime });
  for (const r of await get("BloodPressure")) { out.push({ kind: "bp_sys", value: Math.round(r.systolic.inMillimetersOfMercury), at: r.time }); out.push({ kind: "bp_dia", value: Math.round(r.diastolic.inMillimetersOfMercury), at: r.time }); }
  for (const r of await get("Weight")) out.push({ kind: "weight_kg", value: Math.round(r.weight.inKilograms * 10) / 10, at: r.time });
  for (const r of await get("SleepSession")) out.push({ kind: "sleep_hours", value: Math.round(((Date.parse(r.endTime) - Date.parse(r.startTime)) / 36e5) * 10) / 10, at: r.endTime });
  return out;
}
