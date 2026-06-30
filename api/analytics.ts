import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from './_lib/handler.js';
import { getAnalytics } from './_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    throw new AppError(405, 'Method not allowed');
  }

  // Admin access token check
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== 'Bearer admin-token') {
    throw new AppError(401, 'Unauthorized');
  }

  const analytics = await getAnalytics();

  json(res, 200, {
    success: true,
    data: analytics,
  });
});
