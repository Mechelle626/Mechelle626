import { readFile } from 'node:fs/promises';
import pg from 'pg';
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try { await pool.query(await readFile(new URL('../packages/database/schema.sql', import.meta.url),'utf8')); console.log('Database schema applied.'); } finally { await pool.end(); }
