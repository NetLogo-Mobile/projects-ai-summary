import { assertEnv } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { runDiscussionBot } from '../services/discussionBot';
import { runWithRunLogger } from '../services/runLogger';

async function main() {
  assertEnv();
  await initDatabase();
  await initTable();
  await runDiscussionBot();
}

runWithRunLogger('run-bot', main).catch((e) => {
  console.error(e);
  process.exit(1);
});
