// GENERATED from packages/mobile-shared/src/voice.tsx. Do not edit here; run node scripts/sync-mobile-shared.mjs
import { useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { Audio } from "expo-av";
import { API, api, tokenStore } from "./api";
import { Button, Card, T } from "./ui";
import { C } from "./theme";

/**
 * Voice for Uday: record up to 30 seconds and send it to the server, which turns it into text (Sarvam AI) when
 * connected. Purposes: "request" (Speak to Uday), "companion" (talk to the companion) and "note" (caregiver dictation).
 */
export type VoicePurpose = "request" | "companion" | "note";
const MAX_SEC = 30;

async function upload<T = any>(purpose: VoicePurpose, uri: string): Promise<T> {
  const t = await tokenStore.get(); const form = new FormData();
  if (Platform.OS === "web") { const b = await (await fetch(uri)).blob(); form.append("audio", b, "speech.webm"); }
  else form.append("audio", { uri, name: "speech.m4a", type: "audio/m4a" } as any);
  form.append("purpose", purpose);
  let r: Response;
  try { r = await fetch(API + "/api/voice", { method: "POST", headers: t ? { Authorization: "Bearer " + t } : {}, body: form }); }
  catch { throw new Error("No connection. Please check your internet and try again."); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error ?? "Something went wrong. Please try again."), { status: r.status, data: j });
  return j as T;
}

/** Records while the person speaks; stops itself after 30 seconds. */
export function useRecorder() {
  const rec = useRef<Audio.Recording | null>(null); const [on, setOn] = useState(false); const [sec, setSec] = useState(0);
  useEffect(() => () => { rec.current?.stopAndUnloadAsync().catch(() => {}); }, []);
  useEffect(() => { if (!on) return; const t = setInterval(() => setSec((s) => s + 1), 1000); return () => clearInterval(t); }, [on]);
  async function start() {
    const p = await Audio.requestPermissionsAsync();
    if (!p.granted) throw new Error("Please allow the microphone for Uday in your phone settings.");
    await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
    const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    rec.current = recording; setSec(0); setOn(true);
  }
  async function stop(): Promise<string | null> {
    const r = rec.current; rec.current = null; setOn(false); if (!r) return null;
    await r.stopAndUnloadAsync().catch(() => {}); await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => {});
    return r.getURI();
  }
  return { on, sec, start, stop, max: MAX_SEC };
}

/** First use: explains where the voice goes and asks the person to agree. */
function Consent({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [about, setAbout] = useState<string[]>([]); const [err, setErr] = useState("");
  useEffect(() => { api<any>("/api/voice").then((v) => setAbout(v.about)).catch((e) => setErr(e.message)); }, []);
  return (<Card tone="amber"><T size={24} weight="bold">Before you speak</T>
    {about.map((a) => <T key={a}>{a}</T>)}{err ? <T color={C.coral}>{err}</T> : null}
    <Button title="I agree" onPress={() => api("/api/voice", { consent: true }, "PUT").then(onDone).catch((e) => setErr(e.message))} />
    <Button title="Not now" tone="outline" onPress={onCancel} /></Card>);
}

/**
 * A microphone button. Tap to start, tap again to send. Handles consent, the 30 second limit and errors.
 * onResult gets the server's answer: { text } for notes, the companion reply, or the stored request.
 */
export function MicButton({ purpose, onResult, title = "Speak", stopTitle = "Tap to send", big, tone = "amber" }:
  { purpose: VoicePurpose; onResult: (r: any) => void; title?: string; stopTitle?: string; big?: boolean; tone?: any }) {
  const r = useRecorder(); const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [consent, setConsent] = useState(false); const pending = useRef<string | null>(null);
  async function send(uri: string) {
    setBusy(true); setErr("");
    try { onResult(await upload(purpose, uri)); }
    catch (e: any) { if (e.status === 428) { pending.current = uri; setConsent(true); } else setErr(e.message); }
    finally { setBusy(false); }
  }
  async function tap() {
    setErr("");
    try { if (!r.on) await r.start(); else { const uri = await r.stop(); if (uri) await send(uri); } }
    catch (e: any) { setErr(e.message); }
  }
  useEffect(() => { if (r.on && r.sec >= r.max) tap(); }, [r.sec]); // eslint-disable-line react-hooks/exhaustive-deps
  if (consent) return <Consent onCancel={() => { setConsent(false); pending.current = null; }} onDone={() => { setConsent(false); const u = pending.current; pending.current = null; if (u) send(u); }} />;
  return (<View style={{ gap: 8 }}>
    <Button title={busy ? "Sending" : r.on ? `${stopTitle} (${r.max - r.sec}s)` : title} busy={busy} tone={r.on ? "coral" : tone} onPress={tap}
      style={big ? { minHeight: 110 } : undefined} accessibilityLabel={r.on ? "Recording. Tap to send" : title} />
    {err ? <T color={C.coral} weight="semi">{err}</T> : null}
  </View>);
}
