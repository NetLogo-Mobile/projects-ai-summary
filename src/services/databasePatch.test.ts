import assert from 'node:assert/strict';
import test from 'node:test';

import { coerceAdminRecord, serializeRecordForAdmin } from './databasePatch';

const baseRecord = {
  id: 'record-id',
  name: 'record-name',
  contentLength: 100,
  userID: 'user-id',
  userName: 'user-name',
  editorID: '',
  editorName: '',
  year: 2026,
  summary: 'summary',
  primaryDiscipline: '[]',
  secondaryDiscipline: '[]',
  keyWords: '[]',
  readability: 0.5,
  taggingModel: 'model',
};

test('旧补丁记录缺少来源时默认标记为其他', () => {
  const record = coerceAdminRecord(baseRecord);

  assert.equal(record.source, '其他');
});

test('管理快照保留作品来源', () => {
  const record = coerceAdminRecord({ ...baseRecord, source: '黑洞小说' });
  const serialized = serializeRecordForAdmin(record);

  assert.equal(serialized.source, '黑洞小说');
});
