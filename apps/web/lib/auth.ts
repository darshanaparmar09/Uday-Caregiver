import { SignJWT, jwtVerify } from "jose";
import { randomInt } from "node:crypto";
import { cookies, headers } from "next/headers";
import { one, q } from "./db";
import { enc, lookupHash, normalisePhone } from "./crypto";
import { sendOtp } from "./notify";
import { TEST_MODE } from "./env";

export type Role = "family" | "caregiver" | "senior" | "ops";
export interface SessionUser { id: string; role: Role; name: string | null; phoneLast4: string; sessionId: string }

const COOKIE = "uday_session";
const SESSION_DAYS = 30;
const OTP_TTL_MIN = 5;
const OTP_MAX_ATTEMPTS = 5;
const OTP_MAX_SENDS_PER_HOUR = 5;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  return new TextEncoder().encode(s);
}

export class AuthError extends Error { constructor(msg: string, public status = 401) { super(msg); } }

export async function requestOtp(rawPhone: string): Promise<{ sent: true; devCode?: string }> {
  const phone = normalisePhone(rawPhone);
  const h = lookupHash(phone);
  const prev = await one<{ sent_count: number; window_start: Date }>("SELECT sent_count, window_start FROM otp_codes WHERE phone_hash=$1", [h]);
  const inWindow = prev && Date.now() - new Date(prev.window_start).getTime() < 3600e3;
  if (inWindow && prev!.sent_count >= OTP_MAX_SENDS_PER_HOUR) throw new AuthError("Too many codes requested. Try again in an hour.", 429);
  // Development and automated tests can pin the code. Never set OTP_DEV_CODE in production.
  const code = TEST_MODE && process.env.OTP_DEV_CODE ? process.env.OTP_DEV_CODE : String(randomInt(100000, 1000000));
  await q(
    `INSERT INTO otp_codes (phone_hash, code_hash, expires_at, attempts, sent_count, window_start)
     VALUES ($1,$2, now() + interval '${OTP_TTL_MIN} minutes', 0, 1, now())
     ON CONFLICT (phone_hash) DO UPDATE SET code_hash=EXCLUDED.code_hash, expires_at=EXCLUDED.expires_at, attempts=0,
       sent_count = CASE WHEN otp_codes.window_start > now() - interval '1 hour' THEN otp_codes.sent_count + 1 ELSE 1 END,
       window_start = CASE WHEN otp_codes.window_start > now() - interval '1 hour' THEN otp_codes.window_start ELSE now() END`,
    [h, lookupHash("otp:" + phone + ":" + code)]
  );
  await sendOtp(phone, code);
  return TEST_MODE && process.env.OTP_DEV_CODE ? { sent: true, devCode: code } : { sent: true };
}

export async function verifyOtp(rawPhone: string, code: string, opts: { name?: string; role?: Role } = {}) {
  const phone = normalisePhone(rawPhone);
  const h = lookupHash(phone);
  const row = await one<{ code_hash: string; expires_at: Date; attempts: number }>("SELECT * FROM otp_codes WHERE phone_hash=$1", [h]);
  if (!row || new Date(row.expires_at) < new Date()) throw new AuthError("Code expired. Request a new one.");
  if (row.attempts >= OTP_MAX_ATTEMPTS) throw new AuthError("Too many wrong attempts. Request a new code.", 429);
  if (row.code_hash !== lookupHash("otp:" + phone + ":" + code)) {
    await q("UPDATE otp_codes SET attempts = attempts + 1 WHERE phone_hash=$1", [h]);
    throw new AuthError("That code is not right.");
  }
  await q("DELETE FROM otp_codes WHERE phone_hash=$1", [h]);

  let user = await one<any>("SELECT * FROM users WHERE phone_hash=$1", [h]);
  if (!user) {
    // Self sign up can only create family or senior accounts. Caregivers and ops are created by Uday.
    const role: Role = opts.role === "senior" ? "senior" : "family";
    user = await one("INSERT INTO users (phone_hash, phone_enc, phone_last4, name, role) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [h, enc(phone), phone.slice(-4), opts.name ?? null, role]);
  }
  if (user.role === "senior" || opts.role === "senior") {
    await q("UPDATE care_recipients SET senior_user_id=$1 WHERE senior_phone_hash=$2 AND senior_user_id IS NULL", [user.id, h]);
  }
  const s = await one<{ id: string }>(`INSERT INTO sessions (user_id, expires_at) VALUES ($1, now() + interval '${SESSION_DAYS} days') RETURNING id`, [user.id]);
  const token = await new SignJWT({ sid: s!.id }).setProtectedHeader({ alg: "HS256" }).setSubject(user.id)
    .setIssuedAt().setExpirationTime(`${SESSION_DAYS}d`).sign(secret());
  return { token, user: { id: user.id, role: user.role as Role, name: user.name } };
}

export function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_DAYS * 86400 });
}
export function clearSessionCookie() { cookies().delete(COOKIE); }

/** Reads the session from the cookie (website) or the Authorization header (mobile app). */
export async function currentUser(): Promise<SessionUser | null> {
  const auth = headers().get("authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : cookies().get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const u = await one<any>(
      `SELECT u.id, u.role, u.name, u.phone_last4, s.id AS sid FROM sessions s JOIN users u ON u.id=s.user_id
       WHERE s.id=$1 AND s.revoked_at IS NULL AND s.expires_at > now()`, [payload.sid]);
    return u ? { id: u.id, role: u.role, name: u.name, phoneLast4: u.phone_last4, sessionId: u.sid } : null;
  } catch { return null; }
}

export async function requireUser(...roles: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new AuthError("Please sign in.");
  if (roles.length && !roles.includes(u.role)) throw new AuthError("Not allowed for this account.", 403);
  return u;
}

export async function revokeSession(sessionId: string) { await q("UPDATE sessions SET revoked_at=now() WHERE id=$1", [sessionId]); }
