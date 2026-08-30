# Cloudflare Query API + 搜索页

这个目录提供一个可直接部署到 Cloudflare Workers 的搜索服务：访问根路径会返回一个搜索页面，同时提供只读查询 API。数据存储在 Cloudflare D1 数据库 `plworks` 中，通过手动触发的工作流导入。

## 文件

- `worker.mjs`：Workers 入口，提供 `/api/meta`、`/api/search`、`/api/record`，其余路径回退到静态资源，数据从 D1 binding `DB` 读取
- `public/index.html`：搜索页面（前端检索，同源调用本 Worker 的 API）
- `d1/data.sql`：由 `npm run export-d1` 生成的导入文件（已 gitignore，不入库）
- `data/records.mjs`：旧的静态快照，Worker 已不再依赖，仅作为数据备份保留
- `wrangler.toml`：Workers 配置（含 D1 `[[d1_databases]]` 与静态资源 `[assets]`）

## 部署准备

```bash
npm run build
npm run export-cloudflare
npx wrangler login
npx wrangler deploy --config cloudflare/wrangler.toml
```

部署后访问 Worker 域名即可打开搜索页。API 端点为 `/api/meta`、`/api/search`、`/api/record`。

## 数据导入 D1

仓库根目录的 `data.db` 是权威数据源。通过 GitHub Actions 工作流 `导入数据到Cloudflare D1`（`import-d1.yml`，手动触发）完成同步：

1. `npm run export-d1`：从 `data.db` 导出 SQL（建表 + 全量替换 + 元信息）到 `cloudflare/d1/data.sql`
2. `npx wrangler d1 execute 1ff32e2b-ab3c-4f78-aa15-9313e095e237 --remote --file=./cloudflare/d1/data.sql -y`：全量导入 D1
3. `npx wrangler d1 execute 1ff32e2b-ab3c-4f78-aa15-9313e095e237 --remote --command "SELECT COUNT(*) AS total FROM data"`：校验行数

也可以本地手动执行同样两条 wrangler 命令完成导入。

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

页面位于 `public/index.html`，以同源方式调用以上 API（`API = ''`），支持关键词、作者、年份筛选，结果卡片可展开查看关键词、学科与档案详情。数据来自 D1 数据库 `plworks`，每次运行 `导入数据到Cloudflare D1` 工作流后自动更新。
