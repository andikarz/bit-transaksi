export type SubmissionStatus = 'DRAFT' | 'SUBMITTED' | 'REVISION_REQUIRED' | 'RESUBMITTED';
export type AdministrationStatus = 'NOT_STARTED' | 'PENDING' | 'REVISION' | 'PASSED' | 'REJECTED';
export type InterviewStatus = 'NOT_ELIGIBLE' | 'PENDING' | 'PASSED' | 'FAILED';
export type FinalStatus = 'UNDECIDED' | 'ACCEPTED' | 'NOT_ACCEPTED';
export type ConfirmationStatus = 'NOT_AVAILABLE' | 'PENDING' | 'CONFIRMED' | 'WITHDRAWN';

export interface ApplicationRecord {
  id: string;
  registration_code: string;
  applicant_id: string;
  program_id: string;
  program_snapshot: any;
  submission_status: SubmissionStatus;
  administration_status: AdministrationStatus;
  interview_status: InterviewStatus;
  final_status: FinalStatus;
  confirmation_status: ConfirmationStatus;
  current_step: number;
  version: number;
  submitted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PersonalDetailsRecord {
  id: string;
  application_id: string;
  nik: string;
  full_name: string;
  email: string;
  birth_place: string | null;
  birth_date: Date | null;
  gender: 'MALE' | 'FEMALE' | null;
  phone_number: string | null;
  address: string | null;
  province_code: string | null;
  province_name: string | null;
  regency_code: string | null;
  regency_name: string | null;
  district_code: string | null;
  district_name: string | null;
  village_code: string | null;
  village_name: string | null;
}

export interface EducationDetailsRecord {
  id: string;
  application_id: string;
  education_level: string | null;
  institution_name: string | null;
  major: string | null;
  graduation_year: number | null;
  current_occupation: string | null;
}

export interface ConsentRecord {
  id: string;
  application_id: string;
  agreed_statement_text: string;
  agreement_version: string;
  agreed_at: Date;
  agreed_by_ip: string | null;
}

export interface DocumentBindingRecord {
  id: string;
  application_id: string;
  requirement_type_code: string;
  requirement_type_name: string;
  document_id: string;
  original_filename: string;
  mime_type: string;
  file_size: number;
  sha256_hash: string;
  storage_path: string;
  is_clean: boolean | number;
  version: number;
}

export interface ApplicationDetailResponse {
  id: string;
  registrationCode: string;
  applicantId: string;
  programId: string;
  programSnapshot: any;
  submissionStatus: SubmissionStatus;
  administrationStatus: AdministrationStatus;
  interviewStatus: InterviewStatus;
  finalStatus: FinalStatus;
  confirmationStatus: ConfirmationStatus;
  currentStep: number;
  version: number;
  submittedAt: string | null;
  createdAt: string;
  personalDetails: Partial<PersonalDetailsRecord>;
  educationDetails: Partial<EducationDetailsRecord>;
  consent: Partial<ConsentRecord> | null;
  documents: DocumentBindingRecord[];
  review?: {
    decision: string;
    generalNotes: string | null;
    createdAt: string | null;
  } | null;
  interviewScore?: {
    scoreAspect1: number | null;
    scoreAspect2: number | null;
    scoreAspect3: number | null;
    totalScore: number | null;
    decision: string | null;
    notes: string | null;
    isFinalized: boolean;
    createdAt: string | null;
  } | null;
  confirmation?: {
    status: string;
    notes: string | null;
    confirmedAt: string | null;
  } | null;
}

export interface CreateDraftDto {
  programId: string;
}

export interface UpdatePersonalDto {
  birthPlace: string;
  birthDate: string;
  gender: 'MALE' | 'FEMALE';
  phoneNumber: string;
  address: string;
  provinceCode: string;
  provinceName: string;
  regencyCode: string;
  regencyName: string;
  districtCode: string;
  districtName: string;
  villageCode: string;
  villageName: string;
  expectedVersion?: number;
}

export interface UpdateEducationDto {
  educationLevel: string;
  institutionName: string;
  major?: string | null;
  graduationYear?: number | null;
  currentOccupation?: string | null;
  expectedVersion?: number;
}

export interface UpdateConsentDto {
  agreed: boolean;
  statementText: string;
  agreementVersion: string;
  expectedVersion?: number;
}
