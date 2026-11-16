/**
 * Apple Health reader. UNTESTED ON A DEVICE: needs an Expo development build with react-native-health
 * and the HealthKit entitlement. Usage in the iPhone build:
 *   import { readAppleHealth } from "@uday/native-health/ios"; registerHealthReader(readAppleHealth);
 */
// @ts-nocheck  (types come from react-native-health once installed)
import AppleHealthKit from "react-native-health";
import type { Sample } from "../src/health";

const P = AppleHealthKit.Constants.Permissions;
const perms = { permissions: { read: [P.HeartRate, P.OxygenSaturation, P.StepCount, P.SleepAnalysis, P.BloodPressureSystolic, P.BloodPressureDiastolic, P.Weight], write: [] } };
const call = <T,>(fn: any, opts: any) => new Promise<T>((ok, no) => fn(opts, (e: any, r: T) => (e ? no(e) : ok(r))));

export async function readAppleHealth(since: Date): Promise<Sample[]> {
  await new Promise<void>((ok, no) => AppleHealthKit.initHealthKit(perms, (e: any) => (e ? no(e) : ok())));
  const o = { startDate: since.toISOString(), endDate: new Date().toISOString(), ascending: true, limit: 500 };
  const out: Sample[] = [];
  for (const r of await call<any[]>(AppleHealthKit.getHeartRateSamples, o)) out.push({ kind: "pulse", value: Math.round(r.value), at: r.startDate });
  for (const r of await call<any[]>(AppleHealthKit.getOxygenSaturationSamples, o)) out.push({ kind: "spo2", value: Math.round(r.value <= 1 ? r.value * 100 : r.value), at: r.startDate });
  for (const r of await call<any[]>(AppleHealthKit.getDailyStepCountSamples, o)) out.push({ kind: "steps", value: Math.round(r.value), at: r.startDate });
  for (const r of await call<any[]>(AppleHealthKit.getBloodPressureSamples, o)) { out.push({ kind: "bp_sys", value: Math.round(r.bloodPressureSystolicValue), at: r.startDate }); out.push({ kind: "bp_dia", value: Math.round(r.bloodPressureDiastolicValue), at: r.startDate }); }
  for (const r of await call<any[]>(AppleHealthKit.getWeightSamples, { ...o, unit: "gram" })) out.push({ kind: "weight_kg", value: Math.round(r.value / 100) / 10, at: r.startDate });
  // Sleep: add up ASLEEP periods per night (by the date the sleep ended).
  const nights: Record<string, number> = {};
  for (const r of await call<any[]>(AppleHealthKit.getSleepSamples, o)) if (String(r.value).includes("ASLEEP")) { const d = r.endDate.slice(0, 10); nights[d] = (nights[d] ?? 0) + (Date.parse(r.endDate) - Date.parse(r.startDate)) / 36e5; }
  for (const [d, h] of Object.entries(nights)) out.push({ kind: "sleep_hours", value: Math.round(h * 10) / 10, at: `${d}T08:00:00+05:30` });
  return out;
}
