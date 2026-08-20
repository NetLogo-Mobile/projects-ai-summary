import assert from 'node:assert/strict';
import test from 'node:test';

import { getTagSyncSkipReason, getWorkContentLength } from './tagSyncFilter';

test('过滤带有小作品标签的作品', () => {
  const reason = getTagSyncSkipReason({
    Tags: ['精选', '小作品'],
    Description: ['这是一段超过五十个字符的作品正文。'.repeat(4)],
  }, 'Discussion');

  assert.equal(reason, '包含“小作品”标签');
});

test('过滤正文少于五十字的作品', () => {
  const reason = getTagSyncSkipReason({
    Tags: ['精选'],
    Description: ['四十九字以内'],
  }, 'Discussion');

  assert.match(reason ?? '', /正文少于 50 字/);
});

test('正文达到五十字时允许同步', () => {
  const reason = getTagSyncSkipReason({
    Tags: ['精选'],
    Description: ['字'.repeat(50)],
  }, 'Discussion');

  assert.equal(reason, null);
});

test('正文长度合并所有描述段并忽略两端空白', () => {
  assert.equal(getWorkContentLength({ Description: ['  ', '字'.repeat(20), '字'.repeat(30), '  '] }), 50);
});

test('Experiment 类型允许带有小作品标签', () => {
  const reason = getTagSyncSkipReason({
    Tags: ['小作品'],
    Description: ['字'.repeat(50)],
  }, 'Experiment');

  assert.equal(reason, null);
});
