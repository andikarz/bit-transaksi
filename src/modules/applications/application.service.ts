import crypto from 'node:crypto';
import { ApplicationRepository } from './application.repository.js';
import {
  CreateDraftDto,
  UpdatePersonalDto,
  UpdateEducationDto,
  UpdateConsentDto,
  ApplicationDetailResponse
} from './application.types.js';
import { env } from '../../config/env.js';

export class ApplicationService {
  private repo: ApplicationRepository;

  constructor() {
    this.repo = new ApplicationRepository();
  }

  // ── Helper: Fetch frozen program snapshot from Master service ──
  private async fetchProgramSnapshot(programId: string): Promise<any> {
    let programSnapshot: any = {
      programId,
      code: 'PROG-DEFAULT',
      name: 'Program Beasiswa Pelatihan',
      version: 1,
      quota: 100,
      requirements: []
    };

    try {
      const gatewayUrl = env.INTERNAL_GATEWAY_URL || 'http://api-gateway:9080';
      const response = await fetch(`${gatewayUrl}/internal/v1/master/program-snapshots/${programId}`, {
        headers: {
          'x-caller-service': 'bit-transaksi'
        }
      });
      if (response.ok) {
        programSnapshot = await response.json();
      }
    } catch (err) {
      console.warn('[bit-transaksi] Failed to fetch program snapshot:', err);
    }
    return programSnapshot;
  }

  // ── 1. Create or Resume Application Draft (AT-04) ────────────
  async createDraft(
    applicant: { id: string; nik: string; fullName: string; email: string },
    dto: CreateDraftDto,
    idempotencyKey?: string,
    routePath = '/api/v1/applications'
  ): Promise<{ data: ApplicationDetailResponse; isCached?: boolean }> {
    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(dto))
      .digest('hex');

    // AT-04: Check existing idempotency record
    if (idempotencyKey) {
      const cached = await this.repo.checkIdempotency(idempotencyKey, applicant.id);
      if (cached) {
        return { data: cached.body.data || cached.body, isCached: true };
      }
    }

    // Check if applicant already has an existing application (draft or submitted)
    const existingApp = await this.repo.findLatestApplication(applicant.id);
    if (existingApp) {
      // If application is still DRAFT and requested programId differs, switch draft to the new program
      if (existingApp.submission_status === 'DRAFT' && dto.programId && existingApp.program_id !== dto.programId) {
        const newSnapshot = await this.fetchProgramSnapshot(dto.programId);
        await this.repo.updateDraftProgram(existingApp.id, dto.programId, newSnapshot);
      }

      const detail = await this.repo.findDetailById(existingApp.id);
      if (detail) {
        if (idempotencyKey) {
          await this.repo.saveIdempotency(
            idempotencyKey,
            applicant.id,
            routePath,
            requestHash,
            200,
            { data: detail }
          );
        }
        return { data: detail };
      }
    }

    // Fetch frozen program snapshot from Master via Gateway internal :9080
    const programSnapshot = await this.fetchProgramSnapshot(dto.programId);

    const applicationId = await this.repo.createDraft(applicant, dto.programId, programSnapshot);
    const detail = await this.repo.findDetailById(applicationId);

    if (!detail) {
      throw new Error('Gagal memuat rincian draft permohonan yang baru dibuat');
    }

    // Cache idempotency response (AT-04)
    if (idempotencyKey) {
      await this.repo.saveIdempotency(
        idempotencyKey,
        applicant.id,
        routePath,
        requestHash,
        201,
        { data: detail }
      );
    }

    return { data: detail };
  }

  // ── Switch/Change Program for Draft Application ──────────────
  async changeDraftProgram(
    applicationId: string,
    user: { id: string; role: string },
    programId: string
  ): Promise<ApplicationDetailResponse> {
    const detail = await this.repo.findDetailById(applicationId);
    if (!detail) {
      const err = new Error('Permohonan beasiswa tidak ditemukan') as any;
      err.statusCode = 404;
      err.code = 'APPLICATION_NOT_FOUND';
      throw err;
    }

    if (detail.applicantId !== user.id && user.role !== 'ADMIN') {
      const err = new Error('Anda tidak berhak mengubah permohonan ini') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (detail.submissionStatus !== 'DRAFT') {
      const err = new Error('Pilihan program beasiswa tidak dapat diubah karena berkas pendaftaran telah dikirimkan') as any;
      err.statusCode = 400;
      err.code = 'APPLICATION_ALREADY_SUBMITTED';
      throw err;
    }

    const programSnapshot = await this.fetchProgramSnapshot(programId);
    await this.repo.updateDraftProgram(applicationId, programId, programSnapshot);

    const updated = await this.repo.findDetailById(applicationId);
    if (!updated) {
      throw new Error('Gagal memuat rincian permohonan setelah pembaruan program');
    }
    return updated;
  }

  // ── 2. Get Active or Submitted Application for Current Applicant ──
  async getMyActiveDraft(applicantId: string): Promise<ApplicationDetailResponse | null> {
    const app = await this.repo.findLatestApplication(applicantId);
    if (!app) return null;
    return this.repo.findDetailById(app.id);
  }

  // ── 3. Get Application Detail with Access Guard ──────────────
  async getApplicationDetail(
    applicationId: string,
    user: { id: string; role: string }
  ): Promise<ApplicationDetailResponse> {
    const detail = await this.repo.findDetailById(applicationId);
    if (!detail) {
      const err = new Error('Permohonan beasiswa tidak ditemukan') as any;
      err.statusCode = 404;
      err.code = 'APPLICATION_NOT_FOUND';
      throw err;
    }

    // Security: Only owner or internal staff can view detail
    const isStaff = ['ADMIN', 'VERIFIKATOR', 'LEMBAGA_SELEKSI'].includes(user.role);
    if (!isStaff && detail.applicantId !== user.id) {
      const err = new Error('Anda tidak berhak mengakses permohonan ini') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    return detail;
  }

  // ── 4. Update Personal Details (AT-05) ────────────────────────
  async updatePersonalDetails(
    applicationId: string,
    user: { id: string; role: string },
    dto: UpdatePersonalDto
  ): Promise<{ version: number }> {
    await this.verifyDraftOwnership(applicationId, user.id);

    const result = await this.repo.updatePersonalDetails(applicationId, dto);
    if (!result.success) {
      const err = new Error('Konflik versi: Data permohonan telah diubah oleh sesi lain') as any;
      err.statusCode = 409;
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    return { version: result.newVersion! };
  }

  // ── 5. Update Education Details (AT-05) ───────────────────────
  async updateEducationDetails(
    applicationId: string,
    user: { id: string; role: string },
    dto: UpdateEducationDto
  ): Promise<{ version: number }> {
    await this.verifyDraftOwnership(applicationId, user.id);

    const result = await this.repo.updateEducationDetails(applicationId, dto);
    if (!result.success) {
      const err = new Error('Konflik versi: Data permohonan telah diubah oleh sesi lain') as any;
      err.statusCode = 409;
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    return { version: result.newVersion! };
  }

  // ── 6. Update Consent & Statement (AT-05) ─────────────────────
  async updateConsent(
    applicationId: string,
    user: { id: string; role: string },
    dto: UpdateConsentDto,
    clientIp: string
  ): Promise<{ version: number }> {
    await this.verifyDraftOwnership(applicationId, user.id);

    const result = await this.repo.updateConsent(applicationId, dto, clientIp);
    if (!result.success) {
      const err = new Error('Konflik versi: Data permohonan telah diubah oleh sesi lain') as any;
      err.statusCode = 409;
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    return { version: result.newVersion! };
  }

  // ── 7. Create Document Reservation (Fase 5) ──────────────────
  async createDocumentReservation(
    applicationId: string,
    user: { id: string; role: string },
    reqCode: string
  ): Promise<any> {
    await this.verifyDraftOwnership(applicationId, user.id);
    const detail = await this.repo.findDetailById(applicationId);
    if (!detail) {
      throw new Error('Permohonan tidak ditemukan');
    }

    const snapshot = detail.programSnapshot;
    const reqs: any[] = snapshot.requirements || [];
    const matched = reqs.find((r: any) => (r.requirementTypeCode || r.code || r.requirement_type_code) === reqCode);

    const reqName = matched ? (matched.name || reqCode) : reqCode;
    const allowedTypes = matched && matched.allowedTypes ? matched.allowedTypes : ['application/pdf', 'image/jpeg', 'image/png'];
    const maxBytes = matched && matched.maxBytes ? matched.maxBytes : 2097152;

    return this.repo.createDocumentReservation(
      applicationId,
      reqCode,
      reqName,
      allowedTypes,
      maxBytes,
      detail.version
    );
  }

  // ── 8. Validate Document Reservation (Internal) ──────────────
  async validateDocumentReservation(reservationId: string): Promise<any> {
    const res = await this.repo.findReservationById(reservationId);
    if (!res) {
      const err = new Error('Reservation tidak ditemukan') as any;
      err.statusCode = 404;
      err.code = 'RESERVATION_NOT_FOUND';
      throw err;
    }

    if (res.isExpired) {
      const err = new Error('Reservation telah kedaluwarsa') as any;
      err.statusCode = 410;
      err.code = 'RESERVATION_EXPIRED';
      throw err;
    }

    if (res.status !== 'RESERVED') {
      const err = new Error(`Reservation telah digunakan (status: ${res.status})`) as any;
      err.statusCode = 409;
      err.code = 'RESERVATION_ALREADY_USED';
      throw err;
    }

    return res;
  }

  // ── 9. Commit Document Reservation (Internal) ────────────────
  async commitDocumentReservation(reservationId: string, docData: any): Promise<any> {
    return this.repo.commitReservation(reservationId, docData);
  }

  // ── 10. Submit Application (AT-08) ───────────────────────────
  async submitApplication(
    applicationId: string,
    user: { id: string; role: string; nik?: string; fullName?: string; email?: string },
    expectedVersion?: number
  ): Promise<{ registrationCode: string; version: number }> {
    await this.verifyDraftOwnership(applicationId, user.id);

    const result = await this.repo.submitApplication(applicationId, expectedVersion, user);
    if (!result.success) {
      const err = new Error('Konflik versi: Data permohonan telah diubah oleh sesi lain') as any;
      err.statusCode = 409;
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    return {
      registrationCode: result.registrationCode!,
      version: result.newVersion!
    };
  }

  // ── 11. Resubmit Application (Fase 6) ────────────────────────
  async resubmitApplication(
    applicationId: string,
    user: { id: string; role: string },
    expectedVersion?: number
  ): Promise<{ registrationCode: string; version: number }> {
    const app = await this.repo.findDetailById(applicationId);
    if (!app) {
      const err = new Error('Permohonan tidak ditemukan') as any;
      err.statusCode = 404;
      err.code = 'APPLICATION_NOT_FOUND';
      throw err;
    }
    if (app.applicantId !== user.id) {
      const err = new Error('Anda bukan pemilik permohonan ini') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
    if (app.submissionStatus !== 'REVISION_REQUIRED') {
      const err = new Error('Hanya permohonan berstatus REVISION_REQUIRED yang dapat dikirim ulang') as any;
      err.statusCode = 400;
      err.code = 'INVALID_SUBMISSION_STATUS';
      throw err;
    }

    const result = await this.repo.resubmitApplication(applicationId, expectedVersion);
    if (!result.success) {
      const err = new Error('Konflik versi: Data permohonan telah diubah oleh sesi lain') as any;
      err.statusCode = 409;
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    return {
      registrationCode: result.registrationCode!,
      version: result.newVersion!
    };
  }

  // ── 12. Confirm Attendance / Daftar Ulang (Fase 6 / FE-06) ──
  async confirmApplication(
    applicationId: string,
    user: { id: string; role: string },
    dto: { status: 'CONFIRMED' | 'WITHDRAWN'; notes?: string }
  ): Promise<{ status: string; confirmedAt: string }> {
    const app = await this.repo.findDetailById(applicationId);
    if (!app) {
      const err = new Error('Permohonan tidak ditemukan') as any;
      err.statusCode = 404;
      err.code = 'APPLICATION_NOT_FOUND';
      throw err;
    }

    if (app.applicantId !== user.id) {
      const err = new Error('Anda bukan pemilik permohonan ini') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (app.finalStatus !== 'ACCEPTED' && app.interviewStatus !== 'PASSED') {
      const err = new Error('Konfirmasi daftar ulang hanya dapat dilakukan oleh peserta yang telah dinyatakan LULUS / DITERIMA') as any;
      err.statusCode = 400;
      err.code = 'NOT_ELIGIBLE_FOR_CONFIRMATION';
      throw err;
    }

    return this.repo.saveConfirmation(applicationId, dto.status, dto.notes);
  }

  // Guard: ensures application is in DRAFT/REVISION and belongs to user
  private async verifyDraftOwnership(applicationId: string, userId: string): Promise<void> {
    const app = await this.repo.findDetailById(applicationId);
    if (!app) {
      const err = new Error('Permohonan tidak ditemukan') as any;
      err.statusCode = 404;
      err.code = 'APPLICATION_NOT_FOUND';
      throw err;
    }

    if (app.applicantId !== userId) {
      const err = new Error('Anda bukan pemilik permohonan ini') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }

    if (!['DRAFT', 'REVISION_REQUIRED'].includes(app.submissionStatus)) {
      const err = new Error('Permohonan yang telah dikirim tidak dapat diubah kembali') as any;
      err.statusCode = 400;
      err.code = 'APPLICATION_LOCKED';
      throw err;
    }
  }
}
