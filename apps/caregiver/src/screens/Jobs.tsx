import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, View } from "react-native";
import * as Location from "expo-location";
import { api, countdown, inr, PLAN, TYPE } from "../shared/api";
import { Button, Card, ErrorText, Field, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";
import { CareChecklist } from "./CareChecklist";
import { cachedGet, sendOrQueue, flush, pending } from "../shared/offline";

const REASONS = ["Not available on these dates", "Too far from me", "Outside my training", "Personal reason"];

async function where(): Promise<{ lat?: number; lng?: number }> {
  try { if (Platform.OS === "web") return {}; const p = await Location.requestForegroundPermissionsAsync(); if (p.status !== "granted") return {};
    const l = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }); return { lat: l.coords.latitude, lng: l.coords.longitude }; } catch { return {}; }
}

export function Jobs({ me, active: isActive }: { me: any; active: boolean }) {
  const [jobs, setJobs] = useState<any[]>([]); const [online, setOnline] = useState<boolean>(!!me.caregiver?.online);
  const [active, setActive] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [decline, setDecline] = useState<string | null>(null); const [code, setCode] = useState(""); 
  const [sos, setSos] = useState(false); const [, tick] = useState(0); const [offline, setOffline] = useState(false); const [queued, setQueued] = useState(0); const [note, setNote] = useState("");
  const [relief, setRelief] = useState<any[]>([]); const [intros, setIntros] = useState<any[]>([]); const [stop, setStop] = useState(false);
  const load = useCallback(async () => {
    await flush().catch(() => 0); setQueued(await pending());
    const r = await cachedGet<any[]>("/api/bookings"); setOffline(r.offline); const j = r.data ?? []; setJobs(j);
    const a = j.find((x) => ["accepted", "enroute", "arrived", "active"].includes(x.status));
    setActive(a ? (await cachedGet(`/api/bookings/${a.id}`)).data : null);
    setRelief((await cachedGet<any[]>("/api/relief")).data ?? []); setIntros((await cachedGet<any[]>("/api/intros")).data ?? []);
  }, []);
  useEffect(() => { load().catch(() => {}); const t = setInterval(() => load().catch(() => {}), offline ? 20000 : 8000); const c = setInterval(() => tick((n) => n + 1), 1000); return () => { clearInterval(t); clearInterval(c); }; }, [load, offline]);
  async function act(id: string, body: any) { setBusy(true); setErr(""); try { await api(`/api/bookings/${id}/action`, body); setCode(""); setDecline(null); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  // Share location with the family every minute while travelling.
  useEffect(() => { if (active?.status !== "enroute") return; const send = async () => { const p = await where(); if (p.lat != null) api(`/api/bookings/${active.id}/location`, p).catch(() => {}); };
    send(); const t = setInterval(send, 60000); return () => clearInterval(t); }, [active?.id, active?.status]);
  const [chat, setChat] = useState(false);
  async function rAct(id: string, body: any) { setBusy(true); setErr(""); try { await api(`/api/relief/${id}`, body); setCode(""); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
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
            {o.care_need_label ? <T weight="bold" color={C.teal}>Care needed: {o.care_need_label}{o.care_need_note ? `. ${o.care_need_note}` : ""}</T> : null}
            <T>Starts {o.start_date} at {String(o.start_time).slice(0, 5)} · {o.locality}</T>
            <T weight="bold">You earn {inr(o.rate_paise)} a shift · {inr(o.care_paise)} total</T>
            {o.family_verified ? <T weight="semi" color={C.teal}>✓ Family ID verified</T> : null}
            {decline === o.id ? <>{REASONS.map((r) => <Button key={r} title={r} tone="outline" busy={busy} onPress={() => act(o.id, { action: "decline", reason: r })} />)}<Button title="Back" tone="night" onPress={() => setDecline(null)} /></>
              : <><Button title="Accept" tone="teal" busy={busy} onPress={() => act(o.id, { action: "accept" })} /><Button title="Decline" tone="outline" onPress={() => setDecline(o.id)} /></>}
          </Card>))}

        {active && (
          <Card tone="cream">
            <T weight="bold" color={C.teal}>{{ accepted: "Next shift", enroute: "Travelling", arrived: "At the door", active: "Shift in progress" }[active.status as string]}</T>
            <T size={26} weight="semi">{active.recipient.name} · {TYPE[active.careType]}</T>
            <T>{active.address}</T>
            {active.careNeed ? <T weight="bold" color={C.teal}>Care needed: {active.careNeed.label}{active.careNeed.note ? `. ${active.careNeed.note}` : ""}</T> : null}
            {active.homeCommitments?.length ? <Card style={{ padding: 14 }}><T weight="bold">The family agreed to provide</T>{active.homeCommitments.map((h: any) => <T key={h.id ?? h}>✓ {h.label ?? h}</T>)}
              <T color={C.inkSoft}>If something is missing, tell the care manager from the Me tab.</T></Card> : null}
            {active.accessNotes ? <T color={C.inkSoft}>Getting in: {active.accessNotes}</T> : null}
            {active.health?.shared === false && <T color={C.inkSoft}>Health details not shared by the family. Ask at the first visit.</T>}
            {active.health?.allergies?.length ? <Card tone="coral" style={{ padding: 14 }}><T weight="bold">Allergies: {active.health.allergies.map((a: any) => a.name).join(", ")}</T></Card> : null}
            {active.health?.medicines?.length ? <T>Medicines: {active.health.medicines.map((m: any) => `${m.name} ${m.dose} at ${m.times}`).join("; ")}</T> : null}
            {active.status === "accepted" && <><Button title="Start travel" busy={busy} onPress={async () => act(active.id, { action: "enroute", ...(await where()) })} />
              <Button title="I cannot make it" tone="outline" busy={busy} onPress={() => act(active.id, { action: "cg_cancel" })} /></>}
            {active.status === "enroute" && <Button title="I have arrived" busy={busy} onPress={async () => act(active.id, { action: "arrive", ...(await where()) })} />}
            {active.status === "arrived" && <><Field label="Start code from the family" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} style={{ letterSpacing: 14, fontSize: 36 }} />
              <Button title="Start shift" tone="teal" busy={busy} onPress={() => act(active.id, { action: "start", code })} /></>}
            {chat ? <ChatBox id={active.id} onClose={() => setChat(false)} /> : <View style={{ flexDirection: "row", gap: 10 }}>
              <Button title="Message family" tone="outline" onPress={() => setChat(true)} style={{ flex: 1 }} />
              <Button title="Call family" tone="outline" onPress={() => api(`/api/bookings/${active.id}/call`, {}).then((r: any) => setNote(r.status === "simulated" ? "Test mode: your phone would ring and connect you." : "Your phone will ring now.")).catch((e) => setErr(e.message))} style={{ flex: 1 }} /></View>}
            {active.extension?.status === "requested" && <Card tone="amber" style={{ padding: 14 }}><T weight="bold">The family wants you to continue for {active.extension.days === 7 ? "another week" : "another month"}</T>
              <Button title="Yes, I will continue" tone="teal" busy={busy} onPress={() => act(active.id, { action: "extension", accept: true })} /><Button title="No, I cannot" tone="outline" onPress={() => act(active.id, { action: "extension", accept: false })} /></Card>}
            {active.status === "active" && active.away && <Card tone="teal" style={{ padding: 14 }}><T size={26} weight="bold">Your day off</T>
              <T>{(() => { const r = active.relief?.find((x: any) => x.dayNo === active.daysDone + 1 || x.dayNo === active.daysDone); return r?.caregiver ? `${r.caregiver.name} covers day ${r.dayNo}.` : "A relief caregiver covers today."; })()} When you are back, ask the family for the welcome back code.</T>
              <Field label="Welcome back code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} style={{ letterSpacing: 14, fontSize: 36 }} />
              <Button title="I am back" tone="teal" busy={busy} onPress={() => act(active.id, { action: "return", code })} /></Card>}
            {active.status === "active" && !active.away && <>
              {active.isLive && <T weight="semi" color={C.teal}>Day {active.daysDone + 1} of {active.days}{active.dayOffName ? ` · day off every ${active.dayOffName}` : ""}</T>}
              <CareChecklist template={active.checklistTemplate ?? []} tier={active.tier} busy={busy} onSave={async (p) => { setBusy(true); setErr(""); try { const r = await sendOrQueue(`/api/bookings/${active.id}/action`, { action: "log", ...p });
                setNote(r.queued ? "No signal. Care log saved on your phone and will send automatically." : "Care log saved. The family can see it."); setQueued(await pending()); if (!r.queued) await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }} />
              {note ? <T weight="semi" color={C.teal}>{note}</T> : null}
              {active.isLive && active.daysDone + 1 < active.days
                ? <Button title={`Close day ${active.daysDone + 1}`} sub="After saving today's care log" tone="teal" busy={busy} onPress={() => act(active.id, { action: "day_close" })} />
                : <><Field label="End code from the family" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} style={{ letterSpacing: 14, fontSize: 36 }} />
                  <Button title={active.isLive ? "End care (last day)" : "End shift"} tone="teal" busy={busy} onPress={() => act(active.id, { action: "end", code })} /></>}
              {stop ? <Card tone="coral" style={{ padding: 14 }}><T weight="bold">Stop caring for this family?</T><T>Uday will find a replacement. Please stay until the family is safe.</T>
                  <Button title="Yes, I cannot continue" tone="coral" busy={busy} onPress={() => act(active.id, { action: "cg_cancel", reason: "Caregiver cannot continue" })} /><Button title="No, go back" tone="outline" onPress={() => setStop(false)} /></Card>
                : <Button title="I cannot continue" tone="outline" onPress={() => setStop(true)} />}</>}
          </Card>)}
        {relief.map((r) => (
          <Card key={r.id} tone={r.status === "offered" ? "amber" : "cream"}>
            <T weight="bold" color={C.teal}>{r.status === "offered" ? "Relief day request" : "Relief day"}</T>
            <T size={26} weight="semi">{new Date(r.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })} · from {r.startTime}</T>
            <T>Cover {r.mainCaregiver}'s day off with {r.recipient}, {r.locality}.{r.careNeed ? ` Care needed: ${r.careNeed}.` : ""}</T>
            <T weight="bold">You earn {inr(r.ratePaise)}</T>
            {r.address && <T>{r.address}</T>}
            {r.status === "offered" && <><Button title="Accept" tone="teal" busy={busy} onPress={() => rAct(r.id, { action: "accept" })} /><Button title="Decline" tone="outline" onPress={() => rAct(r.id, { action: "decline" })} /></>}
            {r.status === "accepted" && (r.ready ? <Button title="I have arrived" busy={busy} onPress={() => rAct(r.id, { action: "arrive" })} /> : <T color={C.inkSoft}>The arrive button opens when the regular caregiver hands over.</T>)}
            {r.status === "arrived" && <><Field label="Start code from the family" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} style={{ letterSpacing: 14, fontSize: 36 }} />
              <Button title="Start relief day" tone="teal" busy={busy} onPress={() => rAct(r.id, { action: "start", code })} /></>}
            {r.status === "active" && <>
              <CareChecklist template={r.checklistTemplate ?? []} tier={Math.min(r.tier ?? 1, 2)} busy={busy} onSave={async (p: any) => { const { vitals, ...rest } = p; await rAct(r.id, { action: "log", mood: rest.mood ?? "Calm", meal: rest.meal, meds: rest.meds, note: rest.note, checklist: rest.checklist }); setNote("Care log saved."); }} />
              <Field label="End code from the family" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={4} style={{ letterSpacing: 14, fontSize: 36 }} />
              <Button title="End relief day" tone="teal" busy={busy} onPress={() => rAct(r.id, { action: "end", code })} /></>}
          </Card>))}
        {intros.filter((i) => i.status === "requested" || i.status === "confirmed").map((i) => (
          <Card key={i.id} tone="cream"><T weight="bold" color={C.teal}>Intro call</T><T>{i.recipient_name}'s family, {i.locality}, wants a short video call before hiring you.{i.note ? ` "${i.note}"` : ""}</T>
            {i.status === "requested" ? <>{i.slots.map((sl: string) => <Button key={sl} title={new Date(sl).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} tone="outline"
                onPress={() => api(`/api/intros/${i.id}`, { action: "choose", slot: sl }).then(load).catch((e) => setErr(e.message))} />)}
              <Button title="I cannot do these times" tone="night" onPress={() => api(`/api/intros/${i.id}`, { action: "decline" }).then(load)} /></>
              : <T weight="semi">Confirmed: {new Date(i.chosen).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}. {i.room_url ? "Open the link from Uday at that time." : "Uday will call you to connect."}</T>}</Card>))}
        {online && !offers.length && !active && !relief.length && <Card><T>No requests right now. New requests appear here with a countdown.</T></Card>}
        <ErrorText msg={err} />
        <View style={{ height: 96 }} />
      </Screen>
      <Pressable accessibilityRole="button" accessibilityLabel="SOS. Alert the Uday safety team" onPress={raiseSos}
        style={{ position: "absolute", right: 20, bottom: 24, width: 88, height: 88, borderRadius: 44, backgroundColor: C.coral, alignItems: "center", justifyContent: "center", elevation: 8, shadowColor: C.coral, shadowOpacity: 0.5, shadowRadius: 12 }}>
        <T size={26} weight="bold" color="#fff">SOS</T></Pressable>
    </View>
  );
}

/** Messages with the family. Numbers stay private; phone numbers and links are blocked. */
function ChatBox({ id, onClose }: { id: string; onClose: () => void }) {
  const [d, setD] = useState<any>(null); const [text, setText] = useState(""); const [err, setErr] = useState("");
  const load = useCallback(() => api(`/api/bookings/${id}/messages`).then(setD).catch(() => {}), [id]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  return (
    <Card tone="cream" style={{ padding: 14 }}>
      <T weight="bold">Messages with the family</T>
      {(d?.messages ?? []).slice(-8).map((m: any) => <View key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: m.mine ? C.night : "#fff", borderRadius: 16, padding: 10 }}>
        <T color={m.mine ? "#fff" : C.ink}>{m.body}</T></View>)}
      <Field label="Your message" value={text} onChangeText={setText} maxLength={500} />
      <Button title="Send" tone="teal" onPress={() => api(`/api/bookings/${id}/messages`, { body: text }).then(() => { setText(""); setErr(""); load(); }).catch((e) => setErr(e.message))} />
      {err ? <T color={C.coral}>{err}</T> : null}
      <Button title="Close messages" tone="outline" onPress={onClose} />
    </Card>);
}
