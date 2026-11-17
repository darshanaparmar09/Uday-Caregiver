import { useEffect, useState } from "react";
import { Linking, TextInput, View } from "react-native";
import { api, API } from "./api";
import { Button, Card, ErrorText, T } from "./ui";
import { C, F } from "./theme";

/**
 * "Your data" on every Me screen: privacy policy, delete account. Deletion happens inside the app, as Apple and
 * Google require, and the screen says plainly what is erased, what the law makes Uday keep, and what blocks it.
 */
export function AccountData({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false); const [info, setInfo] = useState<{ canDelete: boolean; blockers: string[] } | null>(null);
  const [text, setText] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  useEffect(() => { if (open) api<any>("/api/me/delete").then(setInfo).catch((e) => setErr(e.message)); }, [open]);
  async function go() { setBusy(true); setErr(""); try { await api("/api/me/delete", { confirm: text.trim().toUpperCase() }); onDeleted(); } catch (e: any) { setErr(e.message); setBusy(false); } }
  return (
    <Card>
      <T size={24} weight="bold">Your data</T>
      <Button title="Privacy policy" tone="outline" onPress={() => Linking.openURL(`${API}/legal`).catch(() => {})} />
      {!open ? <Button title="Delete my account" tone="outline" onPress={() => setOpen(true)} /> : (
        <View style={{ gap: 10 }}>
          <T weight="semi">Delete my account</T>
          <T>This erases your name, phone number, health details, documents, messages and posts. It cannot be undone.</T>
          <T color={C.inkSoft}>Kept without your name, because the law requires it: payment records and tax invoices.</T>
          {info && !info.canDelete ? <>{info.blockers.map((b) => <T key={b} color={C.coral} weight="semi">{b}</T>)}</> : <>
            <T weight="semi">Type DELETE to confirm</T>
            <TextInput value={text} onChangeText={setText} autoCapitalize="characters" accessibilityLabel="Type DELETE to confirm"
              style={{ fontFamily: F.medium, fontSize: 22, minHeight: 56, borderWidth: 2, borderColor: C.inkSoft, borderRadius: 14, paddingHorizontal: 12, color: C.ink, backgroundColor: "#fff" }} />
            <Button title="Delete my account for good" tone="coral" busy={busy} onPress={() => { if (text.trim().toUpperCase() !== "DELETE") { setErr("Type DELETE to confirm"); return; } go(); }} /></>}
          <Button title="Keep my account" tone="outline" onPress={() => { setOpen(false); setText(""); setErr(""); }} />
          <ErrorText msg={err} />
        </View>)}
    </Card>
  );
}
