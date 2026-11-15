import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { api, API, countdown, inr, PLAN, STATUS, TYPE } from "../api";
import { Button, Card, ErrorText, Screen, T } from "../ui";
import { C } from "../theme";

export function FamilyHome({ me, onSignOut }: { me: any; onSignOut: () => void }) {
  const [recips, setRecips] = useState<any[]>([]); const [bookings, setBookings] = useState<any[]>([]); const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => { const [r, b] = await Promise.all([api<any[]>("/api/recipients"), api<any[]>("/api/bookings")]); setRecips(r); setBookings(b); }, []);
  useEffect(() => { load().catch(() => {}); const t = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(t); }, [load]);
  if (open) return <BookingDetail id={open} onBack={() => { setOpen(null); load(); }} />;
  const live = bookings.filter((b) => !["closed", "cancelled", "released"].includes(b.status));
  return (
    <Screen>
      <T size={34} weight="bold">Namaste{me.user.name ? `, ${me.user.name.split(" ")[0]}` : ""}</T>
      {!recips.length && <Card><T weight="semi">Add your parent's profile on the Uday website to start.</T><Button title="Open the website" onPress={() => Linking.openURL(API + "/app/onboarding")} /></Card>}
      {recips.map((r) => { const today = r.last_checkin && new Date(r.last_checkin.at).toDateString() === new Date().toDateString(); const help = today && r.last_checkin.status === "help";
        return (<Card key={r.id} tone={help ? "coral" : today ? "teal" : "amber"}>
          <T size={28} weight="bold">{r.name}</T>
          <T weight="semi">{help ? "Asked for help today" : today ? "Checked in today" : "Not checked in yet today"}{today ? ` at ${new Date(r.last_checkin.at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</T>
          {!today && <Button title="I spoke to them today" tone="teal" onPress={() => api("/api/checkins", { status: "ok", recipientId: r.id }).then(load)} />}
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
      <Button title="Book care" onPress={() => Linking.openURL(API + "/hire")} />
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
      {b.status === "arrived" && <Card tone="teal"><T weight="semi">{first} is at the door. Give this start code:</T><T size={64} weight="bold" center style={{ letterSpacing: 16 }}>{b.startCode}</T></Card>}
      {b.status === "active" && <Card tone="teal"><T weight="semi">Care in progress. At the end, give this end code:</T><T size={64} weight="bold" center style={{ letterSpacing: 16 }}>{b.endCode}</T></Card>}
      {b.logs?.slice(-3).reverse().map((l: any, i: number) => <Card key={i}><T weight="semi">Shift log · day {l.day}</T><T>{[l.meal && "Meal given", l.meds && "Medicines given", `Mood: ${l.mood}`].filter(Boolean).join(" · ")}</T>{l.note ? <T color={C.inkSoft}>{l.note}</T> : null}</Card>)}
      {b.status === "completed" && <Card><T weight="semi">How was the care?</T><View style={{ flexDirection: "row", justifyContent: "space-between" }}>{[1, 2, 3, 4, 5].map((n) =>
        <Pressable key={n} accessibilityRole="button" accessibilityLabel={`${n} stars`} onPress={() => act({ action: "rate", stars: n, tags: [] })} style={{ minWidth: 56, minHeight: 72, alignItems: "center", justifyContent: "center" }}><T size={44} color={C.amber}>★</T></Pressable>)}</View></Card>}
      {["offered", "proposal", "accepted", "enroute"].includes(b.status) && !quote && <Button title="Cancel booking" tone="outline" onPress={() => api(`/api/bookings/${id}/quote`).then(setQuote).catch((e) => setErr(e.message))} />}
      {quote && <Card><T weight="bold">Cancel this booking?</T><T>Fee {inr(quote.feePaise)} · Refund {inr(quote.refundPaise)}</T><T color={C.inkSoft}>Free up to 4 hours before a shift, then 20% of one day of care.</T>
        <Button title="Yes, cancel" tone="night" busy={busy} onPress={() => act({ action: "cancel" })} /><Button title="Keep booking" tone="outline" onPress={() => setQuote(null)} /></Card>}
      <ErrorText msg={err} />
    </Screen>
  );
}
