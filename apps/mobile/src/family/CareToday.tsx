import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { Audio } from "expo-av";
import { API, api, tokenStore } from "../shared/api";
import { Button, Card, T } from "../shared/ui";
import { C } from "../shared/theme";

const when = (d: string) => new Date(d).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Plays a parent's spoken request. The recording is fetched with the family member's session. */
async function play(id: string) {
  const t = await tokenStore.get();
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
  const { sound } = await Audio.Sound.createAsync({ uri: `${API}/api/voice/requests/${id}/audio`, headers: t ? { Authorization: "Bearer " + t } : {} }, { shouldPlay: true });
  sound.setOnPlaybackStatusUpdate((s: any) => { if (s.didJustFinish) sound.unloadAsync().catch(() => {}); });
}

/** Today's care updates, what parents said to Speak to Uday, and appointments waiting for confirmation. */
export function CareToday({ recips, openBooking }: { recips: any[]; openBooking: (id: string) => void }) {
  const [ups, setUps] = useState<any[]>([]); const [voice, setVoice] = useState<any[]>([]); const [appts, setAppts] = useState<Record<string, any[]>>({}); const [err, setErr] = useState("");
  const load = useCallback(() => {
    api<any[]>("/api/updates").then(setUps).catch(() => {}); api<any[]>("/api/voice/requests").then(setVoice).catch(() => {});
    recips.forEach((r) => api<any[]>(`/api/recipients/${r.id}/appointments`).then((a) => setAppts((x) => ({ ...x, [r.id]: a }))).catch(() => {}));
  }, [recips]);
  useEffect(() => { load(); }, [load]);
  const open = voice.filter((v) => ["new", "seen"].includes(v.status));
  const act = (rid: string, id: string, action: string) => api(`/api/recipients/${rid}/appointments/${id}`, { action }).then(load).catch((e) => setErr(e.message));
  return (<View style={{ gap: 14 }}>
    {err ? <Card tone="coral"><T>{err}</T></Card> : null}
    {open.map((v) => <Card key={v.id} tone={v.category === "urgent" ? "coral" : "amber"}>
      <T size={22} weight="bold">{v.name.split(" ")[0]} said to Uday · {v.what}</T><T color={C.inkSoft}>{when(v.at)}</T>
      {v.heard ? <T>"{v.heard}"</T> : <T>No text yet. Listen to the recording.</T>}
      {v.summary ? <T color={C.inkSoft}>Summary by AI: {v.summary}</T> : null}
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}><Button title="Listen" tone="outline" onPress={() => play(v.id).catch((e) => setErr(e.message))} /></View>
        <View style={{ flex: 1 }}><Button title="Handled" tone="teal" onPress={() => api(`/api/voice/requests/${v.id}`, { status: "done" }).then(load)} /></View></View>
    </Card>)}
    {ups.map((u) => <Card key={u.bookingId} tone="teal">
      <T size={22} weight="bold">{u.name}: day {u.day} update</T><T>{u.text}</T>
      <T color={C.inkSoft}>{u.source === "ai" ? "Written by AI from the caregiver's records." : "From the caregiver's records."} Not a medical assessment.</T>
      <Button title="See full log" tone="outline" onPress={() => openBooking(u.bookingId)} /></Card>)}
    {recips.map((r) => (appts[r.id] ?? []).filter((a) => a.status === "suggested" || (a.status === "confirmed" && a.at && new Date(a.at).getTime() < Date.now() + 7 * 86400e3)).map((a) =>
      <Card key={a.id} tone={a.status === "suggested" ? "amber" : "cream"}>
        <T weight="bold">{a.status === "suggested" ? "Check this date" : "Coming up"} · {r.name.split(" ")[0]}</T>
        <T size={22}>{a.title}</T><T>{a.at ? when(a.at) : "Date not found"}{a.place ? ` · ${a.place}` : ""}</T>
        {a.label ? <T color={C.inkSoft}>{a.label}</T> : null}{a.notes ? <T color={C.inkSoft}>{a.notes}</T> : null}
        {a.status === "suggested" ? <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Button title="Confirm" tone="teal" onPress={() => a.at ? act(r.id, a.id, "confirm") : setErr("Add the date on the website first.")} /></View>
          <View style={{ flex: 1 }}><Button title="Remove" tone="outline" onPress={() => act(r.id, a.id, "cancel")} /></View></View>
          : <Button title="Done" tone="outline" onPress={() => act(r.id, a.id, "done")} />}
      </Card>))}
  </View>);
}
