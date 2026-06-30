import type { VercelRequest, VercelResponse } from '@vercel/node';
import { AppError, json, withHandler } from './_lib/handler.js';
import { getInterests } from './_lib/services.js';

export default withHandler(async (req: VercelRequest, res: VercelResponse) => {
  if (req.method !== 'GET') {
    throw new AppError(405, 'Method not allowed');
  }

  const query = req.query.q as string | undefined;
  if (!query) {
    return json(res, 200, { success: true, data: [] });
  }

  const interests = await getInterests(query);

  json(res, 200, {
    success: true,
    data: interests,
  });
});
