import fs from 'fs';
import path from 'path';

import { config } from '../config';
import { all, initDatabase } from '../db/client';

// D1 对单条 SQL 语句有 100KB 上限（超出报 SQLITE_TOOBIG），因此除了行数上限外，
// 还要按语句字节数分批：FTS 语句里的中文分词（unigram + bigram）会让单行文本
// 膨胀约 4 倍，仅按行数分批会让 FTS 语句贴线超限。字节上限留 10KB 余量。
export const INSERT_BATCH_SIZE = 20;
export const INSERT_MAX_BYTES = 90 * 1024;

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

export interface RawRecord {
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

export function buildStatements(
  header: string,
  rows: RawRecord[],
  renderRow: (row: RawRecord) => string,
): string[] {
  const statements: string[] = [];
  let batch: string[] = [];
  let batchBytes = Buffer.byteLength(header, 'utf8');

  const flush = (): void => {
    if (batch.length === 0) return;
    statements.push(`${header}\n${batch.join(',\n')};`);
    batch = [];
    batchBytes = Buffer.byteLength(header, 'utf8');
  };

  for (const row of rows) {
    const value = renderRow(row);
    // 每行预算包含 ",\n" 连接符，与最终语句的字节数精确一致
    const valueBytes = Buffer.byteLength(value, 'utf8') + 2;
    if (batch.length >= INSERT_BATCH_SIZE || batchBytes + valueBytes > INSERT_MAX_BYTES) {
      flush();
      if (valueBytes > INSERT_MAX_BYTES) {
        console.warn(
          `[D1] id=${row.id} 序列化后 ${valueBytes} 字节，超过单条语句 ${INSERT_MAX_BYTES} 字节上限，将以单独语句导入`,
        );
      }
    }
    batch.push(value);
    batchBytes += valueBytes;
  }
  flush();

  return statements;
}

function dataInsertStatements(rows: RawRecord[]): string[] {
  const header = `INSERT INTO data (${DATA_COLUMNS.join(', ')}) VALUES`;
  return buildStatements(
    header,
    rows,
    row => `(${DATA_COLUMNS.map(column => sqlValue(row[column])).join(', ')})`,
  );
}

function ftsInsertStatements(rows: RawRecord[]): string[] {
  const header = `INSERT INTO data_fts (${FTS_COLUMNS.join(', ')}) VALUES`;
  return buildStatements(
    header,
    rows,
    row => `(${FTS_COLUMNS.map((column) => sqlValue(column === 'id' ? row.id : toFtsText(row[column]))).join(', ')})`,
  );
}

function sqlValue(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  const text = String(value)
    .replace(/\0/g, '')
    .replace(/'/g, "''");
  return `'${text}'`;
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

  statements.push(...dataInsertStatements(rows));

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

  statements.push(...ftsInsertStatements(rows));

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
