import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { C, F } from "../shared/theme";
import { api } from "../shared/api";
import { registerForPush, onNotificationTap } from "../shared/push";
import { Jobs } from "./Jobs";
import { Schedule } from "./Schedule";
import { Earnings } from "./Earnings";
import { Academy } from "./Academy";
import { Me } from "./Me";

type Tab = "jobs" | "schedule" | "earnings" | "academy" | "me";
// Short labels keep the 22px minimum on narrow phones.
const TABS: [Tab, string, string, string][] = [["jobs", "◉", "Jobs", "Jobs"], ["schedule", "▦", "Days", "Schedule"], ["earnings", "₹", "Pay", "Earnings"], ["academy", "✎", "Learn", "Academy"], ["me", "☺", "Me", "My profile"]];

/** Caregiver mode: five tabs, each tab button 72px high. */
export function CaregiverApp({ me, onSignOut }: { me: any; onSignOut: () => void }) {
  const [status, setStatus] = useState<string>(me.caregiver?.status ?? "applied");
  const [tab, setTab] = useState<Tab>(status === "active" ? "jobs" : "me");
  useEffect(() => { registerForPush(); return onNotificationTap((d) => { if (d?.template === "booking_offer") setTab("jobs"); if (d?.template === "payout_paid") setTab("earnings"); }); }, []);
  useEffect(() => { const t = setInterval(() => api("/api/me").then((m) => m.caregiver && setStatus(m.caregiver.status)).catch(() => {}), 30000); return () => clearInterval(t); }, []);
  const active = status === "active";
  return (
    <View style={{ flex: 1, backgroundColor: C.peach }}>
      <View style={{ flex: 1 }}>
        {tab === "jobs" && <Jobs me={me} active={active} />}
        {tab === "schedule" && <Schedule />}
        {tab === "earnings" && <Earnings />}
        {tab === "academy" && <Academy />}
        {tab === "me" && <Me me={me} onSignOut={onSignOut} onStatus={setStatus} />}
      </View>
      <SafeAreaView edges={["bottom", "left", "right"]} style={{ backgroundColor: C.night }}>
        <View accessibilityRole="tablist" style={{ flexDirection: "row" }}>
          {TABS.map(([k, icon, label, full]) => { const on = tab === k; return (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={full} onPress={() => setTab(k)}
              style={{ flex: 1, minHeight: 76, alignItems: "center", justifyContent: "center", borderTopWidth: 4, borderTopColor: on ? C.amber : C.night }}>
              <Text style={{ fontSize: 20, lineHeight: 24, color: on ? C.amber : "#fff" }}>{icon}</Text>
              <Text style={{ fontFamily: on ? F.bold : F.medium, fontSize: 22, lineHeight: 26, color: on ? C.amber : "#fff" }}>{label}</Text>
            </Pressable>); })}
        </View>
      </SafeAreaView>
    </View>
  );
}
