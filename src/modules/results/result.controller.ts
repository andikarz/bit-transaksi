import { Request, Response, NextFunction } from 'express';
import { ResultService } from './result.service.js';

export class ResultController {
  private service: ResultService;

  constructor() {
    this.service = new ResultService();
  }

  // GET /api/v1/results/stats
  getFunnelStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const stats = await this.service.getFunnelStats({ id: req.user.id, role: req.user.role });
      res.status(200).json({
        data: stats,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  // GET /api/v1/results/list
  getResultsList = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const filter = {
        search: req.query.search as string | undefined,
        programId: req.query.programId as string | undefined,
        administrationStatus: req.query.administrationStatus as string | undefined,
        interviewStatus: req.query.interviewStatus as string | undefined,
        finalStatus: req.query.finalStatus as string | undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        limit: req.query.limit ? Number(req.query.limit) : 20
      };

      const result = await this.service.getResultsList(
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

  // GET /api/v1/results/export
  exportResults = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const filter = {
        search: req.query.search as string | undefined,
        programId: req.query.programId as string | undefined,
        administrationStatus: req.query.administrationStatus as string | undefined,
        interviewStatus: req.query.interviewStatus as string | undefined,
        finalStatus: req.query.finalStatus as string | undefined
      };

      const csvData = await this.service.generateCsvExport(
        { id: req.user.id, role: req.user.role },
        filter
      );

      const filename = `rekap_hasil_seleksi_${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.status(200).send(csvData);
    } catch (err) {
      next(err);
    }
  };
}
