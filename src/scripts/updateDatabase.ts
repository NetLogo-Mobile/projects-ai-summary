import { assertEnv, config } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { collectByTypeWithOptions } from '../services/collector';

async function main() {
  assertEnv();
  await initDatabase();
  await initTable();
  
  let totalInserted = 0;
  let totalSkipped = 0;
  
  for (const discussionType of ['Experiment', 'Discussion']) {
    console.log(`\n[update-db] 收集: 类型=${discussionType}`);
    const result = await collectByTypeWithOptions(discussionType, config.skip, undefined, config.take);
    totalInserted += result.inserted;
    totalSkipped += result.skipped;
    console.log(`[update-db]   结果: 插入=${result.inserted}, 跳过=${result.skipped}`);
  }
  
  console.log(`\n[update-db] 总结: 插入=${totalInserted}, 跳过=${totalSkipped}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
