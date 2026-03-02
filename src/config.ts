import dotenv from 'dotenv';

dotenv.config();

export const config = {
  databasePath: process.env.DB_PATH ?? './data.db',
  plUsername: process.env.PL_USERNAME ?? process.env.USERNAME ?? '',
  plPassword: process.env.PL_PASSWORD ?? process.env.PASSWORD ?? '',
  discussionTag: process.env.PL_DISCUSSION_TAG ?? '精选',
  discussionId: process.env.PL_DISCUSSION_ID ?? '69a59f0eca7ceb749317ef7c',
  sparkApiPassword: process.env.SPARK_API_PASSWORD ?? '',
  sparkModel: process.env.SPARK_MODEL ?? 'spark-max',
  sparkEndpoint:
    process.env.SPARK_ENDPOINT ?? 'https://spark-api-open.xf-yun.com/v1/chat/completions'
};

export function assertEnv(): void {
  const missing: string[] = [];
  if (!config.plUsername) missing.push('PL_USERNAME');
  if (!config.plPassword) missing.push('PL_PASSWORD');
  if (!config.sparkApiPassword) missing.push('SPARK_API_PASSWORD');

  if (missing.length > 0) {
    throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
}
