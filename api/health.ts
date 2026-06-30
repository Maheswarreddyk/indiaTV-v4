import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkDatabaseConnection } from './_lib/supabase.js';
import { json, withHandler } from './_lib/handler.js';

export default withHandler(async (_req: VercelRequest, res: VercelResponse) => {
  const dbConnected = await checkDatabaseConnection();

  json(res, 200, {
    success: true,
    status: dbConnected ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
  });
});
