import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { healthRouter } from './modules/health/health.controller.js';
import { applicationRouter } from './modules/applications/application.routes.js';
import { errorHandler } from './middleware/error-handler.js';
import { requestId } from './middleware/request-id.js';
import { closePool } from './db/pool.js';

const app = express();

app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '256kb' }));
app.use(cookieParser());
app.use(requestId);

// Health check
app.use('/health', healthRouter);

// Application wizard & management routes
app.use('/api/v1/applications', applicationRouter);

// Error handler
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`[bit-transaksi] listening on :${env.PORT} (${env.NODE_ENV})`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[bit-transaksi] SIGTERM received, shutting down...');
  server.close(async () => {
    await closePool();
    process.exit(0);
  });
});

export { app };
