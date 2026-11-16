import { useEffect, useState } from "react";
import { View } from "react-native";
import { api, inr } from "../shared/api";
import { Card, ErrorText, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

export function Earnings() {
  const [d, setD] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { api("/api/caregiver/earnings").then(setD).catch((e) => setErr(e.message)); }, []);
  if (!d) return <Screen tabbed><T>Loading</T><ErrorText msg={err} /></Screen>;
  const next = new Date(d.nextPayout + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <Screen tabbed>
      <T size={30} weight="bold">Earnings</T>
      <Card tone="amber"><T weight="semi">Due in your next payout</T><T size={48} weight="bold">{inr(d.balancePaise)}</T>
        <T>{d.bankLast4 ? `Paid ${next} to bank account ending ${d.bankLast4}` : "Add your bank account in the Me tab to get paid"}</T></Card>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Card style={{ flex: 1 }}><T weight="semi">This week</T><T size={30} weight="bold">{inr(d.thisWeek.paise)}</T><T>{d.thisWeek.shifts} shift{d.thisWeek.shifts === 1 ? "" : "s"}</T></Card>
        <Card style={{ flex: 1 }}><T weight="semi">All time</T><T size={30} weight="bold">{inr(d.lifetimePaise)}</T><T>{d.shiftsCompleted} shifts</T></Card>
      </View>
      <T size={26} weight="bold">Payouts</T>
      {!d.payouts.length ? <T color={C.inkSoft}>No payouts yet. Payouts run every Monday for completed shifts.</T> :
        d.payouts.map((p: any, i: number) => <Card key={i} tone={p.status === "paid" ? "teal" : "cream"}><T weight="bold">{inr(p.amount_paise)} · {p.status === "paid" ? "Paid" : p.status === "failed" ? "Failed, Uday will contact you" : "On the way"}</T><T>{new Date(p.created_at).toLocaleDateString("en-IN")} · account ending {p.bank_last4}</T></Card>)}
      <T size={26} weight="bold">Recent entries</T>
      {d.lines.slice(0, 12).map((l: any, i: number) => <View key={i} style={{ flexDirection: "row", justifyContent: "space-between", borderBottomWidth: 1, borderColor: C.line, paddingVertical: 10 }}>
        <T style={{ flexShrink: 1 }}>{l.reason.replace(/^shift (\d+) pay$/, "Shift $1 completed").replace("late cancellation fee", "Late cancellation by family").replace("weekly payout", "Paid to bank")}</T>
        <T weight="bold" color={l.debit_paise ? C.inkSoft : C.teal}>{l.debit_paise ? "−" + inr(l.debit_paise) : "+" + inr(l.credit_paise)}</T></View>)}
      <T color={C.inkSoft}>Tax deduction rules on payouts are being confirmed with a chartered accountant.</T>
    </Screen>
  );
}
