import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { syncDisciplineTagsToSelectedWorks } from '../services/tagSync';
import { runWithRunLogger } from '../services/runLogger';
import {
  ApiCallFailedError,
  ConsecutiveApiFailureGuard,
  SyncStoppedAfterApiFailuresError,
} from '../services/apiFailureGuard';

async function main() {
  await initDatabase();
  await initTable();
  
  const apiFailureGuard = new ConsecutiveApiFailureGuard(2);

  for (let skip = 0; skip < 3000; skip += 100) {
    try {
      await syncDisciplineTagsToSelectedWorks(skip, apiFailureGuard);
    } catch (error) {
      if (error instanceof SyncStoppedAfterApiFailuresError) {
        console.warn(`[sync-tags] ${error.message} 已完成的标签更新保持生效。`);
        return;
      }

      if (error instanceof ApiCallFailedError) {
        console.warn(`[sync-tags] 跳过分页 skip=${skip}: ${error.message}`);
        continue;
      }

      throw error;
    }
  }
}

runWithRunLogger('sync-selected-tags', main).catch((error) => {
  console.error(error);
  process.exit(1);
});
