import { Request, Response, NextFunction } from 'express';
import { InterviewService } from './interview.service.js';
import { interviewScoreSchema, interviewQueueQuerySchema } from './interview.validator.js';

export class InterviewController {
  private service: InterviewService;

  constructor() {
    this.service = new InterviewService();
  }

  // GET /api/v1/interviews/queue
  getQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const filter = interviewQueueQuerySchema.parse(req.query);
      const result = await this.service.getQueue(
        { id: req.user.id, role: req.user.role },
        filter
      );

      res.status(200).json({
        data: result.items,
        meta: { total: result.total, page: filter.page, limit: filter.limit },
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/v1/interviews/stats
  getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const stats = await this.service.getStats({ id: req.user.id, role: req.user.role });
      res.status(200).json({
        data: stats,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/v1/interviews/:applicationId
  getCandidateDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const detail = await this.service.getCandidateDetail(
        req.params.applicationId as string,
        { id: req.user.id, role: req.user.role }
      );

      res.status(200).json({
        data: detail,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  // POST /api/v1/interviews/:applicationId/score
  submitScore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const dto = interviewScoreSchema.parse(req.body);
      const result = await this.service.submitScore(
        req.params.applicationId as string,
        { id: req.user.id, role: req.user.role },
        dto
      );

      res.status(200).json({
        message: 'Nilai dan keputusan hasil wawancara berhasil disimpan',
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };
}
