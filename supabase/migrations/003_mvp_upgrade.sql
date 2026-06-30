-- Migration 003: IndiaTV MVP Upgrade
-- Adds advanced preferences, weighted matching fields, likes, temporary messages, location/interest tables, etc.

-- 1. Create interests and locations tables for autocomplete
CREATE TABLE IF NOT EXISTS interests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL UNIQUE,
  category VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS locations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) NOT NULL,
  type VARCHAR(50) NOT NULL CHECK (type IN ('country', 'state', 'district', 'city')),
  country VARCHAR(100),
  state VARCHAR(100),
  district VARCHAR(100),
  city VARCHAR(100)
);

-- Seed interests
INSERT INTO interests (name, category) VALUES
  ('Gaming', 'General'), ('Movies', 'General'), ('Anime', 'General'), ('Music', 'General'),
  ('Travel', 'General'), ('Photography', 'General'), ('Fitness', 'General'), ('Programming', 'Tech'),
  ('Technology', 'Tech'), ('AI', 'Tech'), ('Business', 'Finance'), ('Finance', 'Finance'),
  ('Books', 'General'), ('Cooking', 'General'), ('Pets', 'General'), ('Football', 'Sports'),
  ('Cricket', 'Sports'), ('Chess', 'Sports'), ('Dating', 'Relationship'), ('Friendship', 'Relationship'),
  ('Cars', 'Lifestyle'), ('Motorcycles', 'Lifestyle'), ('Art', 'General'), ('History', 'General'),
  ('Psychology', 'General'), ('Nature', 'General'), ('Adventure', 'General'), ('Marvel', 'Entertainment'),
  ('DC', 'Entertainment'), ('One Piece', 'Anime'), ('Naruto', 'Anime'), ('Minecraft', 'Gaming'),
  ('Valorant', 'Gaming'), ('PUBG', 'Gaming'), ('BGMI', 'Gaming'), ('Free Fire', 'Gaming'),
  ('Coffee', 'General'), ('Tea', 'General'), ('Camping', 'General'), ('Exploration', 'General'),
  ('Programming Languages', 'Tech'), ('Open Source', 'Tech'), ('Cloud', 'Tech'), ('DevOps', 'Tech'),
  ('Cybersecurity', 'Tech')
ON CONFLICT (name) DO NOTHING;

-- Seed locations
INSERT INTO locations (name, type, country, state, district, city) VALUES
  ('India', 'country', 'India', NULL, NULL, NULL),
  ('United States', 'country', 'United States', NULL, NULL, NULL),
  ('Telangana', 'state', 'India', 'Telangana', NULL, NULL),
  ('Hyderabad', 'city', 'India', 'Telangana', 'Hyderabad', 'Hyderabad'),
  ('California', 'state', 'United States', 'California', NULL, NULL),
  ('Tokyo', 'city', 'Japan', 'Tokyo', NULL, 'Tokyo'),
  ('London', 'city', 'United Kingdom', 'London', NULL, 'London');

-- 2. Modify visitor_sessions to add preference & profile fields
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS gender VARCHAR(50);
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS looking_for VARCHAR(50)[];
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS languages VARCHAR(100)[];
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS country VARCHAR(100);
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS state VARCHAR(100);
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS district VARCHAR(100);
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS city VARCHAR(100);
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS interest_tags VARCHAR(100)[];
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS last_partner UUID REFERENCES visitor_sessions(id) ON DELETE SET NULL;
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS queue_entered_at TIMESTAMPTZ;
ALTER TABLE visitor_sessions ADD COLUMN IF NOT EXISTS last_activity TIMESTAMPTZ DEFAULT NOW();

-- 3. Modify waiting_queue to add matchmaking attributes
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS score_cache INTEGER DEFAULT 0;
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS preference_hash VARCHAR(255);
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS search_started TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE waiting_queue ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 0;

-- 4. Modify matches to add scoring and like attributes
ALTER TABLE matches ADD COLUMN IF NOT EXISTS match_score INTEGER DEFAULT 0;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS matched_reason TEXT;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS liked_by_a BOOLEAN DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS liked_by_b BOOLEAN DEFAULT FALSE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS chat_enabled BOOLEAN DEFAULT TRUE;
ALTER TABLE matches ADD COLUMN IF NOT EXISTS connection_quality VARCHAR(50);

-- 5. Create likes table
CREATE TABLE IF NOT EXISTS likes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Create temporary_messages table
CREATE TABLE IF NOT EXISTS temporary_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sender_session UUID NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

-- 7. Modify reports to add category, severity, and reviewed
ALTER TABLE reports ADD COLUMN IF NOT EXISTS category VARCHAR(100);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS severity VARCHAR(50);
ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed BOOLEAN DEFAULT FALSE;

-- 8. Row Level Security policies (matches initial migration pattern)
ALTER TABLE interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE temporary_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on interests" ON interests FOR SELECT USING (true);
CREATE POLICY "Allow public read on locations" ON locations FOR SELECT USING (true);

CREATE POLICY "Deny public access to likes" ON likes FOR ALL USING (false);
CREATE POLICY "Deny public access to temporary_messages" ON temporary_messages FOR ALL USING (false);

-- Grants
GRANT SELECT ON interests TO anon, authenticated;
GRANT SELECT ON locations TO anon, authenticated;
GRANT ALL ON interests TO service_role;
GRANT ALL ON locations TO service_role;
GRANT ALL ON likes TO service_role;
GRANT ALL ON temporary_messages TO service_role;
