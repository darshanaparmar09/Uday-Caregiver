import { READING_KINDS, READING_RANGE, WEARABLES, type ReadingKind } from "@uday/core";
import { one, q } from "./db";
import { dec, enc } from "./crypto";
import { AppError, familyRole } from "./bookings";
import type { SessionUser } from "./auth";

/** One stream of readings per senior, from caregivers, family entries and connected devices. Values are encrypted. */
async function recipientFor(u: SessionUser, recipientId?: string) {
  if (u.role === "senior") {
    const r = await one<{ id: string }>("SELECT id FROM care_recipients WHERE senior_user_id=$1 ORDER BY created_at LIMIT 1", [u.id]);
    if (!r) throw new AppError("Profile not linked", 404); return r.id;
  }
  if (!recipientId || !(await familyRole(u.id, recipientId))) throw new AppError("Not allowed", 403);
  return recipientId;
}
function valid(kind: string, value: number): kind is ReadingKind {
  if (!(kind in READING_KINDS)) return false;
  const [lo, hi] = READING_RANGE[kind as ReadingKind]; return Number.isFinite(value) && value >= lo && value <= hi;
}

export async function list(u: SessionUser, recipientId: string, days = 30) {
  const rid = await recipientFor(u, recipientId);
  const rows = await q<any>("SELECT kind, value_enc, source, device, recorded_at FROM readings WHERE care_recipient_id=$1 AND recorded_at > now() - ($2 || ' days')::interval ORDER BY recorded_at", [rid, String(Math.min(days, 365))]);
  return rows.map((r) => ({ kind: r.kind, value: Number(dec(r.value_enc)), source: r.source, device: r.device, at: r.recorded_at }));
}

export async function addManual(u: SessionUser, recipientId: string, items: { kind: string; value: number; at?: string }[]) {
  const rid = await recipientFor(u, recipientId);
  let n = 0;
  for (const it of items.slice(0, 20)) {
    if (!valid(it.kind, it.value)) throw new AppError(`Check the ${READING_KINDS[it.kind as ReadingKind]?.[0] ?? it.kind} value`);
    await q("INSERT INTO readings (care_recipient_id, kind, value_enc, source, recorded_at, created_by) VALUES ($1,$2,$3,'family',$4,$5)", [rid, it.kind, enc(String(it.value), "health"), it.at ?? new Date().toISOString(), u.id]); n++;
  }
  return { saved: n };
}

/** Device data posted by the Uday app on the senior's phone (Apple Health or Health Connect) or by a cloud connector. */
export async function ingest(u: SessionUser, device: string, items: { kind: string; value: number; at: string }[], recipientId?: string) {
  if (!WEARABLES.some((w) => w.id === device)) throw new AppError("Unknown device");
  const rid = await recipientFor(u, recipientId);
  const conn = await one<any>("SELECT id FROM device_connections WHERE care_recipient_id=$1 AND device=$2 AND status<>'disconnected'", [rid, device]);
  if (!conn) throw new AppError("Connect this device first", 409);
  let n = 0;
  for (const it of items.slice(0, 500)) {
    if (!valid(it.kind, it.value) || Number.isNaN(Date.parse(it.at))) continue;
    // Skip duplicates from repeated syncs.
    const dup = await one("SELECT 1 FROM readings WHERE care_recipient_id=$1 AND kind=$2 AND device=$3 AND recorded_at=$4", [rid, it.kind, device, it.at]);
    if (dup) continue;
    await q("INSERT INTO readings (care_recipient_id, kind, value_enc, source, device, recorded_at, created_by) VALUES ($1,$2,$3,'device',$4,$5,$6)", [rid, it.kind, enc(String(it.value), "health"), device, it.at, u.id]); n++;
  }
  await q("UPDATE device_connections SET status='connected', last_sync_at=now() WHERE id=$1", [conn.id]);
  return { saved: n };
}

export async function devices(u: SessionUser, recipientId: string) {
  const rid = await recipientFor(u, recipientId);
  const conns = await q<any>("SELECT device, status, last_sync_at FROM device_connections WHERE care_recipient_id=$1", [rid]);
  const by = new Map(conns.map((c) => [c.device, c]));
  return WEARABLES.map((w) => ({ ...w, status: by.get(w.id)?.status ?? "not_connected", lastSyncAt: by.get(w.id)?.last_sync_at ?? null }));
}

export async function connect(u: SessionUser, recipientId: string, device: string, disconnect = false) {
  const rid = await recipientFor(u, recipientId);
  const w = WEARABLES.find((x) => x.id === device);
  if (!w) throw new AppError("Unknown device");
  if (disconnect) { await q("UPDATE device_connections SET status='disconnected' WHERE care_recipient_id=$1 AND device=$2", [rid, device]); return { status: "disconnected" }; }
  await q(`INSERT INTO device_connections (care_recipient_id, device, via, status, connected_by) VALUES ($1,$2,$3,'pending',$4)
    ON CONFLICT (care_recipient_id, device) DO UPDATE SET status='pending', connected_by=EXCLUDED.connected_by`, [rid, device, w.via, u.id]);
  return w.via === "phone"
    ? { status: "pending", next: `On your parent's phone: open the Uday app, tap Health devices, allow ${w.path.includes("Apple") ? "Apple Health" : "Health Connect"}. Readings start arriving after the first sync.` }
    : { status: "pending", next: "Sign in to the device maker's account to allow Uday to read measurements.", authorizeUrl: null };
}
