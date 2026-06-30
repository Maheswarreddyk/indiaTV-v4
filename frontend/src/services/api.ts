import axios from 'axios';
import type { ReportReason, SessionData, StatsData } from '../types/index.js';
import { getBrowserInfo, retry } from '../utils/index.js';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

const api = axios.create({
  baseURL: `${API_URL}/api`,
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.error ||
      error.message ||
      'An unexpected error occurred';
    return Promise.reject(new Error(message));
  }
);

export const apiService = {
  async getHealth(): Promise<{ status: string; database: string }> {
    const { data } = await api.get('/health');
    return data;
  },

  async getStats(): Promise<StatsData> {
    const { data } = await retry(async () => {
      const response = await api.get('/stats');
      return response;
    });
    return data.data;
  },

  async startSession(): Promise<SessionData> {
    const { browser, device, platform } = getBrowserInfo();

    const { data } = await retry(async () => {
      const response = await api.post('/start-session', {
        browser,
        device,
        platform,
      });
      return response;
    });

    return {
      sessionId: data.data.sessionId,
      sessionToken: data.data.sessionToken,
      createdAt: data.data.createdAt,
    };
  },

  async endSession(sessionId: string): Promise<void> {
    await api.post('/end-session', { sessionId });
  },

  async submitReport(
    reporterSessionId: string,
    reportedSessionId: string,
    reason: ReportReason,
    notes?: string
  ): Promise<void> {
    await api.post('/report', {
      reporterSessionId,
      reportedSessionId,
      reason,
      notes,
    });
  },

  async submitFeedback(
    sessionId: string,
    rating: number,
    feedback?: string
  ): Promise<void> {
    await api.post('/feedback', { sessionId, rating, feedback });
  },
};
