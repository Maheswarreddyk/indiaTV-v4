import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from '../_lib/handler.js';
import { notifyPartnerLeft } from '../_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    throw new AppError(405, 'Method not allowed');
  }

  const { sessionId, sessionToken, reason } = req.body ?? {};
  if (!sessionId || !sessionToken) {
    throw new AppError(400, 'sessionId and sessionToken are required');
  }

  const validReasons = ['leave', 'disconnect', 'report'] as const;
  const endReason = validReasons.includes(reason) ? reason : 'disconnect';

  try {
    await notifyPartnerLeft(sessionId, sessionToken, endReason);
    json(res, 200, { success: true, message: 'Partner notified' });
  } catch {
    throw new AppError(401, 'Invalid session');
  }
});
