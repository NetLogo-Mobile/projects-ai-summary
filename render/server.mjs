// Render 部署入口：当 Cloudflare D1 免费额度耗尽时，前端回退到这里的 API。
// 数据来自仓库内 data.db 快照，用 sql.js 载入内存后做检索，不依赖任何云数据库。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

import {
  SEO_CONSTANTS,
  applyDocumentSeo,
  buildRobotsTxt,
  buildSitemapIndexXml,
  buildStaticSitemapUrls,
  buildUrlSetXml,
  normalizeTopicQuery,
  parseTopicQuery,
  parseWorkId,
  parseWorksPage,
  renderHomeNoscript,
  renderNotFoundPage,
  renderTopicCrawlBlock,
  renderTopicPage,
  renderWorkPage,
  renderWorksIndex,
  topicPageMeta,
  topicUrl,
  workUrl,
} from "../cloudflare/seo.mjs";
import { normalizeRecord, searchRecords, tokenizeKeywords } from "../cloudflare/search-core.mjs";

const require = createRequire(import.meta.url);
const initSqlJs = require("sql.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "cloudflare", "public");
const DB_PATH = process.env.DB_PATH ? path.resolve(process.env.DB_PATH) : path.join(ROOT, "data.db");
const PORT = Number(process.env.PORT || 3000);
const MAX_LIMIT = 50;
const FALLBACK_ORIGIN = String(process.env.SITE_ORIGIN || "").trim().replace(/\/+$/, "");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};

let indexHtml = "";
let records = [];
let recordById = new Map();
let generatedAt = new Date().toISOString();

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function loadIndexHtml() {
  indexHtml = fs.readFileSync(path.join(PUBLIC_DIR, "index.html"), "utf8");
}

async function loadDatabase() {
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(DB_PATH));
  const stmt = db.prepare("SELECT * FROM data");
  const rows = [];
  while (stmt.step()) rows.push(normalizeRecord(stmt.getAsObject()));
  stmt.free();
  db.close();
  records = rows;
  recordById = new Map(rows.map((row) => [String(row.id).toLowerCase(), row]));
  try {
    generatedAt = fs.statSync(DB_PATH).mtime.toISOString();
  } catch {
    generatedAt = new Date().toISOString();
  }
  console.log(`[render] loaded ${records.length} record(s) from ${DB_PATH}`);
}

function orderedByYear() {
  return [...records].sort(
    (a, b) =>
      (Number(b.year) || 0) - (Number(a.year) || 0) ||
      String(a.id).localeCompare(String(b.id)),
  );
}

function requestOrigin(req) {
  if (FALLBACK_ORIGIN) return FALLBACK_ORIGIN;
  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim() || "http";
  const host = req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-robots-tag": "noindex",
    ...corsHeaders(),
  });
  res.end(body);
}

function sendHtml(res, body, status = 200, extra = {}) {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": status === 200 ? "public, max-age=600" : "no-store",
    ...extra,
  });
  res.end(body);
}

function sendText(res, body, type = "text/plain; charset=utf-8", cache = "public, max-age=3600") {
  res.writeHead(200, { "content-type": type, "cache-control": cache });
  res.end(body);
}

function injectCrawlable(html, fragment) {
  if (html.includes("<footer>")) return html.replace("<footer>", `${fragment}\n<footer>`);
  if (html.includes("</body>")) return html.replace("</body>", `${fragment}\n</body>`);
  return `${html}${fragment}`;
}

function handleApi(req, res, url) {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/api/meta") {
    return sendJson(res, {
      service: "pl-search-render-fallback",
      generatedAt,
      totalRecords: records.length,
      maxLimit: MAX_LIMIT,
      aiKeywordExpansion: false,
      endpoints: ["/api/meta", "/api/search?keywords=...", "/api/record?id=...", "/w/:id", "/q/:query", "/works", "/sitemap.xml", "/robots.txt"],
    });
  }

  if (pathname === "/api/search") {
    const keywords = tokenizeKeywords(url.searchParams.get("keywords")).slice(0, 8);
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 20), 1), MAX_LIMIT);
    const results = searchRecords(records, {
      keywords,
      author: url.searchParams.get("author") || "",
      year: Number(url.searchParams.get("year")) || NaN,
      yearFrom: Number(url.searchParams.get("yearFrom")) || NaN,
      yearTo: Number(url.searchParams.get("yearTo")) || NaN,
      limit,
    }).map(({ _priority, _matchCount, ...record }) => record);
    return sendJson(res, {
      generatedAt,
      count: results.length,
      keywords,
      extraKeywords: [],
      aiExpanded: false,
      records: results,
    });
  }

  if (pathname === "/api/record") {
    const id = String(url.searchParams.get("id") || "").toLowerCase();
    if (!id) return sendJson(res, { error: "id is required" }, 400);
    const record = recordById.get(id);
    if (!record) return sendJson(res, { error: "Not found" }, 404);
    return sendJson(res, { record, generatedAt });
  }

  if (pathname === "/api/track") {
    return sendJson(res, { ok: true });
  }

  return null;
}

function handleSeo(req, res, url, origin) {
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/robots.txt") {
    return sendText(res, buildRobotsTxt(origin));
  }

  if (pathname === "/sitemap.xml") {
    return sendText(res, buildSitemapIndexXml(origin, records.length, generatedAt), "application/xml; charset=utf-8");
  }

  if (pathname === "/sitemap-static.xml") {
    return sendText(
      res,
      buildUrlSetXml(buildStaticSitemapUrls(origin, records.length, generatedAt), generatedAt),
      "application/xml; charset=utf-8",
    );
  }

  const sitemapMatch = pathname.match(/^\/sitemap-works-(\d+)\.xml$/);
  if (sitemapMatch) {
    const page = Math.max(1, Number(sitemapMatch[1]) || 1);
    const offset = (page - 1) * SEO_CONSTANTS.SITEMAP_CHUNK;
    const ids = [...records]
      .map((row) => String(row.id))
      .sort()
      .slice(offset, offset + SEO_CONSTANTS.SITEMAP_CHUNK);
    return sendText(res, buildUrlSetXml(ids.map((id) => workUrl(origin, id)), generatedAt), "application/xml; charset=utf-8");
  }

  if (pathname === "/") {
    const homeQuery = normalizeTopicQuery(url.searchParams.get("q") || "");
    if (homeQuery) {
      res.writeHead(301, { location: topicUrl(origin, homeQuery) });
      return res.end();
    }
    const top = orderedByYear().slice(0, 50);
    const html = injectCrawlable(indexHtml, renderHomeNoscript(origin, top));
    return sendHtml(res, html);
  }

  if (pathname === "/works") {
    const page = parseWorksPage(url);
    if (url.searchParams.has("page") && page <= 1) {
      res.writeHead(301, { location: `${origin}/works` });
      return res.end();
    }
    const ordered = orderedByYear();
    const offset = (page - 1) * SEO_CONSTANTS.WORKS_PAGE_SIZE;
    const pageRecords = ordered.slice(offset, offset + SEO_CONSTANTS.WORKS_PAGE_SIZE);
    return sendHtml(res, renderWorksIndex({
      origin,
      page,
      total: records.length,
      records: pageRecords,
      lastmod: generatedAt,
    }));
  }

  const workId = parseWorkId(url.pathname) || parseWorkId(pathname);
  if (workId) {
    const record = recordById.get(workId);
    if (!record) return sendHtml(res, renderNotFoundPage(origin), 404);
    return sendHtml(res, renderWorkPage(origin, record));
  }

  const topicQuery = parseTopicQuery(url.pathname) || parseTopicQuery(pathname);
  if (topicQuery) {
    const topicRecords = searchRecords(records, { keywords: [topicQuery], limit: SEO_CONSTANTS.TOPIC_PAGE_SIZE });
    const meta = topicPageMeta(topicQuery, topicRecords);
    const withSeo = applyDocumentSeo(indexHtml, {
      title: meta.title,
      description: meta.description,
      canonical: topicUrl(origin, topicQuery),
      robots: meta.robots,
    });
    const body = injectCrawlable(withSeo, renderTopicCrawlBlock(origin, topicQuery, topicRecords));
    return sendHtml(res, body);
  }

  return null;
}

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const target = path.join(PUBLIC_DIR, relative);
  if (!target.startsWith(PUBLIC_DIR)) return false;
  if (fs.existsSync(target) && fs.statSync(target).isFile()) {
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
    fs.createReadStream(target).pipe(res);
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  const origin = requestOrigin(req);
  const url = new URL(req.url || "/", origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders());
    return res.end();
  }

  if (url.pathname === "/healthz") {
    return sendText(res, "ok");
  }

  try {
    if (url.pathname.startsWith("/api/")) {
      const apiResponse = handleApi(req, res, url);
      if (apiResponse !== null) return undefined;
      return sendJson(res, { error: "Not found" }, 404);
    }

    const seoResponse = handleSeo(req, res, url, origin);
    if (seoResponse !== null) return undefined;

    if (serveStatic(req, res, url.pathname.replace(/\/+$/, "") || "/")) return undefined;

    if (req.method === "GET" && !path.extname(url.pathname)) {
      return sendHtml(res, indexHtml);
    }

    return sendJson(res, { error: "Not found" }, 404);
  } catch (error) {
    console.error("[render] request failed:", error?.message || error);
    return sendJson(res, { error: String(error?.message || error) }, 500);
  }
});

async function main() {
  loadIndexHtml();
  await loadDatabase();
  server.listen(PORT, () => {
    console.log(`[render] fallback server listening on :${PORT}`);
  });
}

main().catch((error) => {
  console.error("[render] failed to start:", error);
  process.exit(1);
});
