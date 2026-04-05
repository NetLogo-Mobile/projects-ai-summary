import { assertEnv } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { runDiscussionBotOnce } from '../services/discussionBot';
import { runWithRunLogger } from '../services/runLogger';

async function main() {
  assertEnv();
  await initDatabase();
  await initTable();
  await runDiscussionBotOnce();
}

runWithRunLogger('run-bot-once', main).catch((e) => {
  console.error(e);
  process.exit(1);
});
