// GENERATED from packages/mobile-shared/src/offline.ts. Do not edit here; run node scripts/sync-mobile-shared.mjs
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "./api";

/**
 * Low data and offline support for caregivers.
 * - cachedGet: shows the last saved copy when the network is down. Wiped on sign out.
 * - sendOrQueue: care logs written without signal are saved on the phone and sent later.
 *   Each log carries its own id, so if the phone sends it twice the server records it once.
 *   A log the server refuses is never dropped silently: it moves to a "not accepted" list the caregiver can see.
 * Actions that need a live check (codes, accept) are never queued.
 */
const OUTBOX = "uday_outbox", REFUSED = "uday_refused";
const isNetwork = (e: any) => !e?.status; // fetch failed before the server answered
const opId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 10)}`;
const read = async (k: string): Promise<any[]> => { try { return JSON.parse((await AsyncStorage.getItem(k)) ?? "[]"); } catch { return []; } };

export async function cachedGet<T>(path: string): Promise<{ data: T | null; offline: boolean }> {
  try { const d = await api<T>(path); AsyncStorage.setItem("cache:" + path, JSON.stringify(d)).catch(() => {}); return { data: d, offline: false }; }
  catch (e: any) {
    // 401 or 403: access was taken away (signed out elsewhere, booking ended, account paused). The saved copy must go too.
    if (e?.status === 401 || e?.status === 403) { await AsyncStorage.removeItem("cache:" + path).catch(() => {}); throw e; }
    if (!isNetwork(e)) throw e;
    const s = await AsyncStorage.getItem("cache:" + path).catch(() => null); return { data: s ? JSON.parse(s) : null, offline: true };
  }
}

export async function sendOrQueue(path: string, body: unknown): Promise<{ queued: boolean }> {
  const op = opId();
  try { await api(path, body, undefined, { "X-Client-Op": op }); return { queued: false }; }
  catch (e: any) {
    if (!isNetwork(e)) throw e;
    const box = await read(OUTBOX); box.push({ op, path, body, at: Date.now() }); await AsyncStorage.setItem(OUTBOX, JSON.stringify(box));
    return { queued: true };
  }
}

export async function pending(): Promise<number> { return (await read(OUTBOX)).length; }
/** Logs the server would not accept, with the reason. Shown to the caregiver so nothing is lost without her knowing. */
export async function refused(): Promise<{ at: number; error: string; body: any }[]> { return read(REFUSED); }
export async function clearRefused() { await AsyncStorage.removeItem(REFUSED).catch(() => {}); }

let flushing: Promise<number> | null = null;
/** Sends queued logs in order. Only one run at a time, so a slow connection cannot send the same log twice. */
export function flush(): Promise<number> {
  if (flushing) return flushing;
  flushing = (async () => {
    let sent = 0;
    for (;;) {
      const box = await read(OUTBOX); if (!box.length) break;
      const item = box[0];
      try { await api(item.path, item.body, undefined, { "X-Client-Op": item.op ?? opId() }); sent++; }
      catch (e: any) {
        if (isNetwork(e)) break; // still offline: keep everything, try again later
        const r = await read(REFUSED); r.push({ at: item.at, error: e?.message ?? "Not accepted", body: item.body }); await AsyncStorage.setItem(REFUSED, JSON.stringify(r.slice(-20)));
      }
      // Remove only the item just handled; anything queued meanwhile stays.
      const now = await read(OUTBOX); await AsyncStorage.setItem(OUTBOX, JSON.stringify(now.filter((x) => x.op !== item.op || x.at !== item.at)));
    }
    return sent;
  })().finally(() => { flushing = null; });
  return flushing;
}

/** Sign out, or access removed: wipe every saved copy of family data from this phone. */
export async function clearOffline() {
  try { const keys = await AsyncStorage.getAllKeys(); await AsyncStorage.multiRemove(keys.filter((k) => k.startsWith("cache:") || k === OUTBOX || k === REFUSED || k.startsWith("draft:"))); } catch {}
}
/** Checklist ticks survive the app being closed. */
export async function saveDraft(key: string, value: unknown) { await AsyncStorage.setItem("draft:" + key, JSON.stringify(value)).catch(() => {}); }
export async function loadDraft<T>(key: string): Promise<T | null> { try { const s = await AsyncStorage.getItem("draft:" + key); return s ? JSON.parse(s) : null; } catch { return null; } }
export async function clearDraft(key: string) { await AsyncStorage.removeItem("draft:" + key).catch(() => {}); }
