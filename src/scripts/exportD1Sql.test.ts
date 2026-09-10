import assert from 'node:assert/strict';
import test from 'node:test';

import { toFtsText } from './exportD1Sql';

test('toFtsText indexes Chinese unigrams and bigrams', () => {
  assert.equal(toFtsText('静力学'), '静 力 学 静力 力学');
});

test('toFtsText lowercases Latin tokens', () => {
  assert.equal(toFtsText('NetLogo physics'), 'netlogo physics');
});

test('toFtsText splits mixed Chinese and Latin', () => {
  assert.equal(toFtsText('力学NetLogo'), '力 学 力学 netlogo');
});
