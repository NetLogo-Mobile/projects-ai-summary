// 纯函数搜索核心：Worker（D1）与 Render（内存）共用。
// 保持与原 includesIgnoreCase / 前台优先级一致的语义。

export const MATCH_PRIORITY_FIELDS = [
  ["name"],
  ["keyWords"],
  ["primaryDiscipline", "secondaryDiscipline"],
  ["userName"],
  ["source"],
  ["summary"],
];

export const ALL_MATCH_FIELDS = [
  "name",
  "keyWords",
  "primaryDiscipline",
  "secondaryDiscipline",
  "userName",
  "source",
  "summary",
];

export const AUTHOR_MATCH_FIELDS = ["userName", "editorName"];

export function tokenizeKeywords(value) {
  return String(value || "")
    .split(/[,\s|，；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function uniq(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

export function parseArrayField(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {
    // 按 JSON 解析失败时回退到分隔符拆分
  }
  return trimmed
    .split(/[,\n|，；;]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeRecord(row) {
  return {
    ...row,
    primaryDiscipline: parseArrayField(row.primaryDiscipline),
    secondaryDiscipline: parseArrayField(row.secondaryDiscipline),
    keyWords: parseArrayField(row.keyWords),
  };
}

function fieldText(record, field) {
  const value = record[field];
  if (Array.isArray(value)) return value.join(" ").toLowerCase();
  return String(value ?? "").toLowerCase();
}

function includesKeyword(record, keyword) {
  return ALL_MATCH_FIELDS.some((field) => fieldText(record, field).includes(keyword));
}

// 内存检索兜底（Render）：语义为子串匹配，是 FTS 二字切词的超集。
export function searchRecords(records, filters = {}) {
  const keywords = (filters.keywords || [])
    .map((keyword) => String(keyword).trim().toLowerCase())
    .filter(Boolean);
  const author = String(filters.author || "").trim().toLowerCase();

  const matched = records.filter((record) => {
    if (author && !AUTHOR_MATCH_FIELDS.some((field) => fieldText(record, field).includes(author))) {
      return false;
    }
    if (Number.isFinite(filters.year) && Number(record.year) !== filters.year) return false;
    if (Number.isFinite(filters.yearFrom) && !(Number(record.year) >= filters.yearFrom)) return false;
    if (Number.isFinite(filters.yearTo) && !(Number(record.year) <= filters.yearTo)) return false;
    return keywords.every((keyword) => includesKeyword(record, keyword));
  });

  const scored = matched.map((record) => {
    let priority = 7;
    let matchCount = 0;
    if (keywords.length > 0) {
      for (const keyword of keywords) {
        if (includesKeyword(record, keyword)) matchCount += 1;
      }
      const index = MATCH_PRIORITY_FIELDS.findIndex((fields) =>
        keywords.some((keyword) => fields.some((field) => fieldText(record, field).includes(keyword))),
      );
      priority = index === -1 ? 7 : index + 1;
    }
    return { ...record, _priority: priority, _matchCount: matchCount };
  });

  scored.sort(
    (a, b) =>
      a._priority - b._priority ||
      b._matchCount - a._matchCount ||
      (Number(b.year) || 0) - (Number(a.year) || 0) ||
      (Number(a.readability) || 1) - (Number(b.readability) || 1) ||
      String(a.id).localeCompare(String(b.id)),
  );

  const limit = Math.min(Math.max(filters.limit ?? 20, 1), 50);
  return scored.slice(0, limit);
}
