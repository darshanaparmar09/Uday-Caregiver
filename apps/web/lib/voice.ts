import { one, q } from "./db";
import { dec, enc } from "./crypto";
import type { SessionUser } from "./auth";
import { AppError } from "./bookings";
import { familyRole } from "./bookings";
import { limit } from "./ratelimit";
import { putEncrypted, getDecrypted, AUDIO_MIMES } from "./storage";
import { claudeJson, transcribe, voiceConnected } from "./providers";
import { aiAllowed } from "./insights";
import { notify } from "./notify";
import { recipientOf } from "./senior";

/**
 * Voice: "Speak to Uday" for seniors, a voice for the companion, and dictation for caregivers.
 * Speech is turned into text by Sarvam AI when connected. A senior's spoken request is always kept, encrypted,
 * so a person can listen to it when no transcript exists. Nothing spoken ever decides care on its own.
 */
export const VOICE_ABOUT = [
  "When you speak to Uday, your voice is recorded and sent to Sarvam AI, an Indian company, to turn it into text.",
  "Your family and the Uday team can read it and listen to it. It is kept for 90 days.",
  "If you ask for urgent help, your family and the Uday team are alerted. In an emergency press SOS or call 112.",
];
export const CAREGIVER_VOICE_ABOUT = [
  "Your voice is sent to Sarvam AI, an Indian company, only to turn it into text. The recording is not kept.",
  "Read the text before you save the note. You are responsible for what the note says.",
];
const MAX_BYTES = 2_000_000;
const MIMES = /^audio\/(m4a|mp4|x-m4a|aac|mpeg|mp3|wav|x-wav|webm|ogg|3gpp|amr)(;.*)?$/;

export async function voiceStatus(u: SessionUser) {
  const consented = u.role === "caregiver"
    ? !!(await one("SELECT 1 FROM caregivers WHERE user_id=$1 AND voice_consent_at IS NOT NULL", [u.id]))
    : !!(await one("SELECT 1 FROM senior_settings WHERE user_id=$1 AND voice_consent_at IS NOT NULL", [u.id]));
  return { consented, connected: await voiceConnected(), about: u.role === "caregiver" ? CAREGIVER_VOICE_ABOUT : VOICE_ABOUT };
}
export async function voiceConsent(u: SessionUser, agree: boolean) {
  if (u.role === "caregiver") await q("UPDATE caregivers SET voice_consent_at=CASE WHEN $2::boolean THEN COALESCE(voice_consent_at, now()) END WHERE user_id=$1", [u.id, agree]);
  else if (u.role === "senior") await q("INSERT INTO senior_settings (user_id, voice_consent_at) VALUES ($1, CASE WHEN $2::boolean THEN now() END) ON CONFLICT (user_id) DO UPDATE SET voice_consent_at=CASE WHEN $2::boolean THEN COALESCE(senior_settings.voice_consent_at, now()) END", [u.id, agree]);
  else throw new AppError("For seniors and caregivers", 403);
  return { consented: agree };
}
async function needConsent(u: SessionUser) { if (!(await voiceStatus(u)).consented) throw new AppError("Please read how voice works and agree first", 428); }
function checkAudio(audio: Buffer, mime: string) {
  if (!audio.length) throw new AppError("Nothing was recorded. Please try again.");
  if (audio.length > MAX_BYTES) throw new AppError("That recording is too long. Please keep it under 30 seconds.", 413);
  if (!MIMES.test(mime)) throw new AppError("This recording format is not supported", 415);
}
async function lang(u: SessionUser) { return (await one<{ language: string }>("SELECT language FROM senior_settings WHERE user_id=$1", [u.id]))?.language ?? (await one<{ language: string }>("SELECT language FROM users WHERE id=$1", [u.id]))?.language ?? undefined; }

/** Caregiver dictation: speech in, text out. The recording is not stored. */
export async function dictate(u: SessionUser, audio: Buffer, mime: string) {
  if (u.role !== "caregiver") throw new AppError("For caregivers", 403);
  await needConsent(u); checkAudio(audio, mime);
  await limit(`dictate:${u.id}`, 60, 3600, "Too many recordings in an hour. Please type the note.");
  const t = await transcribe(audio, mime, await lang(u));
  if (!t) throw new AppError("Voice typing is not set up yet. Use the microphone on your phone's keyboard instead.", 503, { voiceOff: true });
  return { text: t.text, language: t.language };
}
/** The companion with a voice: speech to text, then the normal companion reply (which the app reads aloud). */
export async function speakToCompanion(u: SessionUser, audio: Buffer, mime: string) {
  if (u.role !== "senior") throw new AppError("For seniors", 403);
  await needConsent(u); checkAudio(audio, mime);
  const t = await transcribe(audio, mime, await lang(u));
  if (!t) throw new AppError("Voice is not set up yet. Please type, or use Speak to Uday.", 503, { voiceOff: true });
  if (!t.text) throw new AppError("Sorry, I could not hear that. Please try again.");
  const { companion } = await import("./family");
  return { heard: t.text, ...(await companion(u, t.text)) };
}

// ───────── Speak to Uday ─────────
const URGENT = /\b(help|emergency|ambulance|fell|fallen|chest pain|can'?t breathe|cannot breathe|bleeding)\b|मदत|मदद|बचाओ/i;
const RULES: [string, RegExp][] = [
  ["book_caregiver", /\b(caregiver|attendant|nurse|someone to stay|maid)\b/i],
  ["care_help", /\b(bath|bathe|toilet|dress|walk|eat|food|cook)\b/i],
  ["appointment", /\b(doctor|appointment|hospital|test|check ?up)\b/i],
  ["talk_to_family", /\b(call|talk to|speak to) (my )?(son|daughter|family|beta|beti)\b/i],
];
const CATEGORY_WORDS: Record<string, string> = { unknown: "Not yet heard", care_help: "Help with daily care", book_caregiver: "Wants a caregiver", appointment: "Doctor or appointment", talk_to_family: "Wants to talk to family", urgent: "Asked for urgent help", other: "Other" };

/**
 * A senior speaks a request. It is stored, turned into text when possible, sorted, and sent to the family and
 * the Uday team. Urgent words raise an alert. The family or Uday confirms anything before it happens.
 */
export async function speakToUday(u: SessionUser, audio: Buffer, mime: string) {
  const r = await recipientOf(u);
  await needConsent(u); checkAudio(audio, mime);
  await limit(`voice:${u.id}`, 20, 3600, "Let us rest a little. Press SOS if you need help now.");
  const stored = await putEncrypted(audio, mime.split(";")[0], "health", AUDIO_MIMES);
  let t: { text: string; language: string | null } | null = null;
  try { t = await transcribe(audio, mime, await lang(u)); } catch (e) { console.error("[voice] transcription failed", (e as Error).message); }
  const text = t?.text ?? "";
  let category = text ? "other" : "unknown", summary: string | null = null, source: "rules" | "ai" | null = text ? "rules" : null;
  if (text && URGENT.test(text)) category = "urgent";
  else if (text) for (const [c, re] of RULES) if (re.test(text)) { category = c; break; }
  if (text && (await aiAllowed(r.id))) {
    const ai = await claudeJson<{ category: string; summary: string }>(`You sort what an older person said to an elder care service in India. They may speak Marathi, Hindi or English. Choose one category: urgent (they say they need help now, are hurt, fell, or feel very unwell), care_help, book_caregiver, appointment, talk_to_family, other. Write a one sentence summary in English for their family. Never diagnose. Format: {"category":"...","summary":"..."}`, text, 200);
    if (ai && CATEGORY_WORDS[ai.category] && ai.category !== "unknown") {
      // AI may raise the level to urgent, but never lower a request the rules already found urgent.
      if (category !== "urgent") category = ai.category;
      summary = String(ai.summary ?? "").slice(0, 300); source = "ai";
    }
  }
  const row = await one<{ id: string }>(`INSERT INTO voice_requests (user_id, care_recipient_id, storage_key, file_key_enc, mime, bytes, transcript_enc, language, category, summary_enc, source)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [u.id, r.id, stored.storageKey, stored.fileKeyEnc, mime.split(";")[0], audio.length, text ? enc(text, "health") : null, t?.language ?? null, category, summary ? enc(summary, "health") : null, source]);
  let alert: any = null;
  if (category === "urgent") {
    const { raiseAlert } = await import("./alerts");
    alert = await raiseAlert({ kind: "voice_help", recipientId: r.id, raisedBy: u.id, raisedRole: "senior" }).catch((e) => { console.error("[voice] alert failed", e); return null; });
  }
  const fam = await q<{ user_id: string }>("SELECT user_id FROM family_members WHERE care_recipient_id=$1 AND accepted_at IS NOT NULL", [r.id]);
  const outcomes = await Promise.all(fam.map((f) => notify(f.user_id, "voice_request", { requestId: row!.id, recipientId: r.id, category })));
  await notify(null, "voice_request", { requestId: row!.id, recipientId: r.id, category });
  return { id: row!.id, heard: text || null, category, what: CATEGORY_WORDS[category], familyTold: outcomes.filter((o) => o.status === "sent").length, alert };
}

function shape(v: any) {
  return { id: v.id, recipientId: v.care_recipient_id, name: v.name, heard: dec(v.transcript_enc), summary: dec(v.summary_enc), category: v.category, what: CATEGORY_WORDS[v.category] ?? v.category,
    source: v.source, status: v.status, at: v.created_at, hasAudio: true, locality: v.locality };
}
export async function familyVoiceRequests(u: SessionUser) {
  return (await q<any>(`SELECT v.*, r.name, r.locality FROM voice_requests v JOIN care_recipients r ON r.id=v.care_recipient_id
    JOIN family_members f ON f.care_recipient_id=v.care_recipient_id AND f.user_id=$1 AND f.accepted_at IS NOT NULL
    WHERE v.created_at > now() - interval '30 days' ORDER BY v.created_at DESC LIMIT 30`, [u.id])).map(shape);
}
export async function opsVoiceRequests(open = true) {
  return (await q<any>(`SELECT v.*, r.name, r.locality FROM voice_requests v LEFT JOIN care_recipients r ON r.id=v.care_recipient_id
    WHERE ($1::boolean = false OR v.status IN ('new','seen')) ORDER BY v.created_at DESC LIMIT 100`, [open])).map(shape);
}
async function canSee(u: SessionUser, v: any, ops: boolean) { return ops || (v.care_recipient_id && (await familyRole(u.id, v.care_recipient_id))); }
export async function setVoiceStatus(u: SessionUser, id: string, status: "seen" | "done" | "dismissed", ops = false) {
  const v = await one<any>("SELECT * FROM voice_requests WHERE id=$1", [id]); if (!v || !(await canSee(u, v, ops))) throw new AppError("Not found", 404);
  await q("UPDATE voice_requests SET status=$2, handled_by=$3, handled_at=now() WHERE id=$1", [id, status, u.id]);
  return { ok: true };
}
export async function voiceAudio(u: SessionUser, id: string, ops = false) {
  const v = await one<any>("SELECT * FROM voice_requests WHERE id=$1", [id]); if (!v || !(await canSee(u, v, ops))) throw new AppError("Not found", 404);
  if (ops) await q("INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES ($1,'listen','voice_request',$2)", [u.id, id]);
  return { body: await getDecrypted(v.storage_key, v.file_key_enc), mime: v.mime as string };
}
/** Spoken requests are kept for 90 days. */
export async function sweepVoice() {
  const old = await q<{ storage_key: string }>("DELETE FROM voice_requests WHERE created_at < now() - interval '90 days' RETURNING storage_key");
  const { removeStored } = await import("./storage"); for (const o of old) await removeStored(o.storage_key);
  return { removed: old.length };
}
