import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiService } from '../services/api.js';
import type { SessionData, StatsData } from '../types/index.js';
import { STORAGE_KEYS } from '../types/index.js';

interface SessionContextValue {
  session: SessionData | null;
  stats: StatsData | null;
  isLoading: boolean;
  startSession: () => Promise<SessionData>;
  endSession: () => Promise<void>;
  refreshStats: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SessionData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshStats = useCallback(async () => {
    try {
      const data = await apiService.getStats();
      setStats(data);
    } catch {
      // Stats are non-critical; fail silently
    }
  }, []);

  useEffect(() => {
    refreshStats();
    const interval = setInterval(refreshStats, 30000);
    return () => clearInterval(interval);
  }, [refreshStats]);

  const startSession = useCallback(async (): Promise<SessionData> => {
    setIsLoading(true);
    try {
      const data = await apiService.startSession();
      setSession(data);
      localStorage.setItem(STORAGE_KEYS.SESSION_ID, data.sessionId);
      localStorage.setItem(STORAGE_KEYS.SESSION_TOKEN, data.sessionToken);
      return data;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const endSession = useCallback(async () => {
    if (!session) return;
    try {
      await apiService.endSession(session.sessionId);
    } finally {
      setSession(null);
      localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
      localStorage.removeItem(STORAGE_KEYS.SESSION_TOKEN);
    }
  }, [session]);

  const value = useMemo(
    () => ({
      session,
      stats,
      isLoading,
      startSession,
      endSession,
      refreshStats,
    }),
    [session, stats, isLoading, startSession, endSession, refreshStats]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession must be used within SessionProvider');
  }
  return context;
}
