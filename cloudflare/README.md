# Cloudflare Query API

这个目录提供一个可直接部署到 Cloudflare Workers 的只读查询 API。

## 文件

- `worker.mjs`：Workers 入口，提供 `/api/meta`、`/api/search`、`/api/record`
- `data/records.mjs`：由本地数据库导出的静态数据快照
- `wrangler.toml`：Workers 配置

## 部署前准备

1. 本地先生成最新快照：

```bash
npm run build
npm run export-cloudflare
```

2. 登录 Cloudflare：

```bash
npx wrangler login
```

3. 部署：

```bash
npx wrangler deploy --config cloudflare/wrangler.toml
```

## API

### `GET /api/meta`

返回服务信息、记录数量、快照生成时间。

### `GET /api/search`

查询参数：

- `keywords`
- `author`
- `year`
- `yearFrom`
- `yearTo`
- `limit`

示例：

```text
/api/search?keywords=电磁学 光学&limit=10
```

### `GET /api/record?id=...`

按作品 ID 获取单条记录。


## GitHub Actions 自动部署

如果要让 `.github/workflows/update-database.yml` 自动部署 Cloudflare Worker，请在 GitHub Secrets 里配置：

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

工作流会在导出快照后，进入 `cloudflare/` 目录执行：

```bash
npx wrangler deploy --config wrangler.toml
```
