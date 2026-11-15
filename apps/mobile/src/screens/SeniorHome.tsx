import { useEffect, useState } from "react";
import { Linking, Pressable, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../api";
import { Button, Card, ErrorText, Screen, T } from "../ui";
import { C } from "../theme";
import { Sun } from "./Sun";

type Stage = "loading" | "tap" | "ask" | "ok" | "help" | "unlinked";

/**
 * The signature interaction. One enormous pulsing sunrise is the whole screen.
 * Tap it, then say "I am well" or "I need help". Nothing else competes.
 */
export function SeniorHome({ name, onSignOut }: { name: string | null; onSignOut: () => void }) {
  const { width, height } = useWindowDimensions();
  const size = Math.min(width * 0.82, height * 0.55, 460);
  const [stage, setStage] = useState<Stage>("loading"); const [who, setWho] = useState(name ?? ""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { api("/api/senior").then((h) => { if (!h.linked) return setStage("unlinked"); setWho(h.name); setStage(h.checkedInToday ? (h.lastStatus === "help" ? "help" : "ok") : "tap"); }).catch(() => setStage("tap")); }, []);
  async function send(status: "ok" | "help") { setBusy(true); setErr(""); try { await api("/api/checkins", { status }); setStage(status); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  const first = (who || "").split(" ")[0];
  const hour = new Date().getHours(); const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  if (stage === "loading") return <View style={{ flex: 1, backgroundColor: C.night }} />;
  if (stage === "tap") return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.night }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${greet}${first ? ", " + first : ""}. Tap the sun to check in.`} onPress={() => setStage("ask")}
        style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Sun size={size}>
          <T size={28} weight="semi" color={C.night} center>{greet}{first ? `,\n${first}` : ""}</T>
          <T size={44} weight="bold" color={C.night} center style={{ marginTop: 8 }}>Tap</T>
        </Sun>
      </Pressable>
    </SafeAreaView>
  );
  if (stage === "unlinked") return (
    <Screen tone="night"><T size={32} weight="bold" color={C.onNight}>Almost ready</T>
      <T color={C.onNightSoft}>Your family has not added this phone number to Uday yet. Ask them to add your number in their Uday account, then open this app again.</T>
      <Button title="Sign out" tone="outline" style={{ borderColor: C.amber }} onPress={onSignOut} /></Screen>
  );
  if (stage === "ask") return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: 8 }}><Sun size={120} pulse={false} /></View>
      <T size={36} weight="bold" center>How are you today?</T>
      <Button title="I am well" tone="teal" busy={busy} onPress={() => send("ok")} style={{ minHeight: 110 }} />
      <Button title="I need help" tone="coral" busy={busy} onPress={() => send("help")} style={{ minHeight: 110 }} />
      <ErrorText msg={err} />
    </Screen>
  );
  if (stage === "help") return (
    <Screen>
      <Card tone="coral"><T size={32} weight="bold">Help is coming</T><T>Your family and the Uday team have been told. Someone will call you soon.</T></Card>
      <Button title="Call 112 now" sub="If you are in danger" tone="coral" onPress={() => Linking.openURL("tel:112")} style={{ minHeight: 110 }} />
      <Button title="I am fine now" tone="teal" onPress={() => send("ok")} busy={busy} />
    </Screen>
  );
  return (
    <Screen>
      <View style={{ alignItems: "center", marginTop: 12 }}><Sun size={170} pulse={false} color={C.amber}><T size={56} weight="bold" color={C.night}>✓</T></Sun></View>
      <T size={36} weight="bold" center>Thank you{first ? `, ${first}` : ""}</T>
      <T center color={C.inkSoft}>You have checked in today. Your family can see it.</T>
      <Button title="I need help" tone="coral" onPress={() => send("help")} busy={busy} style={{ marginTop: 24 }} />
      <Button title="Sign out" tone="outline" onPress={onSignOut} style={{ marginTop: 40 }} />
    </Screen>
  );
}
