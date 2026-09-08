import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function computeChecksum(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

function splitSqlStatements(sqlContent: string): string[] {
  const statements: string[] = [];
  let current = '';
  let inString = false;
  let quoteChar = '';
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sqlContent.length; i++) {
    const char = sqlContent[i];
    const nextChar = sqlContent[i + 1] || '';

    if (!inString && !inBlockComment && (char === '#' || (char === '-' && nextChar === '-'))) {
      inLineComment = true;
    }
    if (inLineComment) {
      if (char === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (!inString && !inBlockComment && char === '/' && nextChar === '*') {
      inBlockComment = true;
      i++;
      continue;
    }
    if (inBlockComment) {
      if (char === '*' && nextChar === '/') {
        inBlockComment = false;
        i++;
      }
      continue;
    }

    if ((char === "'" || char === '"' || char === '`') && !inLineComment && !inBlockComment) {
      if (!inString) {
        inString = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        if (sqlContent[i - 1] !== '\\') {
          inString = false;
        }
      }
    }

    if (char === ';' && !inString) {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = '';
    } else {
      current += char;
    }
  }

  const remaining = current.trim();
  if (remaining) {
    statements.push(remaining);
  }

  return statements;
}

async function run() {
  const isStatusMode = process.argv.includes('--status');
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const url = new URL(databaseUrl);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    multipleStatements: false
  });

  try {
    const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT GET_LOCK('beasiswa_transaksi_migration_lock', 10) as locked"
    );
    if (!lockRows || !lockRows[0] || lockRows[0].locked !== 1) {
      throw new Error('Could not acquire database migration lock');
    }

    await connection.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version VARCHAR(255) PRIMARY KEY,
        filename VARCHAR(255) NOT NULL,
        checksum VARCHAR(64) NOT NULL,
        status VARCHAR(20) NOT NULL,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    const migrationsDir = path.join(__dirname, '../db/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('No migrations directory found.');
      return;
    }

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const [appliedRows] = await connection.query<mysql.RowDataPacket[]>(
      'SELECT version, filename, checksum, status, applied_at FROM schema_migrations ORDER BY version ASC'
    );

    const appliedMap = new Map<string, { filename: string; checksum: string; status: string; applied_at: Date }>();
    for (const row of appliedRows) {
      appliedMap.set(row.version, {
        filename: row.filename,
        checksum: row.checksum,
        status: row.status,
        applied_at: row.applied_at
      });
    }

    if (isStatusMode) {
      console.log('=== Migration Status ===');
      for (const file of files) {
        const version = file.split('_')[0];
        const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
        const checksum = computeChecksum(content);
        const applied = appliedMap.get(version);

        if (applied) {
          const checksumMatch = applied.checksum === checksum ? 'MATCH' : 'MISMATCH!';
          console.log(`[${applied.status}] ${file} (checksum: ${checksumMatch}, applied: ${applied.applied_at})`);
        } else {
          console.log(`[PENDING] ${file}`);
        }
      }
      return;
    }

    for (const file of files) {
      const version = file.split('_')[0];
      const filePath = path.join(migrationsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const checksum = computeChecksum(content);
      const applied = appliedMap.get(version);

      if (applied) {
        if (applied.checksum !== checksum) {
          throw new Error(`Checksum mismatch for applied migration ${file}! Expected ${applied.checksum}, got ${checksum}`);
        }
        if (applied.status === 'failed') {
          throw new Error(`Migration ${file} previously failed! Manual intervention required.`);
        }
        console.log(`Skipping already applied migration: ${file}`);
        continue;
      }

      console.log(`Applying migration: ${file}...`);
      await connection.query(
        'INSERT INTO schema_migrations (version, filename, checksum, status) VALUES (?, ?, ?, ?)',
        [version, file, checksum, 'started']
      );

      try {
        const statements = splitSqlStatements(content);
        for (const statement of statements) {
          await connection.query(statement);
        }

        await connection.query(
          'UPDATE schema_migrations SET status = ?, applied_at = CURRENT_TIMESTAMP WHERE version = ?',
          ['applied', version]
        );
        console.log(`Successfully applied: ${file}`);
      } catch (migrationErr) {
        console.error(`Failed to apply migration ${file}:`, migrationErr);
        await connection.query(
          'UPDATE schema_migrations SET status = ? WHERE version = ?',
          ['failed', version]
        );
        throw migrationErr;
      }
    }

    console.log('All migrations completed successfully.');
  } finally {
    try {
      await connection.query("SELECT RELEASE_LOCK('beasiswa_transaksi_migration_lock')");
    } catch {}
    await connection.end();
  }
}

run().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
