import { RowDataPacket, ResultSetHeader, PoolConnection } from 'mysql2/promise';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../../db/pool.js';
import { withTransaction } from '../../db/transaction.js';
import {
  ApplicationRecord,
  PersonalDetailsRecord,
  EducationDetailsRecord,
  ConsentRecord,
  DocumentBindingRecord,
  ApplicationDetailResponse,
  UpdatePersonalDto,
  UpdateEducationDto,
  UpdateConsentDto
} from './application.types.js';

export class ApplicationRepository {
  // ── Idempotency Check & Save (AT-04) ────────────────────────
  async checkIdempotency(key: string, userId: string): Promise<{ status: number; body: any } | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT response_status, response_body
       FROM idempotency_records
       WHERE idempotency_key = ? AND user_id = ? AND expires_at > NOW()
       LIMIT 1`,
      [key, userId]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      status: r.response_status,
      body: typeof r.response_body === 'string' ? JSON.parse(r.response_body) : r.response_body
    };
  }

  async saveIdempotency(
    key: string,
    userId: string,
    routePath: string,
    requestHash: string,
    status: number,
    body: any
  ): Promise<void> {
    const pool = getPool();
    await pool.execute(
      `INSERT INTO idempotency_records (
        id, idempotency_key, user_id, route_path, request_hash, response_status, response_body, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL 24 HOUR))
      ON DUPLICATE KEY UPDATE response_status = VALUES(response_status), response_body = VALUES(response_body)`,
      [uuidv4(), key, userId, routePath, requestHash, status, JSON.stringify(body)]
    );
  }

  // ── Registration Code Generator: REG-{tahun}-{urutan} ────────
  private async getNextRegistrationCode(conn: PoolConnection): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `REG-${year}-`;

    const [rows] = await conn.execute<RowDataPacket[]>(
      `SELECT registration_code
       FROM applications
       WHERE registration_code LIKE ?
       ORDER BY registration_code DESC
       LIMIT 1
       FOR UPDATE`,
      [`${prefix}%`]
    );

    let nextSeq = 1;
    if (rows.length > 0) {
      const lastCode = rows[0].registration_code as string;
      const parts = lastCode.split('-');
      const currentSeq = parseInt(parts[2], 10);
      if (!isNaN(currentSeq)) {
        nextSeq = currentSeq + 1;
      }
    }

    return `${prefix}${nextSeq.toString().padStart(5, '0')}`;
  }

  // ── Find Active Draft for Applicant ──────────────────────────
  async findActiveDraft(applicantId: string): Promise<ApplicationRecord | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM applications
       WHERE applicant_id = ? AND submission_status IN ('DRAFT', 'REVISION_REQUIRED')
       ORDER BY created_at DESC
       LIMIT 1`,
      [applicantId]
    );

    return rows.length > 0 ? (rows[0] as ApplicationRecord) : null;
  }

  // ── Find Full Application Detail with All Sections ───────────
  async findDetailById(id: string): Promise<ApplicationDetailResponse | null> {
    const pool = getPool();
    const [appRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM applications WHERE id = ? LIMIT 1`,
      [id]
    );

    if (appRows.length === 0) return null;
    const app = appRows[0] as ApplicationRecord;

    const [personalRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM personal_details WHERE application_id = ? LIMIT 1`,
      [id]
    );
    const [eduRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM education_details WHERE application_id = ? LIMIT 1`,
      [id]
    );
    const [consentRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM consents WHERE application_id = ? LIMIT 1`,
      [id]
    );
    const [docRows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM document_bindings WHERE application_id = ?`,
      [id]
    );

    const snapshot = typeof app.program_snapshot === 'string'
      ? JSON.parse(app.program_snapshot)
      : app.program_snapshot;

    return {
      id: app.id,
      registrationCode: app.registration_code,
      applicantId: app.applicant_id,
      programId: app.program_id,
      programSnapshot: snapshot,
      submissionStatus: app.submission_status,
      administrationStatus: app.administration_status,
      interviewStatus: app.interview_status,
      finalStatus: app.final_status,
      confirmationStatus: app.confirmation_status,
      currentStep: app.current_step,
      version: app.version,
      submittedAt: app.submitted_at ? new Date(app.submitted_at).toISOString() : null,
      createdAt: new Date(app.created_at).toISOString(),
      personalDetails: personalRows.length > 0 ? (personalRows[0] as PersonalDetailsRecord) : {},
      educationDetails: eduRows.length > 0 ? (eduRows[0] as EducationDetailsRecord) : {},
      consent: consentRows.length > 0 ? (consentRows[0] as ConsentRecord) : null,
      documents: docRows as DocumentBindingRecord[]
    };
  }

  // ── Create Draft Application in Transaction ─────────────────
  async createDraft(
    applicant: { id: string; nik: string; fullName: string; email: string },
    programId: string,
    programSnapshot: any
  ): Promise<string> {
    return withTransaction(async (conn) => {
      const applicationId = uuidv4();
      const registrationCode = await this.getNextRegistrationCode(conn);

      // 1. Insert application header
      await conn.execute(
        `INSERT INTO applications (
          id, registration_code, applicant_id, program_id, program_snapshot,
          submission_status, administration_status, interview_status, final_status,
          current_step, version
        ) VALUES (?, ?, ?, ?, ?, 'DRAFT', 'NOT_STARTED', 'NOT_ELIGIBLE', 'UNDECIDED', 1, 1)`,
        [
          applicationId,
          registrationCode,
          applicant.id,
          programId,
          JSON.stringify(programSnapshot)
        ]
      );

      // 2. Pre-populate personal details with known applicant data
      await conn.execute(
        `INSERT INTO personal_details (
          id, application_id, nik, full_name, email
        ) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), applicationId, applicant.nik, applicant.fullName, applicant.email]
      );

      // 3. Insert initial education details record
      await conn.execute(
        `INSERT INTO education_details (
          id, application_id
        ) VALUES (?, ?)`,
        [uuidv4(), applicationId]
      );

      // 4. Record status history
      await conn.execute(
        `INSERT INTO status_history (
          id, application_id, actor_id, actor_role, dimension, previous_value, next_value, reason, application_version
        ) VALUES (?, ?, ?, 'PESERTA', 'submission', NULL, 'DRAFT', 'Pembuatan draft formulir baru', 1)`,
        [uuidv4(), applicationId, applicant.id]
      );

      return applicationId;
    });
  }

  // ── Update Personal Details with Optimistic Locking (AT-05) ──
  async updatePersonalDetails(
    applicationId: string,
    updates: UpdatePersonalDto
  ): Promise<{ success: boolean; newVersion?: number }> {
    return withTransaction(async (conn) => {
      // 1. Verify optimistic version
      const [appRows] = await conn.execute<RowDataPacket[]>(
        `SELECT version, current_step FROM applications WHERE id = ? FOR UPDATE`,
        [applicationId]
      );

      if (appRows.length === 0) {
        throw new Error('Permohonan tidak ditemukan');
      }

      const currentVersion = appRows[0].version as number;
      const currentStep = appRows[0].current_step as number;

      if (updates.expectedVersion !== undefined && currentVersion !== updates.expectedVersion) {
        return { success: false }; // Concurrency conflict
      }

      const nextVersion = currentVersion + 1;
      const nextStep = Math.max(currentStep, 2);

      // 2. Update personal_details
      await conn.execute(
        `UPDATE personal_details SET
          birth_place = ?, birth_date = ?, gender = ?, phone_number = ?, address = ?,
          province_code = ?, province_name = ?, regency_code = ?, regency_name = ?,
          district_code = ?, district_name = ?, village_code = ?, village_name = ?,
          updated_at = NOW()
         WHERE application_id = ?`,
        [
          updates.birthPlace,
          updates.birthDate,
          updates.gender,
          updates.phoneNumber,
          updates.address,
          updates.provinceCode,
          updates.provinceName,
          updates.regencyCode,
          updates.regencyName,
          updates.districtCode,
          updates.districtName,
          updates.villageCode,
          updates.villageName,
          applicationId
        ]
      );

      // 3. Bump version and step on applications
      await conn.execute(
        `UPDATE applications SET version = ?, current_step = ?, updated_at = NOW() WHERE id = ?`,
        [nextVersion, nextStep, applicationId]
      );

      return { success: true, newVersion: nextVersion };
    });
  }

  // ── Update Education Details with Optimistic Locking (AT-05) ─
  async updateEducationDetails(
    applicationId: string,
    updates: UpdateEducationDto
  ): Promise<{ success: boolean; newVersion?: number }> {
    return withTransaction(async (conn) => {
      const [appRows] = await conn.execute<RowDataPacket[]>(
        `SELECT version, current_step FROM applications WHERE id = ? FOR UPDATE`,
        [applicationId]
      );

      if (appRows.length === 0) {
        throw new Error('Permohonan tidak ditemukan');
      }

      const currentVersion = appRows[0].version as number;
      const currentStep = appRows[0].current_step as number;

      if (updates.expectedVersion !== undefined && currentVersion !== updates.expectedVersion) {
        return { success: false };
      }

      const nextVersion = currentVersion + 1;
      const nextStep = Math.max(currentStep, 3);

      await conn.execute(
        `UPDATE education_details SET
          education_level = ?, institution_name = ?, major = ?,
          graduation_year = ?, current_occupation = ?, updated_at = NOW()
         WHERE application_id = ?`,
        [
          updates.educationLevel,
          updates.institutionName,
          updates.major || null,
          updates.graduationYear || null,
          updates.currentOccupation || null,
          applicationId
        ]
      );

      await conn.execute(
        `UPDATE applications SET version = ?, current_step = ?, updated_at = NOW() WHERE id = ?`,
        [nextVersion, nextStep, applicationId]
      );

      return { success: true, newVersion: nextVersion };
    });
  }

  // ── Update Consent & Agreement with Optimistic Locking (AT-05)
  async updateConsent(
    applicationId: string,
    updates: UpdateConsentDto,
    clientIp: string
  ): Promise<{ success: boolean; newVersion?: number }> {
    return withTransaction(async (conn) => {
      const [appRows] = await conn.execute<RowDataPacket[]>(
        `SELECT version FROM applications WHERE id = ? FOR UPDATE`,
        [applicationId]
      );

      if (appRows.length === 0) {
        throw new Error('Permohonan tidak ditemukan');
      }

      const currentVersion = appRows[0].version as number;

      if (updates.expectedVersion !== undefined && currentVersion !== updates.expectedVersion) {
        return { success: false };
      }

      const nextVersion = currentVersion + 1;

      // Upsert consent row
      await conn.execute(
        `INSERT INTO consents (
          id, application_id, agreed_statement_text, agreement_version, agreed_at, agreed_by_ip
        ) VALUES (?, ?, ?, ?, NOW(), ?)
        ON DUPLICATE KEY UPDATE
          agreed_statement_text = VALUES(agreed_statement_text),
          agreement_version = VALUES(agreement_version),
          agreed_at = NOW(),
          agreed_by_ip = VALUES(agreed_by_ip)`,
        [uuidv4(), applicationId, updates.statementText, updates.agreementVersion, clientIp]
      );

      await conn.execute(
        `UPDATE applications SET version = ?, current_step = 4, updated_at = NOW() WHERE id = ?`,
        [nextVersion, applicationId]
      );

      return { success: true, newVersion: nextVersion };
    });
  }
}
