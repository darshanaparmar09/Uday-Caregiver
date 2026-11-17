import { linkInfo } from "@/lib/alerts";
import { AckButton } from "@/components/AckButton";
export const dynamic = "force-dynamic";
export const metadata = { title: "Uday alert", robots: { index: false, follow: false } };
/** The page behind the link in an alert SMS. No sign in: the link itself is the key, valid for 48 hours. Shows a first name only. */
export default async function Page({ params }: { params: { token: string } }) {
  const i = await linkInfo(params.token);
  return (
    <main className="mx-auto grid min-h-screen max-w-md content-center gap-5 p-6">
      <div className="font-display text-xl font-extrabold text-indigo-900">uday</div>
      {!i ? <><h1 className="text-2xl font-extrabold">This link has expired</h1><p>If you are worried about someone, call them. If you fear danger, call 112.</p></> : <>
        <h1 className="text-3xl font-extrabold">{i.first} {i.what}</h1>
        <p className="text-lg">{new Date(i.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}. Please call or visit {i.first} now.</p>
        <a href="tel:112" className="btn-ghost min-h-[56px] border-red-300 text-lg text-red-800">If you fear danger, call 112</a>
        <AckButton token={params.token} done={i.status !== "open"} by={i.acknowledgedBy} first={i.first} />
        <p className="note">Uday is not an emergency service. This message was sent because you are listed as an emergency contact for {i.first}.</p></>}
    </main>);
}
