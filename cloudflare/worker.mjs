import { generatedAt, records } from "./data/records.mjs";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

function optionalNumber(value) {
  if (value == null || value === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function tokenizeKeywords(value) {
  return String(value || "")
    .split(/[,\s|，；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function includesIgnoreCase(value, query) {
  return String(value || "").toLowerCase().includes(String(query || "").toLowerCase());
}

function fieldMatches(record, keyword) {
  return [
    record.name,
    record.summary,
    record.userName,
    ...(record.keyWords || []),
    ...(record.primaryDiscipline || []),
    ...(record.secondaryDiscipline || []),
  ].some((value) => includesIgnoreCase(value, keyword));
}

function matchPriority(record, keyword) {
  if (includesIgnoreCase(record.name, keyword)) return 1;
  if ((record.keyWords || []).some((value) => includesIgnoreCase(value, keyword))) return 2;
  if (
    (record.primaryDiscipline || []).some((value) => includesIgnoreCase(value, keyword)) ||
    (record.secondaryDiscipline || []).some((value) => includesIgnoreCase(value, keyword))
  ) {
    return 3;
  }
  if (includesIgnoreCase(record.userName, keyword)) return 4;
  if (includesIgnoreCase(record.summary, keyword)) return 5;
  return 6;
}

function searchSnapshot(params) {
  const keywords = tokenizeKeywords(params.get("keywords"));
  const author = params.get("author");
  const year = optionalNumber(params.get("year"));
  const yearFrom = optionalNumber(params.get("yearFrom"));
  const yearTo = optionalNumber(params.get("yearTo"));
  const limit = Math.min(Math.max(Number(params.get("limit") || 20), 1), 50);

  const filtered = records
    .filter((record) => {
      const recordYear = Number(record.year);
      if (keywords.length && !keywords.some((keyword) => fieldMatches(record, keyword))) return false;
      if (author && !includesIgnoreCase(record.userName, author) && !includesIgnoreCase(record.editorName, author)) {
        return false;
      }
      if (Number.isFinite(year) && recordYear !== year) return false;
      if (Number.isFinite(yearFrom) && recordYear < yearFrom) return false;
      if (Number.isFinite(yearTo) && recordYear > yearTo) return false;
      return true;
    })
    .map((record) => ({
      ...record,
      _priority: keywords.length ? matchPriority(record, keywords[0]) : 99,
    }))
    .sort((left, right) => {
      if (left._priority !== right._priority) return left._priority - right._priority;
      if (left.year !== right.year) return right.year - left.year;
      return left.readability - right.readability;
    })
    .slice(0, limit)
    .map(({ _priority, ...record }) => record);

  return filtered;
}

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...jsonHeaders,
          "access-control-allow-methods": "GET,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (request.method !== "GET") {
      return ok({ error: "Method not allowed" }, 405);
    }

    if (url.pathname === "/" || url.pathname === "/api/meta") {
      return ok({
        service: "pl-search-cloudflare",
        generatedAt,
        totalRecords: records.length,
        endpoints: ["/api/search?keywords=...", "/api/record?id=..."],
      });
    }

    if (url.pathname === "/api/search") {
      const result = searchSnapshot(url.searchParams);
      return ok({
        generatedAt,
        count: result.length,
        records: result,
      });
    }

    if (url.pathname === "/api/record") {
      const id = url.searchParams.get("id");
      if (!id) return ok({ error: "id is required" }, 400);

      const record = records.find((item) => item.id === id);
      if (!record) return ok({ error: "Not found" }, 404);
      return ok({ record, generatedAt });
    }

    return ok({ error: "Not found" }, 404);
  },
};
