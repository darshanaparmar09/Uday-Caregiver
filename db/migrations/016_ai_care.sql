-- AI assisted care: daily family updates, care flags, voice requests, appointments, quality themes.
-- AI only summarises, flags and suggests. It never diagnoses, changes medicines or decides care.

-- One short update per booking day, written from what the caregiver recorded.
CREATE TABLE IF NOT EXISTS daily_updates (
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  day int NOT NULL,
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  summary_enc text NOT NULL,
  source text NOT NULL CHECK (source IN ('template','ai')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (booking_id, day));

-- Observations in a shift record that a person should look at. A flag is never an emergency on its own.
CREATE TABLE IF NOT EXISTS care_flags (
  id bigserial PRIMARY KEY,
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE,
  care_recipient_id uuid REFERENCES care_recipients(id) ON DELETE CASCADE,
  shift_log_id uuid REFERENCES shift_logs(id) ON DELETE CASCADE,
  day int,
  kind text NOT NULL,
  detail_enc text,
  source text NOT NULL CHECK (source IN ('rules','ai')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed')),
  review_note text, reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS care_flags_once ON care_flags (shift_log_id, kind);
CREATE INDEX IF NOT EXISTS care_flags_open ON care_flags (status, created_at);

-- "Speak to Uday": what a senior said, kept so a person can listen when no transcript exists.
CREATE TABLE IF NOT EXISTS voice_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  care_recipient_id uuid REFERENCES care_recipients(id) ON DELETE CASCADE,
  storage_key text NOT NULL, file_key_enc text NOT NULL, mime text NOT NULL, bytes int,
  transcript_enc text, language text,
  category text NOT NULL DEFAULT 'unknown' CHECK (category IN ('unknown','care_help','book_caregiver','appointment','talk_to_family','urgent','other')),
  summary_enc text, source text CHECK (source IN ('rules','ai')),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','seen','done','dismissed')),
  handled_by uuid REFERENCES users(id), handled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS voice_requests_open ON voice_requests (status, created_at);
ALTER TABLE senior_settings ADD COLUMN IF NOT EXISTS voice_consent_at timestamptz;
ALTER TABLE caregivers ADD COLUMN IF NOT EXISTS voice_consent_at timestamptz;

-- Appointments and follow ups. Suggestions read from a document wait for a family member to confirm.
CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'doctor' CHECK (kind IN ('doctor','test','therapy','follow_up','other')),
  title text NOT NULL, at timestamptz, place text, notes_enc text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','suggested')),
  status text NOT NULL DEFAULT 'confirmed' CHECK (status IN ('suggested','confirmed','done','cancelled')),
  document_id uuid REFERENCES health_documents(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id), confirmed_by uuid REFERENCES users(id),
  reminded_day_at timestamptz, reminded_soon_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS appointments_due ON appointments (status, at);

-- Weekly quality themes, generated on request so the report is not rebuilt on every view.
CREATE TABLE IF NOT EXISTS quality_themes (
  week date PRIMARY KEY, themes jsonb NOT NULL, source text NOT NULL, created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now());

-- Alerts raised from a senior's spoken request for urgent help.
ALTER TABLE alerts DROP CONSTRAINT IF EXISTS alerts_kind_check;
ALTER TABLE alerts ADD CONSTRAINT alerts_kind_check CHECK (kind IN ('sos','checkin_help','checkin_medical','checkin_missed','safety_report','companion_crisis','voice_help'));
