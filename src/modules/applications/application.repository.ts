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

  // ── Find Latest Application for Applicant (Any Status) ────────
  async findLatestApplication(applicantId: string): Promise<ApplicationRecord | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT * FROM applications
       WHERE applicant_id = ?
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

  // ── Create Document Reservation (Fase 5) ─────────────────────
  async createDocumentReservation(
    applicationId: string,
    reqCode: string,
    reqName: string,
    allowedTypes: string[],
    maxBytes: number,
    appVersion: number
  ): Promise<any> {
    const pool = getPool();
    const reservationId = uuidv4();
    await pool.execute(
      `INSERT INTO document_reservations (
        id, application_id, requirement_type_code, requirement_type_name,
        allowed_types, max_bytes, application_version, status, expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'RESERVED', DATE_ADD(NOW(), INTERVAL 5 MINUTE))`,
      [reservationId, applicationId, reqCode, reqName, JSON.stringify(allowedTypes), maxBytes, appVersion]
    );

    return {
      id: reservationId,
      applicationId,
      requirementTypeCode: reqCode,
      requirementTypeName: reqName,
      allowedTypes,
      maxBytes,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
    };
  }

  // ── Find Reservation by ID (Internal Validation) ─────────────
  async findReservationById(reservationId: string): Promise<any | null> {
    const pool = getPool();
    const [rows] = await pool.execute<RowDataPacket[]>(
      `SELECT r.*, a.registration_code, a.applicant_id, a.submission_status
       FROM document_reservations r
       JOIN applications a ON a.id = r.application_id
       WHERE r.id = ?`,
      [reservationId]
    );

    if (rows.length === 0) return null;
    const r = rows[0];
    return {
      id: r.id,
      applicationId: r.application_id,
      applicantId: r.applicant_id,
      registrationCode: r.registration_code,
      requirementTypeCode: r.requirement_type_code,
      requirementTypeName: r.requirement_type_name,
      allowedTypes: typeof r.allowed_types === 'string' ? JSON.parse(r.allowed_types) : r.allowed_types,
      maxBytes: r.max_bytes,
      status: r.status,
      submissionStatus: r.submission_status,
      isExpired: new Date(r.expires_at) < new Date()
    };
  }

  // ── Commit Document Reservation & Binding (Internal) ─────────
  async commitReservation(
    reservationId: string,
    docData: {
      documentId: string;
      originalFilename: string;
      mimeType: string;
      fileSize: number;
      sha256Hash: string;
      storagePath: string;
      isClean: boolean;
    }
  ): Promise<any> {
    return withTransaction(async (conn) => {
      const [resRows] = await conn.execute<RowDataPacket[]>(
        `SELECT * FROM document_reservations WHERE id = ? FOR UPDATE`,
        [reservationId]
      );

      if (resRows.length === 0) {
        throw new Error('Reservation tidak ditemukan');
      }

      const res = resRows[0];
      if (res.status !== 'RESERVED') {
        throw new Error(`Reservation dalam status '${res.status}'`);
      }

      // 1. Mark reservation COMMITTED
      await conn.execute(
        `UPDATE document_reservations SET status = 'COMMITTED' WHERE id = ?`,
        [reservationId]
      );

      // 2. Upsert document_bindings
      const bindingId = uuidv4();
      await conn.execute(
        `INSERT INTO document_bindings (
          id, application_id, requirement_type_code, requirement_type_name,
          document_id, original_filename, mime_type, file_size, sha256_hash, storage_path, is_clean, version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        ON DUPLICATE KEY UPDATE
          document_id = VALUES(document_id),
          original_filename = VALUES(original_filename),
          mime_type = VALUES(mime_type),
          file_size = VALUES(file_size),
          sha256_hash = VALUES(sha256_hash),
          storage_path = VALUES(storage_path),
          is_clean = VALUES(is_clean),
          version = version + 1`,
        [
          bindingId,
          res.application_id,
          res.requirement_type_code,
          res.requirement_type_name,
          docData.documentId,
          docData.originalFilename,
          docData.mimeType,
          docData.fileSize,
          docData.sha256Hash,
          docData.storagePath,
          docData.isClean
        ]
      );

      return { committed: true, bindingId, applicationId: res.application_id };
    });
  }

  // ── Submit Application (AT-08) ────────────────────────────────
  async submitApplication(
    applicationId: string,
    expectedVersion?: number,
    applicant?: { nik?: string; fullName?: string; email?: string }
  ): Promise<{ success: boolean; newVersion?: number; registrationCode?: string }> {
    return withTransaction(async (conn) => {
      const [appRows] = await conn.execute<RowDataPacket[]>(
        `SELECT version, registration_code, submission_status, program_snapshot FROM applications WHERE id = ? FOR UPDATE`,
        [applicationId]
      );

      if (appRows.length === 0) {
        throw new Error('Permohonan tidak ditemukan');
      }

      const app = appRows[0];
      if (expectedVersion !== undefined && app.version !== expectedVersion) {
        return { success: false };
      }

      const nextVersion = (app.version as number) + 1;

      // 1. Verify Personal Details
      const [pRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, nik, full_name, email FROM personal_details WHERE application_id = ?`,
        [applicationId]
      );
      if (pRows.length === 0) {
        const err = new Error('Data diri belum lengkap') as any;
        err.statusCode = 422;
        err.code = 'INCOMPLETE_PERSONAL_DETAILS';
        throw err;
      }

      let currentNik = pRows[0].nik;
      let currentFullName = pRows[0].full_name;

      if (!currentNik && applicant?.nik) {
        currentNik = applicant.nik;
        await conn.execute(`UPDATE personal_details SET nik = ? WHERE application_id = ?`, [currentNik, applicationId]);
      }
      if (!currentFullName && applicant?.fullName) {
        currentFullName = applicant.fullName;
        await conn.execute(`UPDATE personal_details SET full_name = ? WHERE application_id = ?`, [currentFullName, applicationId]);
      }
      if (!pRows[0].email && applicant?.email) {
        await conn.execute(`UPDATE personal_details SET email = ? WHERE application_id = ?`, [applicant.email, applicationId]);
      }

      if (!currentNik || !currentFullName) {
        const err = new Error('Data diri belum lengkap') as any;
        err.statusCode = 422;
        err.code = 'INCOMPLETE_PERSONAL_DETAILS';
        throw err;
      }

      // 2. Verify Education Details
      const [eRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id, education_level, institution_name FROM education_details WHERE application_id = ?`,
        [applicationId]
      );
      if (eRows.length === 0 || !eRows[0].education_level || !eRows[0].institution_name) {
        const err = new Error('Data pendidikan belum lengkap') as any;
        err.statusCode = 422;
        err.code = 'INCOMPLETE_EDUCATION_DETAILS';
        throw err;
      }

      // 3. Verify Consent
      const [cRows] = await conn.execute<RowDataPacket[]>(
        `SELECT id FROM consents WHERE application_id = ?`,
        [applicationId]
      );
      if (cRows.length === 0) {
        const err = new Error('Pernyataan persetujuan belum disetujui') as any;
        err.statusCode = 422;
        err.code = 'INCOMPLETE_CONSENT';
        throw err;
      }

      const snapshot = typeof app.program_snapshot === 'string' ? JSON.parse(app.program_snapshot) : app.program_snapshot;
      const requirements: any[] = snapshot?.requirements || [];
      const mandatoryReqs = requirements.filter((r: any) => r.isRequired || r.isMandatory || r.is_mandatory || r.is_required);

      const [bindings] = await conn.execute<RowDataPacket[]>(
        `SELECT requirement_type_code, is_clean FROM document_bindings WHERE application_id = ? AND is_clean = TRUE`,
        [applicationId]
      );
      const boundCodes = new Set(bindings.map((b: any) => b.requirement_type_code));

      for (const req of mandatoryReqs) {
        const code = req.requirementTypeCode || req.code || req.requirement_type_code;
        if (!boundCodes.has(code)) {
          const err = new Error(`Dokumen wajib '${req.name || code}' belum diunggah atau tidak bersih`) as any;
          err.statusCode = 422;
          err.code = 'MISSING_MANDATORY_DOCUMENT';
          throw err;
        }
      }

      // 5. Update application status
      await conn.execute(
        `UPDATE applications SET
          submission_status = 'SUBMITTED',
          administration_status = 'PENDING',
          submitted_at = NOW(),
          version = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [nextVersion, applicationId]
      );

      // 6. Record status history
      await conn.execute(
        `INSERT INTO status_history (
          id, application_id, dimension, previous_value, next_value, reason, application_version
        ) VALUES (?, ?, 'SUBMISSION', 'DRAFT', 'SUBMITTED', 'Pendaftaran berhasil dikirim oleh peserta', ?)`,
        [uuidv4(), applicationId, nextVersion]
      );

      return {
        success: true,
        newVersion: nextVersion,
        registrationCode: app.registration_code
      };
    });
  }

  // ── Resubmit Application (Fase 6) ─────────────────────────────
  async resubmitApplication(
    applicationId: string,
    expectedVersion?: number
  ): Promise<{ success: boolean; newVersion?: number; registrationCode?: string }> {
    return withTransaction(async (conn) => {
      const [appRows] = await conn.execute<RowDataPacket[]>(
        `SELECT version, registration_code, submission_status FROM applications WHERE id = ? FOR UPDATE`,
        [applicationId]
      );

      if (appRows.length === 0) {
        throw new Error('Permohonan tidak ditemukan');
      }

      const app = appRows[0];
      if (expectedVersion !== undefined && app.version !== expectedVersion) {
        return { success: false };
      }

      const nextVersion = (app.version as number) + 1;

      await conn.execute(
        `UPDATE applications SET
          submission_status = 'RESUBMITTED',
          administration_status = 'PENDING',
          submitted_at = NOW(),
          version = ?,
          updated_at = NOW()
         WHERE id = ?`,
        [nextVersion, applicationId]
      );

      await conn.execute(
        `INSERT INTO status_history (
          id, application_id, dimension, previous_value, next_value, reason, application_version
        ) VALUES (?, ?, 'SUBMISSION', 'REVISION_REQUIRED', 'RESUBMITTED', 'Perbaikan pendaftaran dikirim ulang oleh peserta', ?)`,
        [uuidv4(), applicationId, nextVersion]
      );

      return {
        success: true,
        newVersion: nextVersion,
        registrationCode: app.registration_code
      };
    });
  }
}
