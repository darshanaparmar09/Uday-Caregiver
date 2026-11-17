import { useEffect, useState } from "react";
import { View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts, Hind_400Regular, Hind_500Medium, Hind_600SemiBold, Hind_700Bold } from "@expo-google-fonts/hind";
import { api, tokenStore, setUnauthorisedHandler } from "./src/shared/api";
import { cachedGet, clearOffline } from "./src/shared/offline";
import { C } from "./src/shared/theme";
import { Button, Screen, T } from "./src/shared/ui";
import { SignIn } from "./src/shared/SignIn";
import { Welcome } from "./src/screens/Welcome";
import { CaregiverApp } from "./src/screens/CaregiverApp";

type Me = { user: { id: string; role: string; name: string | null }; caregiver?: any };

/** Uday Caregiver: a separate app for Uday certified caregivers only. */
export default function App() {
  const [fonts] = useFonts({ Hind_400Regular, Hind_500Medium, Hind_600SemiBold, Hind_700Bold });
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [signingIn, setSigningIn] = useState(false);
  const [offline, setOffline] = useState(false);
  // No internet is not a reason to sign a caregiver out mid shift: she keeps her last saved screen and her care logs queue.
  // Only the server saying "this session is over" (401) signs her out, and that also wipes family data saved on the phone.
  async function forget() { await tokenStore.clear(); await clearOffline(); setSigningIn(false); setMe(null); }
  async function load() {
    try { if (!(await tokenStore.get())) return setMe(null); const r = await cachedGet<Me>("/api/me"); setOffline(r.offline && !r.data); if (r.data) setMe(r.data); }
    catch (e: any) { if (e?.status === 401 || e?.status === 403) await forget(); else setOffline(true); }
  }
  async function signOut() { try { await api("/api/auth/logout", {}); } catch {} await forget(); }
  useEffect(() => { setUnauthorisedHandler(() => { forget(); }); load(); return () => setUnauthorisedHandler(null); }, []);

  let screen: React.ReactNode = <View style={{ flex: 1, backgroundColor: C.night }} />;
  if (fonts && me === undefined && offline) screen = <Screen tone="night"><T size={30} weight="bold" color={C.onNight}>No connection</T><T color={C.onNightSoft}>Uday cannot reach the internet. You are still signed in.</T><Button title="Try again" onPress={load} /></Screen>;
  if (fonts && me === null) screen = signingIn ? <SignIn role="caregiver" onBack={() => setSigningIn(false)} onDone={load} /> : <Welcome onSignIn={() => setSigningIn(true)} />;
  if (fonts && me) screen = me.user.role === "caregiver" ? <CaregiverApp me={me} onSignOut={signOut} />
    : <Screen tone="night"><T size={30} weight="bold" color={C.onNight}>This app is for Uday caregivers</T><T color={C.onNightSoft}>Families and seniors use the Uday app.</T><Button title="Sign out" onPress={signOut} /></Screen>;
  return <SafeAreaProvider><StatusBar style={me ? "dark" : "light"} />{screen}</SafeAreaProvider>;
}
