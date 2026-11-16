import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../shared/api";
import { registerForPush, onNotificationTap } from "../shared/push";
import { Button, Screen, T } from "../shared/ui";
import { C, F } from "../shared/theme";
import { CheckIn } from "./CheckIn";
import { Today } from "./Today";
import { Games } from "./Games";
import { Community } from "./Community";
import { Safety } from "./Safety";
import { Me } from "./Me";

export type Tab = "home" | "games" | "groups" | "safety" | "me";
const TABS: [Tab, string, string][] = [["home", "☀", "Home"], ["games", "✦", "Games"], ["groups", "☺", "Groups"], ["safety", "⛨", "Safety"], ["me", "♥", "Me"]];

/**
 * Senior mode. Opens on the sunrise check in each morning, then five simple tabs,
 * restored from the first Uday builds: home, brain games, community, safety, profile.
 */
export function SeniorApp({ onSignOut }: { onSignOut: () => void }) {
  const [h, setH] = useState<any>(null); const [tab, setTab] = useState<Tab>("home"); const [checking, setChecking] = useState(false);
  const load = useCallback(() => api("/api/senior").then((x) => { setH(x); return x; }), []);
  useEffect(() => { load().then((x) => { if (x.linked && !x.checkedInToday) setChecking(true); }).catch(() => setH({ linked: false, offline: true }));
    registerForPush(); return onNotificationTap((d) => { if (d?.template === "checkin_reminder") setChecking(true); if (d?.template === "namaste") setTab("groups"); }); }, [load]);

  if (!h) return <View style={{ flex: 1, backgroundColor: C.night }} />;
  if (!h.linked) return (
    <Screen tone="night"><T size={32} weight="bold" color={C.onNight}>Almost ready</T>
      <T color={C.onNightSoft}>{h.offline ? "Uday cannot reach the internet. Please check your connection and open the app again." : "Your family has not added this phone number to Uday yet. Ask them to add your number in their Uday account, then open this app again."}</T>
      <Button title="Try again" onPress={() => load().catch(() => {})} /><Button title="Sign out" tone="outline" style={{ borderColor: C.amber }} onPress={onSignOut} /></Screen>);
  if (checking) return <CheckIn name={h.name} contacts={h.contacts} onDone={(go?: Tab) => { setChecking(false); if (go) setTab(go); load(); }} />;

  return (
    <View style={{ flex: 1, backgroundColor: C.peach }}>
      <View style={{ flex: 1 }}>
        {tab === "home" && <Today h={h} reload={load} go={setTab} onCheckIn={() => setChecking(true)} />}
        {tab === "games" && <Games />}
        {tab === "groups" && <Community />}
        {tab === "safety" && <Safety contacts={h.contacts} />}
        {tab === "me" && <Me h={h} reload={load} onSignOut={onSignOut} />}
      </View>
      <SafeAreaView edges={["bottom", "left", "right"]} style={{ backgroundColor: C.night }}>
        <View accessibilityRole="tablist" style={{ flexDirection: "row" }}>
          {TABS.map(([k, icon, label]) => { const on = tab === k; return (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={label} onPress={() => setTab(k)}
              style={{ flex: 1, minHeight: 80, alignItems: "center", justifyContent: "center", borderTopWidth: 4, borderTopColor: on ? C.amber : C.night }}>
              <Text style={{ fontSize: 24, lineHeight: 28, color: on ? C.amber : "#fff" }}>{icon}</Text>
              <Text style={{ fontFamily: on ? F.bold : F.medium, fontSize: 22, lineHeight: 26, color: on ? C.amber : "#fff" }}>{label}</Text>
            </Pressable>); })}
        </View>
      </SafeAreaView>
    </View>
  );
}
