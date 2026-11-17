import { Image, Linking, Pressable, View } from "react-native";
import { api, API } from "../shared/api";
import { Button, Card, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";
import { Medicines } from "./Medicines";
import { useState } from "react";
import { Companion } from "./Companion";
import { tr } from "../shared/i18n";
import { UrgentCard, useUrgent } from "../shared/alerts";
import type { Tab } from "./SeniorApp";

const MOOD: Record<string, string> = { ok: "I am okay", help: "I need some help", medical: "I need medical help", lonely: "I feel lonely" };
const SLOT: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night", daily: "Today" };

/** Home: check in status and streak, SOS, your people, medicines, thought of the day, today's game. */
export function Today({ h, reload, go, onCheckIn }: { h: any; reload: () => Promise<any>; go: (t: Tab) => void; onCheckIn: () => void }) {
  const [meds, setMeds] = useState(false); const sos = useUrgent(); const [asked, setAsked] = useState(false); const [talk, setTalk] = useState(false);
  if (meds) return <Medicines onBack={() => { setMeds(false); reload(); }} />;
  const first = (h.name || "").split(" ")[0]; const hour = new Date().getHours(); const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  if (talk) return <Companion onBack={() => setTalk(false)} onSos={() => { setTalk(false); raiseSos(); }} />;
  function raiseSos() { sos.send("/api/sos", {}); Linking.openURL("tel:112").catch(() => {}); }
  const n = h.meds?.next;
  return (
    <Screen tabbed>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <T size={32} weight="bold" style={{ flexShrink: 1 }}>{greet}{first ? `, ${first}` : ""}</T>
        {h.streak > 0 && <View accessibilityLabel={`${h.streak} day streak`} style={{ backgroundColor: C.night, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignItems: "center" }}>
          <T size={26} weight="bold" color={C.amber}>{h.streak}</T><T color="#fff">{h.streak === 1 ? "day" : "days"}</T></View>}
      </View>
      {h.checkedInToday ? (
        <Card tone={h.lastStatus === "ok" ? "teal" : h.lastStatus === "lonely" ? "amber" : "coral"}>
          <T size={26} weight="bold">✓ Checked in today</T>
          <T>{`"${tr(MOOD[h.lastStatus] ?? "Checked in")}" at ${new Date(h.lastAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}. Your family can see it.`}</T>
          <Button title="Change my answer" tone="outline" onPress={onCheckIn} />
        </Card>
      ) : <Button title="Check in now" sub="Tell your family you are well" tone="amber" onPress={onCheckIn} style={{ minHeight: 100 }} />}

      {h.caregiver && <Card tone="teal"><View style={{ flexDirection: "row", gap: 14, alignItems: "center" }}>
          {h.caregiver.photo ? <Image source={{ uri: API + h.caregiver.photo }} style={{ width: 84, height: 84, borderRadius: 42 }} accessibilityLabel={`Photo of ${h.caregiver.name}`} />
            : <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: C.night, alignItems: "center", justifyContent: "center" }}><T size={30} weight="bold" color={C.amber}>{h.caregiver.first[0]}</T></View>}
          <View style={{ flex: 1 }}><T size={28} weight="bold">{h.caregiver.first} is {h.caregiver.status}</T>
            <T>{h.caregiver.relief ? "Covering your regular caregiver's day off." : `Uday caregiver${h.caregiver.days > 1 ? `, day ${h.caregiver.day} of ${h.caregiver.days}` : ""}.`}</T></View></View>
        <T color={C.inkSoft}>Open the door only to the person in this photo.</T></Card>}
      {sos.state !== "idle" ? <UrgentCard state={sos.state} alert={sos.alert} tries={sos.tries} contacts={h.contacts ?? []} onClear={sos.reset} />
        : <Button title="SOS: I need help now" sub="Alerts your family and opens the phone to call 112" tone="coral" onPress={raiseSos} style={{ minHeight: 100 }} />}

      {!!h.contacts?.length && <><T size={28} weight="bold">Your people</T>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>{h.contacts.slice(0, 4).map((c: any) => (
          <Pressable key={c.phone ?? c.name} accessibilityRole="button" accessibilityLabel={`Call ${c.name}, ${c.relation}`} onPress={() => c.phone && Linking.openURL(`tel:${c.phone}`)}
            style={{ flexBasis: "47%", flexGrow: 1, minHeight: 96, borderRadius: 22, backgroundColor: C.teal, padding: 14, justifyContent: "center" }}>
            <T size={26} weight="bold" color="#fff">📞 {c.name}</T><T color="#fff">{c.relation}</T></Pressable>))}</View></>}

      <T size={28} weight="bold">Your day</T>
      <Pressable accessibilityRole="button" onPress={() => setMeds(true)}>
        <Card tone={h.meds?.due ? "amber" : "cream"}><T size={26} weight="bold">💊 Medicines</T>
          {!h.meds?.total ? <T>No medicines on your list. Tap to add one.</T> : h.meds.due ? <T>{SLOT[n.slot]}: {n.name} {n.dose}. {h.meds.due} still to take today.</T> : <T>All {h.meds.total} taken today. Well done.</T>}</Card></Pressable>
      <Pressable accessibilityRole="button" onPress={() => go("games")}>
        <Card><T size={26} weight="bold">🧠 Brain games</T><T>{h.gamesToday?.length ? `Played today: ${h.gamesToday.length} of 3 games.` : "Today's challenge takes 3 minutes."}</T></Card></Pressable>
      {h.nextEvent && <Pressable accessibilityRole="button" onPress={() => go("groups")}><Card tone="teal"><T size={26} weight="bold">📅 {h.nextEvent.title}</T>
        <T>{new Date(h.nextEvent.starts_at).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })} · {h.nextEvent.place}</T></Card></Pressable>}
      {h.newNamastes > 0 && <Pressable accessibilityRole="button" onPress={() => go("groups")}><Card tone="amber"><T size={26} weight="bold">🙏 {h.newNamastes} new namaste{h.newNamastes > 1 ? "s" : ""}</T><T>Tap to see who greeted you.</T></Card></Pressable>}
      <Button title="Talk to Uday" sub="Chat any time. Uday listens." tone="teal" onPress={() => setTalk(true)} />
      <Card tone="night"><T weight="semi" color={C.amber}>THOUGHT OF THE DAY</T><T size={28} weight="semi" color="#fff">{h.thought}</T></Card>
      {asked ? <Card tone="teal"><T size={26} weight="bold">The Uday team will call you</T><T>Usually within a few hours, between 9 AM and 7 PM.</T></Card>
        : <Button title="Talk to the Uday team" sub="We will call you back" tone="night" onPress={() => api("/api/senior/callback", { reason: "talk" }).then(() => setAsked(true)).catch(() => {})} />}
    </Screen>
  );
}
