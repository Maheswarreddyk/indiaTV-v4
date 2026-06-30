import http from 'http';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { Server as SocketServer } from 'socket.io';
import { config } from './config/index.js';
import { checkDatabaseConnection } from './database/client.js';
import { globalErrorHandler, notFoundHandler } from './middleware/errorHandler.js';
import routes from './routes/index.js';
import { setupSocketHandlers } from './socket/index.js';
import { cleanupService, statsService } from './services/index.js';
import { matchingEngine } from './services/matchingEngine.js';

const app = express();
const server = http.createServer(app);

const io = new SocketServer(server, {
  cors: {
    origin: config.frontendUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

app.set('trust proxy', 1);

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

app.use(compression());
app.use(cors({
  origin: config.frontendUrl,
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api', routes);

app.get('/', (_req, res) => {
  res.json({
    name: 'IndiaTV API',
    version: '1.0.0',
    status: 'running',
  });
});

app.use(notFoundHandler);
app.use(globalErrorHandler);

setupSocketHandlers(io);

let metricsInterval: ReturnType<typeof setInterval> | null = null;
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

async function startServer(): Promise<void> {
  const dbConnected = await checkDatabaseConnection();

  if (!dbConnected) {
    console.warn('[Warning] Database connection failed. Ensure Supabase credentials are configured.');
    console.warn('[Warning] API will start but database operations may fail.');
  } else {
    console.log('[Database] Connected to Supabase');
  }

  server.listen(config.port, () => {
    console.log(`[Server] IndiaTV backend running on port ${config.port}`);
    console.log(`[Server] Frontend URL: ${config.frontendUrl}`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
  });

  metricsInterval = setInterval(async () => {
    try {
      await statsService.recordMetrics(matchingEngine.getOnlineCount());
    } catch (error) {
      console.error('[Metrics] Failed to record:', error);
    }
  }, config.metricsIntervalMs);

  cleanupInterval = setInterval(async () => {
    try {
      await cleanupService.runCleanup(config.queueStaleMs, config.matchStaleMs);
    } catch (error) {
      console.error('[Cleanup] Failed:', error);
    }
  }, config.cleanupIntervalMs);
}

function gracefulShutdown(signal: string): void {
  console.log(`[Server] Received ${signal}. Shutting down gracefully...`);

  if (metricsInterval) clearInterval(metricsInterval);
  if (cleanupInterval) clearInterval(cleanupInterval);

  io.close(() => {
    server.close(() => {
      console.log('[Server] Shutdown complete');
      process.exit(0);
    });
  });

  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});

export { app, server, io };
