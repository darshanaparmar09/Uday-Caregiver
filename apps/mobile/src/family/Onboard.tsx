import { useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../shared/api";
import { Button, Card, Chips, ErrorText, Field, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

const LANGS = ["Marathi", "Hindi", "English", "Gujarati", "Kannada"];
const NEEDS = ["Help walking", "Memory loss", "Diabetes", "Lives alone", "Needs meals", "Hearing difficulty"];

/** Add a parent in the app: the same details as the website, in four short steps. */
export function Onboard({ onBack, onDone }: { onBack: () => void; onDone: () => void }) {
  const [step, setStep] = useState(1); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", dob: "", address: "", locality: "", hospital: "", hasPhone: true, phone: "", langs: [] as string[], needs: [] as string[],
    c1n: "", c1r: "", c1p: "", c1c: "", c2n: "", c2r: "", c2p: "", c2c: "Pune", allergies: true, medicines: true, conditions: false, onBehalf: false });
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  async function save() {
    setErr(""); setBusy(true);
    try { await api("/api/recipients", { name: f.name, dob: f.dob || undefined, address: f.address, locality: f.locality, hospital: f.hospital, hasPhone: f.hasPhone, phone: f.hasPhone ? f.phone : undefined, languages: f.langs,
      careNeeds: Object.fromEntries(f.needs.map((n) => [n, true])),
      emergencyContacts: [{ name: f.c1n, relation: f.c1r, phone: f.c1p, city: f.c1c }, { name: f.c2n, relation: f.c2r, phone: f.c2p, city: f.c2c, isLocal: true }],
      consent: { onBehalf: f.onBehalf, shareWithCaregiver: { allergies: f.allergies, medicines: f.medicines, conditions: f.conditions } } }); onDone(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  const Toggle = ({ k, label }: { k: string; label: string }) => <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: (f as any)[k] }} onPress={() => set(k, !(f as any)[k])} style={{ flexDirection: "row", gap: 12, minHeight: 56, alignItems: "center" }}><T size={28}>{(f as any)[k] ? "☑" : "☐"}</T><T style={{ flex: 1 }}>{label}</T></Pressable>;
  return (
    <Screen>
      <Button title={step === 1 ? "Back" : "Previous step"} tone="outline" onPress={() => (step === 1 ? onBack() : setStep(step - 1))} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T color={C.inkSoft} weight="semi">Step {step} of 4</T>
      {step === 1 && <><T size={30} weight="bold">About your parent</T>
        <Field label="Full name" value={f.name} onChangeText={(v) => set("name", v)} /><Field label="Date of birth (YYYY-MM-DD, optional)" value={f.dob} onChangeText={(v) => set("dob", v)} />
        <T weight="semi">Languages</T><Chips options={LANGS} value={f.langs} onChange={(v) => set("langs", v)} />
        <Toggle k="hasPhone" label="They have their own smartphone (for the daily check in)" />
        {f.hasPhone && <Field label="Their mobile number" value={f.phone} onChangeText={(v) => set("phone", v)} keyboardType="phone-pad" />}
        <ErrorText msg={err} /><Button title="Next" onPress={() => { if (!f.name) return setErr("Enter their name"); setErr(""); setStep(2); }} /></>}
      {step === 2 && <><T size={30} weight="bold">Where they live</T>
        <Field label="Full address" value={f.address} onChangeText={(v) => set("address", v)} multiline style={{ minHeight: 100, textAlignVertical: "top", paddingTop: 14 }} />
        <Field label="Area, for example Kothrud" value={f.locality} onChangeText={(v) => set("locality", v)} /><Field label="Nearest hospital" value={f.hospital} onChangeText={(v) => set("hospital", v)} />
        <T weight="semi">Care needs</T><Chips options={NEEDS} value={f.needs} onChange={(v) => set("needs", v)} />
        <Button title="Next" onPress={() => setStep(3)} /></>}
      {step === 3 && <><T size={30} weight="bold">Two emergency contacts</T><T color={C.inkSoft}>The second should live nearby.</T>
        <Card><Field label="Name" value={f.c1n} onChangeText={(v) => set("c1n", v)} /><Field label="Relation" value={f.c1r} onChangeText={(v) => set("c1r", v)} /><Field label="Mobile, with country code if abroad" value={f.c1p} onChangeText={(v) => set("c1p", v)} keyboardType="phone-pad" /><Field label="City" value={f.c1c} onChangeText={(v) => set("c1c", v)} /></Card>
        <Card><Field label="Nearby contact name" value={f.c2n} onChangeText={(v) => set("c2n", v)} /><Field label="Relation" value={f.c2r} onChangeText={(v) => set("c2r", v)} /><Field label="Mobile" value={f.c2p} onChangeText={(v) => set("c2p", v)} keyboardType="phone-pad" /></Card>
        <Button title="Next" onPress={() => setStep(4)} /></>}
      {step === 4 && <><T size={30} weight="bold">Consent</T>
        <T>What may the caregiver see before a shift? Health details are optional and can be added later.</T>
        <Toggle k="allergies" label="Allergies" /><Toggle k="medicines" label="Medicines" /><Toggle k="conditions" label="Conditions" />
        <Toggle k="onBehalf" label="I have my parent's agreement to set this up for them" />
        <ErrorText msg={err} /><Button title="Save" tone="teal" busy={busy} onPress={() => (f.onBehalf ? save() : setErr("Please confirm you have your parent's agreement"))} /></>}
    </Screen>);
}
