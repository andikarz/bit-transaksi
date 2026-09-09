import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../db/pool.js';
import { withTransaction } from '../../db/transaction.js';
import {
  ReviewQueueItem,
  ReviewQueueFilter,
  ReviewStatsResponse,
  ReviewDecision,
  ReviewChecklistItemDto,
  ReviewRecord,
  ReviewItemRecord
} from './review.types.js';

export class ReviewRepository {

  // ── 1. Get Review Queue (Applications awaiting verification) ───
  async getReviewQueue(filter: ReviewQueueFilter): Promise<{ items: ReviewQueueItem[]; total: number }> {
    const pool = getPool();
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = `a.submission_status IN ('SUBMITTED', 'RESUBMITTED') AND a.administration_status = 'PENDING'`;
    const params: any[] = [];

    if (filter.search) {
      whereClause += ` AND (p.full_name LIKE ? OR p.nik LIKE ?)`;
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Count total
    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM applications a
       JOIN personal_details p ON p.application_id = a.id
       WHERE ${whereClause}`,
      params
    );
    const total = countRows[0].total as number;

    // Fetch paginated items
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         a.id, a.registration_code, a.applicant_id, a.program_id,
         a.submission_status, a.administration_status, a.submitted_at,
         a.program_snapshot, a.locked_by, a.locked_at,
         p.nik, p.full_name
       FROM applications a
       JOIN personal_details p ON p.application_id = a.id
       WHERE ${whereClause}
       ORDER BY a.submitted_at ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items: ReviewQueueItem[] = rows.map((r: any) => {
      const snapshot = typeof r.program_snapshot === 'string'
        ? JSON.parse(r.program_snapshot)
        : r.program_snapshot;
      return {
        id: r.id,
        registrationCode: r.registration_code,
        applicantId: r.applicant_id,
        nik: r.nik || '',
        fullName: r.full_name || '',
        programName: snapshot?.name || 'Program Beasiswa',
        programId: r.program_id,
        submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : '',
        submissionStatus: r.submission_status,
        administrationStatus: r.administration_status,
        lockedBy: r.locked_by || null,
        lockedAt: r.locked_at ? new Date(r.locked_at).toISOString() : null
      };
    });

    return { items, total };
  }

  // ── 2. Get Statistics for Dashboard Cards ──────────────────────
  async getReviewStats(): Promise<ReviewStatsResponse> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN administration_status = 'PENDING' AND submission_status IN ('SUBMITTED','RESUBMITTED') THEN 1 ELSE 0 END) as pending,
         SUM(CASE WHEN administration_status = 'REVISION' THEN 1 ELSE 0 END) as revision,
         SUM(CASE WHEN administration_status = 'PASSED' THEN 1 ELSE 0 END) as passed,
         SUM(CASE WHEN administration_status = 'REJECTED' THEN 1 ELSE 0 END) as rejected
       FROM applications
       WHERE submission_status != 'DRAFT'`
    );

    const r = rows[0];
    return {
      pending: Number(r.pending) || 0,
      revision: Number(r.revision) || 0,
      passed: Number(r.passed) || 0,
      rejected: Number(r.rejected) || 0
    };
  }

  // ── 3. Atomic Lock Application for Verifikator ─────────────────
  async lockApplication(applicationId: string, verifierId: string): Promise<boolean> {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE applications
       SET locked_by = ?, locked_at = NOW()
       WHERE id = ?
         AND administration_status = 'PENDING'
         AND submission_status IN ('SUBMITTED', 'RESUBMITTED')
         AND (locked_by IS NULL OR locked_by = ? OR locked_at < DATE_SUB(NOW(), INTERVAL 30 MINUTE))`,
      [verifierId, applicationId, verifierId]
    );

    return result.affectedRows > 0;
  }

  // ── 4. Unlock Application ─────────────────────────────────────
  async unlockApplication(applicationId: string, verifierId: string): Promise<boolean> {
    const pool = getPool();
    const [result] = await pool.execute<ResultSetHeader>(
      `UPDATE applications
       SET locked_by = NULL, locked_at = NULL
       WHERE id = ? AND locked_by = ?`,
      [applicationId, verifierId]
    );

    return result.affectedRows > 0;
  }

  // ── 5. Create Review Decision (Atomic Transaction) ─────────────
  async createReview(
    applicationId: string,
    verifierId: string,
    decision: ReviewDecision,
    generalNotes: string,
    checklist: ReviewChecklistItemDto[],
    expectedVersion?: number
  ): Promise<{ success: boolean; reviewId?: string; newVersion?: number }> {
    return withTransaction(async (conn) => {
      // 1. Lock application row and verify version
      const [appRows] = await conn.execute<RowDataPacket[]>(
        `SELECT version, administration_status, submission_status, locked_by
         FROM applications WHERE id = ? FOR UPDATE`,
        [applicationId]
      );

      if (appRows.length === 0) {
        throw new Error('Permohonan tidak ditemukan');
      }

      const app = appRows[0];

      // Verify lock ownership
      if (app.locked_by !== verifierId) {
        const err = new Error('Anda tidak memiliki lock pada permohonan ini') as any;
        err.statusCode = 403;
        err.code = 'LOCK_NOT_OWNED';
        throw err;
      }

      // Verify status is actionable
      if (app.administration_status !== 'PENDING') {
        const err = new Error('Permohonan tidak dalam status menunggu verifikasi') as any;
        err.statusCode = 400;
        err.code = 'INVALID_STATUS';
        throw err;
      }

      // Optimistic locking check
      if (expectedVersion !== undefined && app.version !== expectedVersion) {
        return { success: false };
      }

      const nextVersion = (app.version as number) + 1;
      const reviewId = uuidv4();

      // 2. Insert review record
      await conn.execute(
        `INSERT INTO reviews (id, application_id, verifier_id, decision, general_notes, application_version)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [reviewId, applicationId, verifierId, decision, generalNotes, nextVersion]
      );

      // 3. Insert review items (checklist)
      for (const item of checklist) {
        await conn.execute(
          `INSERT INTO review_items (id, review_id, requirement_type_code, is_valid, notes)
           VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), reviewId, item.requirementTypeCode, item.isValid, item.notes || null]
        );
      }

      // 4. Update application status based on decision
      let updateFields: string;
      let historyReason: string;
      let prevAdminStatus = app.administration_status;

      switch (decision) {
        case 'PASSED':
          updateFields = `administration_status = 'PASSED', interview_status = 'PENDING'`;
          historyReason = 'Verifikasi administrasi lolos — berkas lengkap dan sesuai';
          break;
        case 'REVISION':
          updateFields = `administration_status = 'REVISION', submission_status = 'REVISION_REQUIRED'`;
          historyReason = `Revisi diperlukan — ${generalNotes}`;
          break;
        case 'REJECTED':
          updateFields = `administration_status = 'REJECTED', final_status = 'NOT_ACCEPTED', interview_status = 'NOT_ELIGIBLE'`;
          historyReason = `Ditolak — ${generalNotes}`;
          break;
        default:
          throw new Error(`Keputusan tidak valid: ${decision}`);
      }

      await conn.execute(
        `UPDATE applications SET
           ${updateFields},
           locked_by = NULL, locked_at = NULL,
           version = ?, updated_at = NOW()
         WHERE id = ?`,
        [nextVersion, applicationId]
      );

      // 5. Record status history — administration dimension
      await conn.execute(
        `INSERT INTO status_history (
           id, application_id, actor_id, actor_role, dimension,
           previous_value, next_value, reason, application_version
         ) VALUES (?, ?, ?, 'VERIFIKATOR', 'ADMINISTRATION', ?, ?, ?, ?)`,
        [
          uuidv4(), applicationId, verifierId,
          prevAdminStatus,
          decision === 'PASSED' ? 'PASSED' : decision === 'REVISION' ? 'REVISION' : 'REJECTED',
          historyReason, nextVersion
        ]
      );

      // If PASSED, also record interview status change
      if (decision === 'PASSED') {
        await conn.execute(
          `INSERT INTO status_history (
             id, application_id, actor_id, actor_role, dimension,
             previous_value, next_value, reason, application_version
           ) VALUES (?, ?, ?, 'VERIFIKATOR', 'INTERVIEW', 'NOT_ELIGIBLE', 'PENDING', 'Lolos administrasi, masuk tahap wawancara', ?)`,
          [uuidv4(), applicationId, verifierId, nextVersion]
        );
      }

      // If REVISION, also record submission status change
      if (decision === 'REVISION') {
        await conn.execute(
          `INSERT INTO status_history (
             id, application_id, actor_id, actor_role, dimension,
             previous_value, next_value, reason, application_version
           ) VALUES (?, ?, ?, 'VERIFIKATOR', 'SUBMISSION', ?, 'REVISION_REQUIRED', 'Berkas harus diperbaiki oleh peserta', ?)`,
          [uuidv4(), applicationId, verifierId, app.submission_status, nextVersion]
        );
      }

      // If REJECTED, also record final_status change
      if (decision === 'REJECTED') {
        await conn.execute(
          `INSERT INTO status_history (
             id, application_id, actor_id, actor_role, dimension,
             previous_value, next_value, reason, application_version
           ) VALUES (?, ?, ?, 'VERIFIKATOR', 'FINAL', 'UNDECIDED', 'NOT_ACCEPTED', 'Gugur pada seleksi administrasi', ?)`,
          [uuidv4(), applicationId, verifierId, nextVersion]
        );
      }

      return { success: true, reviewId, newVersion: nextVersion };
    });
  }

  // ── 6. Get Review History for Application ──────────────────────
  async getReviewHistory(applicationId: string): Promise<ReviewRecord[]> {
    const pool = getPool();

    const [reviewRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM reviews WHERE application_id = ? ORDER BY created_at DESC`,
      [applicationId]
    );

    const reviews: ReviewRecord[] = [];

    for (const r of reviewRows) {
      const [itemRows] = await pool.execute<RowDataPacket[]>(
        `SELECT * FROM review_items WHERE review_id = ? ORDER BY created_at ASC`,
        [r.id]
      );

      reviews.push({
        id: r.id,
        applicationId: r.application_id,
        verifierId: r.verifier_id,
        decision: r.decision,
        generalNotes: r.general_notes,
        applicationVersion: r.application_version,
        createdAt: new Date(r.created_at).toISOString(),
        items: itemRows.map((i: any) => ({
          id: i.id,
          reviewId: i.review_id,
          requirementTypeCode: i.requirement_type_code,
          isValid: !!i.is_valid,
          notes: i.notes,
          createdAt: new Date(i.created_at).toISOString()
        }))
      });
    }

    return reviews;
  }
}
