import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from './_lib/handler.js';
import { savePreferences } from './_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'POST') {
    throw new AppError(405, 'Method not allowed');
  }

  const { sessionId, sessionToken, preferences } = req.body ?? {};
  if (!sessionId || !sessionToken || !preferences) {
    throw new AppError(400, 'Missing required parameters');
  }

  await savePreferences(sessionId, sessionToken, preferences);

  json(res, 200, {
    success: true,
    message: 'Preferences updated successfully',
  });
});
