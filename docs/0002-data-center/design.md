# Data Center 数据中心详细设计

## 1. 模块目标

数据中心负责 QuantDash 的所有基础数据采集、清洗、存储、质量检查和服务化输出。它是行情看板、股票池、因子、策略、回测、组合、风控和交易模块的共同地基。

## 2. 模块边界

### 2.1 模块内职责

- 外部数据源适配。
- 原始数据保存。
- 字段标准化和数据清洗。
- 复权价格生成。
- 交易日历、停牌、ST、涨跌停数据维护。
- 财务、新闻、公告、舆情数据入库。
- 为其他模块提供稳定查询接口。

### 2.2 模块外职责

- 不决定策略买卖逻辑。
- 不负责因子组合、策略回测、交易下单。
- 不在数据层做投资建议。

## 3. 技术架构

```text
External Sources
  -> Provider Adapters
  -> Raw Storage
  -> Cleaning Jobs
  -> Clean Tables / PostgreSQL
  -> Feature-ready Serving API
```

建议技术栈：

| 层级              | 技术                                                   |
| ----------------- | ------------------------------------------------------ |
| API               | FastAPI                                                |
| 批处理            | Pandas / Polars                                        |
| 任务调度          | APScheduler / Celery / Prefect                         |
| 关系数据          | PostgreSQL                                             |
| 回测历史行情      | Hikyuu 官方工具导入的本地存储；首轮评估默认 HDF5        |
| 展示行情/因子矩阵 | PostgreSQL（现有）；Parquet / DuckDB 后续评估           |
| 高频缓存          | Redis                                                  |
| 数据源            | Hikyuu 官方导入工具获取回测历史行情；AkShare 展示行情与个股新闻，`news-collector` R2 热点快照，Tushare 补充资料 |

## 4. 数据分层

```text
raw
  保存外部源原始响应，便于追溯

clean
  标准字段、标准类型、标准交易日

adjusted
  前复权、后复权、未复权行情

feature
  可供因子和策略读取的特征宽表

serving
  面向前端、回测和策略的稳定接口
```

## 5. 核心数据表

```text
raw_payloads(id, provider, dataset, symbol, payload, captured_at)
stock_profiles(symbol, name, exchange, industry, listed_at, delisted_at, pinyin)
trade_calendar(date, is_open, exchange)
daily_bars(symbol, date, open, high, low, close, volume, turnover, adjust_type)
limit_prices(symbol, date, up_limit, down_limit)
stock_status(symbol, date, is_st, is_suspended)
financial_metrics(symbol, report_period, pe_ttm, pb, roe, gross_margin, source)
news_items(id, symbol, title, summary, source, url, published_at, type)
hot_news_items(id, source_id, source_name, rank, title, url, updated_at, captured_at)
hot_keywords(id, word, heat, sources, captured_at)
hot_news_ai_analyses(id, snapshot_key, snapshot_etag, node_key, analysis_mode, content, generated_at)
hot_news_ai_analysis_runs(id, execution_date, node_key, scheduled_time, status, error)
data_jobs(id, job_type, status, started_at, finished_at, error)
```

新闻与舆情数据分层：

- 热点新闻由 News Center 只读访问 `news-collector` 上传到 Cloudflare R2 的 SQLite 快照，不直接请求公开 NewsNow 实例。
- `news_items` 保存个股新闻、公告、财报、回购、减持、增持等与股票强相关的数据。第一版个股新闻使用 AkShare `stock_news_em`，公告使用 Tushare `anns`。
- `hot_keywords` 第一版基于 R2 热点标题派生热词，后续可替换为更完整的 NLP/情绪模型，API 契约保持稳定。
- `hot_news_ai_analyses` 与 `hot_news_ai_analysis_runs` 保存按 A 股时间线生成的 AI 分析和调度执行结果。

## 6. API 设计

```text
GET /api/data/health
GET /api/data/scheduler
GET /api/data/jobs
POST /api/data/jobs/run
GET /api/data/quality/daily-bars/[symbol]?adjust=
GET /api/stocks/search?q=
GET /api/stocks/profiles?q=
GET /api/stocks/[symbol]/profile
GET /api/calendar/trading-days?start=&end=
GET /api/stock/kline/[symbol]?type=&adjust=
GET /api/stock/intraday/[symbol]
GET /api/stock/trades/[symbol]?limit=
GET /api/stock/status/[symbol]?date=
GET /api/stock/financials/[symbol]
GET /api/news/hot?sources=&limit=
GET /api/news/analysis/latest
GET /api/stock/news/[symbol]?limit=
GET /api/stock/announcements/[symbol]?limit=
GET /api/intelligence/hot-keywords?limit=
```

## 7. Tushare 进阶接入

### 7.1 数据源分工原则

| 场景                            | 首选                                     | 备选                                   |
| ------------------------------- | ---------------------------------------- | -------------------------------------- |
| 实时 quote / 五档 / 分时 / 逐笔 | AkShare                                  | —                                      |
| 指数实时行情                    | AkShare                                  | —                                      |
| 历史日 K（展示）                | AkShare                                  | Tushare daily                          |
| 历史日 K（回测核心）            | Hikyuu `HikyuuTDX` / `importdata` 导入的固定快照 | 缺失即标记不可用，不自动回退展示接口 |
| 回测复权/企业行为               | 先核验 Hikyuu 导入的数据与引擎口径       | 不完整时阻止对应范围的正式回测         |
| 股票基础信息                    | Tushare `stock_basic`                    | AkShare 拼音/简称补充                  |
| 交易日历                        | AkShare `tool_trade_date_hist_sina`      | Tushare `trade_cal`                    |
| 涨跌停价格                      | 自算（前收盘 × 比例）                    | Tushare `stk_limit`（后续）            |
| 停牌历史                        | 日 K 缺失推断                            | Tushare `suspend_d`（后续）            |
| ST 历史                         | 当前简称推断                             | Tushare `namechange`（后续）           |
| 财务指标 PE/PB/ROE/毛利率       | AkShare `stock_zh_a_spot_em` + `stock_financial_analysis_indicator_em` | —                                      |
| 指数成分股 + 权重               | AkShare `index_stock_cons_weight_csindex`                              | Tushare `index_weight`（备选）         |
| 公告                            | AkShare `stock_notice_report`                                          | Tushare `anns`（备选）                 |
| 个股新闻                        | AkShare `stock_news_em`                  | —                                      |
| 全市场热点新闻                  | `news-collector` Cloudflare R2 快照      | —                                      |
| 舆情热词                        | R2 热点标题派生                          | AkShare `stock_hot_keyword_em`（后续） |
| 板块/概念                       | AkShare                                  | —                                      |

### 7.2 已接入 Tushare 接口

| 接口          | 用途         | 积分要求 | 状态          |
| ------------- | ------------ | -------- | ------------- |
| `stock_basic` | 股票基础信息 | 120      | 保留在 TuShare |

其余接口（`anns`、`daily_basic`、`fina_indicator`、`index_weight`）已于 2026-05-30 迁移至 AkShare，详见 `docs/0002-data-center/0006-tushare-akshare-field-gap.md`。

### 7.3 后续待接入（回测前置）

| 接口           | 用途                   | 积分要求 |
| -------------- | ---------------------- | -------- |
| `adj_factor`   | 复权因子，自算 qfq/hfq | 2000     |
| `namechange`   | ST 状态历史            | 2000     |
| `suspend_d`    | 停牌历史               | 2000     |
| `stk_limit`    | 涨跌停价格历史         | 2000     |
| `index_weight` | 沪深 300/中证 500 成分 | 2000     |
| `trade_cal`    | 交易所口径交易日历     | 120      |

### 7.4 注意事项

- 不要用 AkShare `adjust=qfq` 直接做回测：动态前复权基准日不固定，不同时间拉同一段历史会得到不同价格。
- ST 状态必须用历史口径：当前 `is_st_name(profile.name)` 只看今天的名称，回测会判错涨跌停比例。
- Tushare 积分门槛需提前规划：`daily_basic` + `fina_indicator` 需要 2000 积分。

### 7.5 Hikyuu 历史回测数据决策（2026-09-26）

- A 股日频回测历史行情采用 Hikyuu 官方提供的下载/导入工具。`HikyuuTDX` 首次生成配置，`importdata` 可用于后续导入；工具获取外部行情并写入本地存储，不是安装包内附的完整历史数据库。参见 [官方 README](https://github.com/fasiondog/hikyuu)和[新手入门](https://hikyuu.readthedocs.io/zh-cn/latest/quickstart.html)。
- 上表的 Tushare `adj_factor`、`namechange`、`suspend_d`、`stk_limit`、`index_weight` 属于历史规划或辅助数据候选，不能视为 Hikyuu 已自带的数据；具体覆盖和授权需在导入样本上核验。
- 现有 `daily_bars` 与看板 K 线仍描述当前实现；回测读取固定的 Hikyuu 数据快照。标准化副本可入 PostgreSQL 服务其他模块，但必须标记导入批次、来源、日期覆盖与口径。
- 历史 ST、停牌、涨跌停、退市与指数成分按日期可用性是回测前置条件。当前简称推断 ST、日 K 缺失推断停牌、当前指数成分回填历史，均不得进入正式回测。
- 执行与验收步骤见[Hikyuu 接入实施计划](../0006-backtest-center/hikyuu-implementation-plan.md)。

## 8. 调度器设计

### 8.1 方案

使用 APScheduler `BackgroundScheduler` 内嵌进 FastAPI 进程，通过 `lifespan` 钩子启停。

### 8.2 配置

| 环境变量                       | 默认值  | 说明                           |
| ------------------------------ | ------- | ------------------------------ |
| `SCHEDULER_ENABLED`            | `false` | 是否启用调度器                 |
| `NEWS_R2_CACHE_TTL_SECONDS`    | `300`   | R2 热点快照 ETag 检查间隔       |
| `HOT_KEYWORDS_REFRESH_MINUTES` | `30`    | 舆情热词刷新间隔               |
| `STOCK_PROFILE_REFRESH_HOURS`  | `24`    | 股票基础信息刷新间隔           |
| `TRADE_CALENDAR_REFRESH_HOURS` | `24`    | 交易日历刷新间隔               |
| `DAILY_BARS_CRON_HOUR`         | `16`    | 日线刷新时间（周一至周五）     |
| `FINANCIALS_CRON_HOUR`         | `20`    | 财务指标刷新时间（周一至周五） |

### 8.3 任务列表

| 任务                     | 触发方式        | 说明                                |
| ------------------------ | --------------- | ----------------------------------- |
| `hot_news_refresh`       | interval        | 检查并刷新 R2 热点快照               |
| `hot_news_ai_analysis`   | 每分钟检查      | 按 A 股时间线生成 AI 热点分析         |
| `hot_keywords_refresh`   | interval        | 从热点标题派生热词                  |
| `stock_profile_refresh`  | interval        | 刷新 AkShare + Tushare 股票基础信息 |
| `trade_calendar_refresh` | interval        | 刷新交易日历                        |
| `daily_bars_refresh`     | cron 周一至周五 | 刷新 watchlist 日线（三种复权）     |
| `financials_refresh`     | cron 周一至周五 | 刷新 watchlist 财务指标             |

### 8.4 运行状态

`GET /api/data/scheduler` 返回调度器启用状态、是否运行中、各任务最近执行时间和结果。

调度器默认关闭，需要显式设置 `SCHEDULER_ENABLED=true`，避免本地开发或测试环境无人值守触发外部请求。

## 9. 新闻与舆情 Provider 设计

### 9.1 news-collector R2 热点新闻 Provider

- 用途：全市场热点新闻和舆情热词输入。
- 数据源：只读访问 `news-collector` 上传到 Cloudflare R2 的 `news/YYYY-MM-DD.db`。
- 配置项：`NEWS_R2_*`、`HOT_NEWS_SOURCES`、`NEWS_R2_CACHE_TTL_SECONDS`。
- 推荐平台：`cls-hot`、`wallstreetcn-hot`、`ifeng`。
- 清洗规则：页面读取最新 `crawl_records.crawl_time` 对应榜单；AI 可读取当日累计条目和 `rank_history`。
- 风险控制：当天快照异常时回退最近可读对象并标记 `stale`；ETag 未变化时不重复下载或分析。

### 9.2 AkShare 个股新闻 Provider

- 用途：按 `symbol` 查询个股新闻，服务 `GET /api/stock/news/[symbol]`。
- 接口：AkShare `stock_news_em`。
- 清洗规则：标准化 6 位 A 股代码；输出标题、摘要、来源、链接、发布时间和抓取时间；缺少发布时间时保留空值，不伪造时间。
- 降级策略：AkShare 请求失败或无数据时返回空列表和 `status: unavailable` 或 `status: empty`，不生成 mock 新闻。

### 9.3 Tushare 公告与财务 Provider

- 用途：公告服务 `GET /api/stock/announcements/[symbol]`，财务指标服务 `GET /api/stock/financials/[symbol]`。
- 接口：公告使用 Tushare `anns`；财务指标使用 `daily_basic` 与 `fina_indicator` 合并。
- 清洗规则：公告写入 `news_items` 并标记 `type=announcement`；财务指标写入 `financial_metrics`，保留 `report_period`、估值、质量、成长和市值字段。
- 降级策略：未配置 `TUSHARE_TOKEN` 时返回 `status: not_configured`；接口失败时返回 `status: unavailable`，前端展示空状态，不生成模拟公告或财务结论。

### 9.4 搜索、分时与逐笔 Provider

- 跨标的搜索使用 AkShare 构建进程内索引，覆盖 A 股（沪/深/北）、重要指数、ETF，并支持股票名称、代码、拼音和拼音首字母查询。
- 分时图使用 AkShare `stock_zh_a_hist_min_em`，失败时回退 `stock_zh_a_minute`。
- 逐笔成交第一版使用 AkShare `stock_intraday_em` 当日分笔聚合数据；A 股 Tick 级数据后续可替换为付费或自建数据源。

## 10. 数据质量规则

- 同一 `symbol + date + adjust_type` 不允许重复。
- 交易日历关闭日期不应出现普通日线交易数据。
- 非停牌日成交量缺失需要标记异常。
- 涨跌幅超过市场制度限制时需要标记异常。
- 每条服务化数据必须携带 `source` 或可追溯来源。
- 热点新闻与个股新闻分表或分类型存储，不能把全市场热榜直接标记为个股新闻。
- 新闻 URL 为空时允许用 `source + title + captured_at` 做临时去重键，但需要标记不可追溯风险。

## 11. 独立测试设计

- Provider adapter 使用固定原始响应 fixture 测试解析。
- 清洗任务使用小样本数据测试去重、字段类型、缺失值处理。
- 复权计算使用已知样例测试价格连续性。
- API 层使用测试数据库，不依赖真实外部网络。
- 数据质量规则可以单独运行并输出报告。

## 12. 验收标准

- 可以查询任意 A 股最近 10 年日线数据。
- 可以区分未复权、前复权、后复权。
- 可以判断某只股票某日是否 ST、停牌、涨停、跌停。
- 可以查询全市场热点新闻和指定股票的个股新闻，且二者来源和类型清晰区分。
- 可以查询公告、财务指标、分时图、逐笔成交和舆情热词，缺失时返回标准空状态。
- 数据接口稳定返回标准字段。
- 数据源异常不会污染 clean 层数据。
