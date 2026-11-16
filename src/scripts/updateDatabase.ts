import { assertEnv, config } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { collectByTypeWithOptions } from '../services/collector';
import { login } from '../pl/client';

async function main() {
  assertEnv();
  await initDatabase();
  await initTable();

  // Log in once and share the session across categories. Logging in per category
  // doubled the auth calls and tripped the community API's login throttling.
  const session = await login(config.plUsername, config.plPassword);

  let totalInserted = 0;
  let totalSkipped = 0;
  
  for (const discussionType of ['Experiment', 'Discussion']) {
    console.log(`\n[update-db] 收集: 类型=${discussionType}`);
    try {
      const result = await collectByTypeWithOptions(discussionType, config.skip, undefined, config.take, session);
      totalInserted += result.inserted;
      totalSkipped += result.skipped;
      console.log(`[update-db]   结果: 插入=${result.inserted}, 跳过=${result.skipped}`);
    } catch (error) {
      // One category failing (e.g. upstream hiccup) must not discard the other's work.
      console.error(`[update-db] 类型=${discussionType} 采集失败，继续下一个`, error instanceof Error ? error.message : String(error));
    }
  }
  
  console.log(`\n[update-db] 总结: 插入=${totalInserted}, 跳过=${totalSkipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
