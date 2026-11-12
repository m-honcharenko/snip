import autocannon from 'autocannon';
import { Redis } from 'ioredis';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import pg from 'pg';

const PORT = Number(process.env.BENCH_PORT ?? 3100);
const BASE = `http://127.0.0.1:${PORT}`;
const DURATION = Number(process.env.BENCH_DURATION ?? 10);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 50);
const WARMUP = 3;

const TEST_DB = 'snip_test';
const TEST_REDIS_DB = 1;

function withPath(url, path) {
  const parsed = new URL(url);
  parsed.pathname = path;
  return parsed.toString();
}

if (!process.env.DATABASE_URL || !process.env.REDIS_URL) {
  throw new Error('DATABASE_URL and REDIS_URL are required: run "pnpm bench", it loads .env');
}

// The benchmark uses the e2e database and Redis db 1, so development data is never touched
const DATABASE_URL = withPath(process.env.DATABASE_URL, `/${TEST_DB}`);
const REDIS_URL = withPath(process.env.REDIS_URL, `/${TEST_REDIS_DB}`);

const SCENARIOS = [
  {
    name: 'A: no cache, no click tracking',
    env: { LINK_CACHE_ENABLED: 'false', CLICK_TRACKING_ENABLED: 'false' },
  },
  {
    name: 'B: Redis cache',
    env: { LINK_CACHE_ENABLED: 'true', CLICK_TRACKING_ENABLED: 'false' },
  },
  {
    name: 'C: Redis cache + click tracking',
    env: { LINK_CACHE_ENABLED: 'true', CLICK_TRACKING_ENABLED: 'true' },
  },
];

// Empty tables and an empty Redis: a clean slate before a scenario, and no leftovers after
async function cleanUp() {
  const db = new pg.Client({ connectionString: DATABASE_URL });
  try {
    await db.connect();
    await db.query('TRUNCATE TABLE "ClickEvent", "Link" RESTART IDENTITY CASCADE');
  } catch (error) {
    throw new Error(
      `Cannot reach the "${TEST_DB}" database (run "pnpm test:e2e" once to create it): ${error.message}`,
    );
  } finally {
    await db.end().catch(() => {});
  }
  const redis = new Redis(REDIS_URL);
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.status === 200) return;
    } catch {
      // not up yet
    }
    await sleep(200);
  }
  throw new Error('The server did not start in time');
}

function startServer(extraEnv) {
  return spawn('node', ['dist/main'], {
    env: {
      ...process.env,
      ...extraEnv,
      DATABASE_URL,
      REDIS_URL,
      NODE_ENV: 'production',
      PORT: String(PORT),
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

async function stopServer(child) {
  child.kill('SIGTERM');
  await new Promise((resolve) => {
    child.once('exit', resolve);
    setTimeout(() => {
      child.kill('SIGKILL');
      resolve();
    }, 5000);
  });
}

async function createLink() {
  const res = await fetch(`${BASE}/links`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/benchmark' }),
  });
  if (res.status !== 201) {
    throw new Error(`Could not create a link: HTTP ${res.status}`);
  }
  return (await res.json()).code;
}

function run(url, duration) {
  return autocannon({ url, connections: CONNECTIONS, duration, method: 'GET' });
}

const rows = [];

try {
  for (const scenario of SCENARIOS) {
    process.stdout.write(`\n${scenario.name}\n`);
    await cleanUp();
    const server = startServer(scenario.env);
    try {
      await waitForServer();
      const code = await createLink();
      const url = `${BASE}/${code}`;

      await run(url, WARMUP);
      const result = await run(url, DURATION);

      const bad = result.non2xx - result['3xx'];
      if (result['3xx'] === 0 || bad > 0) {
        throw new Error(
          `Unexpected responses: 3xx=${result['3xx']}, other non-2xx=${bad}, errors=${result.errors}`,
        );
      }

      rows.push({
        scenario: scenario.name,
        reqPerSec: Math.round(result.requests.average),
        p50: result.latency.p50,
        p97_5: result.latency.p97_5,
        p99: result.latency.p99,
        errors: result.errors,
      });
    } finally {
      await stopServer(server);
    }
  }
} finally {
  await cleanUp();
}

const baseline = rows[0].reqPerSec;
console.log('\n| Scenario | req/s | p50 ms | p97.5 ms | p99 ms | errors | vs A |');
console.log('| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const row of rows) {
  const speedup = (row.reqPerSec / baseline).toFixed(2);
  console.log(
    `| ${row.scenario} | ${row.reqPerSec} | ${row.p50} | ${row.p97_5} | ${row.p99} | ${row.errors} | x${speedup} |`,
  );
}
console.log(
  `\n${CONNECTIONS} connections, ${DURATION} s per scenario, ${WARMUP} s warm-up. ` +
    'The load generator and the server share one machine: compare the rows, ' +
    'do not treat the absolute numbers as a production benchmark.',
);
