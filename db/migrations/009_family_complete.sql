-- Completing the family web app and the Uday app: invites, documents, customer ID check, booking chat,
-- live location, coupons and Uday Plus, gateway payment ids, companion chat, leads, phone call check in.

CREATE TABLE family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  phone_hash text NOT NULL, phone_last4 text NOT NULL, name text, role family_role NOT NULL,
  invited_by uuid REFERENCES users(id), status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(), accepted_at timestamptz
);
CREATE INDEX family_invites_phone ON family_invites (phone_hash) WHERE status='pending';

ALTER TABLE health_documents ADD COLUMN title text, ADD COLUMN mime text, ADD COLUMN bytes int;

ALTER TABLE users ADD COLUMN kyc_status text CHECK (kyc_status IN ('clear','not_clear','pending'));

CREATE TABLE booking_messages (
  id bigserial PRIMARY KEY, booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id), sender_role text NOT NULL, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_messages_b ON booking_messages (booking_id, id);
CREATE TABLE call_logs (
  id bigserial PRIMARY KEY, booking_id uuid REFERENCES bookings(id), from_user uuid REFERENCES users(id), provider_ref text, status text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE booking_locations (
  booking_id uuid PRIMARY KEY REFERENCES bookings(id) ON DELETE CASCADE, lat double precision NOT NULL, lng double precision NOT NULL, at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coupons (
  code text PRIMARY KEY, fee_discount_bps int NOT NULL CHECK (fee_discount_bps BETWEEN 1 AND 10000),
  max_uses int, used int NOT NULL DEFAULT 0, valid_until date, active boolean NOT NULL DEFAULT true, note text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE coupon_redemptions (code text REFERENCES coupons(code), booking_id uuid REFERENCES bookings(id), user_id uuid REFERENCES users(id), at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (code, user_id));
ALTER TABLE bookings ADD COLUMN coupon text, ADD COLUMN fee_discount_bps int NOT NULL DEFAULT 0;

CREATE TABLE memberships (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, plan text NOT NULL DEFAULT 'plus',
  status text NOT NULL CHECK (status IN ('active','cancelled','past_due')), amount_paise int NOT NULL,
  gateway_ref text, current_period_end date NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ADD COLUMN payment_id text;   -- the gateway's payment id once the family completes checkout

CREATE TABLE companion_messages (
  id bigserial PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')), body_enc text NOT NULL, flagged boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid REFERENCES users(id), care_recipient_id uuid REFERENCES care_recipients(id),
  kind text NOT NULL CHECK (kind IN ('insurance','tablet','telehealth')), note text, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')), created_at timestamptz NOT NULL DEFAULT now()
);

-- Check in by phone call for seniors without a smartphone: the number to call (mobile or landline).
ALTER TABLE care_recipients ADD COLUMN checkin_mode text NOT NULL DEFAULT 'app' CHECK (checkin_mode IN ('app','call')), ADD COLUMN call_phone_enc text;
CREATE TABLE ivr_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  provider_ref text, status text NOT NULL DEFAULT 'placed', digit text, day date NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
