import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from '../_lib/handler.js';
import { leaveQueue } from '../_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    throw new AppError(405, 'Method not allowed');
  }

  const { sessionId, sessionToken } = req.body ?? {};
  if (!sessionId || !sessionToken) {
    throw new AppError(400, 'sessionId and sessionToken are required');
  }

  try {
    await leaveQueue(sessionId, sessionToken);
    json(res, 200, { success: true, message: 'Left queue' });
  } catch {
    throw new AppError(401, 'Invalid session');
  }
});
