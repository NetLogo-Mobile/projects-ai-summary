import fs from 'fs';
import path from 'path';

import { config } from '../config';
import { all, initDatabase } from '../db/client';
import { runWithRunLogger } from '../services/runLogger';

// 单条 INSERT 语句的行数。D1 对单条 SQL 语句有 100KB 上限，
// 平均每行约 1-2KB，20 行一批可以留出足够的安全余量。
const INSERT_BATCH_SIZE = 20;

const DATA_COLUMNS = [
  'id',
  'name',
  'contentLength',
  'userID',
  'userName',
  'editorID',
  'editorName',
  'year',
  'summary',
  'primaryDiscipline',
  'secondaryDiscipline',
  'keyWords',
  'readability',
  'taggingModel',
  'source',
] as const;

interface RawRecord {
  id: string;
  name: string | null;
  contentLength: number | null;
  userID: string | null;
  userName: string | null;
  editorID: string | null;
  editorName: string | null;
  year: number | null;
  summary: string | null;
  primaryDiscipline: string | null;
  secondaryDiscipline: string | null;
  keyWords: string | null;
  readability: number | null;
  taggingModel: string | null;
  source: string | null;
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  const text = String(value)
    .replace(/\0/g, '')
    .replace(/'/g, "''");
  return `'${text}'`;
}

function insertStatement(rows: RawRecord[]): string {
  const values = rows.map(
    row => `(${DATA_COLUMNS.map(column => sqlValue(row[column])).join(', ')})`,
  );
  return `INSERT INTO data (${DATA_COLUMNS.join(', ')}) VALUES\n${values.join(',\n')};`;
}

async function main(): Promise<void> {
  await initDatabase();

  const rows = await all<RawRecord>(
    'SELECT * FROM data ORDER BY year DESC, readability ASC, id ASC',
  );
  const generatedAt = new Date().toISOString();

  const statements: string[] = [
    `CREATE TABLE IF NOT EXISTS data (
  id TEXT PRIMARY KEY,
  name TEXT,
  contentLength INTEGER,
  userID TEXT,
  userName TEXT,
  editorID TEXT,
  editorName TEXT,
  year INTEGER,
  summary TEXT,
  primaryDiscipline TEXT,
  secondaryDiscipline TEXT,
  keyWords TEXT,
  readability REAL,
  taggingModel TEXT,
  source TEXT
);`,
    'CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);',
    'DELETE FROM meta;',
    `INSERT INTO meta (key, value) VALUES ('generatedAt', ${sqlValue(generatedAt)});`,
    'DELETE FROM data;',
  ];

  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    statements.push(insertStatement(rows.slice(index, index + INSERT_BATCH_SIZE)));
  }

  const outputPath = path.resolve(config.d1ExportFile);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${statements.join('\n\n')}\n`, 'utf8');

  console.log(`[D1] exported ${rows.length} record(s) to ${outputPath}`);
}

runWithRunLogger('export-d1-sql', main).catch((error) => {
  console.error(error);
  process.exit(1);
});
