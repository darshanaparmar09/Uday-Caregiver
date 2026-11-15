"use client";
export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const r = await fetch(path, { method: opts.method ?? (opts.body ? "POST" : "GET"), headers: opts.body ? { "Content-Type": "application/json" } : undefined, body: opts.body ? JSON.stringify(opts.body) : undefined, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Something went wrong"), { status: r.status, fields: j.fields });
  return j as T;
}
export const inr = (paise: number) => "₹" + Math.round(paise / 100).toLocaleString("en-IN");
export const TYPE: Record<string, string> = { day: "Day shift, 8 hours", night: "Night shift, 12 hours", live: "24 hour live in" };
export const DUR: Record<number, string> = { 1: "One day", 7: "Weekly", 30: "Monthly", 90: "Quarterly" };
export const TIER: Record<number, string> = { 1: "Tier 1 Companion", 2: "Tier 2 Trained", 3: "Tier 3 Nurse" };
export const STATUS: Record<string, [string, string]> = {
  offered: ["pill-wait", "Waiting for caregiver"], proposal: ["pill-wait", "Needs your approval"], accepted: ["pill-ok", "Confirmed"],
  enroute: ["pill-ok", "On the way"], arrived: ["pill-ok", "Arrived"], active: ["pill-ok", "Care in progress"], completed: ["pill-ok", "Completed, rate it"],
  closed: ["pill-no", "Completed"], cancelled: ["pill-no", "Cancelled"], released: ["pill-no", "Cancelled, hold released"],
};
