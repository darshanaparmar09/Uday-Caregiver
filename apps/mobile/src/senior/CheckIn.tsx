import { useState } from "react";
import { Linking, Pressable, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../shared/api";
import { Button, Card, ErrorText, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";
import { Sun } from "../screens/Sun";
import type { Tab } from "./SeniorApp";

type Mood = "ok" | "help" | "medical" | "lonely";
const MOODS: [Mood, string, "teal" | "amber" | "coral" | "night"][] = [["ok", "I am okay", "teal"], ["help", "I need some help", "amber"], ["medical", "I need medical help", "coral"], ["lonely", "I feel lonely", "night"]];

/** The morning sunrise. Tap it, then choose one of four answers. Each answer has its own response. */
export function CheckIn({ name, contacts, onDone }: { name: string; contacts: any[]; onDone: (go?: Tab) => void }) {
  const { width, height } = useWindowDimensions(); const size = Math.min(width * 0.82, height * 0.55, 460);
  const [stage, setStage] = useState<"tap" | "ask" | Mood>("tap"); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const first = (name || "").split(" ")[0]; const hour = new Date().getHours(); const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const family = contacts.filter((c) => c.phone).slice(0, 2);
  async function send(m: Mood) { setBusy(true); setErr(""); try { await api("/api/checkins", { status: m }); setStage(m); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }

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
      <Card tone="coral"><T size={32} weight="bold">Help is on the way</T><T>Your family and the Uday team have been alerted. Stay where you are. If you can, unlock your front door.</T></Card>
      <Button title="Call 112 now" sub="Ambulance and police" tone="coral" onPress={() => Linking.openURL("tel:112")} style={{ minHeight: 110 }} />
      {calls}<Button title="I am fine now" tone="outline" onPress={() => send("ok")} busy={busy} />
    </Screen>);
  if (stage === "help") return (
    <Screen>
      <Card tone="amber"><T size={32} weight="bold">We have told your family</T><T>Your family and the Uday team know you need some help. Someone will call you soon.</T></Card>
      {calls}<Button title="Ask Uday to call me" tone="night" onPress={() => api("/api/senior/callback", { reason: "talk" }).then(() => onDone())} />
      <Button title="Go to home" tone="outline" onPress={() => onDone()} />
    </Screen>);
  if (stage === "lonely") return (
    <Screen>
      <Card tone="teal"><T size={32} weight="bold">You are not alone{first ? `, ${first}` : ""}</T><T>We have asked your family to call you today. Here are some things you can do now.</T></Card>
      {calls}
      <Button title="Find people in my groups" tone="amber" onPress={() => onDone("groups")} />
      <Button title="Play a brain game" tone="night" onPress={() => onDone("games")} />
      <Button title="Ask Uday to call me" tone="outline" onPress={() => api("/api/senior/callback", { reason: "lonely" }).then(() => onDone())} />
    </Screen>);
  return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: 12 }}><Sun size={170} pulse={false}><T size={56} weight="bold" color={C.night}>✓</T></Sun></View>
      <T size={36} weight="bold" center>Thank you{first ? `, ${first}` : ""}</T>
      <T center color={C.inkSoft}>Your family knows you are well today.</T>
      <Button title="Continue" onPress={() => onDone()} style={{ marginTop: 24 }} />
    </Screen>);
}
