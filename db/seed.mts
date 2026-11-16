// Seed data for development and the pilot launch rehearsal: caregivers, their verification results, one ops user.
// Run: npm run db:seed   (needs DATABASE_URL, LOOKUP_KEY, FIELD_KEY_PII, FIELD_KEY_HEALTH)
// Caregivers are SAMPLE people. Replace with real, verified caregivers before launch.
import pg from "pg";
import { enc, lookupHash } from "../apps/web/lib/crypto.ts";

const CG = [
  ["Sunita Pawar", "SP", 2, ["day", "live"], ["Marathi", "Hindi"], ["Dementia care", "Mobility support", "Meals"], "Kothrud", 18.5074, 73.8077, 6, "Female", 4.9, 127, [1400, 1600, 2200]],
  ["Asha Jadhav", "AJ", 1, ["day", "night"], ["Marathi", "Hindi"], ["Companionship", "Meals", "Walks"], "Aundh", 18.5590, 73.8075, 3, "Female", 4.7, 64, [900, 1100, 1600]],
  ["Mary D'Souza", "MD", 3, ["day", "night"], ["English", "Hindi", "Marathi"], ["Injections", "Wound care", "Vitals"], "Camp", 18.5158, 73.8780, 11, "Female", 5.0, 89, [2200, 2500, 3200]],
  ["Ravi Shinde", "RS", 2, ["day", "night", "live"], ["Marathi", "Hindi"], ["Bedridden support", "Transfers", "Physio assist"], "Hadapsar", 18.5089, 73.9260, 5, "Male", 4.8, 93, [1400, 1600, 2200]],
  ["Shobha Kulkarni", "SK", 1, ["day", "live"], ["Marathi"], ["Companionship", "Reading", "Meals"], "Sopanbaug", 18.5340, 73.8990, 2, "Female", 4.6, 38, [850, 1050, 1500]],
  ["Anil Gaikwad", "AG", 3, ["day", "night", "live"], ["Hindi", "Marathi"], ["Diabetes care", "Catheter care", "Vitals"], "Baner", 18.5590, 73.7868, 8, "Male", 4.9, 71, [2100, 2400, 3100]],
  ["Lata More", "LM", 2, ["night", "live"], ["Marathi", "Hindi"], ["Post surgery", "Dementia care", "Hygiene"], "Wakad", 18.5990, 73.7600, 4, "Female", 4.8, 55, [1400, 1600, 2200]],
] as const;

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
async function user(phone: string, name: string, role: string) {
  const r = await c.query(`INSERT INTO users (phone_hash, phone_enc, phone_last4, name, role) VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (phone_hash) DO UPDATE SET name=EXCLUDED.name, role=EXCLUDED.role RETURNING id`, [lookupHash(phone), enc(phone), phone.slice(-4), name, role]);
  return r.rows[0].id as string;
}
let i = 1;
for (const [name, ini, tier, types, langs, skills, area, lat, lng, exp, gender, rating, count, rates] of CG) {
  const phone = "+9190000000" + String(i).padStart(2, "0");
  const uid = await user(phone, name, "caregiver");
  const r = await c.query(`INSERT INTO caregivers (user_id, display_name, initials, tier, care_types, languages, skills, area, lat, lng, experience_years, gender, rating, rating_count,
      rate_day_paise, rate_night_paise, rate_live_paise, status, online)
    VALUES ($1,$2,$3,$4,$5::care_type[],$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'active',true)
    ON CONFLICT (user_id) DO UPDATE SET display_name=EXCLUDED.display_name RETURNING id`,
    [uid, name, ini, tier, types, langs, skills, area, lat, lng, exp, gender, rating, count, rates[0] * 100, rates[1] * 100, rates[2] * 100]);
  for (const kind of ["identity", "police", "references", "training", "bank"])
    await c.query(`INSERT INTO caregiver_verifications (caregiver_id, kind, provider, result, reference, verified_at, expires_at)
      VALUES ($1,$2,'sample provider','clear',$3, now(), now() + interval '1 year') ON CONFLICT (caregiver_id, kind) DO NOTHING`, [r.rows[0].id, kind, "SAMPLE-" + kind.toUpperCase() + "-" + i]);
  // Sample bank reference (test gateway) and academy history for already certified sample caregivers.
  await c.query("UPDATE caregivers SET bank_ref=COALESCE(bank_ref, $2), bank_last4=COALESCE(bank_last4, $3), bank_ifsc=COALESCE(bank_ifsc,'SBIN0001234') WHERE id=$1", [r.rows[0].id, "mock_fa_seed_" + i, String(4400 + i)]);
  await c.query(`INSERT INTO academy_attempts (caregiver_id, module_id, score, total, passed)
    SELECT $1, m.id, jsonb_array_length(m.quiz), jsonb_array_length(m.quiz), true FROM academy_modules m
    WHERE m.tier <= $2 AND NOT EXISTS (SELECT 1 FROM academy_attempts a WHERE a.caregiver_id=$1 AND a.module_id=m.id)`, [r.rows[0].id, tier]);
  console.log(`caregiver ${name}: sign in with ${phone}`);
  i++;
}
await user("+919000000099", "Uday Ops", "ops");
console.log("ops: sign in with +919000000099");
await c.end();
