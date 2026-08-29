# Cloudflare Query API + 搜索页

这个目录提供一个可直接部署到 Cloudflare Workers 的搜索服务：访问根路径会返回一个搜索页面，同时提供只读查询 API。

## 文件

- `worker.mjs`：Workers 入口，提供 `/api/meta`、`/api/search`、`/api/record`，其余路径回退到静态资源
- `public/index.html`：搜索页面（前端检索，同源调用本 Worker 的 API）
- `data/records.mjs`：由本地数据库导出的静态快照
- `wrangler.toml`：Workers 配置（含静态资源 `[assets]`）

## 部署准备

```bash
npm run build
npm run export-cloudflare
npx wrangler login
npx wrangler deploy --config cloudflare/wrangler.toml
```

部署后访问 Worker 域名即可打开搜索页。API 端点为 `/api/meta`、`/api/search`、`/api/record`。

要给Worker配置secret`GROQ_API_KEY`,其余可选变量：

- `GROQ_BASE_URL`，默认 `https://api.groq.com/openai/v1`
- `GROQ_KEYWORD_MODEL`，默认 `llama-3.1-8b-instant`
- `GROQ_MODEL`，如果没单独配 `GROQ_KEYWORD_MODEL`，会回退用它

如果没有配置 `GROQ_API_KEY`，API 仍可正常使用，只是不会做 AI 扩词。


## API

- `GET /api/meta`：返回服务信息、快照生成时间、总记录数、单次最大返回条数，以及当前是否启用了 AI 扩词。

- `GET /api/search`: 支持参数：keywords, author, year, yearFrom, yearTo, limit, aiExpand

- `GET /api/record?id=...`: 返回单条记录。

## 搜索页面

页面位于 `public/index.html`，以同源方式调用以上 API（`API = ''`），支持关键词、作者、年份筛选，结果卡片可展开查看关键词、学科与档案详情。`data/records.mjs` 随数据库快照更新而自动刷新。
