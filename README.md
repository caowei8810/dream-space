# 造梦空间（Dream Space）

造梦空间是一个面向中文用户的 AI 图片创作平台，核心链路是“发现灵感、复用灵感、提交生成、查看与下载结果”。项目已完成阶段 1 产品设计和高保真用户端原型，现进入正式工程开发。

## 当前状态

| 阶段                    | 状态   | 交付内容                                     |
| ----------------------- | ------ | -------------------------------------------- |
| 阶段 0：产品与原型      | 已完成 | 产品需求、交互规范、高保真用户端原型         |
| 阶段 A1：目录与文档基线 | 已完成 | 正式工程目录、模块 README、开发计划          |
| 阶段 A2：可运行工程骨架 | 已完成 | 四个应用、本机依赖、完整检查和 PR CI 均通过  |
| 阶段 B：用户端 MVP      | 进行中 | B1 灵感目录已完成，B2 登录与安全会话开发中   |
| 阶段 C：真实生成能力    | 未开始 | 模型供应商、对象存储、审核、额度和任务可靠性 |
| 阶段 D：运营与上线      | 未开始 | 完整管理后台、审计、监控、备份和部署         |

每个阶段的目标、验收条件和完成评估见 [开发阶段计划](docs/development-plan.md)。

## 系统组成

```text
用户端 Web ─┐
            ├─> API 服务 ─> PostgreSQL
管理端 Web ─┘       │
                    └─> Redis 队列 ─> Worker ─> 图片模型供应商
                                         └────> 对象存储
```

- `web`：普通用户浏览灵感、登录、生成和下载图片。
- `admin`：运营人员管理内容、用户、任务、审核和模型。
- `api`：统一处理鉴权、业务校验、数据库读写和任务创建。
- `worker`：后台执行模型调用、审核、图片处理和对账。

## 目录结构

```text
.
├── apps/                    # web、admin、api、worker 四个应用
├── packages/                # UI、接口契约、业务规则、数据库和配置
├── infrastructure/docker/  # 本地开发依赖与容器配置
├── e2e/                     # 跨应用端到端测试
├── scripts/                 # 项目维护和数据脚本
├── docs/                    # 产品、设计、架构、开发与部署文档
└── prototype/               # 阶段 1 高保真静态原型
```

完整目录职责和内部结构见 [项目目录规划](docs/project-structure.md)。正式工程已提供公开灵感目录、作品详情以及开发中的演示登录流程。

## 开发环境

### 前置要求

- Node.js 22.12 或更新的受支持 LTS 版本
- pnpm 11.18.0
- macOS 本机开发：Homebrew（推荐，不需要 Docker）
- 可选：Docker Desktop 或 Docker Engine + Compose

### 使用 macOS 本机服务启动（推荐）

首次安装 PostgreSQL 和 Redis：

```bash
brew install postgresql@17 redis
```

安装完成后，在项目根目录执行：

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm local:infra:up
pnpm db:generate
pnpm --filter @dream-space/db exec prisma migrate deploy
pnpm db:seed
pnpm dev
```

`local:infra:up` 会启动 PostgreSQL 和项目专用 Redis，自动创建本地开发角色与数据库。服务状态和停止命令：

本机 PostgreSQL 默认通过 macOS 本地认证连接；如需设置密码，可在命令前临时传入 `DREAMSPACE_DB_PASSWORD`，不要将真实密码写入仓库。

```bash
pnpm local:infra:status
pnpm local:infra:down
```

### 使用 Docker 启动（可选）

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm infra:up
pnpm db:generate
pnpm dev
```

启动后访问：

- 用户端：[http://localhost:3000](http://localhost:3000)
- 管理端：[http://localhost:3001](http://localhost:3001)
- API 健康检查：[http://localhost:4000/health](http://localhost:4000/health)

停止本地依赖：

```bash
pnpm infra:down
```

### 运行项目检查

```bash
pnpm format:check
pnpm check
```

`pnpm check` 会依次执行 lint、TypeScript 类型检查、单元测试和生产构建。

服务启动后可单独验证本机认证闭环：

```bash
pnpm auth:smoke
```

### 运行高保真原型

原型继续独立保留，用于阶段 B 的视觉和交互验收：

```bash
python3 -m http.server 8080 -d prototype
```

浏览器访问 [http://localhost:8080](http://localhost:8080)。

## 文档入口

- [开发阶段计划](docs/development-plan.md)：阶段目标、验收条件和完成评估
- [项目目录规划](docs/project-structure.md)：应用、共享包及内部目录职责
- [阶段 1 文档索引](docs/phase-1/README.md)：产品和设计交付物
- [产品需求](docs/phase-1/01-product-requirements.md)
- [信息架构与用户流程](docs/phase-1/02-information-architecture-and-user-flows.md)
- [页面与组件清单](docs/phase-1/03-page-and-component-inventory.md)
- [交互状态矩阵](docs/phase-1/04-interaction-state-matrix.md)
- [视觉规范](docs/phase-1/05-visual-specification.md)
- [验收清单](docs/phase-1/06-acceptance-checklist.md)
- [部署说明](docs/deployment.md)

## 协作与安全

`main` 为保护分支。所有变更从独立分支提交，通过 Pull Request 审核后合并，具体见 [贡献规范](CONTRIBUTING.md)。凭据、真实用户数据和未脱敏生产数据不得进入仓库，具体见 [安全说明](SECURITY.md)。

## 产品边界

当前范围包含灵感瀑布流、作品详情、文生图、参考图、生成会话、图片下载、基础账户和免费额度。暂不建设视频、画布编辑、社区发布、支付、会员和完整资产管理。

仓库内原型素材仅用于产品演示；正式商用前必须完成素材授权、内容审核和版权复核。
