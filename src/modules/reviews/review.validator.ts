import { z } from 'zod';

export const reviewDecisionSchema = z.object({
  decision: z.enum(['PASSED', 'REVISION', 'REJECTED']),
  generalNotes: z.string().min(1, 'Catatan verifikator wajib diisi'),
  checklist: z.array(
    z.object({
      requirementTypeCode: z.string().min(1),
      isValid: z.boolean(),
      notes: z.string().optional().default('')
    })
  ).min(1, 'Checklist minimal 1 item'),
  expectedVersion: z.number().int().positive().optional()
});

export const reviewQueueQuerySchema = z.object({
  search: z.string().optional().default(''),
  status: z.enum(['PENDING', 'REVISION', 'PASSED', 'REJECTED', '']).optional().default(''),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});
