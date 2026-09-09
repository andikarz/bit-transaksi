import { ReviewRepository } from './review.repository.js';
import { ApplicationRepository } from '../applications/application.repository.js';
import {
  ReviewQueueFilter,
  ReviewStatsResponse,
  ReviewDecisionDto,
  ReviewRecord
} from './review.types.js';

export class ReviewService {
  private reviewRepo: ReviewRepository;
  private appRepo: ApplicationRepository;

  constructor() {
    this.reviewRepo = new ReviewRepository();
    this.appRepo = new ApplicationRepository();
  }

  // ── 1. Get Review Queue ───────────────────────────────────────
  async getQueue(
    user: { id: string; role: string },
    filter: ReviewQueueFilter
  ) {
    this.guardVerifikatorRole(user);
    return this.reviewRepo.getReviewQueue(filter);
  }

  // ── 2. Get Dashboard Statistics ───────────────────────────────
  async getStats(user: { id: string; role: string }): Promise<ReviewStatsResponse> {
    this.guardVerifikatorRole(user);
    return this.reviewRepo.getReviewStats();
  }

  // ── 3. Lock Application for Review ────────────────────────────
  async lockForReview(
    applicationId: string,
    user: { id: string; role: string }
  ): Promise<{ locked: boolean }> {
    this.guardVerifikatorRole(user);

    const success = await this.reviewRepo.lockApplication(applicationId, user.id);
    if (!success) {
      const err = new Error('Tidak dapat mengunci permohonan: sudah dikunci verifikator lain atau status tidak valid') as any;
      err.statusCode = 409;
      err.code = 'LOCK_FAILED';
      throw err;
    }

    return { locked: true };
  }

  // ── 4. Get Full Application Data for Review ───────────────────
  async getApplicationForReview(
    applicationId: string,
    user: { id: string; role: string }
  ) {
    this.guardVerifikatorRole(user);

    const detail = await this.appRepo.findDetailById(applicationId);
    if (!detail) {
      const err = new Error('Permohonan tidak ditemukan') as any;
      err.statusCode = 404;
      err.code = 'APPLICATION_NOT_FOUND';
      throw err;
    }

    // Get review history
    const reviewHistory = await this.reviewRepo.getReviewHistory(applicationId);

    return {
      application: detail,
      reviewHistory
    };
  }

  // ── 5. Submit Verification Decision ───────────────────────────
  async submitDecision(
    applicationId: string,
    user: { id: string; role: string },
    dto: ReviewDecisionDto
  ): Promise<{ reviewId: string; newVersion: number }> {
    this.guardVerifikatorRole(user);

    // Validate business rules based on decision
    if (dto.decision === 'PASSED') {
      // All mandatory checklist items must be valid
      const invalidItems = dto.checklist.filter(c => !c.isValid);
      if (invalidItems.length > 0) {
        const err = new Error('Keputusan LOLOS memerlukan semua item checklist bernilai Sesuai') as any;
        err.statusCode = 422;
        err.code = 'INVALID_CHECKLIST_FOR_PASS';
        throw err;
      }
    }

    if (dto.decision === 'REVISION') {
      // At least one item must be invalid
      const invalidItems = dto.checklist.filter(c => !c.isValid);
      if (invalidItems.length === 0) {
        const err = new Error('Keputusan REVISI memerlukan minimal 1 item checklist yang tidak sesuai') as any;
        err.statusCode = 422;
        err.code = 'NO_INVALID_ITEMS_FOR_REVISION';
        throw err;
      }
    }

    const result = await this.reviewRepo.createReview(
      applicationId,
      user.id,
      dto.decision,
      dto.generalNotes,
      dto.checklist,
      dto.expectedVersion
    );

    if (!result.success) {
      const err = new Error('Konflik versi: Data permohonan telah diubah oleh sesi lain') as any;
      err.statusCode = 409;
      err.code = 'CONCURRENCY_CONFLICT';
      throw err;
    }

    return {
      reviewId: result.reviewId!,
      newVersion: result.newVersion!
    };
  }

  // ── 6. Unlock Application (cancel review without decision) ────
  async unlockReview(
    applicationId: string,
    user: { id: string; role: string }
  ): Promise<{ unlocked: boolean }> {
    this.guardVerifikatorRole(user);

    const success = await this.reviewRepo.unlockApplication(applicationId, user.id);
    return { unlocked: success };
  }

  // ── 7. Get Review History ─────────────────────────────────────
  async getReviewHistory(
    applicationId: string,
    user: { id: string; role: string }
  ): Promise<ReviewRecord[]> {
    this.guardVerifikatorRole(user);
    return this.reviewRepo.getReviewHistory(applicationId);
  }

  // ── Guard: role VERIFIKATOR or ADMIN ──────────────────────────
  private guardVerifikatorRole(user: { id: string; role: string }): void {
    if (!['VERIFIKATOR', 'ADMIN'].includes(user.role)) {
      const err = new Error('Hanya peran VERIFIKATOR atau ADMIN yang dapat mengakses fitur ini') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
  }
}
