-- Transaksi Database Initial Schema
-- PRD §5.3, §5.4, §6, §7, §9, §10

CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  filename VARCHAR(255) NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  status VARCHAR(20) NOT NULL,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS applications (
  id VARCHAR(36) PRIMARY KEY,
  registration_code VARCHAR(50) NOT NULL UNIQUE,
  applicant_id VARCHAR(36) NOT NULL,
  program_id VARCHAR(36) NOT NULL,
  program_snapshot JSON NOT NULL,
  submission_status ENUM('DRAFT', 'SUBMITTED', 'REVISION_REQUIRED', 'RESUBMITTED') NOT NULL DEFAULT 'DRAFT',
  administration_status ENUM('NOT_STARTED', 'PENDING', 'REVISION', 'PASSED', 'REJECTED') NOT NULL DEFAULT 'NOT_STARTED',
  interview_status ENUM('NOT_ELIGIBLE', 'PENDING', 'PASSED', 'FAILED') NOT NULL DEFAULT 'NOT_ELIGIBLE',
  final_status ENUM('UNDECIDED', 'ACCEPTED', 'NOT_ACCEPTED') NOT NULL DEFAULT 'UNDECIDED',
  confirmation_status ENUM('NOT_AVAILABLE', 'PENDING', 'CONFIRMED', 'WITHDRAWN') NOT NULL DEFAULT 'NOT_AVAILABLE',
  current_step INT NOT NULL DEFAULT 1,
  version INT NOT NULL DEFAULT 1,
  submitted_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_app_applicant (applicant_id),
  INDEX idx_app_program (program_id),
  INDEX idx_app_submission (submission_status),
  INDEX idx_app_admin (administration_status),
  INDEX idx_app_interview (interview_status),
  INDEX idx_app_final (final_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS personal_details (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL UNIQUE,
  nik VARCHAR(16) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  birth_place VARCHAR(100) NULL,
  birth_date DATE NULL,
  gender ENUM('MALE', 'FEMALE') NULL,
  phone_number VARCHAR(20) NULL,
  address TEXT NULL,
  province_code VARCHAR(20) NULL,
  province_name VARCHAR(100) NULL,
  regency_code VARCHAR(20) NULL,
  regency_name VARCHAR(100) NULL,
  district_code VARCHAR(20) NULL,
  district_name VARCHAR(100) NULL,
  village_code VARCHAR(20) NULL,
  village_name VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS education_details (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL UNIQUE,
  education_level VARCHAR(50) NULL,
  institution_name VARCHAR(255) NULL,
  major VARCHAR(255) NULL,
  graduation_year INT NULL,
  current_occupation VARCHAR(100) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS consents (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL UNIQUE,
  agreed_statement_text TEXT NOT NULL,
  agreement_version VARCHAR(20) NOT NULL,
  agreed_at TIMESTAMP NOT NULL,
  agreed_by_ip VARCHAR(45) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_reservations (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL,
  requirement_type_code VARCHAR(50) NOT NULL,
  requirement_type_name VARCHAR(100) NOT NULL,
  allowed_types JSON NOT NULL,
  max_bytes INT NOT NULL,
  application_version INT NOT NULL,
  status ENUM('RESERVED', 'VALIDATED', 'COMMITTED', 'EXPIRED') NOT NULL DEFAULT 'RESERVED',
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  INDEX idx_res_app (application_id),
  INDEX idx_res_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS document_bindings (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL,
  requirement_type_code VARCHAR(50) NOT NULL,
  requirement_type_name VARCHAR(100) NOT NULL,
  document_id VARCHAR(36) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INT NOT NULL,
  sha256_hash VARCHAR(64) NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  is_clean BOOLEAN NOT NULL DEFAULT TRUE,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  UNIQUE KEY uk_app_req (application_id, requirement_type_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL,
  verifier_id VARCHAR(36) NOT NULL,
  decision ENUM('PASSED', 'REVISION', 'REJECTED') NOT NULL,
  general_notes TEXT NULL,
  application_version INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  INDEX idx_reviews_app (application_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS review_items (
  id VARCHAR(36) PRIMARY KEY,
  review_id VARCHAR(36) NOT NULL,
  requirement_type_code VARCHAR(50) NOT NULL,
  is_valid BOOLEAN NOT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS interview_scores (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL,
  interviewer_id VARCHAR(36) NOT NULL,
  score_aspect_1 DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  score_aspect_2 DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  score_aspect_3 DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  total_score DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  decision ENUM('PASSED', 'FAILED') NOT NULL,
  notes TEXT NULL,
  application_version INT NOT NULL,
  is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  INDEX idx_scores_app (application_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS confirmations (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL UNIQUE,
  status ENUM('CONFIRMED', 'WITHDRAWN') NOT NULL,
  notes TEXT NULL,
  confirmed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS status_history (
  id VARCHAR(36) PRIMARY KEY,
  application_id VARCHAR(36) NOT NULL,
  actor_id VARCHAR(36) NULL,
  actor_role VARCHAR(50) NULL,
  dimension VARCHAR(50) NOT NULL,
  previous_value VARCHAR(50) NULL,
  next_value VARCHAR(50) NOT NULL,
  reason TEXT NULL,
  application_version INT NOT NULL,
  request_id VARCHAR(36) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE,
  INDEX idx_history_app (application_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS idempotency_records (
  id VARCHAR(36) PRIMARY KEY,
  idempotency_key VARCHAR(255) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  route_path VARCHAR(255) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  response_status INT NOT NULL,
  response_body JSON NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_key_user (idempotency_key, user_id),
  INDEX idx_idem_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
