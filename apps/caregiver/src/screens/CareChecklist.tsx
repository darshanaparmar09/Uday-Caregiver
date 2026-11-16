import { useState } from "react";
import { Pressable, View } from "react-native";
import { Button, Card, Chips, Field, T } from "../shared/ui";
import { C, S } from "../shared/theme";

const MOODS = ["Cheerful", "Calm", "Tired", "Unwell, family told", "Upset"];
const PAIN: [number, string][] = [[0, "0 None"], [2, "2"], [4, "4"], [6, "6"], [8, "8"], [10, "10 Worst"]];
const SECTION_TONE: Record<string, string> = { morning: "#3B9EDB", health: "#2A8C7E", mobility: "#E0A100", environment: "#E84545" };
const SECTION_ICON: Record<string, string> = { morning: "☀", health: "♥", mobility: "🚶", environment: "📋" };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

export interface LogPayload { mood: string; note?: string; checklist: Record<string, string>; vitals?: Record<string, number | boolean | string> }

/**
 * Daily care checklist, from the Uday Daily Resident Care Checklist.
 * Tapping a task stamps the time. Tier 3 nurses also record vital signs; readings outside
 * the usual range alert the family and Uday as soon as the log is saved.
 */
export function CareChecklist({ template, tier, busy, onSave }: { template: { id: string; title: string; items: { id: string; label: string }[] }[]; tier: number; busy: boolean; onSave: (p: LogPayload) => void }) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [pain, setPain] = useState<number | null>(null); const [skin, setSkin] = useState(false); const [appetite, setAppetite] = useState<string[]>(["normal"]);
  const [v, setV] = useState({ bpSys: "", bpDia: "", pulse: "", tempC: "" });
  const [mood, setMood] = useState("Calm"); const [note, setNote] = useState("");
  const total = template.reduce((n, s) => n + s.items.length, 0); const count = Object.keys(done).length;
  function tap(id: string) { setDone((d) => { const x = { ...d }; if (x[id]) delete x[id]; else x[id] = new Date().toISOString(); return x; }); }
  function save() {
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
    const vitals: Record<string, number | boolean | string> = {};
    if (tier >= 3) for (const k of ["bpSys", "bpDia", "pulse", "tempC"] as const) { const n = num(v[k]); if (n !== undefined && !Number.isNaN(n)) vitals[k] = n; }
    if (pain !== null) vitals.pain = pain;
    if (skin) vitals.skinConcern = true;
    vitals.appetite = appetite[0] ?? "normal";
    onSave({ mood, note: note || undefined, checklist: done, vitals });
  }
  return (
    <View style={{ gap: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <T size={26} weight="bold">Care checklist</T><T weight="bold" color={C.teal}>{count} of {total}</T>
      </View>
      <View style={{ height: 12, borderRadius: 6, backgroundColor: "#fff", overflow: "hidden" }}><View style={{ height: 12, width: `${(100 * count) / Math.max(1, total)}%`, backgroundColor: C.teal }} /></View>
      {template.map((s) => (
        <View key={s.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: SECTION_TONE[s.id] ?? C.night, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, alignSelf: "flex-start" }}>
            <T size={22} color="#fff">{SECTION_ICON[s.id] ?? "•"}</T><T weight="bold" color="#fff">{s.title}</T></View>
          {s.items.map((i) => { const on = !!done[i.id]; return (
            <Pressable key={i.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={i.label} onPress={() => tap(i.id)}
              style={{ minHeight: S.touch, borderRadius: 18, borderWidth: 3, borderColor: on ? C.teal : C.night, backgroundColor: on ? "#E3F3F0" : "#fff", flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 8, borderWidth: 3, borderColor: on ? C.teal : C.night, backgroundColor: on ? C.teal : "#fff", alignItems: "center", justifyContent: "center" }}><T size={22} weight="bold" color="#fff">{on ? "✓" : " "}</T></View>
              <View style={{ flex: 1 }}><T weight="semi">{i.label}</T>{on ? <T color={C.teal}>Done at {hhmm(done[i.id])}</T> : null}</View>
            </Pressable>); })}
          {s.id === "health" && <Card style={{ gap: 12 }}>
            {tier >= 3 && <>
              <T weight="bold">Vital signs</T>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="BP upper" value={v.bpSys} onChangeText={(x) => setV({ ...v, bpSys: x })} keyboardType="number-pad" maxLength={3} /></View>
                <View style={{ flex: 1 }}><Field label="BP lower" value={v.bpDia} onChangeText={(x) => setV({ ...v, bpDia: x })} keyboardType="number-pad" maxLength={3} /></View></View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <View style={{ flex: 1 }}><Field label="Pulse" value={v.pulse} onChangeText={(x) => setV({ ...v, pulse: x })} keyboardType="number-pad" maxLength={3} /></View>
                <View style={{ flex: 1 }}><Field label="Temp °C" value={v.tempC} onChangeText={(x) => setV({ ...v, tempC: x })} keyboardType="decimal-pad" maxLength={4} /></View></View>
            </>}
            <T weight="bold">Pain level (ask them)</T>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{PAIN.map(([n, l]) => <Button key={n} title={l} tone={pain === n ? (n >= 7 ? "coral" : "amber") : "outline"} onPress={() => setPain(n)} style={{ flexGrow: 1, minWidth: 90 }} />)}</View>
            <Button title={(skin ? "✓ " : "") + "Skin redness or irritation seen"} tone={skin ? "amber" : "outline"} onPress={() => setSkin(!skin)} />
            <T weight="bold">Appetite today</T>
            <Chips options={["normal", "low", "high"]} value={appetite} onChange={setAppetite} multi={false} />
          </Card>}
        </View>))}
      <T weight="bold">Mood</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>{MOODS.map((m) => <Button key={m} title={m} tone={mood === m ? "amber" : "outline"} onPress={() => setMood(m)} style={{ flexGrow: 1 }} />)}</View>
      <Field label="Note for the family" value={note} onChangeText={setNote} multiline style={{ minHeight: 110, fontSize: 22, paddingTop: 14 }} />
      <Button title="Save care log" tone="night" busy={busy} onPress={save} />
    </View>
  );
}
