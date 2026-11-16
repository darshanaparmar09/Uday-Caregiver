// Search engine setup: titles, descriptions, canonical links, structured data, robots and sitemap.
import { test } from "node:test";
import assert from "node:assert/strict";
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const get = async (p: string) => { const r = await fetch(BASE + p); return { status: r.status, text: await r.text(), type: r.headers.get("content-type") ?? "" }; };
const PUBLIC = ["/", "/hire", "/how-it-works", "/families", "/trust", "/facilities", "/careers", "/partners", "/partner", "/about", "/faq", "/contact", "/legal"];

test("every public page has its own title and a description of search length, a canonical link and a share image", async () => {
  const titles = new Set<string>();
  for (const p of PUBLIC) {
    const { status, text } = await get(p); assert.equal(status, 200, p);
    const t = text.match(/<title>(.*?)<\/title>/)?.[1] ?? ""; const d = text.match(/<meta name="description" content="(.*?)"/)?.[1] ?? "";
    assert.ok(t.length >= 15 && t.length <= 65, `${p} title length ${t.length}: ${t}`); assert.ok(!titles.has(t), `${p} duplicate title`); titles.add(t);
    assert.ok(d.length >= 100 && d.length <= 160, `${p} description length ${d.length}`);
    assert.match(text, /<link rel="canonical" href="[^"]+"/, p); assert.match(text, /property="og:image"/, p);
    assert.ok(!/ · Uday · Uday|Uday · Uday/.test(t), `${p} brand repeated`);
  }
});
test("structured data on the home page and FAQ", async () => {
  assert.match((await get("/")).text, /"@type":"Organization"/);
  assert.match((await get("/faq")).text, /"@type":"FAQPage"/);
});
test("private pages stay out of search; robots and sitemap", async () => {
  assert.match((await get("/signin")).text, /<meta name="robots" content="noindex/);
  assert.match((await get("/caregivers/00000000-0000-0000-0000-000000000000")).text, /<meta name="robots" content="noindex/);
  const r = await get("/robots.txt"); assert.equal(r.status, 200);
  assert.match(r.text, /Disallow: \//, "test servers block all crawlers");
  const s = await get("/sitemap.xml"); assert.equal(s.status, 200); assert.match(s.type, /xml/);
  for (const p of ["/hire", "/facilities", "/faq"]) assert.ok(s.text.includes(`${p}</loc>`), p);
  assert.ok(!s.text.includes("/app") && !s.text.includes("/ops") && !s.text.includes("/caregivers/"), "no private pages in the sitemap");
  const og = await fetch(BASE + "/opengraph-image"); assert.equal(og.status, 200); assert.match(og.headers.get("content-type") ?? "", /image\/png/);
});
