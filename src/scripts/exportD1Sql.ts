import fs from 'fs';
import path from 'path';

import { config } from '../config';
import { all, initDatabase } from '../db/client';

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

const FTS_COLUMNS = [
  'id',
  'name',
  'keyWords',
  'primaryDiscipline',
  'secondaryDiscipline',
  'userName',
  'editorName',
  'source',
  'summary',
] as const;

const CJK_RUN = /[\u3400-\u9fff\uF900-\uFAFF]+/g;

export function toFtsText(value: unknown): string {
  const text = String(value ?? '');
  if (!text) return '';
  const tokens: string[] = [];
  CJK_RUN.lastIndex = 0;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = CJK_RUN.exec(text))) {
    pushLatinTokens(text.slice(last, match.index), tokens);
    pushCjkTokens(match[0], tokens);
    last = match.index + match[0].length;
  }
  pushLatinTokens(text.slice(last), tokens);
  return tokens.join(' ');
}

function pushLatinTokens(value: string, tokens: string[]): void {
  const parts = value.toLowerCase().match(/[a-z0-9_]+/g);
  if (parts) tokens.push(...parts);
}

function pushCjkTokens(run: string, tokens: string[]): void {
  for (let index = 0; index < run.length; index += 1) {
    tokens.push(run[index]);
  }
  for (let index = 0; index < run.length - 1; index += 1) {
    tokens.push(run.slice(index, index + 2));
  }
}

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

function insertFtsStatement(rows: RawRecord[]): string {
  const values = rows.map(
    row => `(${FTS_COLUMNS.map((column) => sqlValue(column === 'id' ? row.id : toFtsText(row[column]))).join(', ')})`,
  );
  return `INSERT INTO data_fts (${FTS_COLUMNS.join(', ')}) VALUES\n${values.join(',\n')};`;
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
    'DROP TABLE IF EXISTS data_fts;',
    'DELETE FROM meta;',
    `INSERT INTO meta (key, value) VALUES ('generatedAt', ${sqlValue(generatedAt)});`,
    `INSERT INTO meta (key, value) VALUES ('rowCount', ${sqlValue(String(rows.length))});`,
    'DELETE FROM data;',
  ];

  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    statements.push(insertStatement(rows.slice(index, index + INSERT_BATCH_SIZE)));
  }

  statements.push(
    'CREATE INDEX IF NOT EXISTS idx_data_year_id ON data(year, id);',
    `CREATE VIRTUAL TABLE data_fts USING fts5(
  id UNINDEXED,
  name,
  keyWords,
  primaryDiscipline,
  secondaryDiscipline,
  userName,
  editorName,
  source,
  summary,
  tokenize = 'unicode61'
);`,
  );

  for (let index = 0; index < rows.length; index += INSERT_BATCH_SIZE) {
    statements.push(insertFtsStatement(rows.slice(index, index + INSERT_BATCH_SIZE)));
  }

  const outputPath = path.resolve(config.d1ExportFile);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${statements.join('\n\n')}\n`, 'utf8');

  console.log(`[D1] exported ${rows.length} record(s) to ${outputPath}`);
}

const isExportCli = /exportD1Sql\.(ts|js)$/.test(String(process.argv[1] || '').replace(/\\/g, '/'));
if (isExportCli) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
