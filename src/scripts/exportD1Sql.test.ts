import assert from 'node:assert/strict';
import test from 'node:test';

import { buildStatements, INSERT_BATCH_SIZE, INSERT_MAX_BYTES, toFtsText } from './exportD1Sql';
import type { RawRecord } from './exportD1Sql';

function makeRow(id: number, summary: string): RawRecord {
  return {
    id: `row-${id}`,
    name: `作品${id}`,
    contentLength: summary.length,
    userID: 'u1',
    userName: '作者',
    editorID: null,
    editorName: null,
    year: 2026,
    summary,
    primaryDiscipline: null,
    secondaryDiscipline: null,
    keyWords: null,
    readability: 1,
    taggingModel: null,
    source: null,
  };
}

function countValues(statement: string): number {
  return statement.split(',\n').length;
}

test('toFtsText indexes Chinese unigrams and bigrams', () => {
  assert.equal(toFtsText('静力学'), '静 力 学 静力 力学');
});

test('toFtsText lowercases Latin tokens', () => {
  assert.equal(toFtsText('NetLogo physics'), 'netlogo physics');
});

test('toFtsText splits mixed Chinese and Latin', () => {
  assert.equal(toFtsText('力学NetLogo'), '力 学 力学 netlogo');
});

test('buildStatements keeps every statement under the byte cap', () => {
  // 每行约 12KB，20 行一批按行数会到 240KB，按字节必须在 90KB 处切分
  const rows = Array.from({ length: 12 }, (_, index) => makeRow(index, '物'.repeat(4000)));
  const header = 'INSERT INTO data_fts (summary) VALUES';
  const statements = buildStatements(header, rows, row => `'${toFtsText(row.summary!)}'`);

  assert.equal(statements.reduce((sum, stmt) => sum + countValues(stmt), 0), rows.length);
  for (const stmt of statements) {
    assert.ok(Buffer.byteLength(stmt, 'utf8') <= INSERT_MAX_BYTES, '语句超出字节上限');
  }
});

test('buildStatements keeps at most INSERT_BATCH_SIZE rows per statement', () => {
  const rows = Array.from({ length: 45 }, (_, index) => makeRow(index, '短摘要'));
  const statements = buildStatements('INSERT INTO data (summary) VALUES', rows, row => `'${row.summary}'`);

  assert.equal(statements.length, Math.ceil(rows.length / INSERT_BATCH_SIZE));
  for (const stmt of statements) {
    assert.ok(countValues(stmt) <= INSERT_BATCH_SIZE, '单条语句行数超出上限');
  }
});

test('buildStatements isolates a single oversized row', () => {
  const rows = [makeRow(0, '小'), makeRow(1, '物'.repeat(60000)), makeRow(2, '小')];
  const statements = buildStatements('INSERT INTO data_fts (id, summary) VALUES', rows, row => `('${row.id}', '${toFtsText(row.summary!)}')`);

  const oversized = statements.find(stmt => countValues(stmt) === 1 && Buffer.byteLength(stmt, 'utf8') > INSERT_MAX_BYTES);
  assert.ok(oversized, '超限单行应以单独语句导出');
  assert.deepEqual(statements.map(countValues), [1, 1, 1]);
  assert.ok(statements[0].includes('row-0'));
  assert.ok(statements[1].includes('row-1'));
  assert.ok(statements[2].includes('row-2'));
});
