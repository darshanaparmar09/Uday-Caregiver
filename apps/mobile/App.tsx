import { useEffect, useState } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Hind_400Regular, Hind_500Medium, Hind_600SemiBold, Hind_700Bold } from "@expo-google-fonts/hind";
import { api, tokenStore } from "./src/shared/api";
import { T, Screen, Button } from "./src/shared/ui";
import { C } from "./src/shared/theme";
import { Welcome } from "./src/screens/Welcome";
import { SignIn } from "./src/shared/SignIn";
import { SeniorApp } from "./src/senior/SeniorApp";
import { FamilyHome } from "./src/screens/FamilyHome";

export type Role = "senior" | "family";
type Me = { user: { id: string; role: Role | "caregiver" | "ops"; name: string | null }; caregiver?: any };

export default function App() {
  const [fonts] = useFonts({ Hind_400Regular, Hind_500Medium, Hind_600SemiBold, Hind_700Bold });
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [intent, setIntent] = useState<Role | null>(null);
  async function load() { try { if (!(await tokenStore.get())) return setMe(null); setMe(await api<Me>("/api/me")); } catch { await tokenStore.clear(); setMe(null); } }
  async function signOut() { try { await api("/api/auth/logout", {}); } catch {} await tokenStore.clear(); setIntent(null); setMe(null); }
  useEffect(() => { load(); }, []);

  let screen: React.ReactNode = <View style={{ flex: 1, backgroundColor: C.night }} />;
  if (fonts && me === null) screen = intent ? <SignIn role={intent} onBack={() => setIntent(null)} onDone={load} /> : <Welcome onPick={setIntent} />;
  if (fonts && me) {
    const r = me.user.role;
    screen = r === "senior" ? <SeniorApp onSignOut={signOut} />
      : r === "caregiver" ? <Screen tone="night"><T size={30} weight="bold" color={C.onNight}>Please use the Uday Caregiver app</T><T color={C.onNightSoft}>This app is for families and seniors. Caregivers have their own app with jobs, schedule and pay.</T><Button title="Sign out" onPress={signOut} /></Screen>
      : <FamilyHome me={me} onSignOut={signOut} />;
  }
  const dark = !me || me.user.role === "senior";
  return <SafeAreaProvider><StatusBar style={dark ? "light" : "dark"} />{screen}</SafeAreaProvider>;
}
