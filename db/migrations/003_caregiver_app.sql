-- Caregiver app completion: onboarding stages, documents, contracts, availability, leave, academy, payouts, push tokens.

ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS bio text, ADD COLUMN IF NOT EXISTS service_areas text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_hours text, ADD COLUMN IF NOT EXISTS pan_last4 text, ADD COLUMN IF NOT EXISTS bank_ifsc text,
  ADD COLUMN IF NOT EXISTS bank_changed_at timestamptz;
ALTER TABLE caregiver_applications ADD COLUMN IF NOT EXISTS caregiver_id uuid REFERENCES caregivers(id);

-- One row per onboarding stage (1 to 15, see Onboarding Specification).
CREATE TABLE onboarding_steps (
  caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  stage smallint NOT NULL CHECK (stage BETWEEN 1 AND 15),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted','clear','not_clear')),
  note text, updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (caregiver_id, stage)
);

-- Files are stored encrypted in object storage; this table holds only metadata and the wrapped file key.
CREATE TABLE caregiver_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('certificate','nursing_registration','address_proof','fitness','vaccination','photo')),
  storage_key text NOT NULL, file_key_enc text NOT NULL, mime text NOT NULL, bytes int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE caregiver_contracts (
  id bigserial PRIMARY KEY, caregiver_id uuid NOT NULL REFERENCES caregivers(id), version text NOT NULL,
  signed_name text NOT NULL, signed_at timestamptz NOT NULL DEFAULT now(), device text
);

CREATE TABLE caregiver_unavailable (
  caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  day date NOT NULL, reason text NOT NULL DEFAULT 'off',
  PRIMARY KEY (caregiver_id, day)
);

CREATE TABLE leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  from_day date NOT NULL, to_day date NOT NULL CHECK (to_day >= from_day), reason text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','declined')),
  decided_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE academy_modules (
  id text PRIMARY KEY, tier smallint NOT NULL, ord smallint NOT NULL, title text NOT NULL, minutes int NOT NULL,
  lesson text[] NOT NULL, quiz jsonb NOT NULL      -- [{q, options[], answer index}]
);
CREATE TABLE academy_attempts (
  id bigserial PRIMARY KEY, caregiver_id uuid NOT NULL REFERENCES caregivers(id) ON DELETE CASCADE,
  module_id text NOT NULL REFERENCES academy_modules(id), score smallint NOT NULL, total smallint NOT NULL, passed boolean NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id),
  amount_paise int NOT NULL CHECK (amount_paise > 0), status text NOT NULL CHECK (status IN ('processing','paid','failed')),
  gateway_ref text, bank_last4 text, period_end date NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), paid_at timestamptz
);

CREATE TABLE push_tokens (
  token text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_tokens_user ON push_tokens (user_id);

-- Existing seeded caregivers are fully onboarded.
INSERT INTO onboarding_steps (caregiver_id, stage, status)
SELECT c.id, s, 'clear' FROM caregivers c CROSS JOIN generate_series(1,15) s WHERE c.status='active' ON CONFLICT DO NOTHING;
