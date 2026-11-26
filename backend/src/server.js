// Starts the real server. Reads settings, picks a database, wires everything together and listens.
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { createBookingService } from './domain/bookingService.js';
import { createAssistant } from './ai/assistant.js';
import { createAnthropicClient } from './ai/anthropicClient.js';
import { createPgRepo } from './repo/pgRepo.js';
import { createMemoryRepo } from './repo/memoryRepo.js';
import { seedDemoData } from './seedData.js';

const config = loadConfig();

// With DATABASE_URL: PostgreSQL. Without it (development only): in-memory demo mode with sample data.
let repo;
if (config.databaseUrl) {
  repo = createPgRepo(config.databaseUrl);
} else {
  repo = createMemoryRepo();
  await seedDemoData(repo, { adminEmail: process.env.ADMIN_EMAIL, adminPassword: process.env.ADMIN_PASSWORD });
  console.log('No DATABASE_URL: running in in-memory demo mode. Data is lost when the server stops.');
}

const svc = createBookingService({ repo, config });
const client = config.ai.apiKey ? createAnthropicClient({ apiKey: config.ai.apiKey, model: config.ai.model }) : null;
const assistant = createAssistant({ client, svc, config, log: (m) => console.error(m) });
if (!client) console.log('ANTHROPIC_API_KEY is not set: the AI assistant is switched off.');

const app = createApp({ repo, svc, assistant, config });
const server = app.listen(config.port, () => console.log(`Booking API listening on port ${config.port}`));

// Shut down cleanly when the host stops the container (finish requests, close database connections).
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => { await repo.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
