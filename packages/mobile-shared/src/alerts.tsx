import { useCallback, useEffect, useRef, useState } from "react";
import { Linking } from "react-native";
import { api } from "./api";
import { Button, Card, T } from "./ui";
import { tr } from "./i18n";

/**
 * Urgent alerts on the phone, told truthfully. The screen never says an alert was sent before the server confirms it,
 * never says family was told unless a message really went out, and says "responding" only after a person acknowledged.
 * Uday is not an emergency service: the 112 button is always there.
 */
export type AlertInfo = { id: string; status: "open" | "acknowledged" | "resolved"; reached: string[]; simulated: string[]; failed: string[]; anyoneReached: boolean; testMode: boolean; acknowledgedBy: string | null; opsReached: boolean };
export type SendState = "idle" | "sending" | "sent" | "failed";

/** Sends an urgent request and keeps trying while there is no connection. Then watches for someone to respond. */
export function useUrgent() {
  const [state, setState] = useState<SendState>("idle"); const [alert, setAlert] = useState<AlertInfo | null>(null); const [tries, setTries] = useState(0);
  const live = useRef(true); const timer = useRef<any>(null);
  useEffect(() => () => { live.current = false; clearTimeout(timer.current); }, []);
  const send = useCallback((path: string, body: object) => {
    let n = 0; setState("sending"); setAlert(null); setTries(0);
    const attempt = async () => {
      n++; if (live.current) setTries(n);
      try { const r: any = await api(path, body); if (!live.current) return; setAlert(r.alert ?? null); setState("sent"); }
      catch { if (!live.current) return; setState("failed"); timer.current = setTimeout(attempt, Math.min(30000, 3000 * n)); } // keeps retrying: 3 s, 6 s … 30 s
    };
    attempt();
  }, []);
  // After it is sent: ask every 10 seconds whether anyone has responded.
  useEffect(() => {
    if (state !== "sent" || !alert || alert.status !== "open") return;
    const t = setInterval(() => api<AlertInfo>(`/api/alerts/${alert.id}`).then((a) => live.current && setAlert(a)).catch(() => {}), 10000);
    return () => clearInterval(t);
  }, [state, alert]);
  const reset = useCallback(() => { clearTimeout(timer.current); setState("idle"); setAlert(null); }, []);
  return { state, alert, tries, send, reset };
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : xs.slice(0, -1).join(", ") + " " + tr("and") + " " + xs[xs.length - 1]);

/** The card shown after SOS or an urgent check in. Every sentence matches what the server reported. */
export function UrgentCard({ state, alert, tries, contacts = [], onClear, clearLabel = "I am safe now" }: { state: SendState; alert: AlertInfo | null; tries: number; contacts?: { name: string; phone?: string; relation?: string }[]; onClear?: () => void; clearLabel?: string }) {
  const call112 = <Button title="Call 112 now" sub="Ambulance and police" tone="coral" onPress={() => Linking.openURL("tel:112").catch(() => {})} style={{ minHeight: 100 }} />;
  const calls = contacts.filter((c) => c.phone).slice(0, 2).map((c) => <Button key={c.phone} title={`${tr("Call")} ${c.name}`} sub={c.relation} tone="teal" onPress={() => Linking.openURL(`tel:${c.phone}`).catch(() => {})} />);
  if (state === "sending") return (<><Card tone="amber"><T size={30} weight="bold">Sending your alert</T><T>Please wait a moment. If you are in danger, call 112 now.</T></Card>{call112}{calls}</>);
  if (state === "failed") return (<><Card tone="coral"><T size={30} weight="bold">Your alert has NOT been sent</T><T>There is no internet connection. We are trying again. Do not wait: call 112 or your family now.</T><T>{`${tr("Tries so far")}: ${tries}`}</T></Card>{call112}{calls}</>);
  if (state !== "sent") return null;
  const a = alert;
  const body = !a ? <T>Your alert is recorded.</T>
    : a.status === "acknowledged" || a.status === "resolved" ? <><T size={30} weight="bold">{a.acknowledgedBy ? `${a.acknowledgedBy} ${tr("is responding")}` : tr("Someone is responding")}</T><T>They have seen your alert.</T></>
    : a.anyoneReached ? <><T size={30} weight="bold">Alert sent</T>
        <T>{a.reached.length ? `${tr("Sent to")} ${list(a.reached)}.` : tr("Sent to the Uday team.")}</T>
        <T>Nobody has responded yet. We keep trying until someone does.</T></>
    : a.testMode ? <><T size={30} weight="bold">Alert recorded (test mode)</T><T>This is a test version of Uday. No real message was sent to anyone.</T></>
    : <><T size={30} weight="bold">We could not reach anyone by message</T><T>Your alert is with the Uday team, but no message got through to your family. Call them or 112 now.</T></>;
  const ok = a && (a.status === "acknowledged" || a.status === "resolved");
  return (<><Card tone={ok ? "teal" : "coral"}>{body}</Card>{!ok && call112}{calls}{onClear && <Button title={clearLabel} tone="outline" onPress={onClear} />}</>);
}
