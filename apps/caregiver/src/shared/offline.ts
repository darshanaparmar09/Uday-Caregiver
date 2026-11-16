// GENERATED from packages/mobile-shared/src/offline.ts. Do not edit here; run node scripts/sync-mobile-shared.mjs
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

/**
 * Low data and offline support for caregivers.
 * - cachedGet: shows the last saved copy when the network is down.
 * - queue: shift logs written without signal are saved on the phone and sent automatically later.
 * Actions that need a live check (codes, accept) are never queued.
 */
const OUTBOX = "uday_outbox";
const isNetwork = (e: any) => !e?.status; // fetch failed before the server answered

export async function cachedGet<T>(path: string): Promise<{ data: T | null; offline: boolean }> {
  try { const d = await api<T>(path); AsyncStorage.setItem("cache:" + path, JSON.stringify(d)).catch(() => {}); return { data: d, offline: false }; }
  catch (e: any) { if (!isNetwork(e)) throw e; const s = await AsyncStorage.getItem("cache:" + path).catch(() => null); return { data: s ? JSON.parse(s) : null, offline: true }; }
}

export async function sendOrQueue(path: string, body: unknown): Promise<{ queued: boolean }> {
  try { await api(path, body); return { queued: false }; }
  catch (e: any) {
    if (!isNetwork(e)) throw e;
    const box = JSON.parse((await AsyncStorage.getItem(OUTBOX)) ?? "[]");
    box.push({ path, body, at: Date.now() }); await AsyncStorage.setItem(OUTBOX, JSON.stringify(box));
    return { queued: true };
  }
}

export async function pending(): Promise<number> { return JSON.parse((await AsyncStorage.getItem(OUTBOX).catch(() => null)) ?? "[]").length; }

export async function flush(): Promise<number> {
  const box: any[] = JSON.parse((await AsyncStorage.getItem(OUTBOX).catch(() => null)) ?? "[]");
  if (!box.length) return 0;
  const left: any[] = []; let sent = 0;
  for (const item of box) {
    try { await api(item.path, item.body); sent++; }
    catch (e: any) { if (isNetwork(e)) left.push(item); /* a server refusal is dropped: the shift has moved on */ }
  }
  await AsyncStorage.setItem(OUTBOX, JSON.stringify(left));
  return sent;
}
