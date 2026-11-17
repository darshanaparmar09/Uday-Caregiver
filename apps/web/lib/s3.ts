import { createHash, createHmac } from "node:crypto";
import { tfetch } from "./net";

/**
 * Minimal S3 client (PUT, GET, DELETE of one object) with AWS Signature Version 4, so no SDK is needed.
 * Works with AWS S3 (use an Indian region such as ap-south-1), and S3 compatible stores (Cloudflare R2, MinIO)
 * through S3_ENDPOINT. The signer is checked in tests against the worked example in the AWS documentation.
 * It has not yet been run against a live bucket: do one upload and download on staging before launch.
 */
export interface S3Config { bucket: string; region: string; accessKeyId: string; secretAccessKey: string; endpoint?: string; pathStyle?: boolean }
const sha = (d: Buffer | string) => createHash("sha256").update(d).digest("hex");
const hmac = (k: Buffer | string, d: string) => createHmac("sha256", k).update(d).digest();
const encPath = (k: string) => k.split("/").map((s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())).join("/");

export function s3Url(c: S3Config, key: string) {
  if (c.endpoint) { const e = c.endpoint.replace(/\/$/, ""); return c.pathStyle === false ? e.replace("://", `://${c.bucket}.`) + "/" + encPath(key) : `${e}/${c.bucket}/${encPath(key)}`; }
  return `https://${c.bucket}.s3.${c.region}.amazonaws.com/${encPath(key)}`;
}
/** Returns the headers for a signed request. Exported for the test against the AWS documentation example. */
export function signV4(c: S3Config, method: string, url: string, payloadHash: string, extra: Record<string, string> = {}, now = new Date()) {
  const u = new URL(url); const amzDate = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); const day = amzDate.slice(0, 8);
  const headers: Record<string, string> = { host: u.host, "x-amz-content-sha256": payloadHash, "x-amz-date": amzDate, ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k.toLowerCase(), v.trim()])) };
  const names = Object.keys(headers).sort(); const signed = names.join(";");
  const query = [...u.searchParams.entries()].map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).sort().join("&");
  const canonical = [method, u.pathname, query, names.map((n) => `${n}:${headers[n]}\n`).join(""), signed, payloadHash].join("\n");
  const scope = `${day}/${c.region}/s3/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha(canonical)].join("\n");
  const key = hmac(hmac(hmac(hmac("AWS4" + c.secretAccessKey, day), c.region), "s3"), "aws4_request");
  const signature = createHmac("sha256", key).update(toSign).digest("hex");
  return { ...headers, Authorization: `AWS4-HMAC-SHA256 Credential=${c.accessKeyId}/${scope},SignedHeaders=${signed},Signature=${signature}` };
}
export function s3Config(): S3Config {
  const need = (k: string) => { const v = process.env[k]; if (!v) throw new Error(`Missing ${k} for S3 storage`); return v; };
  return { bucket: need("S3_BUCKET"), region: process.env.S3_REGION ?? "ap-south-1", accessKeyId: need("S3_ACCESS_KEY_ID"), secretAccessKey: need("S3_SECRET_ACCESS_KEY"), endpoint: process.env.S3_ENDPOINT || undefined, pathStyle: process.env.S3_FORCE_PATH_STYLE !== "false" };
}
async function call(method: string, key: string, body?: Buffer) {
  const c = s3Config(); const url = s3Url(c, key); const hash = sha(body ?? "");
  const send: Record<string, string> = signV4(c, method, url, hash, body ? { "content-type": "application/octet-stream", "x-amz-server-side-encryption": "AES256" } : {});
  delete send.host; // fetch sets Host itself
  const r = await tfetch(url, { method, headers: send, body: body ? new Uint8Array(body) : undefined }, 20000);
  if (!r.ok && !(method === "DELETE" && r.status === 404)) throw new Error(`Storage ${method} failed: ${r.status} ${(await r.text().catch(() => "")).slice(0, 120)}`);
  return r;
}
export const s3 = {
  async put(key: string, body: Buffer) { await call("PUT", key, body); },
  async get(key: string) { return Buffer.from(await (await call("GET", key)).arrayBuffer()); },
  async del(key: string) { await call("DELETE", key); },
};
