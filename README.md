# 造梦空间（Dream Space）

造梦空间是一个面向中文用户的 AI 图片创作平台，核心链路是“发现灵感、复用灵感、提交生成、查看与下载结果”。项目已完成阶段 1 产品设计和高保真用户端原型，现进入正式工程开发。

## 当前状态

| 阶段                    | 状态   | 交付内容                                       |
| ----------------------- | ------ | ---------------------------------------------- |
| 阶段 0：产品与原型      | 已完成 | 产品需求、交互规范、高保真用户端原型           |
| 阶段 A1：目录与文档基线 | 已完成 | 正式工程目录、模块 README、开发计划            |
| 阶段 A2：可运行工程骨架 | 已完成 | 四个应用、本机依赖、完整检查和 PR CI 均通过    |
| 阶段 B：用户端 MVP      | 已完成 | B1-B5、完整栈 smoke、浏览器 E2E 和远端 CI 通过 |
| 阶段 C：真实生成能力    | 进行中 | C1-C2、C3a、C4a 已完成；C4b 为低优先级运维能力 |
| 阶段 D：运营与上线      | 未开始 | 先推进 ADM-0 至 ADM-4，再进入 D1-D6 上线门禁   |

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

完整目录职责和内部结构见 [项目目录规划](docs/project-structure.md)。正式工程已提供公开灵感目录、作品详情、安全演示登录，以及会话、任务、额度、BullMQ 模拟生成和 SSE 事件 API。

## 开发环境

### 前置要求

- Node.js 22.12 或更新的受支持 LTS 版本
- pnpm 11.18.0
- macOS 本机开发：Homebrew（推荐，不需要 Docker）
- 可选：Docker Desktop 或 Docker Engine + Compose

### 使用 macOS 本机服务启动（推荐）

首次安装 PostgreSQL、Redis 和 MinIO：

```bash
brew install postgresql@17 redis minio minio-mc
```

安装完成后，在项目根目录执行：

```bash
pnpm install --frozen-lockfile
pnpm local:up
```

`local:up` 会启动 Homebrew PostgreSQL 17，并在仓库 `.local` 目录中管理 Redis、MinIO、应用 PID 和日志；随后自动执行数据库迁移与种子，再启动 API、Worker、用户端和管理端。它不依赖 Docker。MinIO 本地凭据首次启动时随机生成并仅保存于被 Git 忽略的 `.local/minio/runtime.env`。

完整栈状态、日志、重启和停止命令：

```bash
pnpm local:status
pnpm local:logs
pnpm local:restart
pnpm local:down
```

只管理 PostgreSQL、Redis 和 MinIO 时，使用 `local:infra:up|status|restart|down`。

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

管理端、API 和 PostgreSQL 启动后，可验证管理员独立会话、普通用户隔离、任务查询、灵感 CRUD/发布可见性、只读角色 403 和退出：

```bash
pnpm admin:smoke
```

API、Worker、PostgreSQL 和 Redis 启动后，可验证生成成功、取消、幂等重放与参数冲突、额度结算、SSE 重放和用户数据隔离：

```bash
pnpm generation:smoke
```

验证额度流水、缺失结算、安全补偿和同窗口幂等对账：

```bash
pnpm reconciliation:smoke
```

### 运行高保真原型

原型继续独立保留，用于阶段 B 的视觉和交互验收：

```bash
python3 -m http.server 8080 -d prototype
```

浏览器访问 [http://localhost:8080](http://localhost:8080)。

## 文档入口

- [开发阶段计划](docs/development-plan.md)：阶段目标、验收条件和完成评估
- [商用就绪审计与决策记录](docs/commercial-readiness.md)：计划偏差、架构决策、风险和上线门禁
- [管理端产品需求](docs/admin-console-requirements.md)：角色、基础管理、审核、模型和运营需求
- [管理端功能架构](docs/admin-console-architecture.md)：管理端信息架构、API 边界和 ADM 阶段路线
- [项目目录规划](docs/project-structure.md)：应用、共享包及内部目录职责
- [阶段 1 文档索引](docs/phase-1/README.md)：产品和设计交付物
- [产品需求](docs/phase-1/01-product-requirements.md)
- [信息架构与用户流程](docs/phase-1/02-information-architecture-and-user-flows.md)
- [页面与组件清单](docs/phase-1/03-page-and-component-inventory.md)
- [交互状态矩阵](docs/phase-1/04-interaction-state-matrix.md)
- [视觉规范](docs/phase-1/05-visual-specification.md)
- [验收清单](docs/phase-1/06-acceptance-checklist.md)
- [部署与发布方案](docs/deployment.md)

## 协作与安全

`main` 为保护分支。所有变更从独立分支提交，通过 Pull Request 审核后合并，具体见 [贡献规范](CONTRIBUTING.md)。凭据、真实用户数据和未脱敏生产数据不得进入仓库，具体见 [安全说明](SECURITY.md)。

## 产品边界

当前范围包含灵感瀑布流、作品详情、文生图、参考图、生成会话、图片下载、基础账户和免费额度。暂不建设视频、画布编辑、社区发布、支付、会员和完整资产管理。

仓库内原型素材仅用于产品演示；正式商用前必须完成素材授权、内容审核和版权复核。
