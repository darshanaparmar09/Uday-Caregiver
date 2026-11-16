import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import * as Location from "expo-location";
import { api, countdown, inr, PLAN, TYPE } from "../../api";
import { Button, Card, ErrorText, Field, Screen, T } from "../../ui";
import { C } from "../../theme";
import { cachedGet, sendOrQueue, flush, pending } from "../../offline";

const REASONS = ["Not available on these dates", "Too far from me", "Outside my training", "Personal reason"];
const MOODS = ["Cheerful", "Calm", "Tired", "Unwell, family told", "Upset"];

async function where(): Promise<{ lat?: number; lng?: number }> {
  try { if (Platform.OS === "web") return {}; const p = await Location.requestForegroundPermissionsAsync(); if (p.status !== "granted") return {};
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); return { lat: l.coords.latitude, lng: l.coords.longitude }; } catch { return {}; }
}

export function Jobs({ me, active: isActive }: { me: any; active: boolean }) {
  const [jobs, setJobs] = useState<any[]>([]); const [online, setOnline] = useState<boolean>(!!me.caregiver?.online);
  const [active, setActive] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [decline, setDecline] = useState<string | null>(null); const [code, setCode] = useState(""); const [log, setLog] = useState({ meal: false, meds: false, mood: "Calm", note: "" });
  const [sos, setSos] = useState(false); const [, tick] = useState(0); const [offline, setOffline] = useState(false); const [queued, setQueued] = useState(0); const [note, setNote] = useState("");
  const load = useCallback(async () => {
    await flush().catch(() => 0); setQueued(await pending());
    const r = await cachedGet<any[]>("/api/bookings"); setOffline(r.offline); const j = r.data ?? []; setJobs(j);
    const a = j.find((x) => ["accepted", "enroute", "arrived", "active"].includes(x.status));
    setActive(a ? (await cachedGet(`/api/bookings/${a.id}`)).data : null);
  }, []);
  useEffect(() => { load().catch(() => {}); const t = setInterval(() => load().catch(() => {}), offline ? 20000 : 8000); const c = setInterval(() => tick((n) => n + 1), 1000); return () => { clearInterval(t); clearInterval(c); }; }, [load, offline]);
  async function act(id: string, body: any) { setBusy(true); setErr(""); try { await api(`/api/bookings/${id}/action`, body); setCode(""); setDecline(null); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function raiseSos() { setSos(true); const p = await where(); api("/api/sos", { bookingId: active?.id, ...p }).catch(() => {}); }
  const offers = online ? jobs.filter((j) => j.status === "offered") : [];

  return (
    <View style={{ flex: 1 }}>
      <Screen tabbed>
        {offline && <Card tone="amber"><T weight="semi">No signal. Showing your saved jobs.{queued ? ` ${queued} log${queued > 1 ? "s" : ""} waiting to send.` : ""}</T></Card>}
        {!isActive && <Card tone="amber"><T weight="bold">Finish onboarding to receive requests</T><T>Open the Me tab to see your next step.</T></Card>}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <T size={30} weight="bold" style={{ flexShrink: 1 }}>Jobs</T>
          <Pressable accessibilityRole="switch" accessibilityState={{ checked: online }} onPress={() => api("/api/caregiver/online", { online: !online }).then((r) => setOnline(r.online))}
            style={{ minHeight: 72, minWidth: 140, borderRadius: 36, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", backgroundColor: online ? C.teal : C.night }}>
            <T weight="bold" color="#fff">{online ? "● Online" : "○ Offline"}</T></Pressable>
        </View>
        {sos && <Card tone="coral"><T size={28} weight="bold">SOS sent</T><T>The Uday safety team has your location and will call you within 2 minutes.</T>
          <Button title="Call 112" tone="coral" onPress={() => Linking.openURL("tel:112")} /><Button title="I am safe now" tone="outline" onPress={() => setSos(false)} /></Card>}

        {offers.map((o) => (
          <Card key={o.id} tone="amber">
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}><T weight="bold">New request</T><T size={30} weight="bold">{countdown(o.offer_expires_at)}</T></View>
            <T size={26} weight="semi">{TYPE[o.care_type]} · {PLAN[o.days]}</T>
            <T>Starts {o.start_date} at {String(o.start_time).slice(0, 5)} · {o.locality}</T>
            <T weight="bold">You earn {inr(o.rate_paise)} a shift · {inr(o.care_paise)} total</T>
            {decline === o.id ? <>{REASONS.map((r) => <Button key={r} title={r} tone="outline" busy={busy} onPress={() => act(o.id, { action: "decline", reason: r })} />)}<Button title="Back" tone="night" onPress={() => setDecline(null)} /></>
              : <><Button title="Accept" tone="teal" busy={busy} onPress={() => act(o.id, { action: "accept" })} /><Button title="Decline" tone="outline" onPress={() => setDecline(o.id)} /></>}
          </Card>))}

        {active && (
          <Card tone="cream">
            <T weight="bold" color={C.teal}>{{ accepted: "Next shift", enroute: "Travelling", arrived: "At the door", active: "Shift in progress" }[active.status as string]}</T>
            <T size={26} weight="semi">{active.recipient.name} · {TYPE[active.careType]}</T>
            <T>{active.address}</T>
            {active.accessNotes ? <T color={C.inkSoft}>Getting in: {active.accessNotes}</T> : null}
            {active.health?.shared === false && <T color={C.inkSoft}>Health details not shared by the family. Ask at the first visit.</T>}
            {active.health?.allergies?.length ? <Card tone="coral" style={{ padding: 14 }}><T weight="bold">Allergies: {active.health.allergies.map((a: any) => a.name).join(", ")}</T></Card> : null}
            {active.health?.medicines?.length ? <T>Medicines: {active.health.medicines.map((m: any) => `${m.name} ${m.dose} at ${m.times}`).join("; ")}</T> : null}
            {active.status === "accepted" && <><Button title="Start travel" busy={busy} onPress={async () => act(active.id, { action: "enroute", ...(await where()) })} />
              <Button title="I cannot make it" tone="outline" busy={busy} onPress={() => act(active.id, { action: "cg_cancel" })} /></>}
            {active.status === "enroute" && <Button title="I have arrived" busy={busy} onPress={async () => act(active.id, { action: "arrive", ...(await where()) })} />}
            {active.status === "arrived" && <><Field label="Start code from the family" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} style={{ letterSpacing: 14, fontSize: 36 }} />
              <Button title="Start shift" tone="teal" busy={busy} onPress={() => act(active.id, { action: "start", code })} /></>}
            {active.status === "active" && <>
              <T weight="bold">Shift log</T>
              {([["meal", "Meal given"], ["meds", "Medicines given"]] as const).map(([k, t]) => <Button key={k} title={(log[k] ? "✓ " : "") + t} tone={log[k] ? "teal" : "outline"} onPress={() => setLog({ ...log, [k]: !log[k] })} />)}
              <T weight="semi">Mood</T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{MOODS.map((m) => <Button key={m} title={m} tone={log.mood === m ? "amber" : "outline"} onPress={() => setLog({ ...log, mood: m })} style={{ flexGrow: 1 }} />)}</View>
              <Field label="Note for the family" value={log.note} onChangeText={(note) => setLog({ ...log, note })} multiline style={{ minHeight: 110, fontSize: 22, paddingTop: 14 }} />
              <Button title="Save log" tone="night" busy={busy} onPress={async () => { setBusy(true); setErr(""); try { const r = await sendOrQueue(`/api/bookings/${active.id}/action`, { action: "log", ...log });
                setNote(r.queued ? "No signal. Log saved on your phone and will send automatically." : "Log saved. The family can see it."); setQueued(await pending()); if (!r.queued) await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} />
              {note ? <T weight="semi" color={C.teal}>{note}</T> : null}
              <Field label="End code from the family" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} style={{ letterSpacing: 14, fontSize: 36 }} />
              <Button title="End shift" tone="teal" busy={busy} onPress={() => act(active.id, { action: "end", code })} /></>}
          </Card>)}
        {online && !offers.length && !active && <Card><T>No requests right now. New requests appear here with a countdown.</T></Card>}
        <ErrorText msg={err} />
        <View style={{ height: 96 }} />
      </Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="SOS. Alert the Uday safety team" onPress={raiseSos}
        style={{ position: "absolute", right: 20, bottom: 24, width: 88, height: 88, borderRadius: 44, backgroundColor: C.coral, alignItems: "center", justifyContent: "center", elevation: 8, shadowColor: C.coral, shadowOpacity: 0.5, shadowRadius: 12 }}>
        <T size={26} weight="bold" color="#fff">SOS</T></Pressable>
    </View>
  );
}
