import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { enc, dec, type KeyClass } from "./crypto";
import { TEST_MODE } from "./env";
import { s3 } from "./s3";

/**
 * Encrypted document storage. Each file gets its own random key (AES-256-GCM); that key is itself
 * encrypted with the class key and stored in the database. The storage bucket only ever holds ciphertext.
 * STORAGE=local writes to ./.uploads (development and tests only).
 * STORAGE=s3 writes to a private S3 or S3 compatible bucket (lib/s3.ts): set S3_BUCKET, S3_REGION (ap-south-1),
 * S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, and S3_ENDPOINT for a non AWS store.
 */
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export async function putEncrypted(data: Buffer, mime: string, cls: KeyClass) {
  if (!ALLOWED.includes(mime)) throw new Error("Only JPG, PNG, WEBP or PDF files are accepted");
  if (data.length > MAX_BYTES) throw new Error("File is larger than 5 MB");
  const fileKey = randomBytes(32), iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", fileKey, iv);
  const body = Buffer.concat([iv, c.update(data), c.final(), c.getAuthTag()]);
  const key = `docs/${new Date().toISOString().slice(0, 7)}/${randomUUID()}`;
  await driver().put(key, body);
  return { storageKey: key, fileKeyEnc: enc(fileKey.toString("base64"), cls)!, bytes: data.length };
}

export async function getDecrypted(storageKey: string, fileKeyEnc: string): Promise<Buffer> {
  const body = await driver().get(storageKey);
  const k = Buffer.from(dec(fileKeyEnc)!, "base64");
  const iv = body.subarray(0, 12), tag = body.subarray(body.length - 16), ct = body.subarray(12, body.length - 16);
  const d = createDecipheriv("aes-256-gcm", k, iv); d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

/** Removes a stored file for good (document deleted by the family, or account deletion). Missing files are ignored. */
export async function removeStored(storageKey: string) { await driver().del(storageKey).catch((e) => console.error("[storage] delete failed", storageKey, e?.message)); }

interface Driver { put(key: string, body: Buffer): Promise<void>; get(key: string): Promise<Buffer>; del(key: string): Promise<void> }
function driver(): Driver {
  const s = process.env.STORAGE ?? "local";
  if (s === "local") {
    if (!TEST_MODE) throw new Error("Local storage is for development only. Set STORAGE=s3 in production.");
    const root = process.env.LOCAL_STORAGE_DIR ?? join(process.cwd(), ".uploads");
    return {
      async put(key, body) { const p = join(root, key); await mkdir(join(p, ".."), { recursive: true }); await writeFile(p, body); },
      async get(key) { return readFile(join(root, key)); },
      async del(key) { await rm(join(root, key), { force: true }); },
    };
  }
  if (s === "s3") return s3;
  throw new Error(`Storage driver ${s} is not supported. Use local or s3.`);
}
