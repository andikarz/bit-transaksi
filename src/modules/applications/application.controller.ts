import { Request, Response, NextFunction } from 'express';
import { ApplicationService } from './application.service.js';
import {
  createDraftSchema,
  updatePersonalSchema,
  updateEducationSchema,
  updateConsentSchema
} from './application.validator.js';

export class ApplicationController {
  private service: ApplicationService;

  constructor() {
    this.service = new ApplicationService();
  }

  createDraft = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const body = createDraftSchema.parse(req.body);
      const idempotencyKey = req.headers['idempotency-key'] as string | undefined;

      const applicant = {
        id: req.user.id,
        nik: (req.user as any).nik || '',
        fullName: (req.user as any).fullName || '',
        email: (req.user as any).email || ''
      };

      const result = await this.service.createDraft(
        applicant,
        body,
        idempotencyKey,
        req.originalUrl || req.path
      );

      res.status(result.isCached ? 200 : 201).json({
        data: result.data,
        message: 'Draft permohonan berhasil disiapkan',
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getMyActive = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const activeDraft = await this.service.getMyActiveDraft(req.user.id);
      res.status(200).json({
        data: activeDraft,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  getDetail = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const detail = await this.service.getApplicationDetail(req.params.id as string, {
        id: req.user.id,
        role: req.user.role
      });

      res.status(200).json({
        data: detail,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  updatePersonal = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const body = updatePersonalSchema.parse(req.body);
      const result = await this.service.updatePersonalDetails(
        req.params.id as string,
        { id: req.user.id, role: req.user.role },
        body
      );

      res.status(200).json({
        message: 'Data diri berhasil disimpan',
        data: { version: result.version },
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  updateEducation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const body = updateEducationSchema.parse(req.body);
      const result = await this.service.updateEducationDetails(
        req.params.id as string,
        { id: req.user.id, role: req.user.role },
        body
      );

      res.status(200).json({
        message: 'Data pendidikan berhasil disimpan',
        data: { version: result.version },
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  updateConsent = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const body = updateConsentSchema.parse(req.body);
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1';

      const result = await this.service.updateConsent(
        req.params.id as string,
        { id: req.user.id, role: req.user.role },
        body,
        clientIp
      );

      res.status(200).json({
        message: 'Pernyataan persetujuan berhasil disimpan',
        data: { version: result.version },
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  createReservation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const { requirementTypeCode } = req.body;
      if (!requirementTypeCode) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'requirementTypeCode wajib diisi' } });
        return;
      }

      const reservation = await this.service.createDocumentReservation(
        req.params.id as string,
        { id: req.user.id, role: req.user.role },
        requirementTypeCode
      );

      res.status(201).json({
        message: 'Izin reservasi upload berhasil dibuat',
        data: reservation,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  validateReservation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const reservation = await this.service.validateDocumentReservation(req.params.id as string);
      res.status(200).json({
        data: reservation,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  commitReservation = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const result = await this.service.commitDocumentReservation(req.params.id as string, req.body);
      res.status(200).json({
        message: 'Document binding berhasil dikonfirmasi',
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  submit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const expectedVersion = req.body.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
      const result = await this.service.submitApplication(
        req.params.id as string,
        {
          id: req.user.id,
          role: req.user.role,
          nik: req.user.nik,
          fullName: req.user.fullName,
          email: req.user.email
        },
        expectedVersion
      );

      res.status(200).json({
        message: 'Pendaftaran beasiswa berhasil dikirim',
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  resubmit = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const expectedVersion = req.body.expectedVersion !== undefined ? Number(req.body.expectedVersion) : undefined;
      const result = await this.service.resubmitApplication(
        req.params.id as string,
        { id: req.user.id, role: req.user.role },
        expectedVersion
      );

      res.status(200).json({
        message: 'Perbaikan pendaftaran berhasil dikirim ulang',
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };

  confirm = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Tidak terautentikasi' } });
        return;
      }

      const { status, notes } = req.body;
      if (!['CONFIRMED', 'WITHDRAWN'].includes(status)) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Status harus CONFIRMED atau WITHDRAWN' } });
        return;
      }

      const result = await this.service.confirmApplication(
        req.params.id as string,
        { id: req.user.id, role: req.user.role },
        { status, notes }
      );

      res.status(200).json({
        message: status === 'CONFIRMED' ? 'Konfirmasi kehadiran berhasil dicatat' : 'Pengunduran diri berhasil dicatat',
        data: result,
        requestId: req.headers['x-request-id'] || 'unknown'
      });
    } catch (err) {
      next(err);
    }
  };
}
