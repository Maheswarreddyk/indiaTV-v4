import { v4 as uuidv4 } from 'uuid';
import {
  connectionLogRepository,
  feedbackRepository,
  matchRepository,
  metricsRepository,
  queueRepository,
  reportRepository,
  sessionRepository,
} from '../database/repositories/index.js';
import type {
  FeedbackRequest,
  ReportRequest,
  StartSessionRequest,
  StatsResponse,
  VisitorSession,
} from '../types/index.js';

export const sessionService = {
  async startSession(data: StartSessionRequest): Promise<VisitorSession> {
    const sessionToken = uuidv4();
    const session = await sessionRepository.create({
      sessionToken,
      country: data.country,
      browser: data.browser,
      device: data.device,
      platform: data.platform,
    });

    await connectionLogRepository.log(session.id, 'session_start', {
      country: data.country,
      browser: data.browser,
    });

    return session;
  },

  async endSession(sessionId: string): Promise<void> {
    await sessionRepository.endSession(sessionId);
    await connectionLogRepository.log(sessionId, 'session_end');
  },

  async getSession(sessionId: string): Promise<VisitorSession | null> {
    return sessionRepository.findById(sessionId);
  },
};

export const statsService = {
  async getStats(onlineNow: number): Promise<StatsResponse> {
    const [activeUsers, waitingUsers, matchesToday] = await Promise.all([
      sessionRepository.countActive(),
      queueRepository.countWaiting(),
      matchRepository.countToday(),
    ]);

    return {
      activeUsers,
      waitingUsers,
      matchesToday,
      onlineNow,
    };
  },

  async recordMetrics(onlineNow: number): Promise<void> {
    const stats = await this.getStats(onlineNow);
    await metricsRepository.record(stats.activeUsers, stats.waitingUsers, stats.matchesToday);
  },
};

export const reportService = {
  async submitReport(data: ReportRequest) {
    const report = await reportRepository.create({
      reporterSessionId: data.reporterSessionId,
      reportedSessionId: data.reportedSessionId,
      reason: data.reason,
      notes: data.notes,
    });

    await connectionLogRepository.log(data.reporterSessionId, 'report', {
      reportedSessionId: data.reportedSessionId,
      reason: data.reason,
    });

    return report;
  },
};

export const feedbackService = {
  async submitFeedback(data: FeedbackRequest) {
    return feedbackRepository.create({
      sessionId: data.sessionId,
      rating: data.rating,
      feedback: data.feedback,
    });
  },
};

export const cleanupService = {
  async runCleanup(queueStaleMs: number, matchStaleMs: number): Promise<void> {
    const queueCutoff = new Date(Date.now() - queueStaleMs).toISOString();
    const matchCutoff = new Date(Date.now() - matchStaleMs).toISOString();

    await Promise.all([
      queueRepository.expireStale(queueCutoff),
      matchRepository.expireStale(matchCutoff),
    ]);
  },
};
