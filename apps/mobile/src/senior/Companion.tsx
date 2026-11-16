import { useEffect, useRef, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { api } from "../shared/api";
import { Button, Card, T } from "../shared/ui";
import { tr } from "../shared/i18n";
import { C, F } from "../shared/theme";

/**
 * "Talk to Uday": a gentle chat companion. Replies come from the server, which uses an AI model when a key is set
 * and short scripted replies when it is not. Words about falls, chest pain or ending life alert the family at once.
 * Families cannot read these chats.
 */
export function Companion({ onBack, onSos }: { onBack: () => void; onSos: () => void }) {
  const [msgs, setMsgs] = useState<{ role: string; text: string }[]>([]); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const ref = useRef<ScrollView>(null);
  useEffect(() => { api("/api/senior/companion").then((h: any[]) => setMsgs(h.map((m) => ({ role: m.role, text: m.text ?? "" })))).catch(() => {}); }, []);
  useEffect(() => { setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 50); }, [msgs]);
  async function send() {
    const t = text.trim(); if (!t || busy) return; setBusy(true); setErr(""); setMsgs((m) => [...m, { role: "user", text: t }]); setText("");
    try { const r: any = await api("/api/senior/companion", { message: t }); setMsgs((m) => [...m, { role: "assistant", text: r.reply, crisis: r.crisis } as any]); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const crisis = (msgs[msgs.length - 1] as any)?.crisis;
  return (
    <View style={{ flex: 1, backgroundColor: C.peach }}>
      <View style={{ padding: 16, paddingTop: 48, backgroundColor: C.night, gap: 6 }}>
        <T size={30} weight="bold" color="#fff">Talk to Uday</T><T color={C.onNightSoft}>Chat any time. Uday listens.</T>
      </View>
      <ScrollView ref={ref} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!msgs.length && <Card><T>{tr("Namaste. How is your day going? You can tell me anything: what you ate, a memory, a song you like.")}</T></Card>}
        {msgs.map((m, i) => (
          <View key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", backgroundColor: m.role === "user" ? C.teal : "#fff", borderRadius: 22, padding: 14 }}>
            <T size={24} color={m.role === "user" ? "#fff" : C.ink}>{m.text}</T></View>))}
        {busy && <T color={C.inkSoft}>…</T>}
        {crisis && <Button title="SOS: I need help now" sub="Calls 112 and alerts your family" tone="coral" onPress={onSos} />}
        {!!err && <Card tone="coral"><T>{err}</T></Card>}
      </ScrollView>
      <View style={{ padding: 16, gap: 10, backgroundColor: "#fff" }}>
        <TextInput value={text} onChangeText={setText} placeholder={tr("Write to Uday")} multiline maxLength={600} accessibilityLabel={tr("Write to Uday")}
          style={{ fontFamily: F.medium, fontSize: 24, minHeight: 64, borderWidth: 2, borderColor: C.inkSoft, borderRadius: 18, padding: 12, color: C.ink }} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><Button title="Back" tone="outline" onPress={onBack} /></View>
          <View style={{ flex: 2 }}><Button title="Send" busy={busy} onPress={send} /></View>
        </View>
      </View>
    </View>
  );
}
