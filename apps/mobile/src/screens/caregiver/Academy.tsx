import { useCallback, useEffect, useState } from "react";
import { View } from "react-native";
import { api } from "../../api";
import { Button, Card, ErrorText, Screen, T } from "../../ui";
import { C } from "../../theme";

export function Academy() {
  const [d, setD] = useState<any>(null); const [open, setOpen] = useState<any>(null); const [ans, setAns] = useState<number[]>([]); const [res, setRes] = useState<any>(null); const [err, setErr] = useState("");
  const load = useCallback(() => api("/api/academy").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function submit() { setErr(""); try { setRes(await api(`/api/academy/${open.id}`, { answers: ans })); load(); } catch (e: any) { setErr(e.message); } }
  if (!d) return <Screen tabbed><T>Loading</T><ErrorText msg={err} /></Screen>;
  if (open) return (
    <Screen tabbed>
      <Button title="Back to modules" tone="outline" onPress={() => { setOpen(null); setRes(null); }} />
      <T size={30} weight="bold">{open.title}</T>
      <Card>{open.lesson.map((l: string, i: number) => <T key={i}>• {l}</T>)}</Card>
      <T size={26} weight="bold">Check your learning</T>
      {open.quiz.map((q: any, qi: number) => (
        <Card key={qi}><T weight="semi">{qi + 1}. {q.q}</T>
          {q.options.map((o: string, oi: number) => { const chosen = ans[qi] === oi; const right = res && res.correct[qi] === oi; const wrong = res && chosen && !right;
            return <Button key={oi} title={o} tone={res ? (right ? "teal" : wrong ? "coral" : "outline") : chosen ? "amber" : "outline"} onPress={() => { if (res) return; const a = [...ans]; a[qi] = oi; setAns(a); }} />; })}
        </Card>))}
      {!res ? <Button title="Submit answers" onPress={submit} /> :
        <Card tone={res.passed ? "teal" : "amber"}><T size={28} weight="bold">{res.passed ? "Passed" : "Not yet"} · {res.score} of {res.total}</T><T>{res.passed ? "Well done. This module is complete." : "Read the lesson again and retry."}</T>
          {!res.passed && <Button title="Try again" onPress={() => { setRes(null); setAns([]); }} />}</Card>}
      <ErrorText msg={err} />
    </Screen>
  );
  return (
    <Screen tabbed>
      <T size={30} weight="bold">Academy</T>
      <Card tone="amber"><T weight="semi">You are Tier {d.tier}{d.nextTier ? `. Modules toward Tier ${d.nextTier}:` : "."}</T>
        <T size={36} weight="bold">{d.progress.done} of {d.progress.total} done</T>
        <View style={{ height: 14, borderRadius: 7, backgroundColor: "#fff", overflow: "hidden" }}><View style={{ height: 14, width: `${(100 * d.progress.done) / Math.max(1, d.progress.total)}%`, backgroundColor: C.teal }} /></View>
        <T>Passing the modules leads to a practical assessment by the Uday academy team.</T></Card>
      {d.modules.map((m: any) => (
        <Card key={m.id} tone={m.passed ? "teal" : "cream"}><T weight="bold">{m.passed ? "✓ " : ""}{m.title}</T><T>Tier {m.tier} · {m.minutes} minutes{m.best ? ` · best ${m.best}` : ""}</T>
          <Button title={m.passed ? "Review" : "Start"} tone={m.passed ? "outline" : "amber"} onPress={() => { setOpen(m); setAns([]); setRes(null); }} /></Card>))}
      <ErrorText msg={err} />
    </Screen>
  );
}
