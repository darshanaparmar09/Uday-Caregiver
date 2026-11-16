-- Care facilities (self onboarding with monthly plan), family reviews, visit requests;
-- health readings from caregivers, families and wearables; care needs, home commitments, multi area caregiver ratings.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'facility';

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS care_need text, ADD COLUMN IF NOT EXISTS care_need_note text,
  ADD COLUMN IF NOT EXISTS home_commitments jsonb, ADD COLUMN IF NOT EXISTS home_commitments_version text;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS areas jsonb, ADD COLUMN IF NOT EXISTS overall numeric(2,1);

CREATE TABLE readings (
  id bigserial PRIMARY KEY,
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  kind text NOT NULL, value_enc text NOT NULL,
  source text NOT NULL CHECK (source IN ('caregiver','family','device')), device text, booking_id uuid REFERENCES bookings(id),
  recorded_at timestamptz NOT NULL, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX readings_recent ON readings (care_recipient_id, kind, recorded_at DESC);

CREATE TABLE device_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  device text NOT NULL, via text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','connected','disconnected')),
  external_ref text, connected_by uuid REFERENCES users(id), last_sync_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (care_recipient_id, device)
);

CREATE TABLE facilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES users(id),
  name text NOT NULL, types text[] NOT NULL, city text NOT NULL DEFAULT 'Pune', locality text NOT NULL, address text,
  description text, licence_no text, licence_verified boolean NOT NULL DEFAULT false, beds int,
  staff_ratio text, memory_staff_ratio text, doctor_visits text,
  monthly_from_paise int, monthly_to_paise int, entry_fee_paise int, refund_policy text, extra_costs text,
  dementia_unit boolean NOT NULL DEFAULT false, pets_allowed boolean NOT NULL DEFAULT false, diets text[] NOT NULL DEFAULT '{}',
  activities text[] NOT NULL DEFAULT '{}', contact_phone text, sample boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','review','live','suspended')),
  plan text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE facility_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  plan text NOT NULL, amount_paise int NOT NULL, status text NOT NULL CHECK (status IN ('active','past_due','cancelled')),
  gateway_ref text, current_period_end date NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE visit_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE, family_user_id uuid NOT NULL REFERENCES users(id),
  preferred_date date NOT NULL, note text, status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','completed','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE facility_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE, family_user_id uuid NOT NULL REFERENCES users(id),
  relation text NOT NULL CHECK (relation IN ('visited','resident_family')), areas jsonb NOT NULL, overall numeric(2,1) NOT NULL,
  text text, status text NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden')), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (facility_id, family_user_id)
);
CREATE TABLE facility_visit_notes (
  family_user_id uuid NOT NULL REFERENCES users(id), facility_id uuid NOT NULL REFERENCES facilities(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}', updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (family_user_id, facility_id)
);
