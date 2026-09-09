import { z } from 'zod';

export const createDraftSchema = z.object({
  programId: z.string().min(1, 'ID program beasiswa harus disertakan')
});

export const updatePersonalSchema = z.object({
  birthPlace: z.string().min(2, 'Tempat lahir minimal 2 karakter').max(100),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format tanggal lahir harus YYYY-MM-DD'),
  gender: z.enum(['MALE', 'FEMALE']),
  phoneNumber: z.string().min(10, 'Nomor HP/WhatsApp minimal 10 digit').max(20),
  address: z.string().min(5, 'Alamat domisili minimal 5 karakter'),
  provinceCode: z.string().min(1, 'Provinsi harus dipilih'),
  provinceName: z.string().min(1),
  regencyCode: z.string().min(1, 'Kabupaten/Kota harus dipilih'),
  regencyName: z.string().min(1),
  districtCode: z.string().min(1, 'Kecamatan harus dipilih'),
  districtName: z.string().min(1),
  villageCode: z.string().min(1, 'Kelurahan/Desa harus dipilih'),
  villageName: z.string().min(1),
  expectedVersion: z.number().int().optional()
});

export const updateEducationSchema = z.object({
  educationLevel: z.string().min(2, 'Jenjang pendidikan harus dipilih'),
  institutionName: z.string().min(2, 'Nama instansi / sekolah / universitas minimal 2 karakter'),
  major: z.string().optional().nullable(),
  graduationYear: z.coerce.number().int().min(1950).max(new Date().getFullYear() + 1).optional().nullable(),
  currentOccupation: z.string().optional().nullable(),
  expectedVersion: z.number().int().optional()
});

export const updateConsentSchema = z.object({
  agreed: z.literal(true, {
    errorMap: () => ({ message: 'Anda wajib menyetujui pernyataan keabsahan sebelum melanjutkan' })
  }),
  statementText: z.string().min(10),
  agreementVersion: z.string().default('v1.0'),
  expectedVersion: z.number().int().optional()
});
