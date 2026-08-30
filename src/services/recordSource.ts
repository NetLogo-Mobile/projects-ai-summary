export const OTHER_RECORD_SOURCE = '其他';

export function resolveRecordSource(type: string, tag: string): string {
  const normalizedType = type.trim().toLowerCase();
  const normalizedTag = tag.trim();

  if (normalizedType === 'experiment' && normalizedTag === '精选') {
    return '实验精选';
  }
  if (normalizedType === 'discussion' && normalizedTag === '精选') {
    return '黑洞精选';
  }
  if (normalizedType === 'discussion' && normalizedTag === '小说') {
    return '黑洞小说';
  }

  return OTHER_RECORD_SOURCE;
}
