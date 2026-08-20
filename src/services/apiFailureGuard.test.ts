import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ApiCallFailedError,
  ConsecutiveApiFailureGuard,
  SyncStoppedAfterApiFailuresError,
} from './apiFailureGuard';

test('连续两次 API 失败时停止同步', async () => {
  const guard = new ConsecutiveApiFailureGuard();

  await assert.rejects(() => guard.call('first', async () => {
    throw new Error('first failure');
  }), ApiCallFailedError);

  await assert.rejects(
    () => guard.call('second', async () => {
      throw new Error('second failure');
    }),
    SyncStoppedAfterApiFailuresError,
  );
});

test('成功调用会清零连续失败次数', async () => {
  const guard = new ConsecutiveApiFailureGuard();

  await assert.rejects(() => guard.call('first', async () => {
    throw new Error('first failure');
  }));
  await guard.call('success', async () => 'ok');
  await assert.rejects(
    () => guard.call('next failure', async () => {
      throw new Error('next failure');
    }),
    ApiCallFailedError,
  );
});

test('失败状态与请求异常采用相同计数规则', async () => {
  const guard = new ConsecutiveApiFailureGuard();

  await assert.rejects(
    () => guard.call('bad response', async () => ({ Status: 500 }), (response) => response.Status === 200),
    ApiCallFailedError,
  );
  await assert.rejects(
    () => guard.call('request error', async () => {
      throw new Error('network error');
    }),
    SyncStoppedAfterApiFailuresError,
  );
});

test('停止信号出现后不再启动后续任务', async () => {
  const guard = new ConsecutiveApiFailureGuard();
  const started: string[] = [];
  const tasks = [
    async () => 'completed',
    async () => { throw new Error('first failure'); },
    async () => { throw new Error('second failure'); },
    async () => 'should not start',
  ];

  for (const [index, task] of tasks.entries()) {
    try {
      started.push(String(index));
      await guard.call(`task ${index}`, task);
    } catch (error) {
      if (error instanceof SyncStoppedAfterApiFailuresError) break;
    }
  }

  assert.deepEqual(started, ['0', '1', '2']);
});
