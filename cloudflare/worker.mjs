import {
  SEO_CONSTANTS,
  buildRobotsTxt,
  buildSitemapIndexXml,
  buildStaticSitemapUrls,
  buildUrlSetXml,
  ensureSeoTables,
  applyDocumentSeo,
  htmlResponse,
  isIndexNowKeyPath,
  maybeCanonicalRedirect,
  normalizeTopicQuery,
  parseTopicQuery,
  parseWorkId,
  parseWorksPage,
  renderHomeNoscript,
  renderNotFoundPage,
  renderTopicCrawlBlock,
  renderTopicPage,
  renderWorkPage,
  topicPageMeta,
  renderWorksIndex,
  runSeoSubmission,
  siteOrigin,
  textResponse,
  topicUrl,
  workUrl,
} from "./seo.mjs";
import {
  ALL_MATCH_FIELDS,
  MATCH_PRIORITY_FIELDS,
  normalizeRecord,
  parseArrayField,
  tokenizeKeywords,
  uniq,
} from "./search-core.mjs";

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "x-robots-tag": "noindex",
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

// 学科字段的 SQL 列名（FTS 列过滤用）
const AUTHOR_FTS_FIELDS = ["userName", "editorName"];

function optionalNumber(value) {
  if (value == null || value === "") return NaN;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

const CJK_RUN = /[\u3400-\u9fff\uF900-\uFAFF]+/g;

export function ftsQuote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function keywordToFts(term) {
  const text = String(term || "").trim();
  if (!text) return ftsQuote("");
  const parts = [];
  CJK_RUN.lastIndex = 0;
  let last = 0;
  let match;
  while ((match = CJK_RUN.exec(text))) {
    const latin = text.slice(last, match.index);
    const latinQuery = latinToFts(latin);
    if (latinQuery) parts.push(latinQuery);
    parts.push(cjkToFts(match[0]));
    last = match.index + match[0].length;
  }
  const latinQuery = latinToFts(text.slice(last));
  if (latinQuery) parts.push(latinQuery);
  if (parts.length === 0) return ftsQuote(text);
  return parts.length === 1 ? parts[0] : `(${parts.join(" AND ")})`;
}

function latinToFts(value) {
  const words = String(value).toLowerCase().match(/[a-z0-9_]+/g) || [];
  if (words.length === 0) return "";
  return words.map((word) => `${word}*`).join(" AND ");
}

function cjkToFts(run) {
  if (run.length <= 2) return ftsQuote(run);
  const grams = [];
  for (let index = 0; index < run.length - 1; index += 1) {
    grams.push(ftsQuote(run.slice(index, index + 2)));
  }
  return `(${grams.join(" + ")})`;
}

export function ftsOrQuery(terms) {
  return terms.map(keywordToFts).join(" OR ");
}

function ftsColumnQuery(columns, terms) {
  const inner = ftsOrQuery(terms);
  return columns.map((col) => `{${col}}: (${inner})`).join(" OR ");
}

export function buildSearchQuery(keywords, filters) {
  const conditions = [];
  const paramCols = [];
  const paramBinds = [];
  const extraBinds = [];
  const hasKeywords = keywords.length > 0;
  const hasAuthor = Boolean(filters.author);
  const useFts = hasKeywords || hasAuthor;
  const matchParts = [];

  if (hasKeywords) matchParts.push(`(${ftsOrQuery(keywords)})`);
  if (hasAuthor) matchParts.push(`(${ftsColumnQuery(AUTHOR_FTS_FIELDS, [filters.author])})`);

  if (matchParts.length > 0) {
    paramCols.push("? AS q");
    paramBinds.push(matchParts.join(" AND "));
    conditions.push("data_fts MATCH p.q");
  }

  if (hasKeywords) {
    keywords.forEach((keyword, index) => {
      paramCols.push(`? AS k${index}`);
      paramBinds.push(String(keyword).toLowerCase());
    });
  }

  if (Number.isFinite(filters.year)) {
    conditions.push("year = ?");
    extraBinds.push(filters.year);
  }
  if (Number.isFinite(filters.yearFrom)) {
    conditions.push("year >= ?");
    extraBinds.push(filters.yearFrom);
  }
  if (Number.isFinite(filters.yearTo)) {
    conditions.push("year <= ?");
    extraBinds.push(filters.yearTo);
  }

  let selectClause = useFts ? "data.*" : "*";
  if (hasKeywords) {
    const priorityConds = MATCH_PRIORITY_FIELDS.map((fields) =>
      keywords
        .flatMap((_, index) => fields.map((field) => `instr(LOWER(data.${field}), p.k${index})`))
        .join(" OR "),
    );
    const priorityCase = priorityConds
      .map((cond, index) => `WHEN (${cond}) THEN ${index + 1}`)
      .join(" ");
    const matchCountParts = keywords.map((_, index) => {
      const hit = ALL_MATCH_FIELDS.map((field) => `instr(LOWER(data.${field}), p.k${index})`).join(" OR ");
      return `CASE WHEN (${hit}) THEN 1 ELSE 0 END`;
    });
    selectClause = `data.*, CASE ${priorityCase} ELSE 7 END AS _priority, ${matchCountParts.join(" + ")} AS _matchCount`;
  }

  const fromClause = useFts
    ? `data JOIN data_fts ON data.id = data_fts.id, (SELECT ${paramCols.join(", ")}) AS p`
    : "data";
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderClause = hasKeywords
    ? "ORDER BY _priority ASC, _matchCount DESC, year DESC, readability ASC, id ASC"
    : "ORDER BY year DESC, readability ASC, id ASC";

  return {
    sql: `SELECT ${selectClause} FROM ${fromClause} ${whereClause} ${orderClause} LIMIT ?`,
    binds: [...paramBinds, ...extraBinds, filters.limit],
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
let cachedRowCount;
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

async function getRowCount(env) {
  if (cachedRowCount !== undefined) return cachedRowCount;
  try {
    const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'rowCount'").first();
    const parsed = Number(row?.value);
    if (Number.isFinite(parsed)) {
      cachedRowCount = parsed;
      return cachedRowCount;
    }
  } catch {
    // fall through to COUNT(*)
  }
  const countRow = await env.DB.prepare("SELECT COUNT(*) AS total FROM data").first();
  cachedRowCount = Number(countRow?.total ?? 0);
  return cachedRowCount;
}

/* ============ 埋点 / 错误日志（D1 持久化） ============ */

let tablesReady;
async function ensureTables(env) {
  if (!tablesReady) {
    tablesReady = (async () => {
      await env.DB.batch([
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS error_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL DEFAULT (datetime('now')),
          path TEXT,
          message TEXT,
          stack TEXT,
          extra TEXT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ts TEXT NOT NULL DEFAULT (datetime('now')),
          event TEXT NOT NULL,
          data TEXT,
          ip TEXT
        )`),
        env.DB.prepare(`CREATE TABLE IF NOT EXISTS search_terms (
          term TEXT PRIMARY KEY,
          count INTEGER NOT NULL DEFAULT 0,
          last_searched_at TEXT
        )`),
      ]);
    })().catch((error) => {
      tablesReady = undefined;
      console.error("[analytics] ensureTables failed:", error?.message || error);
    });
  }
  return tablesReady;
}

async function logError(env, error, extra = {}) {
  try {
    await ensureTables(env);
    await env.DB.prepare(
      `INSERT INTO error_logs (ts, path, message, stack, extra) VALUES (?, ?, ?, ?, ?)`
    )
      .bind(
        new Date().toISOString(),
        String(extra.path ?? ""),
        String(error?.message ?? error),
        String(error?.stack ?? ""),
        JSON.stringify(extra),
      )
      .run();
  } catch (logErr) {
    console.error("[analytics] logError failed:", logErr?.message || logErr);
  }
}

async function recordEvent(env, event, data = {}, ip = "") {
  try {
    await ensureTables(env);
    await env.DB.prepare(
      `INSERT INTO events (ts, event, data, ip) VALUES (?, ?, ?, ?)`
    )
      .bind(
        new Date().toISOString(),
        String(event).slice(0, 64),
        JSON.stringify(data),
        String(ip || "").slice(0, 64),
      )
      .run();
  } catch (recordErr) {
    console.error("[analytics] recordEvent failed:", recordErr?.message || recordErr);
  }
}

async function recordSearchTerm(env, term) {
  if (!term) return;
  try {
    await ensureTables(env);
    const now = new Date().toISOString();
    await env.DB.prepare(
      `INSERT INTO search_terms (term, count, last_searched_at) VALUES (?, 1, ?)
       ON CONFLICT(term) DO UPDATE SET count = count + 1, last_searched_at = excluded.last_searched_at`
    )
      .bind(term, now)
      .run();
  } catch (termErr) {
    console.error("[analytics] recordSearchTerm failed:", termErr?.message || termErr);
  }
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

function handlePublicSeoFiles(env, url) {
  const origin = siteOrigin(env, url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const indexnowKey = String(env?.INDEXNOW_KEY || "").trim();

  if (isIndexNowKeyPath(url.pathname, indexnowKey) || isIndexNowKeyPath(pathname, indexnowKey)) {
    return textResponse(indexnowKey, "text/plain; charset=utf-8", "public, max-age=86400");
  }

  if (pathname === "/robots.txt") {
    return textResponse(buildRobotsTxt(origin), "text/plain; charset=utf-8", "public, max-age=86400");
  }

  if (pathname === "/open.html") {
    const id = String(url.searchParams.get("id") || "").trim();
    if (id && SEO_CONSTANTS.WORK_ID_RE.test(id)) {
      return Response.redirect(workUrl(origin, id), 301);
    }
  }

  return null;
}

async function handleSeoGet(request, env, url) {
  const origin = siteOrigin(env, url);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/sitemap.xml") {
    const total = await getRowCount(env);
    const lastmod = (await getGeneratedAt(env)) || new Date().toISOString();
    return textResponse(
      buildSitemapIndexXml(origin, total, lastmod),
      "application/xml; charset=utf-8",
    );
  }

  if (pathname === "/sitemap-static.xml") {
    const total = await getRowCount(env);
    const lastmod = (await getGeneratedAt(env)) || new Date().toISOString();
    return textResponse(
      buildUrlSetXml(buildStaticSitemapUrls(origin, total, lastmod), lastmod),
      "application/xml; charset=utf-8",
    );
  }

  const sitemapMatch = pathname.match(/^\/sitemap-works-(\d+)\.xml$/);
  if (sitemapMatch) {
    const page = Math.max(1, Number(sitemapMatch[1]) || 1);
    const offset = (page - 1) * SEO_CONSTANTS.SITEMAP_CHUNK;
    const rows = await queryAll(
      env,
      "SELECT id FROM data ORDER BY id ASC LIMIT ? OFFSET ?",
      [SEO_CONSTANTS.SITEMAP_CHUNK, offset],
    );
    const lastmod = (await getGeneratedAt(env)) || new Date().toISOString();
    const urls = rows.map((row) => workUrl(origin, row.id));
    return textResponse(buildUrlSetXml(urls, lastmod), "application/xml; charset=utf-8");
  }

  if (pathname === "/") {
    const homeQuery = normalizeTopicQuery(url.searchParams.get("q") || "");
    if (homeQuery) return Response.redirect(topicUrl(origin, homeQuery), 301);
    const records = await queryAll(
      env,
      "SELECT id, name, userName, year, source, summary FROM data ORDER BY year DESC, id ASC LIMIT ?",
      [50],
    );
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      const html = await assetResponse.text();
      const crawlable = renderHomeNoscript(origin, records);
      const body = html.includes("<footer>")
        ? html.replace("<footer>", `${crawlable}\n<footer>`)
        : html.includes("</body>")
          ? html.replace("</body>", `${crawlable}\n</body>`)
          : `${html}${crawlable}`;
      return htmlResponse(body, 200, { "cache-control": "public, max-age=600" });
    }
  }

  if (pathname === "/works") {
    const page = parseWorksPage(url);
    if (url.searchParams.has("page") && page <= 1) {
      return Response.redirect(`${origin}/works`, 301);
    }
    const total = await getRowCount(env);
    const offset = (page - 1) * SEO_CONSTANTS.WORKS_PAGE_SIZE;
    const records = await queryAll(
      env,
      "SELECT id, name, userName, year, source, summary FROM data ORDER BY year DESC, id ASC LIMIT ? OFFSET ?",
      [SEO_CONSTANTS.WORKS_PAGE_SIZE, offset],
    );
    const lastmod = (await getGeneratedAt(env)) || new Date().toISOString();
    return htmlResponse(renderWorksIndex({ origin, page, total, records, lastmod }));
  }

  const workId = parseWorkId(url.pathname) || parseWorkId(pathname);
  if (workId) {
    const row = await env.DB.prepare("SELECT * FROM data WHERE id = ?").bind(workId).first();
    if (!row) return htmlResponse(renderNotFoundPage(origin), 404);
    return htmlResponse(renderWorkPage(origin, normalizeRecord(row)));
  }

  const topicQuery = parseTopicQuery(url.pathname) || parseTopicQuery(pathname);
  if (topicQuery) {
    const { sql, binds } = buildSearchQuery([topicQuery], { limit: SEO_CONSTANTS.TOPIC_PAGE_SIZE });
    const records = (await queryAll(env, sql, binds)).map(normalizeRecord);
    const lastmod = (await getGeneratedAt(env)) || new Date().toISOString();
    if (env.ASSETS) {
      const assetUrl = new URL("/", request.url);
      const assetResponse = await env.ASSETS.fetch(new Request(assetUrl, request));
      const html = await assetResponse.text();
      const meta = topicPageMeta(topicQuery, records);
      const withSeo = applyDocumentSeo(html, {
        title: meta.title,
        description: meta.description,
        canonical: topicUrl(origin, topicQuery),
        robots: meta.robots,
      });
      const crawlable = renderTopicCrawlBlock(origin, topicQuery, records);
      const body = withSeo.includes("<footer>")
        ? withSeo.replace("<footer>", `${crawlable}\n<footer>`)
        : withSeo.includes("</body>")
          ? withSeo.replace("</body>", `${crawlable}\n</body>`)
          : `${withSeo}${crawlable}`;
      return htmlResponse(body, 200, { "cache-control": "public, max-age=600" });
    }
    return htmlResponse(renderTopicPage({ origin, query: topicQuery, records, lastmod }));
  }

  return null;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runSeoSubmission(env).then((summary) => {
      console.log("[seo] submission", JSON.stringify(summary));
    }).catch((error) => {
      console.error("[seo] submission failed", error?.message || error);
    }));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const canonicalRedirect = maybeCanonicalRedirect(request, env, url);
    if (canonicalRedirect) return canonicalRedirect;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          ...jsonHeaders,
          "access-control-allow-methods": "GET,POST,OPTIONS",
          "access-control-allow-headers": "content-type",
        },
      });
    }

    if (url.pathname === "/api/track" && request.method === "POST") {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      const event = String(body?.event ?? body?.name ?? "").trim();
      const data = body?.data && typeof body?.data === "object" ? body.data : {};
      const ip = request.headers.get("CF-Connecting-IP") ?? "";
      ctx.waitUntil(recordEvent(env, event, data, ip));
      return ok({ ok: true });
    }

    if (request.method !== "GET") {
      return ok({ error: "Method not allowed" }, 405);
    }

    const publicSeo = handlePublicSeoFiles(env, url);
    if (publicSeo) return publicSeo;

    if (!env.DB) {
      return ok({ error: "D1 database binding (DB) is not configured" }, 500);
    }

    try {
      const seoResponse = await handleSeoGet(request, env, url);
      if (seoResponse) return seoResponse;

      if (url.pathname === "/api/seo/submit") {
        const submitKey = String(env?.SEO_SUBMIT_KEY || "").trim();
        const given = String(url.searchParams.get("key") || "");
        if (!submitKey || given !== submitKey) return ok({ error: "unauthorized" }, 401);
        const summary = await runSeoSubmission(env);
        return ok(summary);
      }

      if (url.pathname === "/api/meta") {
        return ok({
          service: "pl-search-cloudflare",
          generatedAt: await getGeneratedAt(env),
          totalRecords: await getRowCount(env),
          maxLimit: MAX_LIMIT,
          aiKeywordExpansion: Boolean(env?.GROQ_API_KEY),
          endpoints: ["/api/meta", "/api/search?keywords=...", "/api/record?id=...", "/w/:id", "/q/:query", "/works", "/sitemap.xml", "/robots.txt"],
        });
      }

      if (url.pathname === "/api/search") {
        const result = await searchSnapshot(url.searchParams, env);
        for (const keyword of result.keywords) {
          ctx.waitUntil(recordSearchTerm(env, keyword));
        }
        return ok({
          generatedAt: await getGeneratedAt(env),
          count: result.records.length,
          keywords: result.keywords,
          extraKeywords: result.extraKeywords,
          aiExpanded: result.extraKeywords.length > 0,
          records: result.records,
        });
      }

      if (url.pathname === "/api/stats") {
        // The stats endpoint can be the first request after deployment.
        await ensureTables(env);
        const type = url.searchParams.get("type") || "terms";
        if (type === "terms") {
          const rows = await env.DB.prepare(
            "SELECT term, count, last_searched_at FROM search_terms ORDER BY count DESC LIMIT 50"
          ).all();
          return ok({ type, terms: rows.results ?? [] });
        }
        if (type === "events") {
          const rows = await env.DB.prepare(
            "SELECT event, COUNT(*) AS count, MAX(ts) AS last_ts FROM events GROUP BY event ORDER BY count DESC LIMIT 50"
          ).all();
          return ok({ type, events: rows.results ?? [] });
        }
        if (type === "errors") {
          const rows = await env.DB.prepare(
            "SELECT id, ts, path, message, extra FROM error_logs ORDER BY id DESC LIMIT 50"
          ).all();
          return ok({ type, errors: rows.results ?? [] });
        }
        if (type === "seo") {
          await ensureSeoTables(env);
          const rows = await env.DB.prepare(
            "SELECT engine, cursor_id, last_run_at, last_status FROM seo_index_state"
          ).all();
          return ok({
            type,
            googleConfigured: Boolean(String(env?.GOOGLE_SA_JSON || "").trim()),
            baiduConfigured: Boolean(String(env?.BAIDU_ZHANZHANG_TOKEN || "").trim()),
            indexnowConfigured: Boolean(String(env?.INDEXNOW_KEY || "").trim()),
            submitKeyConfigured: Boolean(String(env?.SEO_SUBMIT_KEY || "").trim()),
            state: rows.results ?? [],
          });
        }
        return ok({ error: "unknown stats type" }, 400);
      }

      if (url.pathname === "/api/record") {
        const id = url.searchParams.get("id");
        if (!id) return ok({ error: "id is required" }, 400);

        const row = await env.DB.prepare("SELECT * FROM data WHERE id = ?").bind(id).first();
        if (!row) return ok({ error: "Not found" }, 404);
        return ok({ record: normalizeRecord(row), generatedAt: await getGeneratedAt(env) });
      }
    } catch (error) {
      ctx.waitUntil(logError(env, error, { path: url.pathname }));
      console.error("[api] error on", url.pathname, error?.message || error);
      return ok({ error: String(error?.message || error) }, 500);
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return ok({ error: "Not found" }, 404);
  },
};
