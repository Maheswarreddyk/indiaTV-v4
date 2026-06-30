import type { VercelRequest, VercelResponse } from '@vercel/node';
import { DatabaseError } from './supabase.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function json(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

export function handleError(res: VercelResponse, error: unknown): void {
  console.error('[API Error]', error);

  if (error instanceof AppError) {
    json(res, error.statusCode, { success: false, error: error.message });
    return;
  }

  if (error instanceof DatabaseError) {
    json(res, 503, {
      success: false,
      error: 'Database service unavailable. Please check Supabase configuration.',
    });
    return;
  }

  json(res, 500, { success: false, error: 'Internal server error' });
}

export function withHandler(
  fn: (req: VercelRequest, res: VercelResponse) => Promise<void>
) {
  return async (req: VercelRequest, res: VercelResponse): Promise<void> => {
    try {
      await fn(req, res);
    } catch (error) {
      handleError(res, error);
    }
  };
}
