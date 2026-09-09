import { RowDataPacket } from 'mysql2/promise';
import { getPool } from '../../db/pool.js';
import { AdminFunnelStats, ResultFilter, ResultListItem } from './result.types.js';

export class ResultRepository {

  // ── 1. Comprehensive Funnel Statistics ────────────────────────
  async getFunnelStats(): Promise<AdminFunnelStats> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         SUM(CASE WHEN submission_status != 'DRAFT' THEN 1 ELSE 0 END) as totalApplicants,
         SUM(CASE WHEN administration_status = 'PENDING' AND submission_status IN ('SUBMITTED','RESUBMITTED') THEN 1 ELSE 0 END) as adminPending,
         SUM(CASE WHEN administration_status = 'PASSED' THEN 1 ELSE 0 END) as adminPassed,
         SUM(CASE WHEN administration_status = 'REJECTED' THEN 1 ELSE 0 END) as adminRejected,
         SUM(CASE WHEN interview_status = 'PENDING' THEN 1 ELSE 0 END) as interviewPending,
         SUM(CASE WHEN interview_status = 'PASSED' THEN 1 ELSE 0 END) as interviewPassed,
         SUM(CASE WHEN interview_status = 'FAILED' THEN 1 ELSE 0 END) as interviewFailed,
         SUM(CASE WHEN final_status = 'ACCEPTED' THEN 1 ELSE 0 END) as finalAccepted,
         SUM(CASE WHEN final_status = 'NOT_ACCEPTED' THEN 1 ELSE 0 END) as finalNotAccepted
       FROM applications`
    );

    const r = rows[0] || {};
    return {
      totalApplicants: Number(r.totalApplicants) || 0,
      adminPending: Number(r.adminPending) || 0,
      adminPassed: Number(r.adminPassed) || 0,
      adminRejected: Number(r.adminRejected) || 0,
      interviewPending: Number(r.interviewPending) || 0,
      interviewPassed: Number(r.interviewPassed) || 0,
      interviewFailed: Number(r.interviewFailed) || 0,
      finalAccepted: Number(r.finalAccepted) || 0,
      finalNotAccepted: Number(r.finalNotAccepted) || 0
    };
  }

  // ── 2. Results List with Search & Filtering ───────────────────
  async getResultsList(filter: ResultFilter): Promise<{ items: ResultListItem[]; total: number }> {
    const pool = getPool();
    const page = filter.page || 1;
    const limit = filter.limit || 20;
    const offset = (page - 1) * limit;

    let whereClause = `a.submission_status != 'DRAFT'`;
    const params: any[] = [];

    if (filter.search) {
      whereClause += ` AND (p.full_name LIKE ? OR p.nik LIKE ? OR a.registration_code LIKE ?)`;
      const s = `%${filter.search}%`;
      params.push(s, s, s);
    }

    if (filter.administrationStatus) {
      whereClause += ` AND a.administration_status = ?`;
      params.push(filter.administrationStatus);
    }

    if (filter.interviewStatus) {
      whereClause += ` AND a.interview_status = ?`;
      params.push(filter.interviewStatus);
    }

    if (filter.finalStatus) {
      whereClause += ` AND a.final_status = ?`;
      params.push(filter.finalStatus);
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

    // Paginated rows
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         a.id, a.registration_code, a.applicant_id, a.program_id,
         a.submission_status, a.administration_status, a.interview_status, a.final_status,
         a.program_snapshot, a.submitted_at, a.updated_at,
         p.nik, p.full_name,
         s.total_score
       FROM applications a
       JOIN personal_details p ON p.application_id = a.id
       LEFT JOIN interview_scores s ON s.application_id = a.id
       WHERE ${whereClause}
       ORDER BY a.submitted_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const items: ResultListItem[] = rows.map((r: any) => {
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
        submissionStatus: r.submission_status,
        administrationStatus: r.administration_status,
        interviewStatus: r.interview_status,
        totalScore: r.total_score !== null ? Number(r.total_score) : null,
        finalStatus: r.final_status,
        submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : '',
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : ''
      };
    });

    return { items, total };
  }

  // ── 3. All Results for Export ─────────────────────────────────
  async getAllResultsForExport(filter: ResultFilter): Promise<ResultListItem[]> {
    const pool = getPool();
    let whereClause = `a.submission_status != 'DRAFT'`;
    const params: any[] = [];

    if (filter.search) {
      whereClause += ` AND (p.full_name LIKE ? OR p.nik LIKE ? OR a.registration_code LIKE ?)`;
      const s = `%${filter.search}%`;
      params.push(s, s, s);
    }

    if (filter.administrationStatus) {
      whereClause += ` AND a.administration_status = ?`;
      params.push(filter.administrationStatus);
    }

    if (filter.interviewStatus) {
      whereClause += ` AND a.interview_status = ?`;
      params.push(filter.interviewStatus);
    }

    if (filter.finalStatus) {
      whereClause += ` AND a.final_status = ?`;
      params.push(filter.finalStatus);
    }

    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT
         a.id, a.registration_code, a.applicant_id, a.program_id,
         a.submission_status, a.administration_status, a.interview_status, a.final_status,
         a.program_snapshot, a.submitted_at, a.updated_at,
         p.nik, p.full_name,
         s.total_score
       FROM applications a
       JOIN personal_details p ON p.application_id = a.id
       LEFT JOIN interview_scores s ON s.application_id = a.id
       WHERE ${whereClause}
       ORDER BY a.submitted_at DESC`,
      params
    );

    return rows.map((r: any) => {
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
        submissionStatus: r.submission_status,
        administrationStatus: r.administration_status,
        interviewStatus: r.interview_status,
        totalScore: r.total_score !== null ? Number(r.total_score) : null,
        finalStatus: r.final_status,
        submittedAt: r.submitted_at ? new Date(r.submitted_at).toISOString() : '',
        updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : ''
      };
    });
  }
}
