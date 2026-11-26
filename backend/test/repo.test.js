// Runs the shared repository checks against the in-memory repository always,
// and against PostgreSQL too when DATABASE_URL points at a database that has been migrated (CI does this).
import { runRepoContract } from '../testkit/repoContract.js';
import { createMemoryRepo } from '../src/repo/memoryRepo.js';

runRepoContract('memory', async () => ({ repo: createMemoryRepo() }));

const url = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
runRepoContract('postgres', async () => {
  const { createPgRepo } = await import('../src/repo/pgRepo.js');
  const repo = createPgRepo(url);
  // Start every test from empty tables (this only ever runs against a throw-away test database).
  await repo.pool.query('TRUNCATE bookings, staff_hours, staff_services, staff, services, users RESTART IDENTITY CASCADE');
  return { repo, cleanup: () => repo.close() };
}, { skip: !url && 'set DATABASE_URL to a migrated PostgreSQL database to run these' });
