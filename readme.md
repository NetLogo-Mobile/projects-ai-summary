# pl-database-gpt (TypeScript 重构版)

基于 `physics-lab-web-api` + SQLite + 讯飞星火 Spark Max 的作品收录与查询机器人。

## 功能

1. **定时更新数据库**：按标签抓取最新 Discussion，并做学科分类后入库。
2. **定时启动 Bot**：在指定讨论区回复查询请求。
3. **历史补录脚本**：读取历史作品 ID 列表，检查是否收录，未收录则自动补录。
4. **丰富查询工作流**：支持关键词、作者、年份、难度、学科、组合过滤等多种查法。

## 查询格式（Bot）

### 快捷查法

```text
#查词: 电磁学,光学
#查作者: 用户名
#查年份: 2024
#查年份: 2021-2024
#查难度: 0.2-0.6
#查学科: 理学
```

### 组合查法（推荐）

```text
#查询 关键词=电磁学,光学 作者=张三 年份范围=2021-2024 难度=0.2-0.8 学科=理学 limit=8
```

- 字段可自由组合，顺序不限。
- 当前支持字段：`关键词` / `作者` / `年份` / `年份范围` / `难度` / `学科` / `limit`。

## 环境变量

请创建 `.env`：

```env
PL_USERNAME=你的物实账号
PL_PASSWORD=你的物实密码
SPARK_API_PASSWORD=你的讯飞Spark API Password
SPARK_MODEL=spark-max
SPARK_ENDPOINT=https://spark-api-open.xf-yun.com/v1/chat/completions
PL_DISCUSSION_TAG=精选
PL_DISCUSSION_ID=69a59f0eca7ceb749317ef7c
DB_PATH=./data.db
```

> 注意：密钥与账号不要提交到仓库。

## 运行

```bash
npm install
npm run build
```

### 1) 定时工作流（更新数据库 + Bot）

```bash
npm run scheduler
```

- 同步作品：每三天一次 `0 2 */3 * *`（抓取新 tag 作品并分类入库）。
- 获取查询：每小时一次 `0 * * * *`（初始化 Bot 并处理 discussion 查询请求）。
- 两个流程已经拆分为独立定时任务。
- 用户可在 discussion 中使用上面的任意查询格式发起请求。

### 2) 单独更新数据库

```bash
npm run update-db
```

### 3) 单独运行 Bot

```bash
npm run run-bot
```

### 4) 历史补录检查

先准备一个 `history-ids.txt`（每行一个 discussion ID），然后运行：

```bash
npm run check-history -- history-ids.txt
```

