import fs from 'fs';
import path from 'path';
import { assertEnv } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { backfillByDiscussionIds } from '../services/collector';

async function main() {
  assertEnv();
  await initDatabase();
  await initTable();

  const listFile = process.argv[2] ?? 'history-ids.txt';
  const abs = path.resolve(listFile);
  if (!fs.existsSync(abs)) {
    throw new Error(`未找到历史ID文件: ${abs}`);
  }

  const ids = fs
    .readFileSync(abs, 'utf8')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const result = await backfillByDiscussionIds(ids);
  console.log('[check-history]', result);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
