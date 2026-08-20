import { config } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { backfillHistoricalRecordSources } from '../services/recordSourceBackfill';
import { runWithRunLogger } from '../services/runLogger';

async function main() {
  const username = config.plAdminUsername || config.plUsername;
  const password = config.plAdminPassword || config.plPassword;
  if (!username || !password) {
    throw new Error('请配置 PL_ADMIN_USERNAME / PL_ADMIN_PASSWORD 或 PL_USERNAME / PL_PASSWORD');
  }

  await initDatabase();
  await initTable();
  const counts = await backfillHistoricalRecordSources(username, password);
  console.log('[backfill-sources] 历史来源回填完成:', counts);
}

runWithRunLogger('backfill-record-sources', main).catch((error) => {
  console.error(error);
  process.exit(1);
});
