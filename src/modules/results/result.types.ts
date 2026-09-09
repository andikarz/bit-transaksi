export interface AdminFunnelStats {
  totalApplicants: number;
  adminPending: number;
  adminPassed: number;
  adminRejected: number;
  interviewPending: number;
  interviewPassed: number;
  interviewFailed: number;
  finalAccepted: number;
  finalNotAccepted: number;
}

export interface ResultFilter {
  search?: string;
  programId?: string;
  administrationStatus?: string;
  interviewStatus?: string;
  finalStatus?: string;
  page?: number;
  limit?: number;
}

export interface ResultListItem {
  id: string;
  registrationCode: string;
  applicantId: string;
  nik: string;
  fullName: string;
  programName: string;
  programId: string;
  submissionStatus: string;
  administrationStatus: string;
  interviewStatus: string;
  totalScore: number | null;
  finalStatus: string;
  submittedAt: string;
  updatedAt: string;
}
