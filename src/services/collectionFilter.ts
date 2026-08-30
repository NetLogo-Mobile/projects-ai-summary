const EXCLUDED_TAG = '小作品';

type WorkSummary = {
  Tags?: unknown;
  Description?: unknown;
};

function getStringArray(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (value && typeof value === 'object' && '$values' in value) {
    return getStringArray((value as { $values?: unknown }).$values);
  }
  return [];
}

export function getCollectionSkipReason(summary: WorkSummary): string | null {
  const tags = getStringArray(summary.Tags).map((tag) => tag.trim());
  if (tags.includes(EXCLUDED_TAG)) {
    return `包含“${EXCLUDED_TAG}”标签`;
  }

  return null;
}
