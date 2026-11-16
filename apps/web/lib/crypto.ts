import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";

/**
 * Field level encryption (the "third lock" in the Onboarding Specification).
 * Two key classes so a leak of one never exposes the other:
 *   pii    : phone numbers, addresses, date of birth, access notes, codes
 *   health : allergies, conditions, medicines, doctors, shift notes, documents
 *   secret : provider keys entered in the admin module (SMS, payments, calls, AI)
 * Keys are 32 random bytes, base64, supplied by the key vault through env vars.
 * Format: v1.<class>.<iv>.<tag>.<ciphertext>   (all base64url)
 */
export type KeyClass = "pii" | "health" | "secret";

function key(cls: KeyClass): Buffer {
  // In development the secret class may borrow the pii key; production must set FIELD_KEY_SECRET.
  const v = cls === "pii" ? process.env.FIELD_KEY_PII : cls === "health" ? process.env.FIELD_KEY_HEALTH
    : process.env.FIELD_KEY_SECRET ?? (["development", "staging"].includes(process.env.UDAY_ENV ?? "") ? process.env.FIELD_KEY_PII : undefined);
  if (!v) throw new Error(`Missing FIELD_KEY_${cls.toUpperCase()}`);
  const k = Buffer.from(v, "base64");
  if (k.length !== 32) throw new Error(`FIELD_KEY_${cls.toUpperCase()} must be 32 bytes base64`);
  return k;
}

export function enc(plain: string | null | undefined, cls: KeyClass = "pii"): string | null {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(cls), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", cls, iv.toString("base64url"), c.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function dec(blob: string | null | undefined): string | null {
  if (!blob) return null;
  const [v, cls, iv, tag, ct] = blob.split(".");
  if (v !== "v1") throw new Error("unknown ciphertext version");
  const d = createDecipheriv("aes-256-gcm", key(cls as KeyClass), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
}

export function encJson(v: unknown, cls: KeyClass = "health") { return v == null ? null : enc(JSON.stringify(v), cls); }
export function decJson<T>(blob: string | null | undefined): T | null { const s = dec(blob); return s ? (JSON.parse(s) as T) : null; }

/** Deterministic lookup hash, so encrypted phone numbers can still be found at login. */
export function lookupHash(value: string): string {
  const k = process.env.LOOKUP_KEY;
  if (!k) throw new Error("Missing LOOKUP_KEY");
  return createHmac("sha256", k).update(value).digest("hex");
}

/** Normalise to E.164. Indian numbers without a country code get +91. */
export function normalisePhone(raw: string): string {
  const d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) { if (!/^\+\d{8,15}$/.test(d)) throw new Error("Invalid phone number"); return d; }
  const n = d.replace(/^0+/, "");
  if (/^[6-9]\d{9}$/.test(n)) return "+91" + n;
  throw new Error("Invalid phone number. Add the country code for numbers outside India.");
}
