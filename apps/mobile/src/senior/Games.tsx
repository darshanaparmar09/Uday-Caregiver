import { useEffect, useRef, useState } from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { api } from "../shared/api";
import { Button, Card, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

type G = "memory" | "trivia" | "words";
const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
/** Brain games: Memory Match, Daily Trivia and Word Scramble. Five minutes a day. */
export function Games() {
  const [d, setD] = useState<any>(null); const [game, setGame] = useState<G | null>(null);
  const load = () => api("/api/senior/games").then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  async function finish(g: G, score: number, seconds: number) { try { setD(await api("/api/senior/games", { game: g, score, seconds })); } catch {} }
  if (game === "memory") return <Memory onDone={(s, t) => finish("memory", s, t)} onBack={() => setGame(null)} />;
  if (game === "trivia" && d) return <Trivia qs={d.trivia} onDone={(s, t) => finish("trivia", s, t)} onBack={() => setGame(null)} />;
  if (game === "words" && d) return <Words words={d.words} onDone={(s, t) => finish("words", s, t)} onBack={() => setGame(null)} />;
  const list: [G, string, string, string][] = [["memory", "🃏 Memory Match", "Turn cards and find the pairs.", "3 to 4 minutes"], ["trivia", "❓ Daily Trivia", "5 questions on India, culture and general knowledge.", "2 to 3 minutes"], ["words", "🔤 Word Scramble", "Put the letters in the right order.", "3 minutes"]];
  return (
    <Screen tabbed>
      <T size={34} weight="bold">Brain games</T>
      <Card tone="night"><View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        {[["Streak", days(d?.streak ?? 0)], ["This week", days(d?.daysThisWeek ?? 0)], ["Today", `${Object.keys(d?.today ?? {}).length} of 3`]].map(([l, v]) =>
          <View key={l} style={{ alignItems: "center" }}><T size={28} weight="bold" color={C.amber}>{v}</T><T color="#fff">{l}</T></View>)}</View></Card>
      {list.map(([g, t, s, time]) => { const best = d?.today?.[g]?.best; return (
        <Pressable key={g} accessibilityRole="button" accessibilityLabel={t} onPress={() => setGame(g)}>
          <Card tone={best != null ? "teal" : "cream"}><T size={28} weight="bold">{t}</T><T>{s}</T><T weight="semi" color={C.inkSoft}>{best != null ? `✓ Played today · best ${best} points` : time}</T></Card>
        </Pressable>); })}
      <Card><T weight="semi">Why play every day?</T><T>Puzzles, reading and learning new things keep the mind active. Playing with friends is even better.</T></Card>
    </Screen>
  );
}

const EMOJI = ["🌸", "🥭", "🪔", "🐘", "🦚", "☕"];
function shuffle<T>(a: T[]) { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }
function useTimer() { const start = useRef(Date.now()); return () => Math.round((Date.now() - start.current) / 1000); }

function Memory({ onDone, onBack }: { onDone: (s: number, t: number) => void; onBack: () => void }) {
  const { width } = useWindowDimensions(); const size = Math.min((Math.min(width, 520) - 40 - 24) / 3, 140);
  const [cards, setCards] = useState(() => shuffle([...EMOJI, ...EMOJI]).map((e, i) => ({ id: i, e, up: false, done: false })));
  const [open, setOpen] = useState<number[]>([]); const [moves, setMoves] = useState(0); const [score, setScore] = useState<number | null>(null); const secs = useTimer();
  function flip(i: number) {
    if (open.length === 2 || cards[i].up || cards[i].done) return;
    const next = cards.map((c) => (c.id === i ? { ...c, up: true } : c)); setCards(next); const o = [...open, i]; setOpen(o);
    if (o.length < 2) return;
    const turns = moves + 1; setMoves(turns);
    const isMatch = next[o[0]].e === next[o[1]].e;
    setTimeout(() => {
      const after = next.map((c) => (o.includes(c.id) ? { ...c, up: isMatch, done: isMatch } : c)); setCards(after); setOpen([]);
      if (after.every((c) => c.done)) { const t = secs(); const sc = Math.max(10, 200 - turns * 5 - t); setScore(sc); onDone(sc, t); }
    }, isMatch ? 350 : 1100);
  }
  if (score != null) return <Done title="Excellent!" line={`All pairs found in ${moves} turns.`} score={score} onAgain={() => { setCards(shuffle([...EMOJI, ...EMOJI]).map((e, i) => ({ id: i, e, up: false, done: false }))); setMoves(0); setScore(null); }} onBack={onBack} />;
  return (
    <Screen tabbed>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={32} weight="bold">Memory Match</T><T>Turns: {moves}. Find the 6 pairs.</T>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
        {cards.map((c) => <Pressable key={c.id} accessibilityRole="button" accessibilityLabel={c.up || c.done ? c.e : "Hidden card"} onPress={() => flip(c.id)}
          style={{ width: size, height: size, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: c.done ? "#E3F3F0" : c.up ? "#fff" : C.night, borderWidth: 3, borderColor: c.done ? C.teal : C.night }}>
          <T size={size * 0.45} center>{c.up || c.done ? c.e : ""}</T></Pressable>)}
      </View>
    </Screen>);
}

function Trivia({ qs, onDone, onBack }: { qs: { q: string; options: string[]; answer: number }[]; onDone: (s: number, t: number) => void; onBack: () => void }) {
  const [i, setI] = useState(0); const [pick, setPick] = useState<number | null>(null); const [right, setRight] = useState(0); const [done, setDone] = useState(false); const secs = useTimer();
  const q = qs[i];
  function next() { const r = right + (pick === q.answer ? 1 : 0); if (i + 1 >= qs.length) { setRight(r); setDone(true); onDone(r * 20, secs()); } else { setRight(r); setI(i + 1); setPick(null); } }
  if (done) return <Done title={right >= 4 ? "Wonderful!" : right >= 2 ? "Well done!" : "Keep practising!"} line={`${right} of ${qs.length} correct.`} score={right * 20} onBack={onBack} />;
  return (
    <Screen tabbed>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T weight="semi" color={C.inkSoft}>Question {i + 1} of {qs.length}</T>
      <T size={30} weight="bold">{q.q}</T>
      {q.options.map((o, k) => { const show = pick != null; const tone = !show ? "outline" : k === q.answer ? "teal" : k === pick ? "coral" : "outline";
        return <Button key={o} title={`${String.fromCharCode(65 + k)}. ${o}${show && k === q.answer ? "  ✓" : ""}`} tone={tone as any} onPress={() => pick == null && setPick(k)} />; })}
      {pick != null && <><T size={26} weight="bold" color={pick === q.answer ? C.teal : C.ink}>{pick === q.answer ? "Correct!" : `The answer is ${q.options[q.answer]}.`}</T>
        <Button title={i + 1 >= qs.length ? "See my score" : "Next question"} onPress={next} /></>}
    </Screen>);
}

function Words({ words, onDone, onBack }: { words: { word: string; hint: string; letters: string }[]; onDone: (s: number, t: number) => void; onBack: () => void }) {
  const [i, setI] = useState(0); const [used, setUsed] = useState<number[]>([]); const [solved, setSolved] = useState(0); const [hint, setHint] = useState(false); const [msg, setMsg] = useState(""); const [done, setDone] = useState(false); const secs = useTimer();
  const w = words[i]; const guess = used.map((k) => w.letters[k]).join("");
  function tap(k: number) { if (used.includes(k)) return; const u = [...used, k]; setUsed(u); const g = u.map((x) => w.letters[x]).join("");
    if (g.length === w.word.length) { if (g === w.word) { setMsg("Correct!"); setTimeout(() => advance(true), 900); } else { setMsg("Not quite. Try again."); setTimeout(() => { setUsed([]); setMsg(""); }, 900); } } }
  function advance(ok: boolean) { const s = solved + (ok ? 1 : 0); setSolved(s); setUsed([]); setMsg(""); setHint(false); if (i + 1 >= words.length) { setDone(true); onDone(s * 20, secs()); } else setI(i + 1); }
  if (done) return <Done title={solved >= 4 ? "Brilliant!" : "Well done!"} line={`${solved} of ${words.length} words solved.`} score={solved * 20} onBack={onBack} />;
  return (
    <Screen tabbed>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T weight="semi" color={C.inkSoft}>Word {i + 1} of {words.length}</T>
      <Card><T size={40} weight="bold" center style={{ letterSpacing: 6 }}>{guess.padEnd(w.word.length, "_").split("").join(" ")}</T></Card>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" }}>
        {w.letters.split("").map((l, k) => <Pressable key={k} accessibilityRole="button" accessibilityLabel={`Letter ${l}`} onPress={() => tap(k)}
          style={{ width: 72, height: 72, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: used.includes(k) ? C.line : C.amber }}>
          <T size={32} weight="bold" center>{used.includes(k) ? "" : l}</T></Pressable>)}
      </View>
      {msg ? <T size={26} weight="bold" center color={msg === "Correct!" ? C.teal : C.ink}>{msg}</T> : null}
      {hint ? <Card tone="amber"><T size={26} weight="semi">Hint: {w.hint}</T></Card> : <Button title="Show a hint" tone="outline" onPress={() => setHint(true)} />}
      <View style={{ flexDirection: "row", gap: 12 }}><Button title="Clear" tone="outline" onPress={() => setUsed([])} style={{ flex: 1 }} /><Button title="Skip" tone="night" onPress={() => advance(false)} style={{ flex: 1 }} /></View>
    </Screen>);
}

function Done({ title, line, score, onAgain, onBack }: { title: string; line: string; score: number; onAgain?: () => void; onBack: () => void }) {
  return (<Screen tabbed><View style={{ alignItems: "center", gap: 12, marginTop: 24 }}><T size={64} center>🎉</T><T size={36} weight="bold" center>{title}</T><T center>{line}</T>
    <Card tone="amber" style={{ alignSelf: "stretch" }}><T size={40} weight="bold" center>{score} points</T></Card></View>
    {onAgain && <Button title="Play again" onPress={onAgain} />}<Button title="Back to games" tone="outline" onPress={onBack} /></Screen>);
}
