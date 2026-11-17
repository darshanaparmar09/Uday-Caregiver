import { useCallback, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { api } from "../shared/api";
import { Button, Card, ErrorText, Field, Screen, T } from "../shared/ui";
import { C } from "../shared/theme";

type V = "groups" | "events" | "people";
/** Uday community: interest groups, events near you and people nearby. Phone numbers and links are never shared. */
export function Community() {
  const [v, setV] = useState<V>("groups"); const [open, setOpen] = useState<string | null>(null);
  if (open) return <Group id={open} onBack={() => setOpen(null)} />;
  return (
    <Screen tabbed>
      <T size={34} weight="bold">Uday community</T>
      <T color={C.inkSoft}>Every member is a senior known to Uday through their family. Phone numbers are never shown.</T>
      <View style={{ flexDirection: "row", gap: 8 }}>{([["groups", "Groups"], ["events", "Events"], ["people", "People"]] as [V, string][]).map(([k, l]) =>
        <Pressable key={k} accessibilityRole="tab" accessibilityState={{ selected: v === k }} onPress={() => setV(k)}
          style={{ flex: 1, minHeight: 72, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: v === k ? C.night : "#fff", borderWidth: 3, borderColor: C.night }}>
          <T weight="bold" color={v === k ? "#fff" : C.ink}>{l}</T></Pressable>)}</View>
      {v === "groups" && <Groups onOpen={setOpen} />}
      {v === "events" && <Events />}
      {v === "people" && <People />}
    </Screen>
  );
}

/** The community rules. A member must read and agree before joining a group or posting. */
function Rules({ onDone }: { onDone: () => void }) {
  const [r, setR] = useState<any>(null); const [err, setErr] = useState("");
  useEffect(() => { api("/api/community/rules").then(setR).catch((e) => setErr(e.message)); }, []);
  if (!r) return <ErrorText msg={err} />;
  if (r.accepted) return null;
  return <Card tone="amber"><T size={28} weight="bold">Community rules</T>
    {r.rules.map((x: string, i: number) => <T key={i}>{i + 1}. {x}</T>)}
    <T color={C.inkSoft}>You can report or block anyone. Uday reviews every report within one day.</T>
    <Button title="I agree to these rules" onPress={() => api("/api/community/rules", {}).then(() => { setR({ ...r, accepted: true }); onDone(); }).catch((e) => setErr(e.message))} />
    <ErrorText msg={err} /></Card>;
}

/** Block or report another member. Reporting also blocks them for you straight away. */
function PersonActions({ id, onDone }: { id: string; onDone: (msg: string) => void }) {
  return <View style={{ gap: 8 }}>
    <Button title="Block this person" sub="You will not see each other" tone="outline" onPress={() => api(`/api/community/people/${id}`, { action: "block" }).then(() => onDone("Blocked. You will not see each other."))} />
    <Button title="Report this person" sub="Uday will review within one day" tone="outline" onPress={() => api(`/api/community/people/${id}`, { action: "report" }).then(() => onDone("Thank you. Uday will review this. You will not see this person meanwhile."))} />
  </View>;
}

function Groups({ onOpen }: { onOpen: (id: string) => void }) {
  const [list, setList] = useState<any[]>([]); const load = () => api<any[]>("/api/community/groups").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  return <><Rules onDone={load} />{list.map((g) => (
    <Card key={g.id} tone={g.joined ? "teal" : "cream"}>
      <Pressable accessibilityRole="button" onPress={() => onOpen(g.id)}><T size={28} weight="bold">{g.icon} {g.name}</T><T>{g.about}</T>
        <T weight="semi" color={C.inkSoft}>{g.members} member{g.members === 1 ? "" : "s"}{g.new_posts ? ` · ${g.new_posts} new today` : ""}</T></Pressable>
      {g.joined ? <Button title="Open group" tone="teal" onPress={() => onOpen(g.id)} /> : <Button title="Join" onPress={() => api(`/api/community/groups/${g.id}`, { join: true }).then(load)} />}
    </Card>))}</>;
}

function Group({ id, onBack }: { id: string; onBack: () => void }) {
  const [d, setD] = useState<any>(null); const [text, setText] = useState(""); const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(() => api(`/api/community/groups/${id}`).then(setD).catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  async function post() { setBusy(true); setErr(""); try { await api(`/api/community/groups/${id}`, { body: text }); setText(""); await load(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); } }
  if (!d) return <Screen tabbed><T>{err || "Loading"}</T></Screen>;
  return (
    <Screen tabbed>
      <Button title="Back" tone="outline" onPress={onBack} style={{ alignSelf: "flex-start", paddingHorizontal: 28 }} />
      <T size={34} weight="bold">{d.group.icon} {d.group.name}</T><T>{d.group.about}</T>
      {!d.termsAccepted && <Rules onDone={load} />}
      {d.joined ? <Card><Field label="Share something with the group" value={text} onChangeText={setText} multiline maxLength={300} style={{ minHeight: 110, textAlignVertical: "top", paddingTop: 14 }} />
          <T color={C.inkSoft}>No phone numbers or links, to keep everyone safe.</T>
          <Button title="Post" tone="teal" busy={busy} onPress={post} /></Card>
        : <Button title="Join this group" onPress={() => api(`/api/community/groups/${id}`, { join: true }).then(load)} />}
      <ErrorText msg={err} />
      {!d.posts.length && <T>No posts yet. Say namaste to the group!</T>}
      {d.posts.map((p: any) => (
        <Card key={p.id}><T weight="bold">{p.author} · {p.locality}</T><T size={26}>{p.body}</T>
          <T color={C.inkSoft}>{new Date(p.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</T>
          {p.mine ? <Button title="Delete my post" tone="outline" onPress={() => api(`/api/community/posts/${p.id}`, { action: "delete" }).then(load)} />
            : <><Button title="Report this post" sub="If it seems wrong or unsafe" tone="outline" onPress={() => api(`/api/community/posts/${p.id}`, { action: "report" }).then(() => { setErr("Thank you. Uday will review this post. It is hidden for you now."); load(); })} />
              {p.authorId && <PersonActions id={p.authorId} onDone={(m) => { setErr(m); load(); }} />}</>}
        </Card>))}
      {d.joined && <Button title="Leave group" tone="outline" onPress={() => api(`/api/community/groups/${id}`, { join: false }).then(load)} />}
    </Screen>
  );
}

function Events() {
  const [list, setList] = useState<any[]>([]); const [err, setErr] = useState(""); const load = () => api<any[]>("/api/community/events").then(setList).catch(() => {});
  useEffect(() => { load(); }, []);
  return <>{!list.length && <T>No events planned yet. Uday will post walks, bhajans and meetups here.</T>}
    {list.map((e) => (
      <Card key={e.id} tone={e.mine ? "teal" : "cream"}>
        {e.sample && <T weight="semi" color={C.coral}>Sample event for testing</T>}
        <T size={28} weight="bold">{e.icon ?? "📅"} {e.title.replace(/^Sample: /, "")}</T>
        <T weight="semi">{new Date(e.starts_at).toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" })}</T>
        <T>{e.place}</T><T color={C.inkSoft}>{e.going} going{e.capacity ? ` · ${e.capacity} places` : ""}</T>
        {e.mine ? <Button title="✓ I am going" sub="Tap to cancel" tone="outline" onPress={() => api(`/api/community/events/${e.id}`, { going: false }).then(load)} />
          : <Button title="I will come" tone="teal" onPress={() => api(`/api/community/events/${e.id}`, { going: true }).then(load).catch((x) => setErr(x.message))} />}
      </Card>))}<ErrorText msg={err} /></>;
}

function People() {
  const [d, setD] = useState<any>(null); const [msg, setMsg] = useState(""); const load = () => api("/api/community/people").then(setD).catch(() => {});
  useEffect(() => { load(); }, []);
  if (!d) return null;
  if (!d.discoverable) return (
    <Card tone="amber"><T size={26} weight="bold">Meet people near you</T>
      <T>Turn this on to see other Uday members near you, and to let them see your first name and area. Your phone number is never shown.</T>
      <Button title="Let people near me find me" onPress={() => api("/api/senior/settings", { discoverable: true }, "PUT").then(load)} /></Card>);
  return <>{!d.people.length && <T>No one nearby has turned this on yet. Join a group to meet people.</T>}
    {d.people.map((p: any) => (
      <Card key={p.id} tone={p.friends ? "teal" : p.received ? "amber" : "cream"}>
        <T size={28} weight="bold">{p.name}</T><T>{p.locality}{p.sharedGroups ? ` · ${p.sharedGroups} group${p.sharedGroups > 1 ? "s" : ""} in common` : ""}</T>
        {p.friends ? <T weight="semi" color={C.teal}>🙏 You greeted each other</T> : p.received && !p.sent ? <T weight="semi">🙏 {p.name} said namaste to you</T> : null}
        {!p.sent ? <Button title="Say namaste 🙏" onPress={() => api(`/api/community/people/${p.id}`, {}).then(load)} /> : !p.friends ? <T color={C.inkSoft}>Namaste sent</T> : null}
        <PersonActions id={p.id} onDone={(m) => { setMsg(m); load(); }} />
      </Card>))}<ErrorText msg={msg} /></>;
}
