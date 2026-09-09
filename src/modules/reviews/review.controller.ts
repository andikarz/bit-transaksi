import { Request, Response, NextFunction } from 'express';
import { ReviewService } from './review.service.js';
import { reviewDecisionSchema, reviewQueueQuerySchema } from './review.validator.js';

export class ReviewController {
  private service: ReviewService;

  constructor() {
    this.service = new ReviewService();
  }

  // GET /api/v1/reviews/queue
  getQueue = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const filter = reviewQueueQuerySchema.parse(req.query);
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

  // GET /api/v1/reviews/stats
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

  // POST /api/v1/reviews/:applicationId/lock
  lockApplication = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const result = await this.service.lockForReview(
        req.params.applicationId as string,
        { id: req.user.id, role: req.user.role }
      );

      res.status(200).json({
        message: 'Permohonan berhasil dikunci untuk verifikasi',
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/v1/reviews/:applicationId
  getApplicationForReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const result = await this.service.getApplicationForReview(
        req.params.applicationId as string,
        { id: req.user.id, role: req.user.role }
      );

      res.status(200).json({
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  // POST /api/v1/reviews/:applicationId/decision
  submitDecision = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const dto = reviewDecisionSchema.parse(req.body);
      const result = await this.service.submitDecision(
        req.params.applicationId as string,
        { id: req.user.id, role: req.user.role },
        dto
      );

      res.status(200).json({
        message: 'Keputusan verifikasi berhasil disimpan',
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  // DELETE /api/v1/reviews/:applicationId/lock
  unlockReview = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const result = await this.service.unlockReview(
        req.params.applicationId as string,
        { id: req.user.id, role: req.user.role }
      );

      res.status(200).json({
        message: 'Lock verifikasi berhasil dilepas',
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/v1/reviews/:applicationId/history
  getReviewHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const history = await this.service.getReviewHistory(
        req.params.applicationId as string,
        { id: req.user.id, role: req.user.role }
      );

      res.status(200).json({
        data: history,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };
}
