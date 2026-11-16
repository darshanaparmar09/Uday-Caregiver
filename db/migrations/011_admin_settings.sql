-- Admin module: provider connections, business details for invoices, partners, auto pay mandates.

-- One row per outside service. Secrets are encrypted with the "secret" key class.
CREATE TABLE integrations (
  key text PRIMARY KEY,                       -- msg91, twilio, meta_whatsapp, exotel, razorpay, kyc, video, anthropic, routing
  config_enc text,                            -- encrypted JSON of the fields
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','connected','error')),
  last_test_at timestamptz, last_error text,
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);

-- The company that issues invoices. Exactly one row.
CREATE TABLE business_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  brand_name text NOT NULL DEFAULT 'Uday',
  legal_name text, gstin text, pan text,
  address text, city text DEFAULT 'Pune', state text DEFAULT 'Maharashtra', state_code text DEFAULT '27', pincode text,
  sac_code text DEFAULT '998599', gst_rate_bps int NOT NULL DEFAULT 1800,
  invoice_prefix text NOT NULL DEFAULT 'INV', support_phone text, support_email text,
  ca_reviewed boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id), updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO business_settings (id) VALUES (1);

-- Partners loaded from the admin Excel upload.
CREATE TABLE partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('telehealth','insurance','tablet')),
  name text NOT NULL, contact_name text, phone_enc text, email text,
  city text NOT NULL DEFAULT 'Pune', areas text, offer text, price_note text, website text,
  share_leads boolean NOT NULL DEFAULT false,  -- send consenting leads to this partner
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, name)
);
ALTER TABLE leads ADD COLUMN partner_id uuid REFERENCES partners(id);
ALTER TABLE leads ADD COLUMN consent_share boolean NOT NULL DEFAULT false;
ALTER TABLE leads ADD COLUMN sent_at timestamptz;

-- Auto pay: a UPI AutoPay or card mandate saved at the gateway, used for weekly charges.
CREATE TABLE mandates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  gateway text NOT NULL, customer_ref text, token_ref text, order_ref text,
  method text NOT NULL DEFAULT 'upi', max_paise bigint NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','cancelled','failed')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mandates_booking ON mandates (booking_id, status);
ALTER TABLE billing_cycles ADD COLUMN IF NOT EXISTS order_ref text;
ALTER TABLE billing_cycles ADD COLUMN IF NOT EXISTS fail_reason text;
