-- Uday core schema. PostgreSQL 15+.
-- Columns ending _enc hold AES-256-GCM ciphertext produced by the application (see apps/web/lib/crypto.ts).
-- Columns ending _hash hold HMAC-SHA256 lookups so encrypted values stay searchable (for example login by phone).
-- Money is always integer paise. Never store card numbers, UPI PINs, full Aadhaar numbers or police reports.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('family','caregiver','senior','ops');
CREATE TYPE family_role AS ENUM ('owner','care_manager','payer','viewer','local_contact');
CREATE TYPE care_type AS ENUM ('day','night','live');
CREATE TYPE booking_status AS ENUM ('offered','proposal','accepted','enroute','arrived','active','completed','closed','cancelled','released');
CREATE TYPE caregiver_status AS ENUM ('applied','verifying','active','paused','exited');
CREATE TYPE verification_kind AS ENUM ('identity','police','nursing','references','bank','training');
CREATE TYPE verification_result AS ENUM ('pending','clear','not_clear');
CREATE TYPE payment_status AS ENUM ('held','captured','released','refunded','partially_refunded','failed');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_hash text UNIQUE NOT NULL,
  phone_enc text NOT NULL,
  phone_last4 text NOT NULL,
  name text,
  email text,
  role user_role NOT NULL DEFAULT 'family',
  country text, city text, timezone text DEFAULT 'Asia/Kolkata', language text DEFAULT 'en',
  aadhaar_ref text, aadhaar_last4 text,             -- optional customer KYC: partner reference only
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE otp_codes (
  phone_hash text PRIMARY KEY,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  sent_count int NOT NULL DEFAULT 1,
  window_start timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);

CREATE TABLE care_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  senior_user_id uuid REFERENCES users(id),          -- set when the senior signs in to check in
  senior_phone_hash text,                            -- lets the senior's own login find this profile
  name text NOT NULL,
  dob_enc text, gender text, languages text[] DEFAULT '{}',
  has_phone boolean DEFAULT true,
  address_enc text, locality text, lat double precision, lng double precision,
  access_notes_enc text,
  care_needs jsonb NOT NULL DEFAULT '{}',
  preferences jsonb NOT NULL DEFAULT '{}',
  hospital text,
  checkin_by time DEFAULT '10:00',                   -- daily check in expected by this local time
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE family_members (
  care_recipient_id uuid REFERENCES care_recipients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role family_role NOT NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  PRIMARY KEY (care_recipient_id, user_id)
);

CREATE TABLE emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  name text NOT NULL, relation text, phone_enc text NOT NULL, city text, is_local boolean DEFAULT false
);

-- Optional for now. Every field encrypted. One row per senior, versioned through health_profile_history.
CREATE TABLE health_profiles (
  care_recipient_id uuid PRIMARY KEY REFERENCES care_recipients(id) ON DELETE CASCADE,
  allergies_enc text, conditions_enc text, medicines_enc text, doctors_enc text, insurance_enc text,
  no_known_allergies boolean, updated_by uuid REFERENCES users(id), updated_at timestamptz DEFAULT now()
);
CREATE TABLE health_profile_history (
  id bigserial PRIMARY KEY, care_recipient_id uuid NOT NULL, snapshot_enc text NOT NULL, changed_by uuid, changed_at timestamptz DEFAULT now()
);

CREATE TABLE health_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  kind text NOT NULL, doc_date date, storage_key text NOT NULL, file_key_enc text NOT NULL,
  uploaded_by uuid REFERENCES users(id), created_at timestamptz DEFAULT now()
);

CREATE TABLE consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  purpose text NOT NULL, scope jsonb NOT NULL DEFAULT '{}',
  granted_by uuid NOT NULL REFERENCES users(id), on_behalf boolean NOT NULL DEFAULT false,
  granted_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz
);

CREATE TABLE caregivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id),
  display_name text NOT NULL, initials text NOT NULL,
  tier smallint NOT NULL CHECK (tier BETWEEN 1 AND 3),
  care_types care_type[] NOT NULL,
  languages text[] DEFAULT '{}', skills text[] DEFAULT '{}',
  area text, lat double precision, lng double precision,
  experience_years int DEFAULT 0, gender text,
  rating numeric(2,1) DEFAULT 0, rating_count int DEFAULT 0,
  rate_day_paise int NOT NULL, rate_night_paise int NOT NULL, rate_live_paise int NOT NULL,
  status caregiver_status NOT NULL DEFAULT 'applied',
  online boolean NOT NULL DEFAULT false,
  pan_enc text, bank_ref text, bank_last4 text,
  created_at timestamptz DEFAULT now()
);

-- Results only. Police reports and Aadhaar numbers are never stored.
CREATE TABLE caregiver_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  kind verification_kind NOT NULL, provider text, result verification_result NOT NULL DEFAULT 'pending',
  reference text, last4 text, verified_at timestamptz, expires_at timestamptz,
  UNIQUE (caregiver_id, kind)
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  payer_id uuid NOT NULL REFERENCES users(id),
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id),
  tier smallint NOT NULL, care_type care_type NOT NULL, days int NOT NULL,
  start_date date NOT NULL, start_time time NOT NULL,
  status booking_status NOT NULL DEFAULT 'offered',
  rate_paise int NOT NULL, care_paise int NOT NULL, platform_paise int NOT NULL, gst_paise int NOT NULL, total_paise int NOT NULL,
  policy jsonb NOT NULL,                              -- snapshot of fees and cancellation rules at booking time
  days_done int NOT NULL DEFAULT 0,
  offer_expires_at timestamptz,
  tried uuid[] NOT NULL DEFAULT '{}',
  proposed_caregiver_id uuid REFERENCES caregivers(id),
  start_code_enc text, end_code_enc text,
  cancel_fee_paise int DEFAULT 0, refund_paise int,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bookings_caregiver_status ON bookings (caregiver_id, status);
CREATE INDEX bookings_payer ON bookings (payer_id, created_at DESC);
CREATE INDEX bookings_offer_expiry ON bookings (offer_expires_at) WHERE status = 'offered';

CREATE TABLE booking_events (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id),
  actor_id uuid, actor_role text NOT NULL,
  from_status booking_status, to_status booking_status,
  message text NOT NULL, at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shift_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  day int NOT NULL, caregiver_id uuid NOT NULL REFERENCES caregivers(id),
  meal boolean, meds boolean, mood text, note_enc text,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE attendance (
  id bigserial PRIMARY KEY,
  booking_id uuid NOT NULL REFERENCES bookings(id), day int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('enroute','arrived','start','end')),
  lat double precision, lng double precision, at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id),
  gateway text NOT NULL, gateway_ref text NOT NULL, method text,
  amount_paise int NOT NULL, captured_paise int NOT NULL DEFAULT 0, refunded_paise int NOT NULL DEFAULT 0,
  status payment_status NOT NULL,
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);

-- Double entry: every movement is two rows that net to zero.
CREATE TABLE ledger_entries (
  id bigserial PRIMARY KEY,
  booking_id uuid REFERENCES bookings(id),
  account text NOT NULL,                              -- family_hold, caregiver:<id>, uday_fee, gst_payable, refunds
  debit_paise int NOT NULL DEFAULT 0, credit_paise int NOT NULL DEFAULT 0,
  reason text NOT NULL, at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  booking_id uuid PRIMARY KEY REFERENCES bookings(id),
  stars smallint NOT NULL CHECK (stars BETWEEN 1 AND 5), tags text[] DEFAULT '{}', note_enc text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  booking_id uuid REFERENCES bookings(id), user_id uuid NOT NULL REFERENCES users(id),
  category text NOT NULL, text_enc text, urgent boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open', sla_due_at timestamptz NOT NULL, created_at timestamptz DEFAULT now()
);

CREATE TABLE checkins (
  id bigserial PRIMARY KEY,
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('ok','help')),
  source text NOT NULL DEFAULT 'app', at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX checkins_recent ON checkins (care_recipient_id, at DESC);

CREATE TABLE sos_events (
  id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), booking_id uuid REFERENCES bookings(id),
  role text NOT NULL, lat double precision, lng double precision, at timestamptz DEFAULT now(), resolved_at timestamptz
);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY, user_id uuid REFERENCES users(id), channel text NOT NULL, template text NOT NULL,
  payload jsonb, status text NOT NULL DEFAULT 'queued', at timestamptz DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY, actor_id uuid, action text NOT NULL, entity text NOT NULL, entity_id text,
  reason text, at timestamptz NOT NULL DEFAULT now()
);

-- Append only tables: block updates and deletes.
CREATE FUNCTION forbid_change() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'append only table'; END $$ LANGUAGE plpgsql;
CREATE TRIGGER booking_events_append BEFORE UPDATE OR DELETE ON booking_events FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER ledger_append BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_append BEFORE UPDATE OR DELETE ON audit_log FOR EACH ROW EXECUTE FUNCTION forbid_change();

CREATE TABLE schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now());
