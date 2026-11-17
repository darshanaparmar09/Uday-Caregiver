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
  const [msgs, setMsgs] = useState<{ id?: number; role: string; text: string; label?: string; reported?: boolean }[]>([]);
  const [about, setAbout] = useState<string[] | null>(null); const [consented, setConsented] = useState<boolean | null>(null); const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const ref = useRef<ScrollView>(null);
  useEffect(() => { api("/api/senior/companion").then((h: any) => { setConsented(h.consented); setAbout(h.about); setMsgs(h.messages.map((m: any) => ({ id: m.id, role: m.role, text: m.text ?? "", reported: m.reported }))); }).catch((e) => setErr(e.message)); }, []);
  async function flag(id?: number) { if (!id) return; try { await api("/api/senior/companion", { report: id }); setMsgs((m) => m.map((x) => x.id === id ? { ...x, reported: true } : x)); } catch (e: any) { setErr(e.message); } }
  useEffect(() => { setTimeout(() => ref.current?.scrollToEnd({ animated: true }), 50); }, [msgs]);
  async function send() {
    const t = text.trim(); if (!t || busy) return; setBusy(true); setErr(""); setMsgs((m) => [...m, { role: "user", text: t }]); setText("");
    try { const r: any = await api("/api/senior/companion", { message: t }); setMsgs((m) => [...m, { id: r.id, role: "assistant", text: r.reply, label: r.label, crisis: r.crisis } as any]); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const crisis = (msgs[msgs.length - 1] as any)?.crisis;
  if (consented === false) return (
    <ScrollView style={{ flex: 1, backgroundColor: C.peach }} contentContainerStyle={{ padding: 16, paddingTop: 48, gap: 14 }}>
      <T size={30} weight="bold">{tr("Before you start")}</T>
      {(about ?? []).map((a, i) => <Card key={i}><T>{a}</T></Card>)}
      <Button title="I understand. Start chatting" onPress={() => api("/api/senior/companion", { consent: true }).then(() => setConsented(true)).catch((e) => setErr(e.message))} />
      <Button title="Not now" tone="outline" onPress={onBack} />
      {!!err && <Card tone="coral"><T>{err}</T></Card>}
    </ScrollView>);
  return (
    <View style={{ flex: 1, backgroundColor: C.peach }}>
      <View style={{ padding: 16, paddingTop: 48, backgroundColor: C.night, gap: 6 }}>
        <T size={30} weight="bold" color="#fff">Talk to Uday</T><T color={C.onNightSoft}>{tr("An AI companion, not a person or a doctor. It can be wrong.")}</T>
      </View>
      <ScrollView ref={ref} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {!msgs.length && <Card><T>{tr("Namaste. How is your day going? You can tell me anything: what you ate, a memory, a song you like.")}</T></Card>}
        {msgs.map((m, i) => (
          <View key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "85%", backgroundColor: m.role === "user" ? C.teal : "#fff", borderRadius: 22, padding: 14 }}>
            <T size={24} color={m.role === "user" ? "#fff" : C.ink}>{m.text}</T>
            {m.role === "assistant" && <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }}>
              <T size={16} color={C.inkSoft}>{m.label ?? tr("Written by AI. It can be wrong.")}</T>
              {m.id ? (m.reported ? <T size={16} color={C.inkSoft}>{tr("Reported")}</T>
                : <Button title="Report reply" tone="outline" onPress={() => flag(m.id)} />) : null}
            </View>}</View>))}
        {busy && <T color={C.inkSoft}>…</T>}
        {crisis && <Button title="SOS: I need help now" sub="Alerts your family and opens the phone to call 112" tone="coral" onPress={onSos} />}
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
