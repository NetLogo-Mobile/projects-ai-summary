import cron from 'node-cron';
import { assertEnv, config } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { collectByTag } from '../services/collector';
import { runDiscussionBot } from '../services/bot';

async function runSyncWorksJob(): Promise<void> {
  const result = await collectByTag(config.discussionTag);
  console.log('[cron][sync-works]', result);
}

async function runFetchQueriesJob(): Promise<void> {
  await runDiscussionBot();
  console.log('[cron][fetch-queries] bot initialized');
}

async function main() {
  assertEnv();
  await initDatabase();
  await initTable();

  // 启动时分别执行一次，随后按不同周期执行
  await runSyncWorksJob();
  await runFetchQueriesJob();

  // 同步作品：每三天一次（凌晨2点）
  cron.schedule('0 2 */3 * *', async () => {
    try {
      await runSyncWorksJob();
    } catch (error) {
      console.error('[cron][sync-works] failed', error);
    }
  });

  // 获取查询：每小时一次
  cron.schedule('0 * * * *', async () => {
    try {
      await runFetchQueriesJob();
    } catch (error) {
      console.error('[cron][fetch-queries] failed', error);
    }
  });

  console.log('scheduler started');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
