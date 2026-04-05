import { initDatabase } from './db/client';
import { runWithRunLogger } from './services/runLogger';

runWithRunLogger('init-database', async () => {
  await initDatabase();
}).catch((e) => {
  console.error('Failed to initialize database:', e);
  process.exit(1);
});
