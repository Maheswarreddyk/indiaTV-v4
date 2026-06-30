import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from './_lib/handler.js';
import { endSession, validateSession } from './_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    throw new AppError(405, 'Method not allowed');
  }

  const { sessionId } = req.body ?? {};
  if (!sessionId || typeof sessionId !== 'string') {
    throw new AppError(400, 'sessionId is required');
  }

  const session = await validateSession(sessionId);
  if (!session) {
    throw new AppError(404, 'Session not found');
  }

  await endSession(sessionId);
  json(res, 200, { success: true, message: 'Session ended' });
});
