import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../shared/api";
import { Button, Card, ErrorText, Field, Screen, T } from "../shared/ui";
import { C, S } from "../shared/theme";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const label = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

export function Schedule() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState(""); const [from, setFrom] = useState(""); const [to, setTo] = useState(""); const [reason, setReason] = useState(""); const [msg, setMsg] = useState("");
  const load = useCallback(() => api("/api/caregiver/availability").then(setD).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);
  async function toggle(day: string, available: boolean) { setErr(""); try { await api("/api/caregiver/availability", { day, available }, "PUT"); load(); } catch (e: any) { setErr(e.message); } }
  async function leave() { setErr(""); setMsg(""); try { await api("/api/caregiver/leave", { from, to, reason }); setMsg("Leave requested. Uday will confirm, and brief a backup for any booked days."); setFrom(""); setTo(""); setReason(""); load(); } catch (e: any) { setErr(e.message); } }
  if (!d) return <Screen tabbed><T>Loading</T><ErrorText msg={err} /></Screen>;
  const off = new Map(d.off.map((o: any) => [o.day, o.reason])); const booked = new Set(d.booked);
  const days = Array.from({ length: 21 }, (_, i) => iso(new Date(Date.now() + i * 86400e3)));
  return (
    <Screen tabbed>
      <T size={30} weight="bold">Schedule</T>
      <T color={C.inkSoft}>Tap a day to mark yourself off or available. Families only see you on days you are available.</T>
      <ErrorText msg={err} />
      {days.map((day) => { const isBooked = booked.has(day); const why = off.get(day); const state = isBooked ? "Booked" : why === "leave" ? "On leave" : why ? "Off" : "Available";
        const bg = isBooked ? "#E3F3F0" : why ? "#fff" : "#FFF6EA"; const border = isBooked ? C.teal : why ? C.night : C.line;
        return (
          <Pressable key={day} accessibilityRole="button" accessibilityLabel={`${label(day)}, ${state}`} disabled={isBooked || why === "leave"} onPress={() => toggle(day, !!why)}
            style={{ minHeight: S.touch, borderRadius: 18, borderWidth: 2, borderColor: border, backgroundColor: bg, paddingHorizontal: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <T weight="semi">{label(day)}</T><T weight="bold" color={isBooked ? C.teal : why ? C.night : C.amberDeep}>{state}</T>
          </Pressable>); })}
      <Card>
        <T size={26} weight="bold">Request leave</T>
        <Field label="From (YYYY-MM-DD)" value={from} onChangeText={setFrom} placeholder={iso(new Date(Date.now() + 7 * 86400e3))} />
        <Field label="To (YYYY-MM-DD)" value={to} onChangeText={setTo} placeholder={iso(new Date(Date.now() + 9 * 86400e3))} />
        <Field label="Reason (optional)" value={reason} onChangeText={setReason} />
        <Button title="Send leave request" onPress={leave} />
        {msg ? <T weight="semi" color={C.teal}>{msg}</T> : null}
      </Card>
      {d.leave.length ? <Card><T weight="bold">Your leave requests</T>{d.leave.map((l: any) => <T key={l.id}>{l.from_day} to {l.to_day} · {l.status === "requested" ? "Waiting" : l.status === "approved" ? "Approved" : "Declined"}</T>)}</Card> : null}
    </Screen>
  );
}
