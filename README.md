# bit-transaksi

Transaksi service for the Beasiswa Pelatihan platform.

## Features
- Multi-step application wizard (biodata, pendidikan, dokumen, persetujuan)
- Section-level auto-saving with optimistic locking (`version` field)
- Idempotent draft creation (`REG-YYYY-XXXXX`) and submission via `Idempotency-Key`
- Document reservations and binding to verified documents
- Administrative review workflow (PASSED, REVISION, REJECTED)
- Interview scoring and automated finalization (PASSED -> ACCEPTED)
- Acceptance letter PDF and attendance confirmation (M feature)
- Summary statistics and XLSX reporting

## Database
- MySQL 8.4 (`transaksi_db`)
- Native access using `mysql2/promise` (no ORM)

## Scripts
- `npm run dev`: Start service in development mode
- `npm run build`: Compile TypeScript
- `npm run db:migrate`: Run database migrations
- `npm run db:migrate:status`: Check migration status
- `npm run db:seed`: Run seed scripts
