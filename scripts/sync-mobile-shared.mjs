// Copies shared mobile code into each app so every app builds on its own (no Metro monorepo setup needed).
// Edit files in packages/mobile-shared/src, then run: node scripts/sync-mobile-shared.mjs
// CI runs it with --check and fails if an app copy has drifted.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(root, "packages/mobile-shared/src");
const APPS = {
  "apps/mobile": ["api.ts", "theme.ts", "ui.tsx", "push.ts", "SignIn.tsx"],
  "apps/caregiver": ["api.ts", "theme.ts", "ui.tsx", "push.ts", "offline.ts", "SignIn.tsx"],
};
const check = process.argv.includes("--check");
let drift = 0;
for (const [app, files] of Object.entries(APPS)) {
  const out = join(root, app, "src/shared");
  mkdirSync(out, { recursive: true });
  for (const f of files) {
    const body = `// GENERATED from packages/mobile-shared/src/${f}. Do not edit here; run node scripts/sync-mobile-shared.mjs\n` + readFileSync(join(SRC, f), "utf8");
    const dest = join(out, f);
    if (check) { if (!existsSync(dest) || readFileSync(dest, "utf8") !== body) { console.error("out of date:", dest); drift++; } }
    else writeFileSync(dest, body);
  }
}
if (check && drift) process.exit(1);
console.log(check ? "shared code in sync" : "synced");
