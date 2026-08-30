import assert from 'node:assert/strict';
import test from 'node:test';

import { getCollectionSkipReason } from './collectionFilter';

test('过滤带有小作品标签的作品', () => {
  const reason = getCollectionSkipReason({
    Tags: ['精选', '小作品'],
    Description: ['这是一段超过五十个字符的作品正文。'.repeat(4)],
  });

  assert.equal(reason, '包含“小作品”标签');
});

test('正文较短但没有小作品标签时允许同步', () => {
  const reason = getCollectionSkipReason({
    Tags: ['精选'],
    Description: ['四十九字以内'],
  });

  assert.equal(reason, null);
});

test('所有类型都过滤带有小作品标签的作品', () => {
  const reason = getCollectionSkipReason({
    Tags: ['小作品'],
    Description: ['字'.repeat(50)],
  });

  assert.equal(reason, '包含“小作品”标签');
});

test('支持 API 的 $values 标签格式', () => {
  const reason = getCollectionSkipReason({
    Tags: { $values: ['小作品'] },
    Description: ['字'.repeat(50)],
  });

  assert.equal(reason, '包含“小作品”标签');
});
