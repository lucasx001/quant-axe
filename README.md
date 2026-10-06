# QuantDash

QuantDash 是一个面向个人投资者的轻量级量化看板。项目目标是把自选股、实时行情、K 线、指数概览和后续舆情/新闻/财务数据整合到一个响应式工作台里，辅助做数据驱动的投资决策。

当前版本已经实现：

- A 股自选池，支持输入 6 位股票代码查询真实行情后添加。
- 个股实时 quote：价格、涨跌幅、成交量、成交额、最高/最低、开盘、昨收。
- 日 K / 周 K 图表，包含 MA5、MA10 和成交量。
- 顶部市场指数：上证指数、深证成指、创业板指、科创 50。
- 前后端分离开发结构，使用 Taskfile 一键并行启动。

仍待完善的能力：

- Hikyuu 历史数据已完成本地日线导入和正式快照；复权、权息与历史交易状态仍需深入核验。
- 回测中的历史交易约束、风险指标及完整的数据库任务链路验收。

## 技术架构

项目目录：

```text
.
├── backend/                 # FastAPI 行情数据服务
│   ├── app/main.py          # FastAPI 入口
│   ├── app/db/              # SQLAlchemy 模型、连接和 repository
│   ├── migrations/          # Alembic 数据库迁移
│   └── app/services/        # 数据源适配与清洗
├── frontend/                # Next.js 前端应用
│   ├── src/app/             # App Router 页面与 BFF route handlers
│   ├── src/components/      # 看板与图表组件
│   └── src/lib/             # 前端类型与请求封装
├── docs/                    # 产品文档
└── Taskfile.yml             # 开发任务管理
```

前端：

- Next.js 16 App Router
- React 19
- TanStack React Query：用 `useQuery` 读取与轮询、`useQueries` 并行读取股票详情、`useMutation` 提交股票池与回测任务
- Zustand：仅保存自选股、当前标的等界面状态；服务端数据由 React Query 缓存
- Tailwind CSS
- Apache ECharts
- lucide-react 图标

后端：

- FastAPI
- Uvicorn
- Pylint 后端代码异味检测
- AkShare A 股行情、K 线、指数、盘口和新闻数据适配
- PostgreSQL 本地数据中心存储
- SQLAlchemy 2.0 ORM / Core 和 Alembic 数据库迁移
- Redis serving 层缓存
- Tushare 公告和基础资料补充源
- Cloudflare R2 `news-collector` 热点快照和 A 股时间线 AI 分析
- Hikyuu 2.8.2 研究预览回测：官方导入器历史日线、版本化快照、独立任务进程和 `/backtests` 页面

数据链路：

```text
Browser
  -> Next.js UI
  -> Next.js Route Handler (/api/*)
  -> FastAPI Backend (http://127.0.0.1:8000)
-> AkShare / Cloudflare R2 news snapshots
-> PostgreSQL / Redis local storage
```

Next.js 的 BFF 路由默认通过 `MARKET_API_BASE_URL` 请求后端；未设置时默认是：

```text
http://127.0.0.1:8000
```

回测中心的本地安装、官方历史数据导入、快照和启动步骤见[Hikyuu 本地回测运行说明](docs/0006-backtest-center/hikyuu-runbook.md)。当前回测仅是研究预览，历史交易约束和 Docker 部署仍待验收。

## 启动方式

项目根目录提供环境变量模板：

```bash
cp .env.example .env.local
```

`task dev`、`task build`、Docker Compose 和后端检查任务会读取根目录 `.env.local`。`.env.local` 已加入 `.gitignore`，用于保存本机数据库、Redis 和 Tushare token 等私有配置。

项目使用 [Task](https://taskfile.dev/) 管理开发命令。需要先安装 `task`：

```bash
brew install go-task
```

首次启动前安装依赖：

```bash
task install
```

如果只需要安装后端依赖：

```bash
task backend:install
```

如果只需要安装前端依赖：

```bash
task frontend:install
```

启动完整开发环境：

```bash
task dev
```

该命令会并行启动：

- 前端：http://localhost:3000
- 后端：http://127.0.0.1:8000

也可以使用 Docker Compose 一条命令启动前端、后端、PostgreSQL 和 Redis：

```bash
docker compose up --build
```

前端容器启动日志会打印：

```text
QuantDash frontend is ready at: http://localhost:3000
```

如果安装了 `task`，等价命令是：

```bash
task docker:dev
```

后端健康检查：

```bash
curl http://127.0.0.1:8000/health
```

示例行情接口：

```bash
curl http://localhost:3000/api/stock/quote/600519
curl "http://localhost:3000/api/stock/kline/600519?type=daily"
curl http://localhost:3000/api/market/indexes
```

本地非 Docker 启动时，创建或升级 PostgreSQL 表结构：

```bash
task db:migrate
```

从旧版本升级且数据库已经由 `CREATE TABLE IF NOT EXISTS` 初始化时，`task db:migrate`
会先核对旧表结构。结构与 baseline 一致时会自动执行 `stamp head`，再继续升级；
结构不完整或不一致时会停止并打印差异，避免误标记数据库版本。

`POST /api/data/jobs/run?type=initialize_storage` 仍然保留，内部同样执行 Alembic migration。

## 常用命令

```bash
task --list       # 查看所有任务
task dev          # 并行启动前后端
task check        # 后端语法/Pylint 检查 + 前端 lint/build
task docker:dev   # Docker Compose 启动前端、后端、PostgreSQL、Redis
task docker:down  # 停止 Docker Compose 服务
task backend:lint # 后端 Pylint 异味检测
task db:migrate   # 创建或升级 PostgreSQL 表结构
task db:stamp     # 标记已经核对过的旧版数据库 baseline
task lint         # 前端 lint
task build        # 前端生产构建
```

## 备注

后端依赖默认安装在项目根目录的 `.venv` 中，不会写入系统 Python 环境。后端开发依赖声明在 `backend/requirements-dev.txt` 中，包含 Pylint。前端依赖位于 `frontend/node_modules`。
