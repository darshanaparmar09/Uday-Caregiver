export function Section({ children, tone = "plain", className = "", id }: { children: React.ReactNode; tone?: "plain" | "tint" | "dark"; className?: string; id?: string }) {
  const bg = tone === "tint" ? "bg-indigo-50/60" : tone === "dark" ? "bg-indigo-900 text-indigo-100" : "";
  return <section id={id} className={`${bg} py-14 sm:py-20 ${className}`}><div className="wrap">{children}</div></section>;
}
export function Head({ eyebrow, title, lead, light }: { eyebrow?: string; title: string; lead?: string; light?: boolean }) {
  return (
    <div className="mb-8 max-w-2xl sm:mb-10">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h2 className={`mt-2 text-3xl font-extrabold sm:text-4xl ${light ? "text-white" : ""}`}>{title}</h2>
      {lead && <p className={`mt-3 text-lg ${light ? "text-indigo-100/80" : ""}`}>{lead}</p>}
    </div>
  );
}
export function PageHero({ eyebrow, title, lead, img, alt, pos = "center" }: { eyebrow: string; title: string; lead: string; img?: string; alt?: string; pos?: string }) {
  return (
    <div className="relative overflow-hidden bg-indigo-900">
      <div aria-hidden className="absolute -bottom-40 left-1/2 h-80 w-[48rem] -translate-x-1/2 rounded-full bg-orange-500/25 blur-3xl" />
      <div className="wrap relative grid items-center gap-8 py-12 sm:py-16 lg:grid-cols-[1.1fr_.9fr]">
        <div>
          <div className="eyebrow text-orange-400">{eyebrow}</div>
          <h1 className="mt-3 text-4xl font-extrabold text-white sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-xl text-lg text-indigo-100/85">{lead}</p>
        </div>
        {img && <Photo src={img} alt={alt ?? ""} pos={pos} className="aspect-[16/10] lg:aspect-[4/3]" priority />}
      </div>
    </div>
  );
}
export function Photo({ src, alt, pos = "center", className = "", priority }: { src: string; alt: string; pos?: string; className?: string; priority?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={`/img/${src}-1200.webp`} srcSet={`/img/${src}-640.webp 640w, /img/${src}-1200.webp 1200w`} sizes="(max-width: 1024px) 100vw, 560px"
      alt={alt} loading={priority ? "eager" : "lazy"} width={1200} height={900}
      className={`w-full rounded-2xl object-cover shadow-lift ${className}`} style={{ objectPosition: pos }} />
  );
}
