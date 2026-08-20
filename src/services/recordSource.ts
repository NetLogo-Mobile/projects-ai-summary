export const OTHER_RECORD_SOURCE = '其他';

export const RECORD_SOURCE_QUERIES = [
  { type: 'Experiment', tag: '精选', source: '实验精选' },
  { type: 'Discussion', tag: '精选', source: '黑洞精选' },
  { type: 'Discussion', tag: '小说', source: '黑洞小说' },
] as const;

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

export function classifyHistoricalRecordSources(
  localIds: Iterable<string>,
  sourceIds: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, string> {
  const classifications = new Map<string, string>();

  for (const id of localIds) {
    classifications.set(id, OTHER_RECORD_SOURCE);
  }

  // Later, more specific queries override broader source matches.
  for (const query of RECORD_SOURCE_QUERIES) {
    for (const id of sourceIds.get(query.source) ?? []) {
      if (classifications.has(id)) {
        classifications.set(id, query.source);
      }
    }
  }

  return classifications;
}
