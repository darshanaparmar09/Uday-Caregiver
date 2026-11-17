import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { api } from "../shared/api";
import { registerForPush, onNotificationTap } from "../shared/push";
import { Button, Card, Screen, T } from "../shared/ui";
import { C, F } from "../shared/theme";
import { setLang, tr } from "../shared/i18n";
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
  const [h, setH] = useState<any>(null); const [tab, setTab] = useState<Tab>("home"); const [checking, setChecking] = useState(false); const [lang, setL] = useState("en");
  const { width } = useWindowDimensions(); const tablet = width >= 768;
  const applyLang = useCallback((l: string) => { setLang(l); setL(l); }, []);
  useEffect(() => { api("/api/senior/settings").then((x: any) => applyLang(x.language)).catch(() => {}); return () => setLang("en"); }, [applyLang]);
  const load = useCallback(() => api("/api/senior").then((x) => { setH(x); return x; }), []);
  useEffect(() => { load().then((x) => { if (x.linked && !x.checkedInToday) setChecking(true); }).catch(() => setH({ linked: false, offline: true }));
    registerForPush(); return onNotificationTap((d) => { if (d?.template === "checkin_reminder") setChecking(true); if (d?.template === "namaste") setTab("groups"); }); }, [load]);

  if (!h) return <View style={{ flex: 1, backgroundColor: C.night }} />;
  // A family has entered this phone number. The parent decides, in plain words, before anything is shared.
  if (!h.linked && h.requests?.length) { const r = h.requests[0]; const answer = (accept: boolean) => api("/api/senior/links", { id: r.id, accept }).then(() => load()).catch(() => {}); return (
    <Screen tone="night"><T size={32} weight="bold" color={C.onNight}>Is this your family?</T>
      <Card><T size={28} weight="bold">{r.family_name ?? "Someone"}</T><T>{`Phone number ending ${r.phone_last4}${r.city ? ", " + r.city : ""}`}</T>
        <T>wants to connect with you on Uday as your family.</T></Card>
      <Card><T weight="semi">If you say yes, they will see:</T><T>• your daily check in, and if you miss it</T><T>• your medicines and when you take them</T><T>• an alert if you press SOS or ask for help</T><T>You can ask Uday to remove them at any time.</T></Card>
      <Button title="Yes, this is my family" tone="teal" onPress={() => answer(true)} style={{ minHeight: 96 }} />
      <Button title="No, I do not know them" tone="coral" onPress={() => answer(false)} style={{ minHeight: 96 }} />
      <T color={C.onNightSoft}>If you are not sure, say no and call your family first.</T></Screen>); }
  if (!h.linked) return (
    <Screen tone="night"><T size={32} weight="bold" color={C.onNight}>Almost ready</T>
      <T color={C.onNightSoft}>{h.offline ? "Uday cannot reach the internet. Please check your connection and open the app again." : "Your family has not added this phone number to Uday yet. Ask them to add your number in their Uday account, then open this app again."}</T>
      <Button title="Try again" onPress={() => load().catch(() => {})} /><Button title="Sign out" tone="outline" style={{ borderColor: C.amber }} onPress={onSignOut} /></Screen>);
  if (checking) return <CheckIn key={lang} name={h.name} contacts={h.contacts} onDone={(go?: Tab) => { setChecking(false); if (go) setTab(go); load(); }} />;

  return (
    <View key={lang} style={{ flex: 1, backgroundColor: C.peach, flexDirection: tablet ? "row-reverse" : "column" }}>
      <View style={{ flex: 1, alignItems: tablet ? "center" : "stretch" }}><View style={{ flex: 1, width: "100%", maxWidth: tablet ? 820 : undefined }}>
        {tab === "home" && <Today h={h} reload={load} go={setTab} onCheckIn={() => setChecking(true)} />}
        {tab === "games" && <Games />}
        {tab === "groups" && <Community />}
        {tab === "safety" && <Safety contacts={h.contacts} />}
        {tab === "me" && <Me h={h} reload={load} onSignOut={() => { setLang("en"); onSignOut(); }} onLang={applyLang} />}
      </View></View>
      <SafeAreaView edges={tablet ? ["top", "bottom", "left"] : ["bottom", "left", "right"]} style={{ backgroundColor: C.night, width: tablet ? 150 : undefined }}>
        <View accessibilityRole="tablist" style={{ flexDirection: tablet ? "column" : "row", flex: tablet ? 1 : undefined, justifyContent: "center" }}>
          {TABS.map(([k, icon, label]) => { const on = tab === k; return (
            <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={tr(label)} onPress={() => setTab(k)}
              style={{ flex: tablet ? undefined : 1, minHeight: tablet ? 110 : 80, alignItems: "center", justifyContent: "center", borderTopWidth: tablet ? 0 : 4, borderLeftWidth: tablet ? 6 : 0, borderColor: on ? C.amber : C.night }}>
              <Text style={{ fontSize: 24, lineHeight: 28, color: on ? C.amber : "#fff" }}>{icon}</Text>
              <Text style={{ fontFamily: on ? F.bold : F.medium, fontSize: 22, lineHeight: 26, color: on ? C.amber : "#fff" }}>{tr(label)}</Text>
            </Pressable>); })}
        </View>
      </SafeAreaView>
    </View>
  );
}
