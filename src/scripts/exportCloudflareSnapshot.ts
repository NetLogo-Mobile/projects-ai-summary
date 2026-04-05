import fs from 'fs';
import path from 'path';

import { config } from '../config';
import { all, initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { serializeRecordForAdmin } from '../services/databasePatch';
import { runWithRunLogger } from '../services/runLogger';
import { DataRecord } from '../types/data';

async function main() {
  await initDatabase();
  await initTable();

  const rows = await all<DataRecord>(
    'SELECT * FROM data ORDER BY year DESC, readability ASC, id ASC',
  );
  const snapshot = rows.map(serializeRecordForAdmin);
  const outputPath = path.resolve(config.cloudflareExportFile);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `export const generatedAt = ${JSON.stringify(new Date().toISOString())};\nexport const records = ${JSON.stringify(
      snapshot,
      null,
      2,
    )};\n`,
    'utf8',
  );

  console.log(`[Cloudflare] exported ${snapshot.length} record(s) to ${outputPath}`);
}

runWithRunLogger('export-cloudflare-snapshot', main).catch((error) => {
  console.error(error);
  process.exit(1);
});
