-- Caregiver applications from the Careers page. Phone encrypted like every other phone number.
CREATE TABLE caregiver_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, phone_enc text NOT NULL, phone_hash text NOT NULL, area text NOT NULL, experience text NOT NULL,
  status text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX caregiver_applications_new ON caregiver_applications (status, created_at);
