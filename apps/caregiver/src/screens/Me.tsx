import { useCallback, useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { api } from "../shared/api";
import { Button, Card, Chips, ErrorText, Field, Screen, T } from "../shared/ui";
import { C, S } from "../shared/theme";

const LANGS = ["Marathi", "Hindi", "English", "Kannada", "Gujarati"];
const TYPES: [string, string][] = [["day", "Day shift"], ["night", "Night shift"], ["live", "Live in"]];
const SKILLS = ["Companionship", "Meals", "Walks", "Mobility support", "Transfers", "Dementia care", "Hygiene", "Post surgery", "Vitals", "Injections", "Wound care", "Diabetes care"];
const ICON: Record<string, [string, string]> = { clear: ["✓", C.teal], submitted: ["…", C.amberDeep], not_clear: ["!", C.coral], pending: ["○", C.night] };

export function Me({ me, onSignOut, onStatus }: { me: any; onSignOut: () => void; onStatus: (s: string) => void }) {
  const [d, setD] = useState<any>(null); const [r, setR] = useState<any>(null); const [open, setOpen] = useState<number | null>(null); const [err, setErr] = useState(""); const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string>(me.caregiver?.photo_status ?? "none");
  const load = useCallback(async () => { const o = await api("/api/caregiver/onboarding"); setD(o); onStatus(o.status); if (o.status === "active") setR(await api("/api/caregiver/ratings")); }, [onStatus]);
  useEffect(() => { load().catch((e) => setErr(e.message)); }, [load]);
  async function run(fn: () => Promise<any>, done: string) { setBusy(true); setErr(""); setMsg(""); try { await fn(); setMsg(done); setOpen(null); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  if (!d) return <Screen tabbed><T>Loading</T><ErrorText msg={err} /></Screen>;
  const doneCount = d.stages.filter((s: any) => s.status === "clear").length;
  return (
    <Screen tabbed>
      <T size={30} weight="bold">{me.caregiver?.display_name ?? me.user.name}</T>
      {d.status === "active" ? <Card tone="teal"><T weight="bold">Active · you can receive requests</T></Card>
        : <Card tone="amber"><T weight="bold">Onboarding · {doneCount} of 15 steps done</T><T>Finish the steps marked for you. Uday completes the others.</T></Card>}
      {msg ? <Card tone="teal"><T weight="semi">{msg}</T></Card> : null}
      <ErrorText msg={err} />
      <Card tone={photo === "verified" ? "teal" : "amber"}>
        <T size={26} weight="bold">Profile photo</T>
        <T>{{ none: "Add a clear photo of your face. Families see it before you arrive, so they know it is you.", pending: "Uploaded. Uday checks it against your ID.", verified: "✓ Checked by Uday. Families can see it.", rejected: "Uday could not match it to your ID. Please upload a new, clear photo." }[photo] ?? ""}</T>
        {photo !== "verified" && <Button title={photo === "none" ? "Add photo" : "Upload a new photo"} tone="night" busy={busy} onPress={async () => {
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6, allowsEditing: true, aspect: [1, 1] });
          if (res.canceled || !res.assets[0]?.base64) return; const a = res.assets[0];
          run(() => api("/api/caregiver/documents", { kind: "photo", base64: a.base64, mime: a.mimeType ?? "image/jpeg" }).then(() => setPhoto("pending")), "Photo uploaded. Uday will check it."); }} />}
      </Card>

      {r && <Card>
        <T size={26} weight="bold">Your ratings</T>
        <T size={40} weight="bold" color={C.amberDeep}>★ {r.rating.toFixed(1)} <T size={22}>from {r.count} families</T></T>
        {Object.entries(r.tags).length ? <T>Families say: {Object.entries(r.tags).map(([t, n]) => `${t} (${n})`).join(", ")}</T> : null}
        {r.tips.map((t: string, i: number) => <Card key={i} tone={r.belowStandard ? "amber" : "cream"} style={{ padding: 14 }}><T weight="semi">Tip: {t}</T></Card>)}
        {r.belowStandard && <T color={C.inkSoft}>Your recent average is below 4.3. Your care manager will call to help.</T>}
      </Card>}

      <T size={26} weight="bold">{d.status === "active" ? "Your checks" : "Your steps"}</T>
      {d.stages.map((s: any) => { const [ic, col] = ICON[s.status]; const mine = s.owner === "caregiver" && s.status !== "clear" && s.n !== 10;
        return (
          <View key={s.n}>
            <Pressable accessibilityRole="button" disabled={!mine && s.owner !== "caregiver"} onPress={() => setOpen(open === s.n ? null : s.n)}
              style={{ minHeight: S.touch, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, borderRadius: 18, borderWidth: 2, borderColor: mine ? C.amber : C.line, backgroundColor: mine ? "#FFF0D6" : C.cream }}>
              <T size={26} weight="bold" color={col}>{ic}</T>
              <View style={{ flex: 1, paddingVertical: 8 }}><T weight="semi">{s.n}. {s.title}</T><T color={C.inkSoft}>{s.status === "submitted" ? "Uday is checking" : s.status === "not_clear" ? "Uday will contact you" : s.owner === "uday" && s.status !== "clear" ? "Uday completes this" : s.hint}</T></View>
            </Pressable>
            {open === s.n && <StageForm n={s.n} d={d} busy={busy} run={run} />}
          </View>); })}
      <Button title="Sign out" tone="outline" onPress={onSignOut} />
    </Screen>
  );
}

function StageForm({ n, d, busy, run }: { n: number; d: any; busy: boolean; run: (fn: () => Promise<any>, done: string) => void }) {
  const [langs, setLangs] = useState<string[]>(d.profile.languages ?? []); const [types, setTypes] = useState<string[]>(d.profile.careTypes ?? []);
  const [skills, setSkills] = useState<string[]>(d.profile.skills ?? []); const [areas, setAreas] = useState((d.profile.serviceAreas ?? []).join(", ")); const [hours, setHours] = useState(d.profile.preferredHours ?? "");
  const [aadhaar, setAadhaar] = useState(""); const [pan, setPan] = useState(""); const [acct, setAcct] = useState(""); const [ifsc, setIfsc] = useState(""); const [holder, setHolder] = useState(""); const [sign, setSign] = useState("");
  async function pick(kind: string) {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], base64: true, quality: 0.6 });
    if (r.canceled || !r.assets[0]?.base64) return;
    const a = r.assets[0]; run(() => api("/api/caregiver/documents", { kind, base64: a.base64, mime: a.mimeType ?? "image/jpeg" }), "Uploaded. Uday will check it.");
  }
  const box = { marginTop: 10, gap: 14 };
  if (n === 4) return <Card style={box}>
    <T weight="semi">Languages you speak</T><Chips options={LANGS} value={langs} onChange={setLangs} />
    <T weight="semi">Care you offer</T><Chips options={TYPES.map((t) => t[1])} value={types.map((t) => TYPES.find((x) => x[0] === t)?.[1] ?? t)} onChange={(v) => setTypes(v.map((l) => TYPES.find((x) => x[1] === l)![0]))} />
    <T weight="semi">Skills</T><Chips options={SKILLS} value={skills} onChange={setSkills} />
    <Field label="Areas you can travel to" value={areas} onChangeText={setAreas} placeholder="Kothrud, Aundh" />
    <Field label="Preferred hours" value={hours} onChangeText={setHours} placeholder="Day shifts, Monday to Saturday" />
    <Button title="Save profile" busy={busy} onPress={() => run(() => api("/api/caregiver/profile", { languages: langs, careTypes: types, skills, serviceAreas: areas.split(",").map((x: string) => x.trim()).filter(Boolean), preferredHours: hours || undefined }, "PUT"), "Profile saved.")} />
  </Card>;
  if (n === 5) return <Card style={box}>
    <T color={C.inkSoft}>Your Aadhaar number goes to our licensed verification partner. Uday keeps only the result and the last four digits.</T>
    <Field label="Aadhaar number" value={aadhaar} onChangeText={setAadhaar} keyboardType="number-pad" maxLength={14} />
    <Field label="PAN" value={pan} onChangeText={(v) => setPan(v.toUpperCase())} autoCapitalize="characters" maxLength={10} />
    <Button title="Verify" busy={busy} onPress={() => run(() => api("/api/caregiver/identity", { aadhaar, pan }), "Identity checked.")} />
  </Card>;
  if (n === 8) return <Card style={box}><T>Upload a clear photo of each certificate. Nurses: include your nursing council registration.</T>
    <Button title="Upload certificate" busy={busy} onPress={() => pick("certificate")} /><Button title="Upload nursing registration" tone="outline" busy={busy} onPress={() => pick("nursing_registration")} /></Card>;
  if (n === 9) return <Card style={box}><T>Upload your fitness declaration or vaccination proof. It is stored encrypted and seen only by Uday's verification team.</T>
    <Button title="Upload fitness declaration" busy={busy} onPress={() => pick("fitness")} /><Button title="Upload vaccination proof" tone="outline" busy={busy} onPress={() => pick("vaccination")} /></Card>;
  if (n === 11) return <Card style={box}>
    <T weight="bold">Caregiver agreement (version {d.contractVersion})</T>
    {["Uday pays you every week for each completed shift.", "You start and end every shift with the family's code and write a shift log.", "You never handle cash, cards, jewellery or property papers.", "You keep the family's information private.", "If you cannot make a booked shift, you tell Uday through the app as early as you can.", "Health and accident cover applies while you work through Uday."].map((t) => <T key={t}>• {t}</T>)}
    <T color={C.inkSoft}>Draft for the pilot. Final terms are being prepared with labour counsel.</T>
    <Field label="Type your full name to sign" value={sign} onChangeText={setSign} />
    <Button title="I agree and sign" busy={busy} onPress={() => run(() => api("/api/caregiver/contract", { signedName: sign, device: Platform.OS }), "Agreement signed.")} />
  </Card>;
  if (n === 12) return <Card style={box}>
    <T color={C.inkSoft}>We send ₹1 to check the account. Uday keeps only the last four digits; the bank details stay with our payment partner.</T>
    <Field label="Account holder name" value={holder} onChangeText={setHolder} />
    <Field label="Account number" value={acct} onChangeText={setAcct} keyboardType="number-pad" />
    <Field label="IFSC" value={ifsc} onChangeText={(v) => setIfsc(v.toUpperCase())} autoCapitalize="characters" maxLength={11} />
    <Button title="Verify account" busy={busy} onPress={() => run(() => api("/api/caregiver/bank", { accountNumber: acct, ifsc, holder }), "Bank account verified.")} />
  </Card>;
  return null;
}
