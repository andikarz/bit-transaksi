// Review module type definitions for Fase 6 — Verifikasi Berkas Administrasi

export type ReviewDecision = 'PASSED' | 'REVISION' | 'REJECTED';

export interface ReviewQueueItem {
  id: string;                       // application.id
  registrationCode: string;
  applicantId: string;
  nik: string;
  fullName: string;
  programName: string;
  programId: string;
  submittedAt: string;
  submissionStatus: string;         // SUBMITTED | RESUBMITTED
  administrationStatus: string;     // PENDING
  lockedBy: string | null;
  lockedAt: string | null;
}

export interface ReviewQueueFilter {
  search?: string;                  // nama / NIK
  status?: string;                  // administration_status filter
  page?: number;
  limit?: number;
}

export interface ReviewStatsResponse {
  pending: number;
  revision: number;
  passed: number;
  rejected: number;
}

export interface ReviewChecklistItemDto {
  requirementTypeCode: string;
  isValid: boolean;
  notes?: string;
}

export interface ReviewDecisionDto {
  decision: ReviewDecision;
  generalNotes: string;
  checklist: ReviewChecklistItemDto[];
  expectedVersion?: number;
}

export interface ReviewRecord {
  id: string;
  applicationId: string;
  verifierId: string;
  decision: ReviewDecision;
  generalNotes: string | null;
  applicationVersion: number;
  createdAt: string;
  items: ReviewItemRecord[];
}

export interface ReviewItemRecord {
  id: string;
  reviewId: string;
  requirementTypeCode: string;
  isValid: boolean;
  notes: string | null;
  createdAt: string;
}
