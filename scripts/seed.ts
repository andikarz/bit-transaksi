import mysql from 'mysql2/promise';
try { (process as any).loadEnvFile?.(); } catch {}

async function run() {
  console.log('Transaksi database seed — initial state ready (no hardcoded transactions needed for production).');
}

run().catch((err) => {
  console.error('Transaksi seed failed:', err);
  process.exit(1);
});
