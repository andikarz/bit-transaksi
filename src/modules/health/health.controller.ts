import { Router, Request, Response } from 'express';
import { checkDatabaseHealth } from '../../db/pool.js';

export const healthRouter = Router();

healthRouter.get('/live', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

healthRouter.get('/ready', async (_req: Request, res: Response) => {
  const dbHealthy = await checkDatabaseHealth();
  if (dbHealthy) {
    res.json({ status: 'ok', checks: { database: 'up' } });
  } else {
    res.status(503).json({ status: 'unhealthy', checks: { database: 'down' } });
  }
});
