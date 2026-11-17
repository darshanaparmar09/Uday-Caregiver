-- Store readiness: user generated content controls (Apple 1.2, Google UGC policy) and AI companion consent.
CREATE TABLE IF NOT EXISTS user_blocks (
  blocker uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker, blocked));
CREATE TABLE IF NOT EXISTS user_reports (
  id bigserial PRIMARY KEY,
  reporter uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason text, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz);
CREATE UNIQUE INDEX IF NOT EXISTS user_reports_once ON user_reports (reporter, reported) WHERE status='open';
ALTER TABLE senior_settings ADD COLUMN IF NOT EXISTS community_terms_at timestamptz;
ALTER TABLE senior_settings ADD COLUMN IF NOT EXISTS companion_consent_at timestamptz;
ALTER TABLE companion_messages ADD COLUMN IF NOT EXISTS reported_at timestamptz;
ALTER TABLE companion_messages ADD COLUMN IF NOT EXISTS report_reason text;
