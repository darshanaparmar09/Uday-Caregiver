import { tfetch } from "./net";
import { q } from "./db";
/**
 * Push notifications through the Expo push service (works for both Android and iPhone builds made with EAS).
 * PUSH_PROVIDER=expo sends; anything else only records. Docs: https://docs.expo.dev/push-notifications/sending-notifications/
 */
export interface PushMessage { title: string; body: string; data?: Record<string, unknown>; urgent?: boolean }

export function buildExpoMessages(tokens: string[], m: PushMessage) {
  return tokens.filter((t) => /^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/.test(t)).map((to) => ({
    to, title: m.title, body: m.body, data: m.data ?? {}, sound: "default",
    priority: m.urgent ? "high" : "default", channelId: m.urgent ? "urgent" : "default", ttl: m.urgent ? 1800 : 86400,
  }));
}

export interface PushResult { tokens: number; sent: number; failed: number; simulated: boolean; error?: string }
/**
 * Sends to every device the user has registered and reports what really happened:
 * sent = tickets Expo accepted; failed = refused; simulated = push is not switched on (test mode), nothing left the server.
 * "sent" means the push service accepted the message, not that the person saw it.
 */
export async function pushToUser(userId: string, m: PushMessage): Promise<PushResult> {
  const tokens = (await q<{ token: string }>("SELECT token FROM push_tokens WHERE user_id=$1", [userId])).map((r) => r.token);
  const messages = buildExpoMessages(tokens, m);
  if (process.env.PUSH_PROVIDER !== "expo") return { tokens: messages.length, sent: 0, failed: 0, simulated: true };
  if (!messages.length) return { tokens: 0, sent: 0, failed: 0, simulated: false };
  let r: Response;
  try { r = await tfetch("https://exp.host/--/api/v2/push/send", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify(messages) }); }
  catch (e: any) { return { tokens: messages.length, sent: 0, failed: messages.length, simulated: false, error: String(e?.message ?? e).slice(0, 200) }; }
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { tokens: messages.length, sent: 0, failed: messages.length, simulated: false, error: `Expo answered ${r.status}` };
  let sent = 0, failed = 0; let error: string | undefined;
  (j.data ?? []).forEach((t: any, i: number) => {
    if (t?.status === "ok") sent++; else { failed++; error = t?.message ?? t?.details?.error ?? "refused"; }
    // Remove tokens the service reports as no longer registered.
    if (t?.details?.error === "DeviceNotRegistered") q("DELETE FROM push_tokens WHERE token=$1", [messages[i].to]).catch(() => {});
  });
  return { tokens: messages.length, sent, failed, simulated: false, error };
}
