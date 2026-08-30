export const OTHER_RECORD_SOURCE = '其他';

function getTags(value: unknown): string[] {
  if (typeof value === 'string') return [value.trim()];
  if (Array.isArray(value)) return value.map((tag) => String(tag).trim());
  if (value && typeof value === 'object' && '$values' in value) {
    return getTags((value as { $values?: unknown }).$values);
  }
  return [];
}

export function resolveRecordSource(type: string, tagsValue: unknown): string {
  const normalizedType = type.trim().toLowerCase();
  const tags = getTags(tagsValue);

  if (normalizedType === 'experiment' && tags.includes('精选')) {
    return '实验精选';
  }
  if (normalizedType === 'discussion' && tags.includes('精选')) {
    return '黑洞精选';
  }
  if (normalizedType === 'discussion' && (tags.includes('小说') || tags.includes('小说专区'))) {
    return '黑洞小说';
  }

  return OTHER_RECORD_SOURCE;
}
