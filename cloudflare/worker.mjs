const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
};

const MAX_LIMIT = 50;
const GENERIC_KEYWORDS = new Set([
  "study",
  "research",
  "paper",
  "science",
  "technology",
  "method",
  "analysis",
  "model",
  "学术",
  "研究",
  "论文",
  "科学",
  "技术",
  "方法",
  "分析",
  "模型",
]);

// 与原 JS 内存检索一致的优先级定义：
// name(1) > keyWords(2) > 学科(3) > userName(4) > source(5) > summary(6) > 未命中(7)
const MATCH_PRIORITY_FIELDS = [
  ["name"],
  ["keyWords"],
  ["primaryDiscipline", "secondaryDiscipline"],
  ["userName"],
  ["source"],
  ["summary"],
];
const ALL_MATCH_FIELDS = [
  "name",
  "keyWords",
  "primaryDiscipline",
  "secondaryDiscipline",
  "userName",
  "source",
  "summary",
];

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

function uniq(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function parseArrayField(value) {
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

function normalizeRecord(row) {
  return {
    ...row,
    primaryDiscipline: parseArrayField(row.primaryDiscipline),
    secondaryDiscipline: parseArrayField(row.secondaryDiscipline),
    keyWords: parseArrayField(row.keyWords),
  };
}

// LIKE 模式需要转义通配符，保持与原 includesIgnoreCase 语义一致
function likeParam(keyword) {
  const escaped = String(keyword).toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
  return `%${escaped}%`;
}

function likeCondition(field) {
  return `LOWER(${field}) LIKE ? ESCAPE '\\'`;
}

function buildSearchQuery(keywords, filters) {
  const conditions = [];
  const whereBinds = [];
  const selectBinds = [];
  const hasKeywords = keywords.length > 0;

  if (hasKeywords) {
    const keywordConds = keywords.map(
      () => `(${ALL_MATCH_FIELDS.map((field) => likeCondition(field)).join(" OR ")})`,
    );
    conditions.push(`(${keywordConds.join(" OR ")})`);
    for (const keyword of keywords) {
      const param = likeParam(keyword);
      for (let index = 0; index < ALL_MATCH_FIELDS.length; index += 1) {
        whereBinds.push(param);
      }
    }
  }

  if (filters.author) {
    conditions.push(`(${likeCondition("userName")} OR ${likeCondition("editorName")})`);
    const param = likeParam(filters.author);
    whereBinds.push(param, param);
  }

  if (Number.isFinite(filters.year)) {
    conditions.push("year = ?");
    whereBinds.push(filters.year);
  }
  if (Number.isFinite(filters.yearFrom)) {
    conditions.push("year >= ?");
    whereBinds.push(filters.yearFrom);
  }
  if (Number.isFinite(filters.yearTo)) {
    conditions.push("year <= ?");
    whereBinds.push(filters.yearTo);
  }

  let selectClause = "*";
  if (hasKeywords) {
    const priorityConds = [];
    MATCH_PRIORITY_FIELDS.forEach((fields) => {
      const conds = [];
      for (const keyword of keywords) {
        const param = likeParam(keyword);
        for (const field of fields) {
          conds.push(likeCondition(field));
          selectBinds.push(param);
        }
      }
      priorityConds.push(conds.join(" OR "));
    });
    const priorityCase = priorityConds
      .map((cond, index) => `WHEN (${cond}) THEN ${index + 1}`)
      .join(" ");

    const matchParts = keywords.map((keyword) => {
      const param = likeParam(keyword);
      const conds = ALL_MATCH_FIELDS.map((field) => {
        selectBinds.push(param);
        return likeCondition(field);
      });
      return `CASE WHEN (${conds.join(" OR ")}) THEN 1 ELSE 0 END`;
    });

    selectClause = `*, CASE ${priorityCase} ELSE 7 END AS _priority, ${matchParts.join(" + ")} AS _matchCount`;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderClause = hasKeywords
    ? "ORDER BY _priority ASC, _matchCount DESC, year DESC, readability ASC, id ASC"
    : "ORDER BY year DESC, readability ASC, id ASC";

  return {
    sql: `SELECT ${selectClause} FROM data ${whereClause} ${orderClause} LIMIT ?`,
    binds: [...selectBinds, ...whereBinds, filters.limit],
  };
}

function parseExpansionContent(content, originalKeywords) {
  try {
    const parsed = JSON.parse(String(content || ""));
    if (!parsed || !Array.isArray(parsed.extraKeywords)) return [];

    return uniq(parsed.extraKeywords)
      .filter((candidate) => {
        const normalized = candidate.toLowerCase();
        if (!normalized || GENERIC_KEYWORDS.has(normalized)) return false;
        return !originalKeywords.some((keyword) => keyword.toLowerCase() === normalized);
      })
      .slice(0, 5);
  } catch {
    return [];
  }
}

async function expandKeywordsWithGroq(env, keywords) {
  const groqApiKey = env?.GROQ_API_KEY;
  if (!groqApiKey || keywords.length === 0) return [];

  const groqBaseUrl = String(env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/+$/, "");
  const groqModel = String(env.GROQ_KEYWORD_MODEL || env.GROQ_MODEL || "llama-3.1-8b-instant");

  try {
    const response = await fetch(`${groqBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${groqApiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "pl-search-cloudflare/1.0",
      },
      body: JSON.stringify({
        model: groqModel,
        temperature: 0.2,
        max_tokens: 120,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              '你是搜索纠错与对齐助手。只输出 JSON：{"extraKeywords": string[]}。只允许返回拼写纠错、同一实体别名、跨语言对齐、用户真实会搜索的等价短语。禁止泛化到更大领域，禁止长句。',
          },
          {
            role: "user",
            content: `原始关键词：${keywords.join(" | ")}`,
          },
        ],
      }),
    });

    if (!response.ok) return [];

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content ?? "";
    return parseExpansionContent(content, keywords);
  } catch {
    return [];
  }
}

async function queryAll(env, sql, binds = []) {
  const stmt = env.DB.prepare(sql);
  const result = binds.length > 0 ? await stmt.bind(...binds).all() : await stmt.all();
  return result?.results ?? [];
}

let cachedGeneratedAt;
async function getGeneratedAt(env) {
  if (cachedGeneratedAt !== undefined) return cachedGeneratedAt;
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'generatedAt'").first();
    cachedGeneratedAt = row?.value ?? null;
  } catch {
    cachedGeneratedAt = null;
  }
  return cachedGeneratedAt;
}

async function searchSnapshot(params, env) {
  const keywords = tokenizeKeywords(params.get("keywords")).slice(0, 8);
  const author = params.get("author");
  const year = optionalNumber(params.get("year"));
  const yearFrom = optionalNumber(params.get("yearFrom"));
  const yearTo = optionalNumber(params.get("yearTo"));
  const limit = Math.min(Math.max(Number(params.get("limit") || 20), 1), MAX_LIMIT);
  const aiExpand = params.get("aiExpand");
  const shouldAiExpand = aiExpand !== "0" && aiExpand !== "false";
  const extraKeywords = shouldAiExpand ? await expandKeywordsWithGroq(env, keywords) : [];
  const effectiveKeywords = uniq([...keywords, ...extraKeywords]);

  const { sql, binds } = buildSearchQuery(effectiveKeywords, { author, year, yearFrom, yearTo, limit });
  const rows = await queryAll(env, sql, binds);
  const records = rows.map(normalizeRecord);

  return {
    keywords,
    extraKeywords,
    records,
  };
}

function ok(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: jsonHeaders,
  });
}

export default {
  async fetch(request, env) {
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

    if (!env.DB) {
      return ok({ error: "D1 database binding (DB) is not configured" }, 500);
    }

    try {
      if (url.pathname === "/api/meta") {
        const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM data").first();
        return ok({
          service: "pl-search-cloudflare",
          generatedAt: await getGeneratedAt(env),
          totalRecords: Number(countRow?.total ?? 0),
          maxLimit: MAX_LIMIT,
          aiKeywordExpansion: Boolean(env?.GROQ_API_KEY),
          endpoints: ["/api/meta", "/api/search?keywords=...", "/api/record?id=..."],
        });
      }

      if (url.pathname === "/api/search") {
        const result = await searchSnapshot(url.searchParams, env);
        return ok({
          generatedAt: await getGeneratedAt(env),
          count: result.records.length,
          keywords: result.keywords,
          extraKeywords: result.extraKeywords,
          aiExpanded: result.extraKeywords.length > 0,
          records: result.records,
        });
      }

      if (url.pathname === "/api/record") {
        const id = url.searchParams.get("id");
        if (!id) return ok({ error: "id is required" }, 400);

        const row = await env.DB.prepare("SELECT * FROM data WHERE id = ?").bind(id).first();
        if (!row) return ok({ error: "Not found" }, 404);
        return ok({ record: normalizeRecord(row), generatedAt: await getGeneratedAt(env) });
      }
    } catch (error) {
      return ok({ error: String(error?.message || error) }, 500);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return ok({ error: "Not found" }, 404);
  },
};
