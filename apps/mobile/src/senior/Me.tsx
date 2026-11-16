import { useEffect, useState } from "react";
import { Linking, View } from "react-native";
import { api } from "../shared/api";
import { Button, Card, Chips, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

const TIMES: [string, string][] = [["07:00", "7 AM"], ["08:00", "8 AM"], ["09:00", "9 AM"], ["10:00", "10 AM"], ["11:00", "11 AM"]];
const LANG: [string, string][] = [["en", "English"], ["hi", "हिंदी"], ["mr", "मराठी"]];

/** Profile and settings: check in time, being found by people nearby, language, family contacts, a doctor callback. */
export function Me({ h, reload, onSignOut }: { h: any; reload: () => void; onSignOut: () => void }) {
  const [s, setS] = useState<any>(null); const [msg, setMsg] = useState("");
  useEffect(() => { api("/api/senior/settings").then(setS).catch(() => {}); }, []);
  async function save(p: any, ok: string) { try { setS(await api("/api/senior/settings", p, "PUT")); setMsg(ok); reload(); } catch (e: any) { setMsg(e.message); } }
  const label = (v: string, list: [string, string][]) => list.find(([k]) => k === v)?.[1] ?? v;
  return (
    <Screen tabbed>
      <Card tone="night"><T size={34} weight="bold" color="#fff">{h.name}</T><T color={C.onNightSoft}>{h.locality}</T>
        <T size={26} weight="bold" color={C.amber}>{h.streak} day check in streak</T></Card>
      {msg ? <Card tone="teal"><T weight="semi">{msg}</T></Card> : null}
      {s && <>
        <T size={28} weight="bold">Daily check in time</T><T>Uday reminds you at this time. Your family is told if there is no check in an hour later.</T>
        <Chips options={TIMES.map(([, l]) => l)} value={[label(s.checkinBy, TIMES)]} onChange={(v) => save({ checkinBy: TIMES.find(([, l]) => l === v[0])?.[0] }, "Check in time saved")} multi={false} />
        <T size={28} weight="bold">Language</T><T>Full Hindi and Marathi screens are coming. Your choice is saved now.</T>
        <Chips options={LANG.map(([, l]) => l)} value={[label(s.language, LANG)]} onChange={(v) => save({ language: LANG.find(([, l]) => l === v[0])?.[0] }, "Language saved")} multi={false} />
        <T size={28} weight="bold">People near me</T>
        <T>{s.discoverable ? "On. Other members can see your first name and area." : "Off. Other members cannot see you."}</T>
        <Button title={s.discoverable ? "Turn off" : "Let people near me find me"} tone={s.discoverable ? "outline" : "amber"} onPress={() => save({ discoverable: !s.discoverable }, s.discoverable ? "You are hidden from people nearby" : "People nearby can now find you")} />
      </>}
      <T size={28} weight="bold">Family contacts</T>
      {h.contacts.map((c: any) => <Card key={c.name + c.relation}><T size={26} weight="bold">{c.name}</T><T>{c.relation}{c.local ? " · nearby" : ""}</T>
        {c.phone && <Button title="Call" tone="teal" onPress={() => Linking.openURL(`tel:${c.phone}`)} />}</Card>)}
      <T color={C.inkSoft}>Your family can change these in their Uday account.</T>
      <Button title="Ask a doctor to call me" sub="Uday arranges a call back" tone="night" onPress={() => api("/api/senior/callback", { reason: "doctor" }).then(() => setMsg("Uday will arrange a doctor's call. We will phone you first."))} />
      <View style={{ height: 12 }} />
      <Button title="Sign out" tone="outline" onPress={onSignOut} />
    </Screen>
  );
}
