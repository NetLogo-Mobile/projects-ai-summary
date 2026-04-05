# Physics-Lab-Search-Engine

基于 `physics-lab-web-api` + SQLite + OpenAI / Spark / Groq 的作品收录、查询和补丁同步工具。

## GitHub Pages Static Admin

仓库根目录的 `index.html` 是纯静态管理页。

它的工作方式：

- 页面通过 CDN 加载 `sql.js`
- 浏览器直接读取 `./data.db`
- 如果远程 `data.db` 不可访问，可以手动上传本地 `.db` 文件
- 查询、编辑、生成补丁都在浏览器里完成
- 页面只负责复制补丁文本，不直接写本地文件
- 复制出来的补丁仍兼容 `npm run apply-db-patch`

推荐部署方式：

1. GitHub Pages 发布源使用分支根目录
2. 确保发布分支里有 `index.html`、`.nojekyll`、`data.db`
3. 打开页面后查询和编辑记录
4. 复制生成的补丁
5. 将补丁内容粘贴到 `home/database.patch.json`
6. 运行 CI 或 `npm run apply-db-patch`

## Bot 查询命令

```bash
#查词: 电磁学 光学
#查作者: 用户名
#查年份: 2024
#查年份: 2021-2024
#查询 关键词=电磁学|光学 作者=张三 年份范围=2021-2024 limit=8
```

## Cloudflare Query API

导出 Cloudflare Worker 使用的静态快照：

```bash
npm run export-cloudflare
```

部署说明见 [cloudflare/README.md](./cloudflare/README.md)。

## 环境变量

```env
PL_USERNAME=
PL_PASSWORD=
PL_DISCUSSION_ID=69a59f0eca7ceb749317ef7c
PL_DISCUSSION_TAG=精选,知识库
PL_DISCUSSION_TYPE=Discussion,Experiment
PL_BASE_URL=https://physics-api-cn.turtlesim.com

PL_ADMIN_USERNAME=
PL_ADMIN_PASSWORD=
PL_SYNC_CATEGORY=Discussion
PL_SYNC_SOURCE_TAG=精选
PL_SYNC_TAG_WHITELIST=数学,物理学,化学,生物学,地理学,天文学,计算机科学,医学,电气工程,历史学,哲学,文学,艺术学

SKIP=0
TAKE=-100
DB_PATH=./data.db
DB_PATCH_FILE=./home/database.patch.json
CLOUDFLARE_EXPORT_FILE=./cloudflare/data/records.mjs
LOG_DIR=./logs

OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini

SPARK_API_PASSWORD=
SPARK_MODEL=generalv3.5
SPARK_ENDPOINT=https://spark-api-open.xf-yun.com/v1/chat/completions

GROQ_API_KEY=
GROQ_MODEL=openai/gpt-oss-120B
GROQ_CHAT_MODEL=openai/gpt-oss-120B
GROQ_CHAT_MAX_TOKENS=120

PL_LOG_SUMMARY_ID=
PL_LOG_SUMMARY_CATEGORY=Discussion
PL_LOG_SUMMARY_USERNAME=
PL_LOG_SUMMARY_PASSWORD=
PL_LOG_SUMMARY_MAX_CHARS=18000
```

## GitHub Actions

工作流位于 `.github/workflows/`：

- `run-bot-query.yml`
  - 执行 `npm run run-bot-once`
- `update-database.yml`
  - 执行 `npm run apply-db-patch`
  - 执行 `npm run update-db`
  - 执行 `npm run export-cloudflare`

请在 GitHub `Settings -> Secrets and variables -> Actions` 中配置对应 Secrets。

## 本地命令

```bash
npm run update-db
npm run apply-db-patch
npm run export-cloudflare
npm run run-bot
npm run run-bot-once
npm run discipline-stats
npm run flexible-collect -- --tag "精选" --take -50
npm run sync-selected-tags
```
