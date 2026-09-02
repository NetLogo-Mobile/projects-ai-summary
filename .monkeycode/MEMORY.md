# User Instruction Memory

This file records user instructions, preferences, and teachings for reference in future interactions.

## Format

[User Instruction Summary]
- Date: YYYY-MM-DD
- Context: scenario
- Instructions:
  - content

## Entries

[Agent Thinking Format]
- Date: 2026-08-30
- Context: 用户在布置 Cloudflare D1 数据同步任务时提出
- Instructions:
  - 思考（thinking）内容以 "we need..." 开头

[Cloudflare 部署方式]
- Date: 2026-08-30
- Context: 搜索服务（pl-search-cloudflare Worker + D1）的运维约定
- Instructions:
  - Cloudflare 相关操作全部通过 GitHub Actions secrets（CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID，environment: pl-search）完成，不需要本地 wrangler login
  - D1 数据库：plworks，database_id 1ff32e2b-ab3c-4f78-aa15-9313e095e237
  - 线上 Worker 入口：https://s.pltown.online （workers.dev 域名在本环境可能无法访问）
  - 排查 500：先看 `GET /api/stats?type=errors`，再对照失败请求的 JSON `error` 字段

[AI 与 GitHub Environment 配置]
- Date: 2026-08-30
- Context: 用户调整作品收录工作流配置
- Instructions:
  - 作品收录程序统一使用 OpenAI provider，OpenAI API Key 保存在 GitHub Environment Secret `OPENAI_API_KEY`
  - 普通配置统一保存在 GitHub Environment Variables，工作流读取 `vars.*`
