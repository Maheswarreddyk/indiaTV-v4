import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from './_lib/handler.js';
import { submitChatMessage } from './_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    throw new AppError(405, 'Method not allowed');
  }

  const { sessionId, sessionToken, matchId, message } = req.body ?? {};
  if (!sessionId || !sessionToken || !matchId || !message) {
    throw new AppError(400, 'Missing required parameters');
  }

  const msg = await submitChatMessage(sessionId, sessionToken, matchId, message);

  json(res, 201, {
    success: true,
    data: msg,
  });
});
