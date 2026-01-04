import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

async function migrate(): Promise<void> {
  const pool = new Pool();
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir).sort();

  for (const file of files) {
    if (file.endsWith('.sql')) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      console.log(`Running migration: ${file}`);
      await pool.query(sql);
    }
  }

  await pool.end();
  console.log('Migrations complete');
}

migrate().catch((error) => {
  console.error('Migration failed', error);
});
