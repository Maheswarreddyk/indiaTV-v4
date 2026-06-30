export type SessionStatus = 'active' | 'waiting' | 'matched' | 'ended';
export type QueueStatus = 'waiting' | 'matched' | 'left' | 'expired';
export type MatchEndReason = 'next' | 'leave' | 'disconnect' | 'report' | 'timeout' | 'error';
export type ReportReason = 'spam' | 'nudity' | 'abuse' | 'harassment' | 'other';
export type ConnectionEvent =
  | 'session_start'
  | 'session_end'
  | 'queue_join'
  | 'queue_leave'
  | 'match_start'
  | 'match_end'
  | 'disconnect'
  | 'reconnect'
  | 'next'
  | 'report'
  | 'error';

export interface VisitorSession {
  id: string;
  session_token: string;
  country: string | null;
  browser: string | null;
  device: string | null;
  platform: string | null;
  created_at: string;
  ended_at: string | null;
  status: SessionStatus;
}

export interface WaitingQueueEntry {
  id: string;
  session_id: string;
  joined_at: string;
  status: QueueStatus;
}

export interface Match {
  id: string;
  user_a: string;
  user_b: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
  ended_reason: MatchEndReason | null;
}

export interface Report {
  id: string;
  reporter_session: string;
  reported_session: string;
  reason: ReportReason;
  notes: string | null;
  created_at: string;
}

export interface Feedback {
  id: string;
  session_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
}

export interface ServerMetrics {
  id: string;
  active_users: number;
  waiting_users: number;
  matches_today: number;
  timestamp: string;
}

export interface ConnectionLog {
  id: string;
  session_id: string | null;
  event: ConnectionEvent;
  details: Record<string, unknown>;
  timestamp: string;
}

export interface StartSessionRequest {
  country?: string;
  browser?: string;
  device?: string;
  platform?: string;
}

export interface ReportRequest {
  reporterSessionId: string;
  reportedSessionId: string;
  reason: ReportReason;
  notes?: string;
}

export interface FeedbackRequest {
  sessionId: string;
  rating: number;
  feedback?: string;
}

export interface StatsResponse {
  activeUsers: number;
  waitingUsers: number;
  matchesToday: number;
  onlineNow: number;
}

export interface ConnectedUser {
  socketId: string;
  sessionId: string;
  sessionToken: string;
  joinedQueueAt?: Date;
  currentMatchId?: string;
  partnerSessionId?: string;
  lastPartnerSessionId?: string;
  gender?: string;
  lookingFor?: string[];
  languages?: string[];
  country?: string;
  state?: string;
  district?: string;
  city?: string;
  interestTags?: string[];
  queueEnteredAt?: Date;
}

export interface MatchPair {
  matchId: string;
  userA: ConnectedUser;
  userB: ConnectedUser;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}
