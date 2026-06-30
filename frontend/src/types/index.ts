export type SessionStatus = 'idle' | 'starting' | 'waiting' | 'matched' | 'connected' | 'ended';
export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'failed' | 'reconnecting';
export type ReportReason = 'spam' | 'nudity' | 'abuse' | 'harassment' | 'other';

export interface SessionData {
  sessionId: string;
  sessionToken: string;
  createdAt: string;
}

export interface StatsData {
  activeUsers: number;
  waitingUsers: number;
  matchesToday: number;
  onlineNow: number;
}

export interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

export interface MatchedPayload {
  matchId: string;
  partnerSessionId: string;
  isInitiator: boolean;
  iceServers: IceServerConfig[];
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
}

export interface ChatState {
  status: SessionStatus;
  connectionStatus: ConnectionStatus;
  partnerSessionId: string | null;
  matchId: string | null;
  isInitiator: boolean;
  isMuted: boolean;
  isCameraOff: boolean;
  isFullscreen: boolean;
  matchStartTime: number | null;
  queuePosition: number;
}

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam' },
  { value: 'nudity', label: 'Nudity' },
  { value: 'abuse', label: 'Abuse' },
  { value: 'harassment', label: 'Harassment' },
  { value: 'other', label: 'Other' },
];

export const STORAGE_KEYS = {
  SESSION_ID: 'indiatv_session_id',
  SESSION_TOKEN: 'indiatv_session_token',
} as const;
