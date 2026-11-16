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

export async function pushToUser(userId: string, m: PushMessage) {
  if (process.env.PUSH_PROVIDER !== "expo") return { sent: 0 };
  const tokens = (await q<{ token: string }>("SELECT token FROM push_tokens WHERE user_id=$1", [userId])).map((r) => r.token);
  const messages = buildExpoMessages(tokens, m);
  if (!messages.length) return { sent: 0 };
  const r = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
    body: JSON.stringify(messages),
  });
  const j: any = await r.json().catch(() => ({}));
  // Remove tokens the service reports as no longer registered.
  (j.data ?? []).forEach((t: any, i: number) => { if (t?.details?.error === "DeviceNotRegistered") q("DELETE FROM push_tokens WHERE token=$1", [messages[i].to]).catch(() => {}); });
  return { sent: messages.length };
}
