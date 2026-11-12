import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { TEST_DB_NAME, testEnv } from './test-env.js';

// Runs once before all e2e files: creates the test database if needed and applies migrations
export default async function setup() {
  const url = new URL(testEnv.DATABASE_URL);
  if (url.pathname !== `/${TEST_DB_NAME}`) {
    throw new Error(`Refusing to prepare ${url.pathname} as a test database`);
  }

  url.pathname = '/postgres';
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  try {
    const found = await admin.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [TEST_DB_NAME],
    );
    if (found.rowCount === 0) {
      await admin.query(`CREATE DATABASE "${TEST_DB_NAME}"`);
    }
  } finally {
    await admin.end();
  }

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    stdio: 'inherit',
    env: { ...process.env, ...testEnv },
  });
}
