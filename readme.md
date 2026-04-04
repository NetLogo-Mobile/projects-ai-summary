# Physics-Lab-Search-Engine

基于 `physics-lab-web-api` + SQLite + OpenAI/讯飞星火 的作品收录与查询机器人。

## Bot 查询命令

```
#查词: 电磁学,光学
#查作者: 用户名
#查年份: 2024
#查年份: 2021-2024
#查查询 关键词=电磁学,光学 作者=张三 limit=8
```

## 环境变量配置

创建 `.env` 文件：

```env
# 物实平台
PL_USERNAME=
PL_PASSWORD=
PL_DISCUSSION_ID=69a59f0eca7ceb749317ef7c
PL_DISCUSSION_TAG=精选,知识库
PL_DISCUSSION_TYPE=Discussion,Experiment

# 数据收集
SKIP=0
TAKE=-100
DB_PATH=./data.db

# AI 服务（选择其一）
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4o-mini
# OPENAI_BASE_URL=https://your-provider.com/v1

# 或使用讯飞星火
SPARK_API_PASSWORD=your_password
SPARK_MODEL=generalv3.5
SPARK_ENDPOINT=https://spark-api-open.xf-yun.com/v1/chat/completions
```

## GitHub Actions 工作流

两个自动化任务在 `.github/workflows/`：

**run-bot-query.yml**（每小时 0-16 时）
- 执行 `npm run run-bot-once`
- 需要 Secrets: PL_USERNAME, PL_PASSWORD, PL_DISCUSSION_*

**update-database.yml**（每 5 天）
- 执行 `npm run update-db` 并提交数据
- 需要上述 Secrets + AI 配置

在 GitHub Settings → Secrets and variables → Actions 中添加相应的 Secrets。

## 本地命令

```bash
npm run update-db          # 更新数据库
npm run run-bot            # 启动机器人（持续运行）
npm run run-bot-once       # 运行一轮机器人
npm run discipline-stats   # 统计学科分布
npm run flexible-collect -- --tag "精选" --take -50  # 灵活收集
```

