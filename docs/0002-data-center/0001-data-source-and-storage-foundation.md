# 0001 Data Source And Storage Foundation

来源：`docs/proposal.md`、`docs/total_progress.md`、`docs/0002-data-center/design.md`

## 目标

建立数据中心的外部数据源、存储和任务基础设施，让后续股票池、因子和回测不依赖临时行情接口。

## 前置依赖

- 已有 FastAPI 数据服务骨架。
- 已有 AkShare quote、指数、日 K、五档盘口和周期聚合。
- 已确认 Tushare 作为公告、财务指标和股票基础资料补充源。

## 执行步骤

1. 定义 provider adapter 接口，统一外部数据源返回结构和错误格式。
2. 保留 AkShare 作为现有行情展示源；回测历史行情按 [Hikyuu 接入实施计划](../0006-backtest-center/hikyuu-implementation-plan.md)使用其官方导入工具取得固定快照。本条为后续选型修订，当前已实现的 AkShare 代码不代表回测数据已迁移。
3. 移除 Sina 行情依赖，避免实时 quote、指数、K 线和盘口多源口径不一致。
4. 接入 Tushare Token 配置，作为公告、财务指标和基础资料补充源；未配置时返回标准 `not_configured` 状态。
5. 建立 PostgreSQL 连接、迁移方案和基础表管理流程。
6. 评估历史行情、因子矩阵是否使用 Parquet/DuckDB，并记录第一阶段采用 PostgreSQL 的结论。
7. 增加 Redis 缓存，用于 quote、盘口、分时和任务状态。
8. 设计 `data_jobs` 任务表，记录任务状态、开始结束时间和错误信息。

## 产出

- 数据源 adapter 边界。
- PostgreSQL 基础存储。
- Redis 缓存入口。
- 数据更新任务记录模型。
- Tushare、AkShare、NewsNow 的数据源分工。

## 验收

- 数据中心能从统一接口调用 AkShare。
- 数据任务状态可查询。
- 外部数据源失败不会污染 clean 层。
