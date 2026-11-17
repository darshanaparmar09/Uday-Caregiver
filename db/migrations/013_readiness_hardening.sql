-- Readiness sprint: truthful notifications, urgent alerts with acknowledgement and escalation, cron heartbeat,
-- rate limits, shift code attempt limits, idempotent offline writes, senior link consent, membership payment state,
-- account deletion, consent withdrawal, handover notes.
-- Safe on a live database: additive columns and new tables only; the two UPDATEs touch small tables.

-- ───────── rate limiting (per IP and per phone) ─────────
CREATE TABLE rate_limits (key text PRIMARY KEY, count int NOT NULL, window_start timestamptz NOT NULL);
ALTER TABLE otp_codes ADD COLUMN window_attempts int NOT NULL DEFAULT 0;

-- ───────── shift codes: attempt limits ─────────
ALTER TABLE bookings ADD COLUMN code_attempts int NOT NULL DEFAULT 0;
ALTER TABLE bookings ADD COLUMN code_locked_at timestamptz;
ALTER TABLE relief_shifts ADD COLUMN code_attempts int NOT NULL DEFAULT 0;

-- ───────── notifications: what really happened ─────────
-- status: queued (not yet tried) | sent (a provider accepted it) | simulated (test mode: logged, nothing left the server)
--         failed (provider refused or errored) | no_channel (no app token and no phone route) | recorded (ops console inbox only)
ALTER TABLE notifications ADD COLUMN detail jsonb;
ALTER TABLE notifications ADD COLUMN error text;
ALTER TABLE notifications ADD COLUMN updated_at timestamptz;
UPDATE notifications SET status='unknown' WHERE status='queued';
CREATE INDEX notifications_user_recent ON notifications (user_id, at DESC);
CREATE INDEX notifications_failed ON notifications (status, at DESC) WHERE status IN ('failed','no_channel');

-- ───────── urgent alerts: SOS, help, medical, missed check in ─────────
CREATE TABLE alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('sos','checkin_help','checkin_medical','checkin_missed','safety_report','companion_crisis')),
  care_recipient_id uuid REFERENCES care_recipients(id) ON DELETE SET NULL,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  raised_by uuid REFERENCES users(id) ON DELETE SET NULL, raised_role text,
  lat double precision, lng double precision,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  level int NOT NULL DEFAULT 0, next_escalation_at timestamptz,
  reached int NOT NULL DEFAULT 0,            -- people a provider accepted a message for (not proof they read it)
  acknowledged_at timestamptz, acknowledged_by uuid REFERENCES users(id) ON DELETE SET NULL, acknowledged_name text, ack_via text,
  resolved_at timestamptz, resolved_by uuid REFERENCES users(id) ON DELETE SET NULL, resolution text,
  repeats int NOT NULL DEFAULT 0,            -- times the same person raised it again while open
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alerts_open ON alerts (status, next_escalation_at) WHERE status = 'open';
CREATE INDEX alerts_recipient ON alerts (care_recipient_id, created_at DESC);
CREATE TABLE alert_deliveries (
  id bigserial PRIMARY KEY, alert_id uuid NOT NULL REFERENCES alerts(id) ON DELETE CASCADE, level int NOT NULL,
  target text NOT NULL CHECK (target IN ('family','contact','ops')),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL, name text, phone_last4 text,
  channel text NOT NULL, status text NOT NULL CHECK (status IN ('sent','simulated','failed','no_channel')), error text,
  token_hash text,                            -- lets a contact without the app acknowledge from the SMS link
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX alert_deliveries_alert ON alert_deliveries (alert_id);
CREATE UNIQUE INDEX alert_deliveries_token ON alert_deliveries (token_hash) WHERE token_hash IS NOT NULL;
ALTER TABLE incidents ADD COLUMN alert_id uuid REFERENCES alerts(id) ON DELETE SET NULL;
ALTER TABLE policy_settings ADD COLUMN oncall_phones text;                     -- comma separated, receives every urgent alert
ALTER TABLE policy_settings ADD COLUMN urgent_escalate_min int NOT NULL DEFAULT 5;
ALTER TABLE policy_settings ADD COLUMN missed_escalate_min int NOT NULL DEFAULT 30;

-- ───────── cron heartbeat ─────────
CREATE TABLE cron_runs (job text PRIMARY KEY, last_ok_at timestamptz, last_error text, last_error_at timestamptz, runs bigint NOT NULL DEFAULT 0, last_ms int);

-- ───────── idempotent writes from the offline queue ─────────
CREATE TABLE client_ops (user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, op_id text NOT NULL, response jsonb, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (user_id, op_id));

-- ───────── a senior must agree before a family is linked to them ─────────
ALTER TABLE care_recipients ADD COLUMN senior_link text NOT NULL DEFAULT 'none' CHECK (senior_link IN ('none','pending','confirmed','declined'));
UPDATE care_recipients SET senior_link='confirmed' WHERE senior_user_id IS NOT NULL;
UPDATE care_recipients SET senior_link='pending' WHERE senior_user_id IS NULL AND senior_phone_hash IS NOT NULL;

-- ───────── Uday Plus: paid before active ─────────
ALTER TABLE memberships DROP CONSTRAINT memberships_status_check;
ALTER TABLE memberships ADD CONSTRAINT memberships_status_check CHECK (status IN ('pending','active','cancelled','past_due'));
ALTER TABLE memberships ADD COLUMN order_ref text;

-- ───────── account deletion, consent changes ─────────
ALTER TABLE users ADD COLUMN deleted_at timestamptz;
CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES users(id), role text NOT NULL,
  status text NOT NULL DEFAULT 'done' CHECK (status IN ('done','blocked','pending')), note text,
  requested_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);

-- ───────── handover between caregivers ─────────
CREATE TABLE handovers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  from_caregiver_id uuid NOT NULL REFERENCES caregivers(id), day int NOT NULL, note_enc text NOT NULL,
  acknowledged_by uuid REFERENCES caregivers(id), acknowledged_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX handovers_booking ON handovers (booking_id, created_at DESC);

-- ───────── hot path indexes found in the audit ─────────
CREATE INDEX IF NOT EXISTS bookings_caregiver_status ON bookings (caregiver_id, status);
CREATE INDEX IF NOT EXISTS bookings_recipient ON bookings (care_recipient_id, start_date DESC);
CREATE INDEX IF NOT EXISTS bookings_payer ON bookings (payer_id);
CREATE INDEX IF NOT EXISTS tickets_open ON tickets (status, sla_due_at);
CREATE INDEX IF NOT EXISTS ledger_account ON ledger_entries (account);
CREATE INDEX IF NOT EXISTS ledger_booking ON ledger_entries (booking_id);
CREATE INDEX IF NOT EXISTS family_members_user ON family_members (user_id);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions (user_id);
CREATE INDEX IF NOT EXISTS audit_entity ON audit_log (entity, entity_id);
