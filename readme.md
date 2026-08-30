# Physics Lab Search

物理实验室作品搜索服务。线上仅保留 Cloudflare Worker、静态搜索页面和 D1 数据库；仓库保留作品收录程序，自动调度当前关闭。

## 架构

- `cloudflare/public/index.html`：Cloudflare 静态搜索页面
- `cloudflare/worker.mjs`：搜索 API 与可选的 Groq 查询词扩展
- Cloudflare D1 `plworks`：线上查询数据源
- `data.db`：仓库内权威数据快照
- `src/scripts/updateDatabase.ts`：作品收录入口
- `src/scripts/exportD1Sql.ts`：将 `data.db` 导出为 D1 SQL

收录记录包含 `source` 来源字段：`Experiment + 精选` 为“实验精选”，`Discussion + 精选` 为“黑洞精选”，`Discussion + 小说` 为“黑洞小说”，其余组合为“其他”。

## GitHub Actions

工作流使用 GitHub Environment `pl-search`。

- `导入数据到Cloudflare D1`：手动将现有 `data.db` 导入 D1并部署 Worker
- `收录作品到 Cloudflare D1`：手动收录新作品、更新 `data.db`、覆盖 D1并部署 Worker

两个工作流都仅支持 `workflow_dispatch`。自动收录的实现已保留，定时触发当前关闭。

## 环境配置

敏感值使用 GitHub Environment Secrets：

```text
CLOUDFLARE_API_TOKEN
PL_USERNAME
PL_PASSWORD
OPENAI_API_KEY
SPARK_API_PASSWORD
```

`OPENAI_API_KEY` 与 `SPARK_API_PASSWORD` 至少配置一个。

普通配置使用 GitHub Environment Variables：

```text
CLOUDFLARE_ACCOUNT_ID
PL_BASE_URL=https://physics-api-cn.turtlesim.com
PL_DISCUSSION_TAG=精选
PL_DISCUSSION_TYPE=Discussion
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1
SPARK_MODEL=generalv3.5
SPARK_ENDPOINT=https://spark-api-open.xf-yun.com/v1/chat/completions
SKIP=0
TAKE=-100
COLLECT_PAGE_SIZE=20
COLLECT_BATCH_SIZE=20
COLLECT_ANALYZE_CONCURRENCY=5
COLLECT_INSERT_CONCURRENCY=5
COLLECT_PAGE_DELAY_MS=0
COLLECT_BATCH_DELAY_MS=0
```

Worker 的 Groq 查询扩展由 Cloudflare Worker Secret `GROQ_API_KEY` 控制，模型可通过 Cloudflare Variables `GROQ_KEYWORD_MODEL`、`GROQ_MODEL` 和 `GROQ_BASE_URL` 配置。

## 本地命令

```bash
npm ci
npm run build
npm test
npm run update-db
npm run flexible-collect -- --tag "精选" --type Discussion --take -50
npm run export-d1
```

线上服务：`https://pl-search-cloudflare.zongkuli2.workers.dev`
