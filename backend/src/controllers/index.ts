import type { Request, Response } from 'express';
import { checkDatabaseConnection } from '../database/client.js';
import { matchingEngine } from '../services/matchingEngine.js';
import {
  feedbackService,
  reportService,
  sessionService,
  statsService,
} from '../services/index.js';
import { AppError, asyncHandler } from '../middleware/errorHandler.js';
import type { ReportReason } from '../types/index.js';

const VALID_REPORT_REASONS: ReportReason[] = ['spam', 'nudity', 'abuse', 'harassment', 'other'];

export const healthController = {
  getHealth: asyncHandler(async (_req: Request, res: Response) => {
    const dbConnected = await checkDatabaseConnection();

    res.json({
      success: true,
      status: dbConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      uptime: process.uptime(),
    });
  }),
};

export const statsController = {
  getStats: asyncHandler(async (_req: Request, res: Response) => {
    const stats = await statsService.getStats(matchingEngine.getOnlineCount());
    res.json({ success: true, data: stats });
  }),
};

export const sessionController = {
  startSession: asyncHandler(async (req: Request, res: Response) => {
    const { country, browser, device, platform } = req.body ?? {};

    const session = await sessionService.startSession({
      country,
      browser,
      device,
      platform,
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId: session.id,
        sessionToken: session.session_token,
        createdAt: session.created_at,
      },
    });
  }),

  endSession: asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.body ?? {};

    if (!sessionId || typeof sessionId !== 'string') {
      throw new AppError(400, 'sessionId is required');
    }

    const session = await sessionService.getSession(sessionId);
    if (!session) {
      throw new AppError(404, 'Session not found');
    }

    await sessionService.endSession(sessionId);

    res.json({ success: true, message: 'Session ended' });
  }),
};

export const reportController = {
  submitReport: asyncHandler(async (req: Request, res: Response) => {
    const { reporterSessionId, reportedSessionId, reason, notes } = req.body ?? {};

    if (!reporterSessionId || !reportedSessionId || !reason) {
      throw new AppError(400, 'reporterSessionId, reportedSessionId, and reason are required');
    }

    if (!VALID_REPORT_REASONS.includes(reason)) {
      throw new AppError(400, `Invalid reason. Must be one of: ${VALID_REPORT_REASONS.join(', ')}`);
    }

    const report = await reportService.submitReport({
      reporterSessionId,
      reportedSessionId,
      reason,
      notes,
    });

    res.status(201).json({ success: true, data: report });
  }),
};

export const feedbackController = {
  submitFeedback: asyncHandler(async (req: Request, res: Response) => {
    const { sessionId, rating, feedback } = req.body ?? {};

    if (!sessionId || typeof rating !== 'number') {
      throw new AppError(400, 'sessionId and rating are required');
    }

    if (rating < 1 || rating > 5) {
      throw new AppError(400, 'Rating must be between 1 and 5');
    }

    const entry = await feedbackService.submitFeedback({ sessionId, rating, feedback });

    res.status(201).json({ success: true, data: entry });
  }),
};
