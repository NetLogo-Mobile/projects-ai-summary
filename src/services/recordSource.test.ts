import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyHistoricalRecordSources,
  OTHER_RECORD_SOURCE,
  resolveRecordSource,
} from './recordSource';

test('按作品类型和筛选标签生成来源', () => {
  assert.equal(resolveRecordSource('Experiment', '精选'), '实验精选');
  assert.equal(resolveRecordSource('Discussion', '精选'), '黑洞精选');
  assert.equal(resolveRecordSource('Discussion', '小说'), '黑洞小说');
});

test('未知来源组合标记为其他', () => {
  assert.equal(resolveRecordSource('Experiment', '教程'), OTHER_RECORD_SOURCE);
  assert.equal(resolveRecordSource('Unknown', '精选'), OTHER_RECORD_SOURCE);
});

test('历史来源按远端集合回填且小说来源优先', () => {
  const sourceIds = new Map<string, ReadonlySet<string>>([
    ['实验精选', new Set(['experiment'])],
    ['黑洞精选', new Set(['selected', 'novel'])],
    ['黑洞小说', new Set(['novel'])],
  ]);

  const result = classifyHistoricalRecordSources(
    ['experiment', 'selected', 'novel', 'unmatched'],
    sourceIds,
  );

  assert.deepEqual(Object.fromEntries(result), {
    experiment: '实验精选',
    selected: '黑洞精选',
    novel: '黑洞小说',
    unmatched: OTHER_RECORD_SOURCE,
  });
});
