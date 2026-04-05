import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { syncDisciplineTagsToSelectedWorks } from '../services/tagSync';
import { runWithRunLogger } from '../services/runLogger';

async function main() {
  await initDatabase();
  await initTable();
  
  // 创建所有需要执行的skip值数组
  const skipValues = [];
  for(let skip = 0; skip < 3000; skip += 100) {
    skipValues.push(skip);
  }
  
  // 不设并发限制，所有任务同时执行
  await Promise.all(skipValues.map(skip => syncDisciplineTagsToSelectedWorks(skip)));
}

runWithRunLogger('sync-selected-tags', main).catch((error) => {
  console.error(error);
  process.exit(1);
});
