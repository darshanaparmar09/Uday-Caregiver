-- Operations console: team roles, help desk, incidents, booking notes, pricing and policy, GST invoice register, reconciliation.

-- Who in the Uday team can do what. Every ops user gets a row; the seeded ops user is an admin.
CREATE TABLE ops_members (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'agent' CHECK (role IN ('admin','agent','finance','viewer')),
  active boolean NOT NULL DEFAULT true,
  added_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO ops_members (user_id, role) SELECT id, 'admin' FROM users WHERE role='ops' ON CONFLICT DO NOTHING;

-- Help desk
ALTER TABLE tickets ADD COLUMN assigned_to uuid REFERENCES users(id);
ALTER TABLE tickets ADD COLUMN resolved_at timestamptz;
ALTER TABLE tickets ADD COLUMN resolution text;
ALTER TABLE tickets ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE tickets ADD COLUMN first_response_at timestamptz;
UPDATE tickets SET status='resolved', resolved_at=now() WHERE status='closed';
UPDATE tickets SET status='open' WHERE status NOT IN ('open','in_progress','waiting','resolved');
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check CHECK (status IN ('open','in_progress','waiting','resolved'));
CREATE TABLE ticket_notes (
  id bigserial PRIMARY KEY, ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id), body_enc text NOT NULL, to_user boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Incidents: safety, medical, theft, abuse, conduct, data, payment.
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
  severity text NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  category text NOT NULL CHECK (category IN ('safety','medical','theft','abuse','conduct','no_show','data','payment','other')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','action_taken','closed')),
  summary text NOT NULL,
  booking_id uuid REFERENCES bookings(id), caregiver_id uuid REFERENCES caregivers(id), care_recipient_id uuid REFERENCES care_recipients(id),
  ticket_id uuid REFERENCES tickets(id), sos_id bigint REFERENCES sos_events(id),
  owner_id uuid REFERENCES users(id), opened_by uuid REFERENCES users(id),
  caregiver_action text CHECK (caregiver_action IN ('none','coaching','warning','paused','removed')),
  outcome text, police_reported boolean NOT NULL DEFAULT false,
  opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX incidents_open ON incidents (status, severity);
CREATE TABLE incident_events (
  id bigserial PRIMARY KEY, incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id), kind text NOT NULL CHECK (kind IN ('note','status','action','link')),
  body_enc text, at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE sos_events ADD COLUMN resolved_by uuid REFERENCES users(id);
ALTER TABLE sos_events ADD COLUMN resolution text;

-- Internal notes on a booking, never shown to the family or caregiver.
CREATE TABLE booking_notes (
  id bigserial PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  author_id uuid REFERENCES users(id), body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

-- Pricing and policy, editable by admins. One row.
CREATE TABLE policy_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  platform_fee_bps int NOT NULL DEFAULT 800, free_cancel_hours int NOT NULL DEFAULT 4, late_cancel_bps int NOT NULL DEFAULT 2000,
  offer_same_day_min int NOT NULL DEFAULT 30, offer_future_min int NOT NULL DEFAULT 240,
  missed_checkin_grace_min int NOT NULL DEFAULT 60, ticket_sla_min int NOT NULL DEFAULT 240, urgent_ticket_sla_min int NOT NULL DEFAULT 30,
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO policy_settings (id) VALUES (1);
CREATE TABLE tier_rates (
  tier int NOT NULL CHECK (tier BETWEEN 1 AND 3), care_type care_type NOT NULL, rate_paise int NOT NULL CHECK (rate_paise > 0),
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (tier, care_type)
);
INSERT INTO tier_rates (tier, care_type, rate_paise) VALUES
  (1,'day',85000),(1,'night',105000),(1,'live',150000),(2,'day',140000),(2,'night',160000),(2,'live',220000),(3,'day',210000),(3,'night',240000),(3,'live',310000);

-- GST invoice register: consecutive numbers per financial year, credit notes for refunds of the fee.
CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice','credit_note')),
  fy text NOT NULL, seq int NOT NULL, number text NOT NULL UNIQUE,
  booking_id uuid NOT NULL REFERENCES bookings(id), cycle_no int, against_id uuid REFERENCES invoices(id),
  issued_at timestamptz NOT NULL DEFAULT now(),
  care_paise int NOT NULL, taxable_paise int NOT NULL, cgst_paise int NOT NULL DEFAULT 0, sgst_paise int NOT NULL DEFAULT 0, igst_paise int NOT NULL DEFAULT 0, total_paise int NOT NULL,
  gst_rate_bps int NOT NULL, gstin text, place_of_supply text NOT NULL DEFAULT '27', buyer_name text, sac_code text,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','cancelled')),
  UNIQUE (kind, fy, seq)
);
CREATE INDEX invoices_booking ON invoices (booking_id);

-- Reconciliation runs
CREATE TABLE recon_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), from_day date NOT NULL, to_day date NOT NULL,
  run_by uuid REFERENCES users(id), summary jsonb NOT NULL, issues jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE invoices ADD COLUMN reason text;
