import { useState } from "react";
import { View } from "react-native";
import { api, tokenStore } from "../api";
import { Button, ErrorText, Field, Screen, T } from "../ui";
import { C } from "../theme";
import type { Role } from "../../App";

const COPY: Record<Role, string> = { senior: "Your family adds your number in Uday. Enter it here once.", family: "Use your mobile number, from India or abroad.", caregiver: "Use the number you registered with the Uday academy." };

export function SignIn({ role, onBack, onDone }: { role: Role; onBack: () => void; onDone: () => void }) {
  const [phone, setPhone] = useState(""); const [code, setCode] = useState(""); const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(""); const [dev, setDev] = useState<string>();
  async function send() { setErr(""); setBusy(true); try { const r = await api<{ devCode?: string }>("/api/auth/request", { phone }); setDev(r.devCode); setStep("code"); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  async function verify() { setErr(""); setBusy(true);
    try { const r = await api<{ token: string; user: { role: string } }>("/api/auth/verify", { phone, code, role: role === "senior" ? "senior" : undefined, client: "app" });
      if (role === "caregiver" && r.user.role !== "caregiver") { setErr("This number is not registered as an Uday caregiver. Apply through Careers on the website."); setBusy(false); return; }
      await tokenStore.set(r.token); onDone(); } catch (e: any) { setErr(e.message); setBusy(false); } }
  return (
    <Screen>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={34} weight="bold">{step === "phone" ? "Your mobile number" : "Enter the code"}</T>
      <T color={C.inkSoft}>{step === "phone" ? COPY[role] : `We sent a 6 digit code to ${phone}.`}</T>
      {step === "phone" ? <>
        <Field label="Mobile number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="98xxxxxxxx" />
        <Button title="Send code" onPress={send} busy={busy} />
      </> : <>
        <Field label="6 digit code" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} style={{ letterSpacing: 10, fontSize: 34 }} />
        {dev ? <View style={{ backgroundColor: "#FFF0D6", borderRadius: 16, padding: 14 }}><T weight="semi">Test mode code: {dev}</T></View> : null}
        <Button title="Continue" onPress={verify} busy={busy} />
        <Button title="Use a different number" tone="outline" onPress={() => setStep("phone")} />
      </>}
      <ErrorText msg={err} />
    </Screen>
  );
}
