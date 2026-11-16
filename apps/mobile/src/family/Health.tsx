import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../shared/api";
import { Button, Card, ErrorText, Field, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

/** Optional health details in the app: allergies, conditions, medicines, doctor. */
export function Health({ r, onBack }: { r: any; onBack: () => void }) {
  const [h, setH] = useState<any>(null); const [err, setErr] = useState(""); const [ok, setOk] = useState(""); const [busy, setBusy] = useState(false);
  const [allergy, setAllergy] = useState(""); const [cond, setCond] = useState(""); const [med, setMed] = useState({ name: "", dose: "", times: "" }); const [doc, setDoc] = useState({ name: "", phone: "" });
  useEffect(() => { api(`/api/recipients/${r.id}/health`).then((x) => setH(x ?? { allergies: [], conditions: [], medicines: [], doctors: [] })).catch((e) => setErr(e.message)); }, [r.id]);
  async function save(next: any) { setBusy(true); setErr(""); setOk(""); try { await api(`/api/recipients/${r.id}/health`, { noKnownAllergies: !next.allergies.length ? null : false, allergies: next.allergies, conditions: next.conditions, medicines: next.medicines, doctors: next.doctors, insurance: next.insurance ?? undefined }, "PUT"); setH(next); setOk("Saved"); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  if (!h) return <Screen><T>{err || "Loading"}</T></Screen>;
  const List = ({ items, label, onRemove }: { items: string[]; label: string; onRemove: (i: number) => void }) => <>{items.map((x, i) => <View key={label + i} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}><T style={{ flex: 1 }}>• {x}</T><Button title="Remove" tone="outline" onPress={() => onRemove(i)} style={{ minHeight: 56, paddingHorizontal: 14 }} /></View>)}</>;
  return (
    <Screen>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={30} weight="bold">{r.name}: health details</T><T color={C.inkSoft}>Optional. Stored encrypted. Caregivers see only what you allowed.</T>
      {ok ? <Card tone="teal"><T weight="semi">{ok}</T></Card> : null}<ErrorText msg={err} />
      <Card><T size={24} weight="bold">Allergies</T><List label="a" items={h.allergies.map((a: any) => a.name)} onRemove={(i) => save({ ...h, allergies: h.allergies.filter((_: any, j: number) => j !== i) })} />
        <Field label="Add an allergy" value={allergy} onChangeText={setAllergy} /><Button title="Add" tone="night" busy={busy} onPress={() => { if (allergy) { save({ ...h, allergies: [...h.allergies, { name: allergy }] }); setAllergy(""); } }} /></Card>
      <Card><T size={24} weight="bold">Conditions</T><List label="c" items={h.conditions} onRemove={(i) => save({ ...h, conditions: h.conditions.filter((_: any, j: number) => j !== i) })} />
        <Field label="Add a condition" value={cond} onChangeText={setCond} /><Button title="Add" tone="night" busy={busy} onPress={() => { if (cond) { save({ ...h, conditions: [...h.conditions, cond] }); setCond(""); } }} /></Card>
      <Card><T size={24} weight="bold">Medicines</T><List label="m" items={h.medicines.map((m: any) => `${m.name} ${m.dose}, ${m.times}`)} onRemove={(i) => save({ ...h, medicines: h.medicines.filter((_: any, j: number) => j !== i) })} />
        <Field label="Medicine" value={med.name} onChangeText={(v) => setMed({ ...med, name: v })} /><Field label="Dose" value={med.dose} onChangeText={(v) => setMed({ ...med, dose: v })} /><Field label="When (for example 8 AM and 8 PM)" value={med.times} onChangeText={(v) => setMed({ ...med, times: v })} />
        <Button title="Add" tone="night" busy={busy} onPress={() => { if (med.name && med.times) { save({ ...h, medicines: [...h.medicines, med] }); setMed({ name: "", dose: "", times: "" }); } }} /></Card>
      <Card><T size={24} weight="bold">Doctor</T><List label="d" items={h.doctors.map((d: any) => `${d.name}${d.phone ? ", " + d.phone : ""}`)} onRemove={(i) => save({ ...h, doctors: h.doctors.filter((_: any, j: number) => j !== i) })} />
        <Field label="Doctor's name" value={doc.name} onChangeText={(v) => setDoc({ ...doc, name: v })} /><Field label="Phone (optional)" value={doc.phone} onChangeText={(v) => setDoc({ ...doc, phone: v })} keyboardType="phone-pad" />
        <Button title="Add" tone="night" busy={busy} onPress={() => { if (doc.name) { save({ ...h, doctors: [...h.doctors, { name: doc.name, phone: doc.phone || undefined }] }); setDoc({ name: "", phone: "" }); } }} /></Card>
      <T color={C.inkSoft}>Prescriptions and reports can be uploaded on the website.</T>
    </Screen>);
}
