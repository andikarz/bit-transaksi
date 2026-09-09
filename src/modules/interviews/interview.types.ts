export type InterviewDecision = 'PASSED' | 'FAILED';

export interface InterviewCandidateItem {
  id: string; // application_id
  registrationCode: string;
  applicantId: string;
  nik: string;
  fullName: string;
  programName: string;
  programId: string;
  administrationStatus: string;
  interviewStatus: 'NOT_ELIGIBLE' | 'PENDING' | 'PASSED' | 'FAILED';
  finalStatus: 'UNDECIDED' | 'ACCEPTED' | 'NOT_ACCEPTED';
  scoreAspect1: number | null;
  scoreAspect2: number | null;
  scoreAspect3: number | null;
  totalScore: number | null;
  decision: InterviewDecision | null;
  interviewerNotes: string | null;
  interviewedAt: string | null;
}

export interface InterviewStats {
  ready: number;
  unscored: number;
  passed: number;
  failed: number;
}

export interface InterviewFilter {
  search?: string;
  status?: string; // 'PASSED' | 'FAILED' | 'PENDING' | ''
  page?: number;
  limit?: number;
}

export interface InterviewScoreDto {
  scoreAspect1: number;
  scoreAspect2: number;
  scoreAspect3: number;
  decision: InterviewDecision;
  notes: string;
}

export interface InterviewRecord {
  id: string;
  applicationId: string;
  interviewerId: string;
  scoreAspect1: number;
  scoreAspect2: number;
  scoreAspect3: number;
  totalScore: number;
  decision: InterviewDecision;
  notes: string | null;
  applicationVersion: number;
  isFinalized: boolean;
  createdAt: string;
  updatedAt: string;
}
