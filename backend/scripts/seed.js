// Puts demo services, staff and opening hours into the database, and creates the admin account.
// Usage: DATABASE_URL=... ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long password' npm run seed
import { createPgRepo } from '../src/repo/pgRepo.js';
import { seedDemoData } from '../src/seedData.js';

if (!process.env.DATABASE_URL) { console.error('Set DATABASE_URL first.'); process.exit(1); }
const adminPassword = process.env.ADMIN_PASSWORD;
if (adminPassword && adminPassword.length < 10) { console.error('ADMIN_PASSWORD must have at least 10 characters.'); process.exit(1); }

const repo = createPgRepo(process.env.DATABASE_URL);
try {
  await seedDemoData(repo, { adminEmail: process.env.ADMIN_EMAIL, adminPassword, log: console.log });
} finally {
  await repo.close();
}
