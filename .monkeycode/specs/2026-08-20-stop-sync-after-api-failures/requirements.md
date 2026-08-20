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
