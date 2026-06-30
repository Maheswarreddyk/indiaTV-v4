import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from './_lib/handler.js';
import { submitLike } from './_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    throw new AppError(405, 'Method not allowed');
  }

  const { sessionId, sessionToken, matchId } = req.body ?? {};
  if (!sessionId || !sessionToken || !matchId) {
    throw new AppError(400, 'Missing required parameters');
  }

  const result = await submitLike(sessionId, sessionToken, matchId);

  json(res, 200, {
    success: true,
    data: result,
  });
});
