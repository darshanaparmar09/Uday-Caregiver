import { useState } from "react";
import { Linking, Pressable, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../shared/api";
import { Button, Card, ErrorText, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";
import { Sun } from "../screens/Sun";
import type { Tab } from "./SeniorApp";
import { UrgentCard, useUrgent } from "../shared/alerts";

type Mood = "ok" | "help" | "medical" | "lonely";
const MOODS: [Mood, string, "teal" | "amber" | "coral" | "night"][] = [["ok", "I am okay", "teal"], ["help", "I need some help", "amber"], ["medical", "I need medical help", "coral"], ["lonely", "I feel lonely", "night"]];

/** The morning sunrise. Tap it, then choose one of four answers. Each answer has its own response. */
export function CheckIn({ name, contacts, onDone }: { name: string; contacts: any[]; onDone: (go?: Tab) => void }) {
  const { width, height } = useWindowDimensions(); const size = Math.min(width * 0.82, height * 0.55, 460);
  const [stage, setStage] = useState<"tap" | "ask" | Mood>("tap"); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const first = (name || "").split(" ")[0]; const hour = new Date().getHours(); const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const family = contacts.filter((c) => c.phone).slice(0, 2);
  const urgent = useUrgent(); const [told, setTold] = useState<{ told: number; family: number } | null>(null);
  // "I need help" and "I need medical help" are alerts: they keep retrying without internet and show who was really reached.
  async function send(m: Mood) {
    if (m === "help" || m === "medical") { urgent.send("/api/checkins", { status: m }); setStage(m); return; }
    setBusy(true); setErr(""); try { const r: any = await api("/api/checkins", { status: m }); setTold(r); urgent.reset(); setStage(m); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }

  if (stage === "tap") return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.night }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${greet}${first ? ", " + first : ""}. Tap the sun to check in.`} onPress={() => setStage("ask")} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Sun size={size}><T size={28} weight="semi" color={C.night} center>{greet}{first ? `,\n${first}` : ""}</T><T size={44} weight="bold" color={C.night} center style={{ marginTop: 8 }}>Tap</T></Sun>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => onDone()} style={{ minHeight: 72, alignItems: "center", justifyContent: "center" }}><T color={C.onNightSoft} weight="semi">Later</T></Pressable>
    </SafeAreaView>);
  if (stage === "ask") return (
    <Screen>
      <View style={{ alignItems: "center" }}><Sun size={110} pulse={false} /></View>
      <T size={36} weight="bold" center>How are you today?</T>
      {MOODS.map(([m, label, tone]) => <Button key={m} title={label} tone={tone} busy={busy} onPress={() => send(m)} style={{ minHeight: 96 }} />)}
      <ErrorText msg={err} />
    </Screen>);
  const calls = family.map((c) => <Button key={c.phone} title={`Call ${c.name}`} sub={c.relation} tone="teal" onPress={() => Linking.openURL(`tel:${c.phone}`)} />);
  if (stage === "medical") return (
    <Screen>
      <UrgentCard state={urgent.state} alert={urgent.alert} tries={urgent.tries} contacts={family} />
      <Card><T>Stay where you are. If you can, unlock your front door. Uday is not an ambulance service: for an emergency, call 112.</T></Card>
      <Button title="I am fine now" tone="outline" onPress={() => send("ok")} busy={busy} />
    </Screen>);
  if (stage === "help") return (
    <Screen>
      <UrgentCard state={urgent.state} alert={urgent.alert} tries={urgent.tries} contacts={family} />
      <Button title="Ask Uday to call me" tone="night" onPress={() => api("/api/senior/callback", { reason: "talk" }).then(() => onDone()).catch((e: any) => setErr(e.message))} />
      <Button title="Go to home" tone="outline" onPress={() => onDone()} /><ErrorText msg={err} />
    </Screen>);
  if (stage === "lonely") return (
    <Screen>
      <Card tone="teal"><T size={32} weight="bold">You are not alone{first ? `, ${first}` : ""}</T><T>{told?.told ? "We have sent your family a message asking them to call you today." : "Your family can see this when they open Uday."} Here are some things you can do now.</T></Card>
      {calls}
      <Button title="Find people in my groups" tone="amber" onPress={() => onDone("groups")} />
      <Button title="Play a brain game" tone="night" onPress={() => onDone("games")} />
      <Button title="Ask Uday to call me" tone="outline" onPress={() => api("/api/senior/callback", { reason: "lonely" }).then(() => onDone())} />
    </Screen>);
  return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: 12 }}><Sun size={170} pulse={false}><T size={56} weight="bold" color={C.night}>✓</T></Sun></View>
      <T size={36} weight="bold" center>Thank you{first ? `, ${first}` : ""}</T>
      <T center color={C.inkSoft}>{told?.told ? "Your family has been sent a message that you are well." : "Your family can see that you are well when they open Uday."}</T>
      <Button title="Continue" onPress={() => onDone()} style={{ marginTop: 24 }} />
    </Screen>);
}
