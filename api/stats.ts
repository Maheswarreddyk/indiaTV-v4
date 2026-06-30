import type { VercelRequest, VercelResponse } from '@vercel/node';
import { json, withHandler } from './_lib/handler.js';
import { getStats } from './_lib/services.js';

export default withHandler(async (_req: VercelRequest, res: VercelResponse) => {
  const stats = await getStats();
  json(res, 200, { success: true, data: stats });
});
