import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, View } from "react-native";
import { api, API, inr, PLAN, TYPE } from "../shared/api";
import { Button, Card, Chips, ErrorText, Field, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

const TIER: Record<number, string> = { 1: "Tier 1 Companion", 2: "Tier 2 Trained", 3: "Tier 3 Nurse" };
const RATE: Record<string, string> = { day: "rate_day_paise", night: "rate_night_paise", live: "rate_live_paise" };
const TIMES: Record<string, [string, string][]> = { day: [["07:00", "7 AM to 3 PM"], ["09:00", "9 AM to 5 PM"], ["10:00", "10 AM to 6 PM"]], night: [["20:00", "8 PM to 8 AM"]], live: [["09:00", "Starts 9 AM"]] };
function fees(cat: any, rate: number, days: number, bps = 0) { const care = rate * days; const pf = Math.round((care * cat.platformFeeBps * (10000 - bps)) / 1e8); const gst = Math.round((pf * cat.gstBps) / 10000); return { care, pf, gst, total: care + pf + gst }; }
function weekly(cat: any, rate: number, days: number, bps = 0) { const out = []; for (let d = 0; d < days; d += 7) out.push(fees(cat, rate, Math.min(7, days - d), bps)); return out; }

/** Hire in the app: care need, type, length, tier, caregiver, then checkout. Same rules as the website. */
export function Hire({ onBack, onBooked }: { onBack: () => void; onBooked: (id: string) => void }) {
  const [cat, setCat] = useState<any>(null); const [need, setNeed] = useState(""); const [type, setType] = useState("day"); const [days, setDays] = useState(1); const [tier, setTier] = useState(0);
  const [list, setList] = useState<any[] | null>(null); const [pick, setPick] = useState<any>(null); const [profile, setProfile] = useState<any>(null);
  useEffect(() => { api("/api/catalog").then(setCat).catch(() => {}); }, []);
  // Ranked by the server for this parent and dates, with the reasons ("Why this match").
  const [forId, setForId] = useState(""); const [mine, setMine] = useState<any[]>([]);
  useEffect(() => { api<any[]>("/api/recipients").then((r) => { setMine(r); if (r[0]) setForId(r[0].id); }).catch(() => {}); }, []);
  useEffect(() => {
    if (!need) return; setList(null);
    const start = new Date(Date.now() + 86400e3).toISOString().slice(0, 10);
    const p = `type=${type}${tier ? `&tier=${tier}` : ""}${need !== "other" ? `&need=${need}` : ""}${forId ? `&recipientId=${forId}` : ""}&start=${start}&days=${days}`;
    api<any[]>(`/api/caregivers?${p}`).then(setList).catch(() => setList([]));
  }, [need, type, tier, forId, days]);
  const n = cat?.careNeeds.find((x: any) => x.id === need); void n;
  const sorted = useMemo(() => list ?? [], [list]);
  if (!cat) return <Screen><T>Loading</T></Screen>;
  if (pick) return <Checkout cat={cat} c={pick} type={type} days={days} need={need} onBack={() => setPick(null)} onBooked={onBooked} />;
  if (profile) return <Profile id={profile.id} onBack={() => setProfile(null)} onHire={() => { setPick(profile); setProfile(null); }} />;
  return (
    <Screen>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={32} weight="bold">Hire a caregiver</T>
      <T weight="semi">1. What care is needed?</T>
      {cat.careNeedGroups.map((g: string) => <View key={g} style={{ gap: 8 }}><T color={C.inkSoft}>{g}</T>
        <Chips options={cat.careNeeds.filter((x: any) => x.group === g).map((x: any) => x.label)} value={n && n.group === g ? [n.label] : []} multi={false}
          onChange={(v) => { const x = cat.careNeeds.find((y: any) => y.label === v[0]); if (x) { setNeed(x.id); setTier(x.tier > 1 ? x.tier : 0); } }} /></View>)}
      {need && <>
        <T weight="semi">2. When and how long</T>
        <Chips options={Object.values(TYPE)} value={[TYPE[type]]} multi={false} onChange={(v) => setType(Object.keys(TYPE).find((k) => TYPE[k] === v[0])!)} />
        <Chips options={[1, 7, 30, 90].map((d) => PLAN[d])} value={[PLAN[days]]} multi={false} onChange={(v) => setDays(Number(Object.keys(PLAN).find((k) => PLAN[Number(k)] === v[0])))} />
        <Chips options={["All tiers", TIER[1], TIER[2], TIER[3]]} value={[tier ? TIER[tier] : "All tiers"]} multi={false} onChange={(v) => setTier(v[0] === "All tiers" ? 0 : Number(Object.keys(TIER).find((k) => TIER[Number(k)] === v[0])))} />
        {mine.length > 1 && <><T weight="semi">For</T><Chips options={mine.map((r) => r.name)} value={[mine.find((r) => r.id === forId)?.name ?? ""]} multi={false} onChange={(v) => setForId(mine.find((r) => r.name === v[0])?.id ?? forId)} /></>}
        <T weight="semi">3. Choose a caregiver</T>
        <T color={C.inkSoft}>Ranked by fit for the care need, shared language, distance, free days from tomorrow, ratings and past care for your parent.</T>
        {list === null ? <T>Loading</T> : !sorted.length ? <T>No caregivers for this choice yet.</T> : sorted.map((c) => (
          <Card key={c.id}>
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              {c.photo ? <Image source={{ uri: `${API}/api/caregivers/${c.id}/photo` }} style={{ width: 64, height: 64, borderRadius: 32 }} /> : <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: C.night, alignItems: "center", justifyContent: "center" }}><T weight="bold" color={C.amber}>{c.initials}</T></View>}
              <View style={{ flex: 1 }}><T size={24} weight="bold">{c.display_name}</T><T color={C.inkSoft}>{TIER[c.tier]} · {c.rating_count ? `★ ${c.rating.toFixed(1)} (${c.rating_count})` : "New on Uday"}</T></View></View>
            {c.match?.reasons?.length ? <View style={{ backgroundColor: c.match.available ? "#E3F4F1" : "#FDE4E4", borderRadius: 14, padding: 10, gap: 2 }}>
              <T weight="bold" size={16}>WHY THIS MATCH</T>{c.match.reasons.map((r: string) => <T key={r}>{c.match.available ? "✓ " : ""}{r}</T>)}</View> : null}
            <T>{c.skills.join(" · ")}</T><T color={C.inkSoft}>{c.police_verified ? "✓ Police verified  " : ""}{c.id_verified ? "✓ ID verified" : ""}</T>
            <T weight="bold">{inr(c[RATE[type]])} a day · {inr(c[RATE[type]] * days)} care fee</T>
            <View style={{ flexDirection: "row", gap: 10 }}><Button title="Profile" tone="outline" onPress={() => setProfile(c)} style={{ flex: 1 }} /><Button title={c.match && !c.match.available ? "Not free" : "Hire"} onPress={() => { if (!c.match || c.match.available) setPick(c); }} style={{ flex: 1 }} /></View>
          </Card>))}</>}
    </Screen>);
}

function Profile({ id, onBack, onHire }: { id: string; onBack: () => void; onHire: () => void }) {
  const [p, setP] = useState<any>(null);
  useEffect(() => { api(`/api/caregivers/${id}`).then(setP).catch(() => {}); }, [id]);
  if (!p) return <Screen><T>Loading</T></Screen>;
  return (
    <Screen>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      {p.photo && <Image source={{ uri: API + p.photo }} style={{ width: 120, height: 120, borderRadius: 60, alignSelf: "center" }} accessibilityLabel={`Photo of ${p.display_name}`} />}
      <T size={30} weight="bold" center>{p.display_name}</T><T center color={C.inkSoft}>{TIER[p.tier]} · {p.area} · {p.completedBookings} bookings</T>
      <Card><T weight="bold">{p.rating_count ? `★ ${p.rating.toFixed(1)} from ${p.rating_count} ratings` : "New on Uday. No ratings yet."}</T>
        {Object.entries(p.areaAverages).map(([k, v]: any) => <T key={k}>{k[0].toUpperCase() + k.slice(1)}: {v}</T>)}</Card>
      <T size={26} weight="bold">What families say</T>
      {!p.reviews.length && <T color={C.inkSoft}>No reviews yet.</T>}
      {p.reviews.map((r: any, k: number) => <Card key={k}><T weight="bold">★ {r.overall} · {r.month}</T>{r.text && <T>"{r.text}"</T>}{!!r.tags?.length && <T color={C.inkSoft}>{r.tags.join(" · ")}</T>}</Card>)}
      <T size={26} weight="bold">Next 30 days</T><T color={C.inkSoft}>{p.busyDates.length ? `Booked on ${p.busyDates.length} of the next 30 days.` : "Free on all of the next 30 days."}</T>
      <Button title={`Hire ${p.display_name.split(" ")[0]}`} onPress={onHire} />
    </Screen>);
}

function Checkout({ cat, c, type, days, need, onBack, onBooked }: { cat: any; c: any; type: string; days: number; need: string; onBack: () => void; onBooked: (id: string) => void }) {
  const [recips, setRecips] = useState<any[]>([]); const [rid, setRid] = useState(""); const [plus, setPlus] = useState(false);
  const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  const [date, setDate] = useState(tomorrow); const [time, setTime] = useState(TIMES[type][type === "day" ? 1 : 0][0]); const [method, setMethod] = useState("UPI");
  const [dayOff, setDayOff] = useState<number | null>(null); const [agreed, setAgreed] = useState<string[]>([]); const [coupon, setCoupon] = useState(""); const [disc, setDisc] = useState<any>(null);
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const commitments = cat.commitments[type]; const needsDayOff = type === "live" && days >= 7;
  useEffect(() => { api<any[]>("/api/recipients").then((r) => { setRecips(r); if (r[0]) setRid(r[0].id); }); api("/api/plus").then((p: any) => setPlus(!!p.member)).catch(() => {}); }, []);
  const bps = disc?.bps ?? (plus ? cat.plus.feeDiscountBps : 0); const rate = c[RATE[type]];
  const cycles = days >= cat.weeklyFrom ? weekly(cat, rate, days, bps) : null; const f = cycles ? cycles.reduce((a, x) => ({ care: a.care + x.care, pf: a.pf + x.pf, gst: a.gst + x.gst, total: a.total + x.total }), { care: 0, pf: 0, gst: 0, total: 0 }) : fees(cat, rate, days, bps);
  const holdNow = cycles ? cycles[0].total : f.total;
  async function send() {
    setErr(""); if (agreed.length < commitments.length) return setErr("Please confirm everything the caregiver needs at home."); if (needsDayOff && dayOff == null) return setErr("Choose the weekly day off.");
    setBusy(true);
    try { const b = await api("/api/bookings", { recipientId: rid, caregiverId: c.id, careType: type, days, startDate: date, startTime: time, method, careNeed: need, homeCommitments: agreed, dayOff: needsDayOff ? dayOff : undefined, coupon: disc?.coupon ?? undefined });
      onBooked(b.id); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  if (!recips.length) return <Screen><Button title="Back" tone="outline" onPress={onBack} /><T>Add your parent first, from the home screen.</T></Screen>;
  return (
    <Screen>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={30} weight="bold">Request {c.display_name.split(" ")[0]}</T><T color={C.inkSoft}>{TYPE[type]} · {PLAN[days]}</T>
      <T weight="semi">Care for</T><Chips options={recips.map((r) => r.name)} value={[recips.find((r) => r.id === rid)?.name ?? ""]} multi={false} onChange={(v) => setRid(recips.find((r) => r.name === v[0])?.id ?? rid)} />
      <Field label="Start date (YYYY-MM-DD)" value={date} onChangeText={setDate} />
      <T weight="semi">Hours</T><Chips options={TIMES[type].map(([, l]) => l)} value={[TIMES[type].find(([v]) => v === time)?.[1] ?? ""]} multi={false} onChange={(v) => setTime(TIMES[type].find(([, l]) => l === v[0])![0])} />
      {needsDayOff && <><T weight="semi">Weekly day off (a relief caregiver covers it)</T><Chips options={[...cat.weekdays]} value={dayOff != null ? [cat.weekdays[dayOff]] : []} multi={false} onChange={(v) => setDayOff(cat.weekdays.indexOf(v[0]))} /></>}
      <T weight="semi">Pay with</T><Chips options={["UPI", "Card", "Net banking"]} value={[method]} multi={false} onChange={(v) => setMethod(v[0])} />
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end" }}><View style={{ flex: 1 }}><Field label="Coupon (optional)" value={coupon} onChangeText={(t) => setCoupon(t.toUpperCase())} /></View>
        <Button title="Apply" tone="outline" onPress={() => api("/api/coupons/check", { code: coupon, ratePaise: rate, days }).then(setDisc).catch((e) => { setDisc(null); setErr(e.message); })} /></View>
      <Card><T>Care fee {inr(f.care)}</T><T>Uday fee {inr(f.pf)}{bps ? ` (${bps / 100}% off)` : ""}</T><T>GST {inr(f.gst)}</T><T size={26} weight="bold">Total {inr(f.total)}</T>
        {cycles && <T weight="semi" color={C.teal}>Billed weekly. First week held now: {inr(holdNow)}</T>}</Card>
      <T weight="semi">What you will provide at home</T>
      {commitments.map((h: any) => <Pressable key={h.id} accessibilityRole="checkbox" accessibilityState={{ checked: agreed.includes(h.id) }} onPress={() => setAgreed(agreed.includes(h.id) ? agreed.filter((x) => x !== h.id) : [...agreed, h.id])}
        style={{ flexDirection: "row", gap: 12, minHeight: 56, alignItems: "center" }}><T size={28}>{agreed.includes(h.id) ? "☑" : "☐"}</T><T style={{ flex: 1 }}>{h.label}</T></Pressable>)}
      <Button title="Confirm all" tone="outline" onPress={() => setAgreed(commitments.map((h: any) => h.id))} />
      <ErrorText msg={err} />
      <Button title={`Hold ${inr(holdNow)} and send request`} busy={busy} onPress={send} />
    </Screen>);
}
