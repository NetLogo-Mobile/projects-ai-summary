import dotenv from 'dotenv';

dotenv.config();

function readEnv(name: string): string | undefined {
  const value = process.env[name];
  if (value == null) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function readEnvWithDefault(name: string, defaultValue: string): string {
  return readEnv(name) ?? defaultValue;
}

function readEnvList(name: string, fallback: string): string[] {
  return readEnvWithDefault(name, fallback)
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function readEnvInt(name: string, fallback: number): number {
  const raw = readEnv(name);
  if (!raw) return fallback;

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readEnvIntAtLeast(name: string, fallback: number, minimum: number): number {
  return Math.max(readEnvInt(name, fallback), minimum);
}

const openaiApiKey = readEnv('OPENAI_API_KEY');
const sparkApiPassword = readEnv('SPARK_API_PASSWORD');

export const config = {
  databasePath: readEnvWithDefault('DB_PATH', './data.db'),
  d1ExportFile: readEnvWithDefault('D1_EXPORT_FILE', './cloudflare/d1/data.sql'),
  plUsername: readEnvWithDefault('PL_USERNAME', ''),
  plPassword: readEnvWithDefault('PL_PASSWORD', ''),
  discussionTags: readEnvList('PL_DISCUSSION_TAG', '精选'),
  discussionTypes: readEnvList('PL_DISCUSSION_TYPE', 'Discussion'),
  plBaseUrl: readEnvWithDefault('PL_BASE_URL', 'https://physics-api-cn.turtlesim.com'),
  skip: readEnvInt('SKIP', 0),
  take: readEnvInt('TAKE', -100),
  collectPageSize: readEnvIntAtLeast('COLLECT_PAGE_SIZE', 20, 1),
  collectBatchSize: readEnvIntAtLeast('COLLECT_BATCH_SIZE', 20, 1),
  collectAnalyzeConcurrency: readEnvIntAtLeast('COLLECT_ANALYZE_CONCURRENCY', 5, 1),
  collectInsertConcurrency: readEnvIntAtLeast('COLLECT_INSERT_CONCURRENCY', 5, 1),
  collectPageDelayMs: readEnvIntAtLeast('COLLECT_PAGE_DELAY_MS', 0, 0),
  collectBatchDelayMs: readEnvIntAtLeast('COLLECT_BATCH_DELAY_MS', 0, 0),
  apiKey: openaiApiKey ?? sparkApiPassword ?? '',
  model: readEnv('OPENAI_MODEL') ?? readEnv('SPARK_MODEL') ?? 'gpt-3.5-turbo',
  apiBaseUrl: readEnvWithDefault('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
  aiRequestTimeoutMs: readEnvInt('AI_REQUEST_TIMEOUT_MS', 45000),
  apiEndpoint: readEnvWithDefault(
    'SPARK_ENDPOINT',
    'https://spark-api-open.xf-yun.com/v1/chat/completions',
  ),

  get discussionType() { return this.discussionTypes[0]; },
  get openaiApiKey() { return openaiApiKey ?? ''; },
};


export function assertEnv(): void {
  const missing: string[] = [];
  if (!config.plUsername) missing.push('PL_USERNAME');
  if (!config.plPassword) missing.push('PL_PASSWORD');

  if (!config.apiKey) {
    missing.push('OPENAI_API_KEY or SPARK_API_PASSWORD');
  }

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}
