// Shared test set-up: a small world with a fixed clock, an in-memory database and the demo data.
// Lives outside test/ because the test runner would try to execute every file inside test/.
import { loadConfig } from '../src/config.js';
import { createMemoryRepo } from '../src/repo/memoryRepo.js';
import { createBookingService } from '../src/domain/bookingService.js';
import { seedDemoData } from '../src/seedData.js';
import { hashPassword } from '../src/auth/passwords.js';
import { zonedToUtc } from '../src/time/zones.js';

// "Now" is Thursday 26 November 2026, 08:00 in Nairobi (05:00 UTC). Tomorrow is Friday the 27th.
export const NOW = zonedToUtc('2026-11-26', '08:00', 'Africa/Nairobi');
export const TOMORROW = '2026-11-27';

export async function makeWorld({ env = {}, now = NOW } = {}) {
  const config = loadConfig({ ...env });
  const state = { now };
  const clock = () => state.now;
  const repo = createMemoryRepo();
  await seedDemoData(repo);
  const svc = createBookingService({ repo, config, clock });
  const services = await repo.listServices();
  const byName = Object.fromEntries(services.map((s) => [s.name, s]));

  let counter = 0;
  async function makeUser({ role = 'CUSTOMER', name = 'Test User' } = {}) {
    counter += 1;
    return repo.createUser({ email: `user${counter}@example.com`, passwordHash: await hashPassword('correct horse battery'), fullName: name, role });
  }
  const at = (date, time) => new Date(zonedToUtc(date, time, config.business.timezone)).toISOString();

  return { config, repo, svc, clock, state, services, byName, makeUser, at };
}
