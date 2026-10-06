# 0002 Connect Base Universes

来源：`docs/proposal.md`、`docs/total_progress.md`、`docs/0003-universe-center/design.md`

## 目标

接入全 A、沪深 300、中证 500、中证 1000 等基础股票池。

## 前置依赖

- `data-center` 已提供股票基础信息和指数成分数据。
- 股票池模型已定义。

## 执行步骤

1. 实现 `BaseUniverseProvider`。
2. 接入全 A 基础股票池。
3. 接入沪深 300 成分。
4. 接入中证 500 成分。
5. 接入中证 1000 成分。
6. 处理指数成分的历史变更，保存按日期可查询的成分。
   Hikyuu 官方历史行情导入并不自动证明逐日指数成分可用；按[回测实施计划](../0006-backtest-center/hikyuu-implementation-plan.md)独立核验来源与生效日期，缺失时不可用当前成分回填历史。
7. 在第一版范围未确认前，优先保证沪深 300 可复现。

## 产出

- 基础股票池 provider。
- 全 A 和主要指数股票池。
- 历史成分读取能力。

## 验收

- 可以读取任意交易日的沪深 300 成分。
- 基础股票池不使用当前成分替代历史成分。
- 股票池结果包含股票名称和代码。

