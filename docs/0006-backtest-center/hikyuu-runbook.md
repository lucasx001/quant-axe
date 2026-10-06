# Hikyuu 本地回测运行说明

当前接入范围是**研究预览**：官方 `importdata` 导入日线与权息数据，完成后冻结一份带 SHA-256 校验的快照；FastAPI 创建独立进程回测任务，Hikyuu 计算固定股票的 5 日 EMA 与其 10 日平滑线交叉策略，页面在 `/backtests` 展示总收益、期末资产、数据覆盖与成交。历史 ST、停牌、逐日涨跌停、T+1、滑点、复权/分红送配和按日股票池尚未验收，不能把预览结果用于投资决策。

## 首次准备（Windows PowerShell）

在项目根目录执行：

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
.\.venv\Scripts\python.exe -m pip install -r backend\requirements-hikyuu.txt
.\.venv\Scripts\python.exe -m backend.scripts.setup_hikyuu
```

最后一步使用已安装 Hikyuu 的官方配置模板，在用户目录 `~/.hikyuu/` 创建 `hikyuu.ini` 与 `importdata-gui.ini`，数据写入项目根目录 `.hikyuu-data/`。脚本不会覆盖已有配置；若目录里已有 Hikyuu 配置，先核对它的路径和导入选项。`.hikyuu-data/` 已被 Git 忽略；首次全市场导入和每份快照都需要额外磁盘空间。

## 导入、冻结、运行

```powershell
.\.venv\Scripts\importdata.exe
.\.venv\Scripts\python.exe -m backend.scripts.snapshot_hikyuu
.\.venv\Scripts\python.exe -m backend.app.db.migrations
```

`importdata.exe` 是 Hikyuu 官方导入器，首次下载可能耗时较长。**只在导入器成功退出并完成覆盖核验后**执行快照命令。快照脚本会检查沪、深日线和证券资料文件，复制并记录校验值；导入期间更新的文件会被拒绝。以后更新数据也按“导入完成 → 新快照”执行，旧回测继续绑定旧快照。当前配置打开日线和权息；分钟、历史财务、板块下载未打开。

本机 2026-09-26 的第一次导入在深圳 `301502` 后留下 108 只在市 A 股无日线；重新运行官方导入器后补齐，完整日志保存在 `.hikyuu-data/tmp/import-resume-20260926.stdout.log` 和 `.stderr.log`。当前正式快照为 `20260926T151933Z-00f7d5bc`。本地验收已确认沪深北全部 5568 只在市 A 股均有日线，SQLite 完整性检查及逐股日期/OHLC/成交量结构检查通过；样本末日为 2026-09-24，`stock.db` 将 2026-09-25 记为休市日。上述检查不等于独立行情源比对或复权/权息验收。

数据库迁移需要本地 PostgreSQL 可连接，并使用 `.env.local` 中的 `POSTGRES_DSN`。随后启动 FastAPI 和 Next.js：

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

另一终端在 `frontend/` 运行 `npm run dev`。浏览器打开 `/backtests`。页面“历史数据”显示“快照已就绪”后才能提交任务。也可请求 `GET /api/backtests/hikyuu/status` 检查环境。`POST /api/backtests` 需要 `symbols`、`start_date`、`end_date`，例如：

```json
{"symbols":["600519"],"start_date":"2022-01-01","end_date":"2025-12-31","initial_cash":300000}
```

提交后得到任务 ID；`GET /api/backtests/{id}` 返回状态、输入和完成后的结果。快照 ID 与 Hikyuu 版本固定在任务中。任务日志存放在 `.hikyuu-data/job-logs/`；若任务失败，接口也会返回错误文字。

## 已知边界

- 已验证 Windows 本地 Hikyuu 2.8.2 安装、正式快照读取和直接调用引擎的沪深两股 3 年回测：各 727 个交易日、共 111 笔成交。PostgreSQL 任务和页面链路尚未实测；Linux x86_64 wheel 已确认可下载，Docker 镜像和容器挂载尚未实测。
- 深入核验复权、权息、退市与历史交易状态前，不能将该快照的结构性覆盖检查等同于可信回测数据验收。导入器运行时不要对正在写入的 HDF5 文件创建快照。
- 当前账户结果只展示现金、持仓市值、净值和成交；完整持仓、回撤、基准、风险指标、拒单原因和历史交易约束仍在后续阶段。
