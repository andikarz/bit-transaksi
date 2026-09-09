import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import { healthRouter } from './modules/health/health.controller.js';
import { applicationRouter } from './modules/applications/application.routes.js';
import { internalRouter } from './modules/applications/internal.routes.js';
import { reviewRouter } from './modules/reviews/review.routes.js';
import { interviewRouter } from './modules/interviews/interview.routes.js';
import { resultRouter } from './modules/results/result.routes.js';
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

// Review / verification routes (Fase 6)
app.use('/api/v1/reviews', reviewRouter);

// Interview / scoring routes (Fase 7)
app.use('/api/v1/interviews', interviewRouter);

// Admin results & export routes (Fase 8)
app.use('/api/v1/results', resultRouter);
app.use('/api/v1/reports', resultRouter);

// Internal service-to-service routes (PRD §6)
app.use('/internal/v1/transaksi', internalRouter);

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
