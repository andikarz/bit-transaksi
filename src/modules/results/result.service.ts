import { ResultRepository } from './result.repository.js';
import { ResultFilter } from './result.types.js';

export class ResultService {
  private repo: ResultRepository;

  constructor() {
    this.repo = new ResultRepository();
  }

  private guardAdminRole(user: { id: string; role: string }) {
    if (user.role !== 'ADMIN') {
      const err = new Error('Akses ditolak: Hanya Administrator yang dapat mengakses modul hasil seleksi') as any;
      err.statusCode = 403;
      err.code = 'FORBIDDEN';
      throw err;
    }
  }

  async getFunnelStats(user: { id: string; role: string }) {
    this.guardAdminRole(user);
    return this.repo.getFunnelStats();
  }

  async getResultsList(user: { id: string; role: string }, filter: ResultFilter) {
    this.guardAdminRole(user);
    return this.repo.getResultsList(filter);
  }

  async generateCsvExport(user: { id: string; role: string }, filter: ResultFilter): Promise<string> {
    this.guardAdminRole(user);
    const items = await this.repo.getAllResultsForExport(filter);

    // Escape CSV cell value
    const escapeCsv = (val: string | number | null | undefined) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const headers = [
      'No',
      'Kode Pendaftaran',
      'NIK',
      'Nama Lengkap',
      'Program Beasiswa',
      'Status Administrasi',
      'Nilai Wawancara',
      'Status Wawancara',
      'Status Kelulusan Final',
      'Tanggal Pengajuan'
    ];

    const rows = items.map((item, index) => {
      return [
        index + 1,
        escapeCsv(item.registrationCode),
        escapeCsv(item.nik),
        escapeCsv(item.fullName),
        escapeCsv(item.programName),
        escapeCsv(item.administrationStatus),
        escapeCsv(item.totalScore !== null ? item.totalScore.toFixed(2) : '-'),
        escapeCsv(item.interviewStatus),
        escapeCsv(item.finalStatus === 'ACCEPTED' ? 'DITERIMA' : item.finalStatus === 'NOT_ACCEPTED' ? 'TIDAK DITERIMA' : 'PROSES'),
        escapeCsv(item.submittedAt ? item.submittedAt.split('T')[0] : '-')
      ].join(';');
    });

    // Add UTF-8 BOM so Excel opens Indonesian characters and semicolons correctly
    return '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  }
}
