# Requirements Document

## Introduction

本功能为标签同步任务增加连续 API 失败保护，避免远端服务持续异常时继续发起同步请求，同时保留已经成功提交的标签更新。

## Glossary

- **同步任务**：由 `sync-selected-tags` 命令启动的一次完整标签同步。
- **API 调用失败**：API 请求抛出异常，或更新接口返回非 200 状态。
- **连续失败次数**：自最近一次成功 API 调用后连续发生的 API 调用失败数量。
- **已完成更新**：远端 API 已返回成功状态的标签更新。

## Requirements

### Requirement 1

**User Story:** AS 运维人员, I want 同步任务在 API 连续失败时及时结束, so that 远端服务异常期间的请求数量受控

#### Acceptance Criteria

1. WHEN API 调用失败一次, 同步任务 SHALL 记录失败并继续处理后续工作。
2. WHEN API 调用成功, 同步任务 SHALL 将连续失败次数重置为零。
3. IF API 调用连续失败两次, 同步任务 SHALL 停止启动后续同步工作。
4. WHEN 同步任务因连续失败停止, 同步任务 SHALL 以正常收尾流程输出停止原因。

### Requirement 2

**User Story:** AS 运维人员, I want 保留停止前完成的更新, so that 已完成工作仍然产生业务价值

#### Acceptance Criteria

1. WHEN 标签更新 API 返回成功状态, 同步任务 SHALL 将该作品计入已完成更新。
2. IF 后续 API 调用连续失败两次, 同步任务 SHALL 保留此前已完成更新的远端状态。
3. WHEN 同步任务停止, 运行日志 SHALL 继续执行推送收尾流程。

### Requirement 3

**User Story:** AS 运维人员, I want 标签同步过滤低价值作品, so that 学科标签应用于符合内容要求的作品

#### Acceptance Criteria

1. WHERE 作品类型为 Discussion, IF 作品包含“小作品”标签, 同步任务 SHALL 跳过该作品的标签更新。
2. IF 作品正文合计少于 50 个字符, 采集任务与同步任务 SHALL 跳过该作品。
3. WHEN 作品正文合计达到 50 个字符且作品标签不包含“小作品”, 同步任务 SHALL 按现有学科映射处理该作品。
4. WHEN 同步任务过滤作品, 运行日志 SHALL 记录作品标识与过滤原因。

### Requirement 4

**User Story:** AS 数据维护人员, I want 每条记录保存标准化作品来源, so that 查询和统计能够区分作品收录入口

#### Acceptance Criteria

1. WHEN 系统按“Experiment + 精选”采集作品, 系统 SHALL 将来源记录为“实验精选”。
2. WHEN 系统按“Discussion + 精选”采集作品, 系统 SHALL 将来源记录为“黑洞精选”。
3. WHEN 系统按“Discussion + 小说”采集作品, 系统 SHALL 将来源记录为“黑洞小说”。
4. WHEN 系统按其他类型与标签组合采集作品, 系统 SHALL 将来源记录为“其他”。
5. WHEN 系统初始化缺少来源字段的数据库, 系统 SHALL 新增来源字段并将历史记录来源填充为“其他”。
6. WHEN 管理页读取缺少来源字段的数据库, 管理页 SHALL 将记录来源显示为“其他”。
7. WHEN 用户使用来源名称搜索记录, 本地查询与 Cloudflare 查询 SHALL 返回来源匹配的记录。
