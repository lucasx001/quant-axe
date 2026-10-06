# Data Center 数据中心实现进展

## 已完成

- [x] FastAPI 数据服务骨架。
- [x] Data Center API 骨架：`/api/data/health`、`/api/data/jobs`、`/api/data/jobs/run`、`/api/data/scheduler`。
- [x] AkShare quote 适配。
- [x] AkShare 指数适配。
- [x] AkShare 日 K 数据适配。
- [x] K 线接口支持 `adjust=none|qfq|hfq`，并保留日/周/月/年聚合。
- [x] AkShare 五档盘口适配。
- [x] 周线、月线、年线后端聚合。
- [x] Next.js BFF 转发行情请求。
- [x] NewsNow 热点新闻适配。
- [x] AkShare 个股新闻适配。
- [x] AkShare 分时图适配（`stock_zh_a_hist_min_em` 主源 + `stock_zh_a_minute` 备选）。
- [x] AkShare 当日分笔聚合适配（`stock_intraday_em`）。
- [x] 跨标的搜索数据源：A 股(沪/深/北) + 指数 + ETF + 拼音首字母。
- [x] 新闻接口统一按可解析时间倒序返回，时间缺失时保留来源排名。
- [x] PostgreSQL 本地存储层接入，使用 `POSTGRES_DSN`，包含 raw、clean、adjusted、news、financial_metrics、hot_keywords、job 等基础表 schema。
- [x] Redis 本地缓存层接入，使用 `REDIS_URL`，用于 K 线等 serving 数据 JSON 缓存。
- [x] Tushare 外部数据源接入，使用 `TUSHARE_TOKEN`：覆盖股票基础信息、公告、`daily_basic`、`fina_indicator`。
- [x] 财务指标合并接口：`/api/stock/financials/{symbol}` 输出估值、质量、成长、流通市值等字段，落库到 `financial_metrics`。
- [x] 舆情热词接口：`/api/intelligence/hot-keywords` 基于 NewsNow 标题派生，落库到 `hot_keywords`。
- [x] 股票基础信息查询接口：`/api/stocks/{symbol}/profile` 与 `/api/stocks/profiles`。
- [x] 跨标的搜索接口：`/api/stocks/search?q=...`。
- [x] 交易日历接口：`/api/calendar/trading-days`。
- [x] 股票状态接口：`/api/stock/status/{symbol}`，可返回 ST、停牌、涨跌停价格与涨跌停触发状态。
- [x] 数据质量规则与接口：`/api/data/quality/daily-bars/{symbol}`。
- [x] APScheduler 内嵌调度器：热点新闻 / 热词 / 股票基础信息 / 交易日历 / 日线 / 财务指标按周期触发，运行状态在 `/api/data/scheduler` 暴露。
- [x] 后端单元测试覆盖：数据质量规则、交易所识别、涨跌停比例、日期标准化、舆情热词派生、Tushare 财务合并、分时辅助函数、跨标的搜索匹配。

## 阶段清单

- [x] 接入 AkShare 数据源。
- [x] 建立股票基础信息数据表。
- [x] 建立交易日历。
- [x] 建立 ST 状态数据。
- [x] 建立停牌数据。
- [x] 建立涨跌停价格数据。
- [x] 建立前复权/后复权行情。
- [x] 建立财务指标数据。
- [x] 建立热点新闻入库存储。
- [x] 建立个股新闻公告入库存储。
- [x] 建立舆情热词数据。
- [x] 增加 PostgreSQL 存储。
- [x] 增加 Redis 缓存。
- [x] 增加数据更新任务入口与 `data_jobs` 记录表。
- [x] 增加数据质量检查。
- [x] 增加后端单元测试。
- [x] 增加完整调度器，自动按日/小时/财报周期触发更新任务。

## 阻塞/待确认

- [x] 回测历史行情路线已选定 Hikyuu 官方 `HikyuuTDX` / `importdata` 导入；现有 AkShare K 线仍供展示。选型记录见[实施计划](../0006-backtest-center/hikyuu-implementation-plan.md)。
- [x] 验证 Windows 本地 Hikyuu 安装和增量导入；沪深北在市 A 股日线表覆盖齐全，并生成带校验值的正式快照。
- [ ] 验证 Linux/Docker 目标环境、复权/权息和基准指数口径；仅有日线表覆盖不等于数据内容全面验收。
- [ ] 补齐并核验历史 ST、停牌、涨跌停、退市和逐日指数成分，建立可复现的导入批次与数据质量报告。

- [x] 历史行情数据源优先使用 AkShare 还是申请 Tushare Token：行情继续优先 AkShare，Tushare 作为公告、财务、基础资料补充源。
- [x] 热点新闻是否使用公开 NewsNow 实例作为 MVP，或优先自建 NewsNow 服务：MVP 使用可配置 `NEWSNOW_API_BASE`，默认公开实例。
- [x] 历史行情存储方案：第一阶段使用 PostgreSQL 单一存储，待分钟线/Tick 进入再评估 Parquet/DuckDB。
- [ ] 本地运行需补充环境说明：PostgreSQL、Redis 服务、`TUSHARE_TOKEN`、`SCHEDULER_ENABLED` 和调度器 watchlist。
