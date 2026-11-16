-- From the end to end journey review: live in days, weekly billing and extensions, relief caregivers
-- for the weekly day off, public reviews, verified photos, intro calls, no show alerts, replacements.

ALTER TABLE bookings ADD COLUMN billing text NOT NULL DEFAULT 'upfront' CHECK (billing IN ('upfront','weekly'));
ALTER TABLE bookings ADD COLUMN day_off smallint CHECK (day_off BETWEEN 0 AND 6);   -- 0 Sunday .. 6 Saturday, live in only
ALTER TABLE bookings ADD COLUMN away boolean NOT NULL DEFAULT false;                -- live in caregiver is on her day off
ALTER TABLE bookings ADD COLUMN return_code_enc text;
ALTER TABLE bookings ADD COLUMN paid_paise int NOT NULL DEFAULT 0;                   -- captured so far

ALTER TABLE attendance DROP CONSTRAINT IF EXISTS attendance_kind_check;
ALTER TABLE attendance ADD CONSTRAINT attendance_kind_check CHECK (kind IN ('enroute','arrived','start','end','day_close','return','reminder','late_alert'));

-- Family's daily "all well?" answer on live in care.
CREATE TABLE day_checks (
  booking_id uuid REFERENCES bookings(id) ON DELETE CASCADE, day int NOT NULL, ok boolean NOT NULL, note_enc text,
  by_user uuid REFERENCES users(id), at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (booking_id, day)
);

-- Monthly and quarterly care is billed one week at a time.
CREATE TABLE billing_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, cycle_no int NOT NULL,
  from_day int NOT NULL, to_day int NOT NULL,
  care_paise int NOT NULL, platform_paise int NOT NULL, gst_paise int NOT NULL, amount_paise int NOT NULL,
  status text NOT NULL DEFAULT 'due' CHECK (status IN ('due','held','paid','failed','cancelled')),
  due_at timestamptz NOT NULL, attempts int NOT NULL DEFAULT 0, gateway_ref text, paid_at timestamptz,
  UNIQUE (booking_id, cycle_no)
);

CREATE TABLE extension_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, days int NOT NULL CHECK (days IN (7,30)),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','accepted','declined','expired')),
  requested_by uuid REFERENCES users(id), expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- One row per weekly day off on live in care, covered by a relief caregiver of the same tier.
CREATE TABLE relief_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE, day_no int NOT NULL, day date NOT NULL,
  caregiver_id uuid REFERENCES caregivers(id),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','offered','accepted','arrived','active','done','covered','cancelled')),
  offer_expires_at timestamptz, tried uuid[] NOT NULL DEFAULT '{}', start_code_enc text, end_code_enc text,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE (booking_id, day_no)
);

ALTER TABLE reviews ADD COLUMN public_text text;

ALTER TABLE caregivers ADD COLUMN photo_doc_id uuid REFERENCES caregiver_documents(id);
ALTER TABLE caregivers ADD COLUMN photo_status text NOT NULL DEFAULT 'none' CHECK (photo_status IN ('none','pending','verified','rejected'));

CREATE TABLE intro_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_user uuid NOT NULL REFERENCES users(id), care_recipient_id uuid NOT NULL REFERENCES care_recipients(id),
  caregiver_id uuid NOT NULL REFERENCES caregivers(id), slots timestamptz[] NOT NULL, chosen timestamptz, note text,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','confirmed','declined','done','cancelled')),
  room_url text, created_at timestamptz NOT NULL DEFAULT now()
);
