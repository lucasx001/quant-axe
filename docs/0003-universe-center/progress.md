# Universe Center 股票池中心实现进展

## 已完成

- [x] 定义股票池配置模型：`id`、`name`、`base`、`filters`、`created_at`、`updated_at`。
- [x] 定义股票池成分模型：`date`、`universe_id`、`symbol`、`name`、`included`、`excluded_reason`，并扩展 `can_buy`、`can_sell`、`flags` 用于涨跌停交易状态。
- [x] 建立 PostgreSQL 股票池配置表和股票池历史成分表。
- [x] 实现基础池 provider：`all_a`、`hs300`、`zz500`、`zz1000`、`custom`。
- [x] `all_a` 优先读取本地 `stock_profiles`，本地缺失时回退 AkShare 当前 A 股代码名称列表。
- [x] `hs300`、`zz500`、`zz1000` 通过 Tushare `index_weight` 按目标日期向前读取最近一期成分，避免使用未来日期数据。
- [x] 实现过滤器管道统一接口。
- [x] 实现 ST 过滤器。
- [x] 实现停牌过滤器。
- [x] 实现上市天数过滤器。
- [x] 实现成交额流动性过滤器。
- [x] 实现价格过滤器。
- [x] 实现涨跌停交易状态标记。
- [x] 实现股票池 CRUD 接口。
- [x] 实现股票池预览接口。
- [x] 实现股票池历史快照保存和读取接口。
- [x] 增加过滤器单元测试。
- [x] 增加 Next.js BFF route handlers 转发 Universe Center API。
- [x] 增加 `/universes` Universe Center 管理页面，支持股票池列表、配置编辑、临时预览、保存、另存副本和生成快照。
- [x] 在首页策略观察区域增加 Universe Center 入口。
- [x] 前端股票池列表使用 React Query 缓存，预览、保存与生成快照使用 `useMutation`，保存后刷新列表缓存。

## 待完成

- [ ] 增加指数成分刷新任务和可观测任务记录。
- [ ] 为 Universe Center API 增加集成测试。
- [ ] 在回测中心实现后，接入股票池历史快照读取器。

## 阻塞/待确认

- [x] 第一版优先做沪深 300，还是全 A + 过滤条件：当前按任务文档执行，优先提供内置“沪深300基础池（剔除 ST + 剔除停牌）”，同时支持创建全 A + 过滤条件的自定义池。
- [ ] 上市不足 N 天默认 N 值待定。
- [x] 第一版是否需要前端 Universe Center 页面，还是 API 能力先满足当前阶段：已实现基础管理页面。
