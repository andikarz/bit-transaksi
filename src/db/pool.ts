import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { env } from '../config/env.js';

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const url = new URL(env.DATABASE_URL);
    pool = mysql.createPool({
      host: url.hostname,
      port: Number(url.port) || 3306,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.replace(/^\//, ''),
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 5000,
      multipleStatements: false,
      enableKeepAlive: true,
      keepAliveInitialDelay: 30000
    });
  }
  return pool;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const currentPool = getPool();
    const [rows] = await currentPool.query('SELECT 1 as healthy');
    return Array.isArray(rows) && rows.length > 0;
  } catch (err) {
    console.error('Database health check failed:', err);
    return false;
  }
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
