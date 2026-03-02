import { initDatabase } from './db/client';
import './scripts/scheduler';

initDatabase().catch((e) => {
  console.error('Failed to initialize database:', e);
  process.exit(1);
});
