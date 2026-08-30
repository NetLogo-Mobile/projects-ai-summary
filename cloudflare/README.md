# Cloudflare Search

`cloudflare/worker.mjs` 提供搜索 API，`cloudflare/public/index.html` 提供同源静态页面，查询数据来自 D1 binding `DB`。

## API

- `GET /api/meta`：数据总数、更新时间及功能状态
- `GET /api/search?keywords=力学&author=张三&yearStart=2020&yearEnd=2025&limit=20`
- `GET /api/record?id=<作品ID>`

## 数据同步

仓库根目录的 `data.db` 是权威快照。手动运行 GitHub Actions 工作流 `导入数据到Cloudflare D1` 时会依次执行：

1. `npm run export-d1`
2. 将 `cloudflare/d1/data.sql` 导入 D1
3. 校验 D1 行数
4. 部署 Worker 与静态页面

手动工作流 `收录作品到 Cloudflare D1` 会先收录新作品，再执行同一套同步和部署流程。定时触发当前关闭。

## Cloudflare 配置

- Worker：`pl-search-cloudflare`
- D1 database：`plworks`
- D1 binding：`DB`
- Assets binding：`ASSETS`

部署凭据由 GitHub Environment `pl-search` 提供。`CLOUDFLARE_API_TOKEN` 使用 Secret，`CLOUDFLARE_ACCOUNT_ID` 使用 Variable。
