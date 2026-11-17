import { useState } from "react";
import { Linking, View } from "react-native";
import { api } from "../shared/api";
import { Button, Card, Chips, ErrorText, Field, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";
import { UrgentCard, useUrgent } from "../shared/alerts";

const CYBER: [string, string][] = [["bank", "Fake bank call"], ["kyc", "KYC update fraud"], ["upi", "UPI or payment scam"], ["invest", "Investment scam"], ["whatsapp", "WhatsApp or SMS scam"], ["other", "Something else"]];
const CRIME: [string, string][] = [["theft", "Theft or robbery"], ["cheat", "Cheated in person"], ["assault", "Physical attack"], ["harass", "Threats or harassment"], ["trespass", "Someone entered my home"], ["other", "Something else"]];
const WHEN = ["Today", "Yesterday", "This week", "Not sure"];

/** Safety: SOS, cyber fraud help (helpline 1930) and reporting a crime (112). Each report is saved and the family is told. */
export function Safety({ contacts }: { contacts: any[] }) {
  const [flow, setFlow] = useState<null | "cyber" | "crime">(null); const sos = useUrgent();
  if (flow) return <Report kind={flow} onBack={() => setFlow(null)} />;
  return (
    <Screen tabbed>
      <T size={34} weight="bold">Safety</T>
      {sos.state !== "idle" ? <UrgentCard state={sos.state} alert={sos.alert} tries={sos.tries} contacts={contacts} onClear={sos.reset} />
        : <Button title="SOS: I need help now" sub="Alerts your family and opens the phone to call 112" tone="coral" style={{ minHeight: 110 }} onPress={() => { sos.send("/api/sos", {}); Linking.openURL("tel:112").catch(() => {}); }} />}
      <T color={C.inkSoft}>Uday is not an emergency service. In danger, always call 112.</T>
      <Button title="I was cheated online or on the phone" sub="Money or bank details taken" tone="night" onPress={() => setFlow("cyber")} style={{ minHeight: 100 }} />
      <Button title="Report a crime" sub="Theft, attack, threats" tone="amber" onPress={() => setFlow("crime")} style={{ minHeight: 100 }} />
      {contacts.filter((c) => c.phone).slice(0, 2).map((c) => <Button key={c.phone} title={`Call ${c.name}`} sub={c.relation} tone="teal" onPress={() => Linking.openURL(`tel:${c.phone}`)} />)}
      <Card><T size={26} weight="bold">Stay safe from scams</T>
        {["Banks never ask for your OTP, PIN or password. Never share them.", "Do not install apps a caller asks you to install.", "Police and courts do not arrest anyone on a video call.", "If someone rushes you to pay, stop and call your family first."].map((t) => <T key={t}>• {t}</T>)}</Card>
    </Screen>
  );
}

function Report({ kind, onBack }: { kind: "cyber" | "crime"; onBack: () => void }) {
  const opts = kind === "cyber" ? CYBER : CRIME;
  const [cat, setCat] = useState<string | null>(null); const [when, setWhen] = useState<string[]>([]); const [amount, setAmount] = useState(""); const [details, setDetails] = useState("");
  const [code, setCode] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const number = kind === "cyber" ? "1930" : "112";
  async function submit() { setBusy(true); setErr(""); try { const r = await api("/api/senior/safety", { kind, category: cat, happened: when[0], amount: amount ? Number(amount.replace(/\D/g, "")) : undefined, details: details || undefined }); setCode(r.code); Linking.openURL(`tel:${number}`).catch(() => {}); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  if (code) return (
    <Screen tabbed>
      <Card tone="teal"><T size={30} weight="bold">Report saved</T><T>Your report is with the Uday team and an alert has gone to your family. Your reference is</T><T size={34} weight="bold">{code}</T></Card>
      <Button title={`Call ${number} now`} sub={kind === "cyber" ? "National cyber crime helpline" : "Police and emergency"} tone="coral" onPress={() => Linking.openURL(`tel:${number}`)} style={{ minHeight: 100 }} />
      {kind === "cyber" && <Card tone="amber"><T size={26} weight="bold">Do these now</T>
        {["Do not send any more money.", "Call your bank to block your card or UPI.", "Block the caller's number.", "Do not delete messages. They are evidence.", "You can also report at cybercrime.gov.in"].map((t) => <T key={t}>• {t}</T>)}</Card>}
      <Button title="Back to safety" tone="outline" onPress={onBack} />
    </Screen>);
  return (
    <Screen tabbed>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={32} weight="bold">{kind === "cyber" ? "Cheated online or on the phone" : "Report a crime"}</T>
      <T>{kind === "cyber" ? "Call 1930 as soon as you can. Quick reporting gives the best chance of stopping the money." : "If you are in danger now, call 112 first."}</T>
      <T size={26} weight="bold">What happened?</T>
      {opts.map(([k, l]) => <Button key={k} title={(cat === k ? "✓ " : "") + l} tone={cat === k ? "night" : "outline"} onPress={() => setCat(k)} />)}
      {cat && <>
        <T size={26} weight="bold">When?</T><Chips options={WHEN} value={when} onChange={setWhen} multi={false} />
        {kind === "cyber" && <Field label="How much money? (₹, if any)" value={amount} onChangeText={setAmount} keyboardType="number-pad" />}
        <Field label="Anything else (optional)" value={details} onChangeText={setDetails} multiline style={{ minHeight: 100, textAlignVertical: "top", paddingTop: 14 }} />
        <Button title={`Save and call ${number}`} tone="coral" busy={busy} onPress={submit} style={{ minHeight: 100 }} /></>}
      <ErrorText msg={err} />
    </Screen>);
}
