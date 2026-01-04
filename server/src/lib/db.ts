import { Pool, PoolConfig } from 'pg';

let pool: Pool | undefined;

export function getDbPool(): Pool {
  if (!pool) {
    pool = new Pool(buildPoolConfig());
  }

  return pool;
}

function buildPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;

  if (connectionString && connectionString.trim().length > 0) {
    return { connectionString };
  }

  const port = Number.parseInt(process.env.PGPORT ?? '', 10);

  return {
    host: process.env.PGHOST,
    port: Number.isNaN(port) ? undefined : port,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE
  };
}
