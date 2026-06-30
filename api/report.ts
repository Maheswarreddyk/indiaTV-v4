import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from './_lib/handler.js';
import { submitReport, type ReportReason } from './_lib/services.js';

const VALID_REASONS: ReportReason[] = ['spam', 'nudity', 'abuse', 'harassment', 'other'];

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    throw new AppError(405, 'Method not allowed');
  }

  const { reporterSessionId, reportedSessionId, reason, notes } = req.body ?? {};

  if (!reporterSessionId || !reportedSessionId || !reason) {
    throw new AppError(400, 'reporterSessionId, reportedSessionId, and reason are required');
  }

  if (!VALID_REASONS.includes(reason)) {
    throw new AppError(400, `Invalid reason. Must be one of: ${VALID_REASONS.join(', ')}`);
  }

  const report = await submitReport({
    reporterSessionId,
    reportedSessionId,
    reason,
    notes,
  });

  json(res, 201, { success: true, data: report });
});
