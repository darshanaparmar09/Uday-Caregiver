-- Senior mode, restored from the first Uday builds: four ways to check in, medicines taken,
-- brain games, community groups and events, people nearby, safety reports, callbacks.

ALTER TABLE checkins DROP CONSTRAINT IF EXISTS checkins_status_check;
ALTER TABLE checkins ADD CONSTRAINT checkins_status_check CHECK (status IN ('ok','help','medical','lonely'));

CREATE TABLE senior_settings (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  discoverable boolean NOT NULL DEFAULT false,      -- off by default: others nearby cannot see this senior
  language text NOT NULL DEFAULT 'en',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- One row per medicine, time slot and day when it is marked taken.
CREATE TABLE med_doses (
  id bigserial PRIMARY KEY,
  care_recipient_id uuid NOT NULL REFERENCES care_recipients(id) ON DELETE CASCADE,
  med_key text NOT NULL, slot text NOT NULL CHECK (slot IN ('morning','afternoon','evening','night','daily')),
  day date NOT NULL, taken_at timestamptz NOT NULL DEFAULT now(), marked_by uuid REFERENCES users(id),
  UNIQUE (care_recipient_id, med_key, slot, day)
);

CREATE TABLE game_plays (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game text NOT NULL CHECK (game IN ('memory','trivia','words')),
  score int NOT NULL CHECK (score >= 0), seconds int, day date NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_plays_user ON game_plays (user_id, day DESC);

CREATE TABLE community_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL, name text NOT NULL, icon text NOT NULL, about text NOT NULL, city text NOT NULL DEFAULT 'Pune',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE group_members (
  group_id uuid REFERENCES community_groups(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (group_id, user_id)
);
CREATE TABLE group_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES community_groups(id) ON DELETE CASCADE, user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL, status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','hidden')), reports int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX group_posts_feed ON group_posts (group_id, created_at DESC);
CREATE TABLE post_reports (
  post_id uuid REFERENCES group_posts(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id),
  reason text, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (post_id, user_id)
);

CREATE TABLE community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid REFERENCES community_groups(id) ON DELETE SET NULL,
  title text NOT NULL, about text, place text NOT NULL, city text NOT NULL DEFAULT 'Pune',
  starts_at timestamptz NOT NULL, capacity int, sample boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'live' CHECK (status IN ('live','cancelled')), created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE event_rsvps (
  event_id uuid REFERENCES community_events(id) ON DELETE CASCADE, user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (event_id, user_id)
);

-- A namaste is a greeting between seniors. Returned namastes make two people "known" to each other. No phone numbers are shared.
CREATE TABLE namastes (
  from_user uuid REFERENCES users(id) ON DELETE CASCADE, to_user uuid REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(), seen_at timestamptz, PRIMARY KEY (from_user, to_user)
);

CREATE TABLE safety_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL, user_id uuid NOT NULL REFERENCES users(id), care_recipient_id uuid REFERENCES care_recipients(id),
  kind text NOT NULL CHECK (kind IN ('cyber','crime')), category text NOT NULL, happened text, amount_paise bigint,
  details_enc text, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')), created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE callback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id), care_recipient_id uuid REFERENCES care_recipients(id),
  reason text NOT NULL CHECK (reason IN ('talk','doctor','lonely')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')), created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO community_groups (slug, name, icon, about) VALUES
  ('bhajan', 'Bhajan and music', '🎵', 'Share bhajans, old film songs and music you love.'),
  ('chess', 'Chess and cards', '♟', 'Find partners for chess, rummy and bridge.'),
  ('recipes', 'Recipe share', '🍲', 'Family recipes, festival food and healthy cooking.'),
  ('walkers', 'Morning walkers', '🌅', 'Walk together in your area. Meet at a park near you.'),
  ('yoga', 'Yoga and wellness', '🧘', 'Gentle yoga, pranayama and staying active.'),
  ('books', 'Books and stories', '📖', 'Books, poems and stories from your life.'),
  ('garden', 'Gardening', '🌱', 'Balcony plants, kitchen gardens and flowers.')
ON CONFLICT (slug) DO NOTHING;
