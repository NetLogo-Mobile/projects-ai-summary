export class SyncStoppedAfterApiFailuresError extends Error {
  constructor(
    readonly operation: string,
    readonly consecutiveFailures: number,
  ) {
    super(`API 连续失败 ${consecutiveFailures} 次，停止同步。最后失败操作: ${operation}`);
    this.name = 'SyncStoppedAfterApiFailuresError';
  }
}

export class ApiCallFailedError extends Error {
  constructor(
    readonly operation: string,
    readonly cause: unknown,
  ) {
    super(`API 调用失败: ${operation}`);
    this.name = 'ApiCallFailedError';
  }
}

export class ConsecutiveApiFailureGuard {
  private consecutiveFailures = 0;

  constructor(private readonly failureLimit: number = 2) {
    if (!Number.isInteger(failureLimit) || failureLimit < 1) {
      throw new Error('failureLimit 必须是正整数');
    }
  }

  async call<T>(
    operation: string,
    request: () => Promise<T>,
    isSuccess: (response: T) => boolean = () => true,
  ): Promise<T> {
    try {
      const response = await request();
      if (!isSuccess(response)) {
        throw new Error(`${operation} 返回失败状态`);
      }

      this.consecutiveFailures = 0;
      return response;
    } catch (error) {
      this.consecutiveFailures += 1;
      console.warn(
        `[sync-tags] API 调用失败 (${this.consecutiveFailures}/${this.failureLimit}): ${operation}`,
        error,
      );

      if (this.consecutiveFailures >= this.failureLimit) {
        throw new SyncStoppedAfterApiFailuresError(operation, this.consecutiveFailures);
      }

      throw new ApiCallFailedError(operation, error);
    }
  }
}
