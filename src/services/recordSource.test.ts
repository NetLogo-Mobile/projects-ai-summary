import assert from 'node:assert/strict';
import test from 'node:test';

import {
  OTHER_RECORD_SOURCE,
  resolveRecordSource,
} from './recordSource';

test('按作品类型和作品标签生成来源', () => {
  assert.equal(resolveRecordSource('Experiment', ['知识库', '精选']), '实验精选');
  assert.equal(resolveRecordSource('Discussion', ['交流', '精选']), '黑洞精选');
  assert.equal(resolveRecordSource('Discussion', ['小说专区']), '黑洞小说');
});

test('未知来源组合标记为其他', () => {
  assert.equal(resolveRecordSource('Experiment', ['教程']), OTHER_RECORD_SOURCE);
  assert.equal(resolveRecordSource('Unknown', ['精选']), OTHER_RECORD_SOURCE);
});

test('支持 API 的 $values 标签格式', () => {
  assert.equal(resolveRecordSource('Experiment', { $values: ['精选'] }), '实验精选');
});
