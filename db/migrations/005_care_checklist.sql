-- Daily care checklist and vital signs on each shift log. Both are health data: encrypted by the application.
ALTER TABLE shift_logs ADD COLUMN IF NOT EXISTS checklist_enc text, ADD COLUMN IF NOT EXISTS vitals_enc text, ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}';
