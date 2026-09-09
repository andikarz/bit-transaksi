import { z } from 'zod';

export const interviewScoreSchema = z.object({
  scoreAspect1: z.number().min(0, 'Nilai minimal 0').max(100, 'Nilai maksimal 100'),
  scoreAspect2: z.number().min(0, 'Nilai minimal 0').max(100, 'Nilai maksimal 100'),
  scoreAspect3: z.number().min(0, 'Nilai minimal 0').max(100, 'Nilai maksimal 100'),
  decision: z.enum(['PASSED', 'FAILED'], {
    errorMap: () => ({ message: 'Keputusan wawancara harus PASSED atau FAILED' })
  }),
  notes: z.string().min(5, 'Catatan evaluasi minimal 5 karakter').max(2000, 'Catatan maksimal 2000 karakter')
});

export const interviewQueueQuerySchema = z.object({
  search: z.string().optional(),
  status: z.enum(['PASSED', 'FAILED', 'PENDING', '']).optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});
