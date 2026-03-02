import { assertEnv } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { runDiscussionBot } from '../services/bot';

async function main() {
  assertEnv();
  await initDatabase();
  await initTable();
  await runDiscussionBot();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
