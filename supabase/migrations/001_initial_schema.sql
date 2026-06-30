-- IndiaTV Initial Schema Migration
-- Anonymous Random Video Chat Platform

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- ENUM TYPES
-- ==========================================

CREATE TYPE session_status AS ENUM ('active', 'waiting', 'matched', 'ended');
CREATE TYPE queue_status AS ENUM ('waiting', 'matched', 'left', 'expired');
CREATE TYPE match_end_reason AS ENUM ('next', 'leave', 'disconnect', 'report', 'timeout', 'error');
CREATE TYPE report_reason AS ENUM ('spam', 'nudity', 'abuse', 'harassment', 'other');
CREATE TYPE connection_event AS ENUM (
  'session_start',
  'session_end',
  'queue_join',
  'queue_leave',
  'match_start',
  'match_end',
  'disconnect',
  'reconnect',
  'next',
  'report',
  'error'
);

-- ==========================================
-- visitor_sessions
-- Stores anonymous visitor session metadata
-- ==========================================

CREATE TABLE visitor_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_token VARCHAR(255) NOT NULL UNIQUE,
  country VARCHAR(100),
  browser VARCHAR(100),
  device VARCHAR(100),
  platform VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  status session_status NOT NULL DEFAULT 'active'
);

COMMENT ON TABLE visitor_sessions IS 'Anonymous visitor sessions without authentication';
COMMENT ON COLUMN visitor_sessions.session_token IS 'Unique token stored in client localStorage';
COMMENT ON COLUMN visitor_sessions.status IS 'Current session lifecycle status';

CREATE INDEX idx_visitor_sessions_token ON visitor_sessions(session_token);
CREATE INDEX idx_visitor_sessions_status ON visitor_sessions(status);
CREATE INDEX idx_visitor_sessions_created_at ON visitor_sessions(created_at DESC);

-- ==========================================
-- waiting_queue
-- Users waiting to be matched
-- ==========================================

CREATE TABLE waiting_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status queue_status NOT NULL DEFAULT 'waiting'
);

COMMENT ON TABLE waiting_queue IS 'Queue of users waiting for random video chat match';
COMMENT ON COLUMN waiting_queue.status IS 'Queue entry status';

CREATE INDEX idx_waiting_queue_session ON waiting_queue(session_id);
CREATE INDEX idx_waiting_queue_status ON waiting_queue(status);
CREATE INDEX idx_waiting_queue_joined_at ON waiting_queue(joined_at);

-- Prevent duplicate active queue entries per session
CREATE UNIQUE INDEX idx_waiting_queue_active_session
  ON waiting_queue(session_id)
  WHERE status = 'waiting';

-- ==========================================
-- matches
-- Paired user connections
-- ==========================================

CREATE TABLE matches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_a UUID NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  user_b UUID NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  ended_reason match_end_reason,
  CONSTRAINT matches_different_users CHECK (user_a <> user_b)
);

COMMENT ON TABLE matches IS 'Video chat matches between two anonymous users';
COMMENT ON COLUMN matches.duration_seconds IS 'Match duration computed on end';

CREATE INDEX idx_matches_user_a ON matches(user_a);
CREATE INDEX idx_matches_user_b ON matches(user_b);
CREATE INDEX idx_matches_started_at ON matches(started_at DESC);
CREATE INDEX idx_matches_active ON matches(started_at) WHERE ended_at IS NULL;

-- ==========================================
-- reports
-- Abuse reports submitted by users
-- ==========================================

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_session UUID NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  reported_session UUID NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  reason report_reason NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT reports_different_users CHECK (reporter_session <> reported_session)
);

COMMENT ON TABLE reports IS 'User-submitted abuse reports';
COMMENT ON COLUMN reports.notes IS 'Optional additional details from reporter';

CREATE INDEX idx_reports_reporter ON reports(reporter_session);
CREATE INDEX idx_reports_reported ON reports(reported_session);
CREATE INDEX idx_reports_created_at ON reports(created_at DESC);

-- ==========================================
-- feedback
-- Post-chat feedback and ratings
-- ==========================================

CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES visitor_sessions(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE feedback IS 'Optional user feedback after chat sessions';
COMMENT ON COLUMN feedback.rating IS 'Rating from 1 to 5 stars';

CREATE INDEX idx_feedback_session ON feedback(session_id);
CREATE INDEX idx_feedback_created_at ON feedback(created_at DESC);

-- ==========================================
-- server_metrics
-- Periodic server health snapshots
-- ==========================================

CREATE TABLE server_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  active_users INTEGER NOT NULL DEFAULT 0,
  waiting_users INTEGER NOT NULL DEFAULT 0,
  matches_today INTEGER NOT NULL DEFAULT 0,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE server_metrics IS 'Periodic snapshots of server activity metrics';

CREATE INDEX idx_server_metrics_timestamp ON server_metrics(timestamp DESC);

-- ==========================================
-- connection_logs
-- Audit trail for connection events
-- ==========================================

CREATE TABLE connection_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID REFERENCES visitor_sessions(id) ON DELETE SET NULL,
  event connection_event NOT NULL,
  details JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE connection_logs IS 'Audit log of connection and matching events';
COMMENT ON COLUMN connection_logs.details IS 'Additional event metadata as JSON';

CREATE INDEX idx_connection_logs_session ON connection_logs(session_id);
CREATE INDEX idx_connection_logs_event ON connection_logs(event);
CREATE INDEX idx_connection_logs_timestamp ON connection_logs(timestamp DESC);

-- ==========================================
-- ROW LEVEL SECURITY
-- Backend uses service role (bypasses RLS)
-- Frontend publishable key has read-only stats access
-- ==========================================

ALTER TABLE visitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE waiting_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE connection_logs ENABLE ROW LEVEL SECURITY;

-- Deny all direct client access; backend service role bypasses RLS
CREATE POLICY "Deny public access to visitor_sessions"
  ON visitor_sessions FOR ALL USING (false);

CREATE POLICY "Deny public access to waiting_queue"
  ON waiting_queue FOR ALL USING (false);

CREATE POLICY "Deny public access to matches"
  ON matches FOR ALL USING (false);

CREATE POLICY "Deny public access to reports"
  ON reports FOR ALL USING (false);

CREATE POLICY "Deny public access to feedback"
  ON feedback FOR ALL USING (false);

CREATE POLICY "Allow public read on server_metrics"
  ON server_metrics FOR SELECT USING (true);

CREATE POLICY "Deny public write on server_metrics"
  ON server_metrics FOR INSERT WITH CHECK (false);

CREATE POLICY "Deny public access to connection_logs"
  ON connection_logs FOR ALL USING (false);

-- ==========================================
-- SEED DATA (optional baseline metrics row)
-- ==========================================

INSERT INTO server_metrics (active_users, waiting_users, matches_today)
VALUES (0, 0, 0);

-- ==========================================
-- GRANTS FOR SUPABASE ROLES
-- service_role bypasses RLS but still needs table privileges
-- ==========================================

GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT SELECT ON server_metrics TO anon, authenticated;

GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

GRANT ALL ON ALL ROUTINES IN SCHEMA public TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO postgres, service_role;
