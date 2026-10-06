# Market Dashboard 行情看板实现进展

## 已完成

- [x] Next.js App Router 页面骨架。
- [x] 三栏行情工作台布局。
- [x] UI 组件拆分，降低主组件复杂度。
- [x] 自选股本地列表。
- [x] 自选股 `localStorage` 持久化。
- [x] 6 位 A 股代码 quote 查询。
- [x] 自选股 quote 轮询。
- [x] quote 轮询频率与缓存策略统一。
- [x] quote 请求失败时保留旧数据并标记 stale/error。
- [x] 顶部市场指数展示。
- [x] ECharts K 线基础渲染。
- [x] 日线、周线、月线、年线切换。
- [x] MA5、MA10、成交量展示。
- [x] 完整股票搜索主数据：A 股(沪/深/北) + 指数 + ETF + 拼音首字母。
- [x] 真实五档盘口，当前由 AkShare `stock_bid_ask_em` 字段解析。
- [x] 修复五档盘口列宽和买卖盘布局，避免价格与数量文本重叠。
- [x] 真实分时图数据源，由 AkShare `stock_zh_a_hist_min_em` 提供。
- [x] 真实逐笔成交数据源（当日分笔聚合），由 AkShare `stock_intraday_em` 提供。
- [x] 真实热点新闻数据源（NewsNow 聚合）。
- [x] 真实个股新闻数据源（AkShare `stock_news_em`）。
- [x] 真实公告数据源（Tushare `anns`）。
- [x] 真实财务指标数据源（Tushare `daily_basic` + `fina_indicator` 合并视图）。
- [x] 真实舆情热词数据源（基于 NewsNow 标题派生）。
- [x] 新增 `/news` 独立 News page，承载全市场热点新闻。
- [x] Dashboard 右侧边栏新增 News page 入口，主 K 线区域不再展示热点新闻列表。
- [x] 新闻列表按时间从近到远排序，时间戳列保持不换行。
- [x] 前端组件测试。
- [x] Zustand store 单元测试。
- [x] 浏览器端行情、K 线、搜索和新闻请求迁移至 React Query；6 个独立详情接口通过 `useQueries` 并行读取，单个接口失败独立展示。
- [x] 浏览器端人工 E2E 验证：页面渲染、搜索、quote/K 线/盘口加载、空状态展示。

## 待完成

- [ ] 移动端布局（已确认非近期目标，记录在此供后续追踪）。

## 阻塞/待确认

- [x] quote 轮询频率最终使用 3-5 秒还是更保守的 10 秒：当前采用 5 秒。
- [x] 移动端布局是否需要作为近期目标：当前不作为近期目标。
- [x] 真实分时、逐笔、公告、财务、舆情：由 `data-center` 阶段 1 完成接入。
