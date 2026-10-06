# 0003 Build Adjusted Market Data

来源：`docs/proposal.md`、`docs/total_progress.md`、`docs/0002-data-center/design.md`

## 目标

建立未复权、前复权、后复权日线行情，并提供稳定 K 线服务接口。

## 前置依赖

- 数据源 adapter 已建立。
- `stock_profiles` 和 `trade_calendar` 已可用。

## 执行步骤

1. 建立 `daily_bars`，字段包含 OHLC、成交量、成交额、换手率和 `adjust_type`。
2. 拉取任意 A 股最近 10 年未复权日线数据。
3. 生成前复权和后复权价格序列。
4. 校验同一 `symbol + date + adjust_type` 不允许重复。
5. 校验非交易日不应出现普通日线数据。
6. 为 K 线接口增加 `adjust=none|qfq|hfq` 参数。
7. 保留日线到周线、月线、年线聚合能力，并确保聚合数据来源可追溯。

## 产出

- 未复权、前复权、后复权日线。
- K 线服务接口支持复权参数。
- 复权计算测试样例。

## 验收

- 可以查询任意 A 股最近 10 年日线数据。
- 可以区分未复权、前复权、后复权。
- K 线接口稳定返回标准字段。

## 2026-09-26 回测数据补充要求

上述步骤描述现有展示 K 线建设；回测改用 [Hikyuu 官方工具导入的历史数据](../0006-backtest-center/hikyuu-implementation-plan.md)。回测前另须验证未复权成交价、复权指标、企业行为及数据版本口径，不能因为展示接口支持 `qfq/hfq` 就认定回测数据验收完成。

