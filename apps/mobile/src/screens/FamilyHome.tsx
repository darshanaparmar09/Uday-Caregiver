import { AccountData } from "../shared/AccountData";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { api, API, countdown, inr, PLAN, READING, SOURCE, STATUS, TYPE } from "../shared/api";
import { Button, Card, ErrorText, Field, Screen, T, Chips } from "../shared/ui";
import { registerForPush, onNotificationTap } from "../shared/push";
import { Hire } from "../family/Hire";
import { Onboard } from "../family/Onboard";
import { Health } from "../family/Health";
import { C } from "../shared/theme";

export function FamilyHome({ me, onSignOut }: { me: any; onSignOut: () => void }) {
  const [recips, setRecips] = useState<any[]>([]); const [bookings, setBookings] = useState<any[]>([]); const [open, setOpen] = useState<string | null>(null); const [readings, setReadings] = useState<any>(null);
  const [view, setView] = useState<"home" | "hire" | "onboard">("home"); const [health, setHealth] = useState<any>(null); const [invites, setInvites] = useState<any[]>([]); const [alerts, setAlerts] = useState<any[]>([]);
  useEffect(() => { registerForPush(); api<any[]>("/api/invites").then(setInvites).catch(() => {});
    return onNotificationTap((d) => { if (d?.bookingId) setOpen(d.bookingId); }); }, []);
  const loadAlerts = useCallback(() => api<any[]>("/api/alerts").then(setAlerts).catch(() => {}), []);
  const load = useCallback(async () => { const [r, b] = await Promise.all([api<any[]>("/api/recipients"), api<any[]>("/api/bookings")]); setRecips(r); setBookings(b); loadAlerts(); }, [loadAlerts]);
  useEffect(() => { load().catch(() => {}); const t = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(t); }, [load]);
  if (open) return <BookingDetail id={open} onBack={() => { setOpen(null); load(); }} />;
  if (readings) return <Readings r={readings} onBack={() => setReadings(null)} />;
  if (health) return <Health r={health} onBack={() => setHealth(null)} />;
  if (view === "hire") return <Hire onBack={() => setView("home")} onBooked={(id) => { setView("home"); setOpen(id); }} />;
  if (view === "onboard") return <Onboard onBack={() => setView("home")} onDone={() => { setView("home"); load(); }} />;
  const live = bookings.filter((b) => !["closed", "cancelled", "released"].includes(b.status));
  return (
    <Screen>
      <T size={34} weight="bold">Namaste{me.user.name ? `, ${me.user.name.split(" ")[0]}` : ""}</T>
      {alerts.map((a) => a.status === "open" ? <Card key={a.id} tone="coral"><T size={24} weight="bold">{a.name} {a.what}</T><T>Call them now. If you cannot reach them and fear danger, call 112 (India).</T>
          {a.mine ? <T>You raised this. Someone else needs to respond.</T> : <Button title="I am responding" tone="night" onPress={() => api(`/api/alerts/${a.id}`, { action: "ack" }).then(loadAlerts).catch(() => {})} />}
          <T color={C.inkSoft}>Until someone responds, Uday keeps alerting the emergency contacts and its own team.</T></Card>
        : <Card key={a.id} tone="teal"><T weight="semi">{a.name} {a.what}. {a.acknowledgedBy ?? "Someone"} is responding.</T>
          <Button title="All is well now" tone="outline" onPress={() => api(`/api/alerts/${a.id}`, { action: "resolve", note: "Family confirmed all is well" }).then(loadAlerts).catch(() => {})} /></Card>)}
      {invites.map((i) => <Card key={i.id} tone="amber"><T weight="semi">{i.inviter ?? "A family member"} invited you to help care for {i.senior}.</T>
        <Button title="Join" tone="teal" onPress={() => api(`/api/invites/${i.id}`, { accept: true }).then(() => { setInvites(invites.filter((x) => x.id !== i.id)); load(); })} /></Card>)}
      {!recips.length && <Card><T weight="semi">Start by adding your parent. It takes about five minutes.</T><Button title="Add your parent" onPress={() => setView("onboard")} /></Card>}
      {recips.map((r) => { const today = r.last_checkin && new Date(r.last_checkin.at).toDateString() === new Date().toDateString(); const help = today && ["help", "medical"].includes(r.last_checkin.status);
        return (<Card key={r.id} tone={help ? "coral" : today ? "teal" : "amber"}>
          <T size={28} weight="bold">{r.name}</T>
          <T weight="semi">{help ? "Asked for help today" : today ? `Checked in today: "${MOOD[r.last_checkin.status] ?? "okay"}"` : "Not checked in yet today"}{today ? ` at ${new Date(r.last_checkin.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</T>
          {!today && <Button title="I spoke to them today" tone="teal" onPress={() => api("/api/checkins", { status: "ok", recipientId: r.id }).then(load)} />}
          <Week id={r.id} />
          <Button title="Readings and devices" tone="outline" onPress={() => setReadings(r)} />
          <Button title="Health details" tone="outline" onPress={() => setHealth(r)} />
        </Card>); })}
      <T size={28} weight="bold" style={{ marginTop: 8 }}>Care bookings</T>
      {!live.length && <T color={C.inkSoft}>No active bookings.</T>}
      {live.map((b) => (
        <Pressable key={b.id} accessibilityRole="button" onPress={() => setOpen(b.id)}>
          <Card tone={b.status === "proposal" || b.status === "arrived" || b.status === "active" ? "amber" : "cream"}>
            <T size={26} weight="bold">{b.caregiver_name}</T>
            <T>{TYPE[b.care_type]} · {PLAN[b.days]} · {b.recipient_name}</T>
            <T weight="semi" color={b.status === "proposal" ? C.amberDeep : C.teal}>{STATUS[b.status]}{b.status === "offered" ? ` · ${countdown(b.offer_expires_at)}` : ""}</T>
          </Card>
        </Pressable>))}
      <Button title="Hire a caregiver" onPress={() => setView("hire")} />
      {!!recips.length && <Button title="Add another person" tone="outline" onPress={() => setView("onboard")} />}
      <AccountData onDeleted={onSignOut} />
      <Button title="Sign out" tone="outline" onPress={onSignOut} />
    </Screen>
  );
}

function BookingDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [b, setB] = useState<any>(null); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false); const [quote, setQuote] = useState<any>(null); const [, tick] = useState(0);
  const load = useCallback(() => api(`/api/bookings/${id}`).then(setB).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); const a = setInterval(load, 5000); const t = setInterval(() => tick((n) => n + 1), 1000); return () => { clearInterval(a); clearInterval(t); }; }, [load]);
  async function act(body: any) { setBusy(true); setErr(""); try { await api(`/api/bookings/${id}/action`, body); setQuote(null); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  if (!b) return <Screen><T>Loading</T></Screen>;
  const first = b.caregiver.name.split(" ")[0];
  return (
    <Screen>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={34} weight="bold">{b.caregiver.name}</T>
      <T>{TYPE[b.careType]} · {PLAN[b.days]}{b.days > 1 ? ` · day ${Math.min(b.daysDone + 1, b.days)} of ${b.days}` : ""}</T>
      <T>Starts {b.startDate} at {String(b.startTime).slice(0, 5)}</T>
      <T weight="bold" color={C.teal}>{STATUS[b.status]}</T>
      {b.status === "offered" && <Card tone="amber"><T weight="semi">Waiting for {first} to accept</T><T size={48} weight="bold">{countdown(b.offerExpiresAt)}</T><T>{inr(b.fees.totalPaise)} is held, not charged.</T></Card>}
      {b.status === "proposal" && b.proposal && <Card tone="amber"><T weight="semi">{first} cannot come. Uday suggests:</T><T size={28} weight="bold">{b.proposal.display_name}</T><T>Same tier · ★ {b.proposal.rating} · {b.proposal.area}</T>
        <Button title={`Yes, send to ${b.proposal.display_name.split(" ")[0]}`} tone="teal" busy={busy} onPress={() => act({ action: "approve" })} />
        <Button title="No, cancel and release hold" tone="outline" busy={busy} onPress={() => act({ action: "reject" })} /></Card>}
      {(b.codes ?? []).map((c: any) => <Card key={c.kind} tone="teal"><T weight="semi">{c.label}</T><T size={64} weight="bold" center style={{ letterSpacing: 16 }}>{c.code}</T></Card>)}
      {b.status === "active" && !b.codes?.length && <Card tone="teal"><T weight="semi">{b.away ? `${first}'s day off. The relief caregiver is covering.` : b.isLive ? `Care in progress. ${first} closes each day with the care log.` : "Care in progress."}</T></Card>}
      {b.isLive && b.daysDone > 0 && !b.dayChecks?.some((x: any) => x.day === b.daysDone) && b.status === "active" && <Card tone="amber"><T weight="semi">Day {b.daysDone}: was everything well?</T>
        <Button title="Yes, all well" tone="teal" busy={busy} onPress={() => act({ action: "day_check", day: b.daysDone, ok: true })} />
        <Button title="Something was wrong" tone="outline" onPress={() => act({ action: "day_check", day: b.daysDone, ok: false, note: "Flagged from the app" })} /></Card>}
      {b.logs?.slice(-3).reverse().map((l: any, i: number) => <Card key={i}><T weight="semi">Shift log · day {l.day}</T><T>{[l.checklist && `${Object.keys(l.checklist).length} care tasks marked done by the caregiver`, l.meal === true && "Meal: caregiver says given", l.meds === true && "Medicines: caregiver says given as prescribed", l.meds === false && "Medicines: caregiver says NOT given", `Mood: ${l.mood}`].filter(Boolean).join(" · ")}</T>
        {l.vitals ? <T>{[l.vitals.bpSys && `BP ${l.vitals.bpSys}/${l.vitals.bpDia}`, l.vitals.pulse && `Pulse ${l.vitals.pulse}`, l.vitals.tempC && `Temp ${l.vitals.tempC}°C`, l.vitals.pain != null && `Pain ${l.vitals.pain}/10`].filter(Boolean).join(" · ")}</T> : null}
        {l.flags?.length ? <Card tone="coral" style={{ padding: 12 }}><T weight="semi">Outside usual range: {l.flags.join(", ")}</T></Card> : null}{l.note ? <T color={C.inkSoft}>{l.note}</T> : null}</Card>)}
      {b.status === "completed" && <Card><T weight="semi">How was the care?</T><View style={{ flexDirection: "row", justifyContent: "space-between" }}>{[1, 2, 3, 4, 5].map((n) =>
        <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} stars`} onPress={() => act({ action: "rate", stars: n, tags: [] })} style={{ minWidth: 56, minHeight: 72, alignItems: "center", justifyContent: "center" }}><T size={44} color={C.amber}>★</T></Pressable>)}</View></Card>}
      {["offered", "proposal", "accepted", "enroute"].includes(b.status) && !quote && <Button title="Cancel booking" tone="outline" onPress={() => api(`/api/bookings/${id}/quote`).then(setQuote).catch((e) => setErr(e.message))} />}
      {quote && <Card><T weight="bold">Cancel this booking?</T><T>Fee {inr(quote.feePaise)} · Refund {inr(quote.refundPaise)}</T><T color={C.inkSoft}>Free up to 4 hours before a shift, then 20% of one day of care.</T>
        <Button title="Yes, cancel" tone="night" busy={busy} onPress={() => act({ action: "cancel" })} /><Button title="Keep booking" tone="outline" onPress={() => setQuote(null)} /></Card>}
      {["accepted", "enroute", "arrived", "active", "completed"].includes(b.status) && <FamilyChat id={id} name={first} />}
      <HelpForm onSend={(cat, text) => act({ action: "ticket", category: cat, text })} busy={busy} />
      <ErrorText msg={err} />
    </Screen>
  );
}

function HelpForm({ onSend, busy }: { onSend: (cat: string, text: string) => void; busy: boolean }) {
  const [open, setOpen] = useState(false); const [cat, setCat] = useState<string[]>([]); const [text, setText] = useState("");
  const CATS = ["Caregiver is late or did not arrive", "Safety concern", "Care quality", "Payment or refund", "Something else"];
  if (!open) return <Button title="Get help" tone="outline" onPress={() => setOpen(true)} />;
  return (<Card><T size={24} weight="bold">Get help with this booking</T><Chips options={CATS} value={cat} multi={false} onChange={setCat} />
    <Field label="Tell us more" value={text} onChangeText={setText} multiline style={{ minHeight: 90, textAlignVertical: "top", paddingTop: 12 }} />
    <T color={C.coral} weight="semi">If anyone is in danger, call 112 first.</T>
    <Button title="Send to Uday" busy={busy} onPress={() => { if (cat[0]) { onSend(cat[0], text); setOpen(false); setText(""); } }} /></Card>);
}

function FamilyChat({ id, name }: { id: string; name: string }) {
  const [d, setD] = useState<any>(null); const [text, setText] = useState(""); const [err, setErr] = useState(""); const [note, setNote] = useState("");
  const load = useCallback(() => api(`/api/bookings/${id}/messages`).then(setD).catch(() => {}), [id]);
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [load]);
  if (!d?.open) return null;
  return (<Card><T size={24} weight="bold">Messages with {name}</T>
    {d.messages.slice(-8).map((m: any) => <View key={m.id} style={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "88%", backgroundColor: m.mine ? C.night : "#fff", borderRadius: 16, padding: 10 }}><T color={m.mine ? "#fff" : C.ink}>{m.body}</T></View>)}
    <Field label="Message" value={text} onChangeText={setText} maxLength={500} />
    <Button title="Send" tone="teal" onPress={() => api(`/api/bookings/${id}/messages`, { body: text }).then(() => { setText(""); setErr(""); load(); }).catch((e) => setErr(e.message))} />
    <Button title={`Call ${name} through Uday`} tone="outline" onPress={() => api(`/api/bookings/${id}/call`, {}).then((r: any) => setNote(r.status === "simulated" ? "Test mode: your phone would ring and connect you." : "Your phone will ring now.")).catch((e) => setErr(e.message))} />
    {note ? <T color={C.teal} weight="semi">{note}</T> : null}{err ? <T color={C.coral}>{err}</T> : null}</Card>);
}

/** Readings from caregivers, family and devices, plus wearable connections. */
function Readings({ r, onBack }: { r: any; onBack: () => void }) {
  const [rows, setRows] = useState<any[]>([]); const [devs, setDevs] = useState<any[]>([]); const [err, setErr] = useState(""); const [hint, setHint] = useState<Record<string, string>>({});
  const load = useCallback(() => { api<any[]>(`/api/recipients/${r.id}/readings`).then(setRows).catch((e) => setErr(e.message)); api<any[]>(`/api/recipients/${r.id}/devices`).then(setDevs).catch(() => {}); }, [r.id]);
  useEffect(() => { load(); }, [load]);
  const latest: Record<string, any> = {}; rows.forEach((x) => { latest[x.kind] = x; });
  async function conn(d: string, off: boolean) { try { const x: any = await api(`/api/recipients/${r.id}/devices`, { device: d, disconnect: off }); setHint({ ...hint, [d]: x.next ?? "" }); load(); } catch (e: any) { setErr(e.message); } }
  return (
    <Screen>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={34} weight="bold">{r.name}: readings</T>
      {!Object.keys(latest).length && <T color={C.inkSoft}>No readings yet. They come from the caregiver's log, your entries on the website, and connected devices.</T>}
      {Object.entries(latest).filter(([k]) => k !== "bp_dia").map(([k, x]) => <Card key={k}><T weight="semi">{k === "bp_sys" ? "Blood pressure" : READING[k][0]}</T>
        <T size={34} weight="bold">{x.value}{k === "bp_sys" && latest.bp_dia ? `/${latest.bp_dia.value}` : ""} {READING[k][1]}</T>
        <T color={C.inkSoft}>{SOURCE[x.source]} · {new Date(x.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</T></Card>)}
      <T size={28} weight="bold" style={{ marginTop: 8 }}>Devices</T>
      {devs.map((d) => { const on = ["connected", "pending"].includes(d.status); return (<Card key={d.id} tone={d.status === "connected" ? "teal" : "cream"}>
        <T size={24} weight="bold">{d.name}</T><T color={C.inkSoft}>{d.path}</T>
        {d.verify ? <T color={C.amberDeep}>Support being confirmed</T> : null}
        {d.status === "pending" ? <T weight="semi">Waiting for the first sync</T> : d.status === "connected" ? <T weight="semi">✓ Connected</T> : null}
        {hint[d.id] ? <T>{hint[d.id]}</T> : null}
        <Button title={on ? "Disconnect" : "Connect"} tone={on ? "outline" : "night"} onPress={() => conn(d.id, on)} /></Card>); })}
      <ErrorText msg={err} />
    </Screen>
  );
}

const MOOD: Record<string, string> = { ok: "I am okay", help: "I need some help", medical: "I need medical help", lonely: "I feel lonely" };
const DOT: Record<string, string> = { ok: C.teal, help: C.amberDeep, medical: C.coral, lonely: C.amber };
/** The last seven days of check ins, medicines today, and how active they have been. */
function Week({ id }: { id: string }) {
  const [w, setW] = useState<any>(null);
  useEffect(() => { api(`/api/recipients/${id}/week`).then(setW).catch(() => {}); }, [id]);
  if (!w) return null;
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }} accessibilityLabel="Check ins in the last seven days">
        {w.week.map((d: any) => <View key={d.day} style={{ alignItems: "center", gap: 4 }}>
          <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: d.status ? DOT[d.status] : "#fff", borderWidth: 2, borderColor: C.night }} />
          <T>{new Date(d.day + "T00:00:00").toLocaleDateString("en-IN", { weekday: "narrow" })}</T></View>)}
      </View>
      <T>{w.streak} day streak{w.meds.total ? ` · medicines ${w.meds.taken} of ${w.meds.total} today` : ""} · games {w.gameDays} of 7 days{w.groups ? ` · ${w.groups} group${w.groups > 1 ? "s" : ""}` : ""}</T>
    </View>);
}
