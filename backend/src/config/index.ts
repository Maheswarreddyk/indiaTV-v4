import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

export const config = {
  port: parseInt(optionalEnv('PORT', '5000'), 10),
  frontendUrl: optionalEnv('FRONTEND_URL', 'http://localhost:5173'),
  supabaseUrl: requireEnv('SUPABASE_URL'),
  supabaseServiceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  nodeEnv: optionalEnv('NODE_ENV', 'development'),
  isProduction: optionalEnv('NODE_ENV', 'development') === 'production',
  stunServers: optionalEnv(
    'STUN_SERVERS',
    'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302,stun:stun2.l.google.com:19302'
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  queueStaleMs: 5 * 60 * 1000,
  matchStaleMs: 30 * 60 * 1000,
  metricsIntervalMs: 60 * 1000,
  cleanupIntervalMs: 30 * 1000,
};

export function getIceServers() {
  return config.stunServers.map((url) => ({ urls: url }));
}
