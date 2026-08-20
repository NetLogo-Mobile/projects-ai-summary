const EXCLUDED_TAG = '小作品';
const MINIMUM_CONTENT_LENGTH = 50;

type WorkSummary = {
  Tags?: unknown;
  Description?: unknown;
};

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

export function getWorkContentLength(summary: WorkSummary): number {
  return getStringArray(summary.Description).join('').trim().length;
}

export function getTagSyncSkipReason(summary: WorkSummary): string | null {
  const tags = getStringArray(summary.Tags).map((tag) => tag.trim());
  if (tags.includes(EXCLUDED_TAG)) {
    return `包含“${EXCLUDED_TAG}”标签`;
  }

  const contentLength = getWorkContentLength(summary);
  if (contentLength < MINIMUM_CONTENT_LENGTH) {
    return `正文少于 ${MINIMUM_CONTENT_LENGTH} 字（当前 ${contentLength} 字）`;
  }

  return null;
}
