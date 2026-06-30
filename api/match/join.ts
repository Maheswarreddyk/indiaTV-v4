import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from '../_lib/handler.js';
import { joinQueue } from '../_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    throw new AppError(405, 'Method not allowed');
  }

  const { sessionId, sessionToken } = req.body ?? {};
  if (!sessionId || !sessionToken) {
    throw new AppError(400, 'sessionId and sessionToken are required');
  }

  try {
    const result = await joinQueue(sessionId, sessionToken);
    json(res, 200, { success: true, data: result });
  } catch {
    throw new AppError(401, 'Invalid session');
  }
});
