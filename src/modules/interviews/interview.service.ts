import { InterviewRepository } from './interview.repository.js';
import {
  InterviewFilter,
  InterviewStats,
  InterviewScoreDto,
  InterviewCandidateItem
} from './interview.types.js';

export class InterviewService {
  private repo: InterviewRepository;

  constructor() {
    this.repo = new InterviewRepository();
  }

  private guardInterviewerRole(user: { id: string; role: string }) {
    if (user.role !== 'LEMBAGA_SELEKSI' && user.role !== 'ADMIN') {
      const err = new Error('Akses ditolak: Hanya Lembaga Seleksi atau Admin yang dapat mengakses modul wawancara') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
  }

  // 1. Get Interview Queue
  async getQueue(
    user: { id: string; role: string },
    filter: InterviewFilter
  ): Promise<{ items: InterviewCandidateItem[]; total: number }> {
    this.guardInterviewerRole(user);
    return this.repo.getInterviewQueue(filter);
  }

  // 2. Get Interview Dashboard Stats
  async getStats(user: { id: string; role: string }): Promise<InterviewStats> {
    this.guardInterviewerRole(user);
    return this.repo.getInterviewStats();
  }

  // 3. Get Candidate Detail
  async getCandidateDetail(applicationId: string, user: { id: string; role: string }) {
    this.guardInterviewerRole(user);
    const detail = await this.repo.getCandidateDetail(applicationId);
    if (!detail) {
      const err = new Error('Kandidat wawancara tidak ditemukan') as any;
      err.statusCode = 404;
      err.code = 'CANDIDATE_NOT_FOUND';
      throw err;
    }
    return detail;
  }

  // 4. Submit Score
  async submitScore(
    applicationId: string,
    user: { id: string; role: string },
    dto: InterviewScoreDto
  ) {
    this.guardInterviewerRole(user);
    return this.repo.submitScore(applicationId, user.id, dto);
  }
}
