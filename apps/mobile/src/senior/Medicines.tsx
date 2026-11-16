import { useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../shared/api";
import { Button, Card, Chips, ErrorText, Field, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

const SLOT: Record<string, string> = { morning: "Morning", afternoon: "Afternoon", evening: "Evening", night: "Night", daily: "Once a day" };
const SLOTS = ["Morning", "Afternoon", "Evening", "Night"];

/** Today's medicines by time of day, with one big Taken button each. The family sees what was taken. */
export function Medicines({ onBack }: { onBack: () => void }) {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(""); const [add, setAdd] = useState(false);
  const [name, setName] = useState(""); const [dose, setDose] = useState(""); const [when, setWhen] = useState<string[]>([]);
  useEffect(() => { api("/api/senior/meds").then(setD).catch((e) => setErr(e.message)); }, []);
  async function mark(i: any) { setErr(""); try { setD(await api("/api/senior/meds", { action: "taken", key: i.key, slot: i.slot, taken: !i.taken })); } catch (e: any) { setErr(e.message); } }
  async function save() { setErr(""); try { setD(await api("/api/senior/meds", { action: "add", name, dose, slots: when.map((w) => w.toLowerCase()) })); setAdd(false); setName(""); setDose(""); setWhen([]); } catch (e: any) { setErr(e.message); } }
  const items: any[] = d?.items ?? []; const taken = items.filter((i) => i.taken).length;
  return (
    <Screen tabbed>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={34} weight="bold">Medicines</T>
      {!!items.length && <Card tone="teal"><T size={28} weight="bold">{taken} of {items.length} taken today</T>
        <View style={{ height: 16, borderRadius: 8, backgroundColor: "#fff", overflow: "hidden" }}><View style={{ width: `${(taken / items.length) * 100}%`, height: 16, backgroundColor: C.teal }} /></View></Card>}
      {d && !items.length && <T>No medicines yet. Your family can add them in Uday, or you can add one here.</T>}
      {items.map((i) => (
        <Card key={i.key + i.slot} tone={i.taken ? "teal" : "cream"}>
          <T weight="semi" color={C.inkSoft}>{SLOT[i.slot]}{i.withFood ? " · with food" : ""}</T>
          <T size={28} weight="bold">{i.name} {i.dose}</T>
          <Button title={i.taken ? "✓ Taken" : "Take now"} sub={i.taken ? "Tap to undo" : undefined} tone={i.taken ? "outline" : "teal"} onPress={() => mark(i)} />
        </Card>))}
      {add ? <Card><T size={26} weight="bold">Add a medicine</T>
          <Field label="Medicine name" value={name} onChangeText={setName} />
          <Field label="Dose (for example 500 mg)" value={dose} onChangeText={setDose} />
          <T weight="semi">When?</T><Chips options={SLOTS} value={when} onChange={setWhen} />
          <Button title="Save" tone="teal" onPress={save} /><Button title="Cancel" tone="outline" onPress={() => setAdd(false)} /></Card>
        : <Button title="+ Add a medicine" tone="night" onPress={() => setAdd(true)} />}
      <ErrorText msg={err} />
    </Screen>
  );
}
