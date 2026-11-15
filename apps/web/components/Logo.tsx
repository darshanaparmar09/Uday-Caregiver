export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display text-xl font-extrabold ${light ? "text-white" : "text-ink"}`}>
      <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <defs><linearGradient id="sun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFC56B" /><stop offset="1" stopColor="#F5891F" /></linearGradient></defs>
        <rect width="30" height="30" rx="9" fill="#1A1040" />
        <path d="M6 20a9 9 0 0 1 18 0z" fill="url(#sun)" />
        <path d="M5 22.5h20" stroke="#F5891F" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      uday
    </span>
  );
}
