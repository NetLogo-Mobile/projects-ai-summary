import { config } from '../config';
import { initDatabase } from '../db/client';
import { initTable } from '../db/repository';
import { applyPatchFile, loadPatchFile } from '../services/databasePatch';
import { runWithRunLogger } from '../services/runLogger';

async function main() {
  await initDatabase();
  await initTable();

  const patchFile = loadPatchFile();
  if (patchFile.operations.length === 0) {
    console.log(`[Patch] no operations found in ${config.dbPatchFile}`);
    return;
  }

  const applied = await applyPatchFile(patchFile);
  console.log(`[Patch] applied ${applied} operation(s) from ${config.dbPatchFile}`);
}

runWithRunLogger('apply-database-patch', main).catch((error) => {
  console.error(error);
  process.exit(1);
});
