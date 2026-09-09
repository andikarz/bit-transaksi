import { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../db/pool.js';
import { withTransaction } from '../../db/transaction.js';
import {
  InterviewCandidateItem,
  InterviewStats,
  InterviewFilter,
  InterviewScoreDto,
  InterviewRecord
} from './interview.types.js';

export class InterviewRepository {

  // ── 1. Get Interview Queue ────────────────────────────────────
  async getInterviewQueue(filter: InterviewFilter): Promise<{ items: InterviewCandidateItem[]; total: number }> {
    const pool = getPool();
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = `a.administration_status = 'PASSED'`;
    const params: any[] = [];

    if (filter.status) {
      whereClause += ` AND a.interview_status = ?`;
      params.push(filter.status);
    }

    if (filter.search) {
      whereClause += ` AND (p.full_name LIKE ? OR p.nik LIKE ?)`;
      const searchTerm = `%${filter.search}%`;
      params.push(searchTerm, searchTerm);
    }

    // Total count
    const [countRows] = await pool.execute<RowDataPacket[]>(
      `SELECT COUNT(*) as total
       FROM applications a
       JOIN personal_details p ON p.application_id = a.id
       WHERE ${whereClause}`,
      params
    );
    const total = (countRows[0]?.total as number) || 0;

    // Items
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         a.id, a.registration_code, a.applicant_id, a.program_id,
         a.administration_status, a.interview_status, a.final_status,
         a.program_snapshot,
         p.nik, p.full_name,
         s.score_aspect_1, s.score_aspect_2, s.score_aspect_3,
         s.total_score, s.decision as interview_decision, s.notes as interviewer_notes,
         s.updated_at as interviewed_at
       FROM applications a
       JOIN personal_details p ON p.application_id = a.id
       LEFT JOIN interview_scores s ON s.application_id = a.id
       WHERE ${whereClause}
       ORDER BY a.submitted_at ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items: InterviewCandidateItem[] = rows.map((r: any) => {
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
        administrationStatus: r.administration_status,
        interviewStatus: r.interview_status,
        finalStatus: r.final_status,
        scoreAspect1: r.score_aspect_1 !== null ? Number(r.score_aspect_1) : null,
        scoreAspect2: r.score_aspect_2 !== null ? Number(r.score_aspect_2) : null,
        scoreAspect3: r.score_aspect_3 !== null ? Number(r.score_aspect_3) : null,
        totalScore: r.total_score !== null ? Number(r.total_score) : null,
        decision: r.interview_decision || null,
        interviewerNotes: r.interviewer_notes || null,
        interviewedAt: r.interviewed_at ? new Date(r.interviewed_at).toISOString() : null
      };
    });

    return { items, total };
  }

  // ── 2. Get Interview Dashboard Stats ──────────────────────────
  async getInterviewStats(): Promise<InterviewStats> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         COUNT(*) as ready,
         SUM(CASE WHEN interview_status = 'PENDING' THEN 1 ELSE 0 END) as unscored,
         SUM(CASE WHEN interview_status = 'PASSED' THEN 1 ELSE 0 END) as passed,
         SUM(CASE WHEN interview_status = 'FAILED' THEN 1 ELSE 0 END) as failed
       FROM applications
       WHERE administration_status = 'PASSED'`
    );

    const r = rows[0] || {};
    return {
      ready: Number(r.ready) || 0,
      unscored: Number(r.unscored) || 0,
      passed: Number(r.passed) || 0,
      failed: Number(r.failed) || 0
    };
  }

  // ── 3. Get Candidate Detail for Interview ─────────────────────
  async getCandidateDetail(applicationId: string) {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         a.id, a.registration_code, a.applicant_id, a.program_id,
         a.administration_status, a.interview_status, a.final_status,
         a.program_snapshot, a.version,
         p.nik, p.full_name, p.phone_number, p.address,
         e.institution_name, e.major, e.gpa_or_grade, e.degree_level,
         s.score_aspect_1, s.score_aspect_2, s.score_aspect_3,
         s.total_score, s.decision, s.notes, s.updated_at as interviewed_at
       FROM applications a
       JOIN personal_details p ON p.application_id = a.id
       LEFT JOIN education_details e ON e.application_id = a.id
       LEFT JOIN interview_scores s ON s.application_id = a.id
       WHERE a.id = ?`,
      [applicationId]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    const snapshot = typeof r.program_snapshot === 'string'
      ? JSON.parse(r.program_snapshot)
      : r.program_snapshot;

    return {
      id: r.id,
      registrationCode: r.registration_code,
      applicantId: r.applicant_id,
      programId: r.program_id,
      programName: snapshot?.name || 'Program Beasiswa',
      version: r.version,
      administrationStatus: r.administration_status,
      interviewStatus: r.interview_status,
      finalStatus: r.final_status,
      personal: {
        nik: r.nik,
        fullName: r.full_name,
        phoneNumber: r.phone_number,
        address: r.address
      },
      education: {
        institutionName: r.institution_name,
        major: r.major,
        gpaOrGrade: r.gpa_or_grade,
        degreeLevel: r.degree_level
      },
      existingScore: r.total_score !== null ? {
        scoreAspect1: Number(r.score_aspect_1),
        scoreAspect2: Number(r.score_aspect_2),
        scoreAspect3: Number(r.score_aspect_3),
        totalScore: Number(r.total_score),
        decision: r.decision,
        notes: r.notes,
        interviewedAt: r.interviewed_at ? new Date(r.interviewed_at).toISOString() : null
      } : null
    };
  }

  // ── 4. Submit Interview Score & Decision (Atomic Transaction) ──
  async submitScore(
    applicationId: string,
    interviewerId: string,
    dto: InterviewScoreDto
  ): Promise<{ success: boolean; totalScore: number; newVersion: number }> {
    return withTransaction(async (conn) => {
      // 1. Lock application
      const [appRows] = await conn.execute<RowDataPacket[]>(
        `SELECT version, administration_status, interview_status, final_status
         FROM applications WHERE id = ? FOR UPDATE`,
        [applicationId]
      );

      if (appRows.length === 0) {
        const err = new Error('Permohonan tidak ditemukan') as any;
        err.statusCode = 404;
        throw err;
      }

      const app = appRows[0];
      if (app.administration_status !== 'PASSED') {
        const err = new Error('Peserta belum dinyatakan lolos seleksi administrasi') as any;
        err.statusCode = 400;
        throw err;
      }

      const nextVersion = (app.version as number) + 1;
      const prevInterviewStatus = app.interview_status;
      const prevFinalStatus = app.final_status;

      // 2. Calculate weighted total score
      // Aspek 1: Komunikasi (30%), Aspek 2: Teknis (40%), Aspek 3: Komitmen (30%)
      const totalScore = Number(
        (dto.scoreAspect1 * 0.3 + dto.scoreAspect2 * 0.4 + dto.scoreAspect3 * 0.3).toFixed(2)
      );

      const nextInterviewStatus = dto.decision; // 'PASSED' | 'FAILED'
      const nextFinalStatus = dto.decision === 'PASSED' ? 'ACCEPTED' : 'NOT_ACCEPTED';

      // 3. Upsert interview_scores
      const [existingScores] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM interview_scores WHERE application_id = ?`,
        [applicationId]
      );

      if (existingScores.length === 0) {
        await conn.execute(
          `INSERT INTO interview_scores (
             id, application_id, interviewer_id, score_aspect_1, score_aspect_2,
             score_aspect_3, total_score, decision, notes, application_version, is_finalized
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            uuidv4(), applicationId, interviewerId,
            dto.scoreAspect1, dto.scoreAspect2, dto.scoreAspect3,
            totalScore, dto.decision, dto.notes, nextVersion
          ]
        );
      } else {
        await conn.execute(
          `UPDATE interview_scores SET
             interviewer_id = ?,
             score_aspect_1 = ?,
             score_aspect_2 = ?,
             score_aspect_3 = ?,
             total_score = ?,
             decision = ?,
             notes = ?,
             application_version = ?,
             is_finalized = 1,
             updated_at = NOW()
           WHERE application_id = ?`,
          [
            interviewerId,
            dto.scoreAspect1, dto.scoreAspect2, dto.scoreAspect3,
            totalScore, dto.decision, dto.notes, nextVersion,
            applicationId
          ]
        );
      }

      // 4. Update application status
      await conn.execute(
        `UPDATE applications SET
           interview_status = ?,
           final_status = ?,
           version = ?,
           updated_at = NOW()
         WHERE id = ?`,
        [nextInterviewStatus, nextFinalStatus, nextVersion, applicationId]
      );

      // 5. Record status history (interview dimension)
      await conn.execute(
        `INSERT INTO status_history (
           id, application_id, actor_id, actor_role, dimension,
           previous_value, next_value, reason, application_version
         ) VALUES (?, ?, ?, 'LEMBAGA_SELEKSI', 'INTERVIEW', ?, ?, ?, ?)`,
        [
          uuidv4(), applicationId, interviewerId,
          prevInterviewStatus, nextInterviewStatus,
          `Penilaian wawancara: Skor ${totalScore} (${dto.decision}) - ${dto.notes}`,
          nextVersion
        ]
      );

      // 6. Record status history (final dimension)
      if (prevFinalStatus !== nextFinalStatus) {
        await conn.execute(
          `INSERT INTO status_history (
             id, application_id, actor_id, actor_role, dimension,
             previous_value, next_value, reason, application_version
           ) VALUES (?, ?, ?, 'LEMBAGA_SELEKSI', 'FINAL', ?, ?, ?, ?)`,
          [
            uuidv4(), applicationId, interviewerId,
            prevFinalStatus, nextFinalStatus,
            `Keputusan final berdasarkan hasil wawancara: ${nextFinalStatus}`,
            nextVersion
          ]
        );
      }

      return {
        success: true,
        totalScore,
        newVersion: nextVersion
      };
    });
  }
}
