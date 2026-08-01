# 项目目录规划

本文档是造梦空间从高保真原型进入正式开发时的目录基线。推荐采用 pnpm workspace + Turborepo 的 monorepo：用户端、管理端、API 和 Worker 可以独立部署，但共享类型、校验规则和 UI 基础能力只维护一份。

## 1. 目标目录

```text
.
├── apps/
│   ├── web/                         # 用户端 Web（Next.js）
│   │   ├── app/                     # 路由、页面和页面级布局
│   │   │   ├── (public)/inspiration/
│   │   │   ├── (auth)/login/
│   │   │   ├── (workspace)/generate/
│   │   │   ├── settings/
│   │   │   ├── api/                 # 仅放 BFF/回调，不承载业务服务
│   │   │   ├── layout.tsx
│   │   │   └── error.tsx
│   │   ├── components/              # 用户端业务组件
│   │   │   ├── inspiration/
│   │   │   ├── generation/
│   │   │   ├── account/
│   │   │   └── shared/
│   │   ├── features/                # 用户端交互状态和 mutations
│   │   ├── lib/                     # query client、auth、SSE、下载等适配
│   │   ├── stores/                  # Zustand 临时输入器/草稿状态
│   │   ├── styles/
│   │   └── tests/                   # 用户端单测、组件测试、Playwright
│   ├── admin/                       # 管理端 Web（独立鉴权和布局）
│   │   ├── app/
│   │   │   ├── (auth)/login/
│   │   │   └── (console)/
│   │   │       ├── dashboard/
│   │   │       ├── inspirations/
│   │   │       ├── users/
│   │   │       ├── tasks/
│   │   │       ├── moderation/
│   │   │       ├── models/
│   │   │       ├── configs/
│   │   │       └── audit-logs/
│   │   ├── components/              # 表格、筛选器、审核队列等后台组件
│   │   ├── lib/                     # 权限守卫、API client、导出
│   │   └── tests/
│   ├── api/                         # NestJS 模块化单体 API
│   │   ├── src/
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   ├── inspirations/
│   │   │   │   ├── sessions/
│   │   │   │   ├── uploads/
│   │   │   │   ├── generation-tasks/
│   │   │   │   ├── images/
│   │   │   │   ├── quota/
│   │   │   │   ├── moderation/
│   │   │   │   ├── providers/
│   │   │   │   └── admin/
│   │   │   ├── common/               # guards、pipes、异常、日志、分页
│   │   │   ├── config/
│   │   │   ├── app.module.ts
│   │   │   └── main.ts
│   │   └── test/                     # API 集成测试和契约测试
│   └── worker/                       # BullMQ 异步生成与媒体处理 Worker
│       └── src/
│           ├── jobs/                 # generate、moderate、process-image、reconcile
│           ├── processors/
│           ├── providers/             # 供应商适配器实现
│           ├── queues/
│           └── main.ts
├── packages/
│   ├── ui/                           # 跨用户端/管理端的无业务 UI
│   ├── api-contract/                 # OpenAPI 生成的请求、响应、错误码、事件类型
│   ├── domain/                       # 枚举、状态机、值对象和跨端业务常量
│   ├── validation/                   # Zod/DTO 共享校验规则
│   ├── database/                     # Prisma schema、迁移、seed、repository 基础实现
│   ├── storage/                      # S3/TOS/OSS 文件存储接口和签名 URL
│   ├── config/                       # 环境变量 schema 和默认配置
│   ├── i18n/                         # 中英文文案与 locale 工具
│   └── observability/                # 日志、追踪、指标封装
├── infrastructure/
│   ├── docker/                       # Dockerfile、compose、启动脚本
│   ├── nginx/
│   ├── terraform/                    # 云资源（后续再启用）
│   └── k8s/                          # 扩容后再启用，初期可不创建
├── database/
│   ├── seeds/                        # 演示灵感数据和开发账号
│   └── fixtures/                     # 测试固定数据（不放真实用户数据）
├── scripts/                          # lint、类型生成、数据导入、发布辅助脚本
├── docs/
│   ├── architecture/                 # ADR、领域边界、时序图
│   ├── api/                          # OpenAPI 发布稿和 SSE 事件说明
│   ├── runbooks/                     # 任务积压、供应商故障、审核事故处理
│   ├── phase-1/                      # 已有产品与设计基线
│   ├── deployment.md
│   └── project-structure.md
├── prototype/                        # 阶段 1 静态高保真原型，保持可独立运行
├── e2e/                              # 跨应用关键链路测试
├── .env.example
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

## 2. 模块边界

- `apps/web` 只负责用户体验和页面状态，不直接访问数据库或供应商。
- `apps/admin` 与用户端分开部署、分开菜单和权限守卫；所有高风险操作必须经 API 的 RBAC 校验并写审计日志。
- `apps/api` 是业务唯一入口，按领域模块组织 controller、application service、repository 和 DTO；不要按“controllers/services/utils”做全局大目录。
- `apps/worker` 只消费队列并回写领域状态，不能绕过 API 修改额度或审核结论。
- `packages/domain` 放纯 TypeScript 规则，不能依赖 NestJS、Next.js 或具体数据库；`packages/database` 负责持久化实现。
- 供应商 SDK 只能出现在 `apps/worker/src/providers` 的适配器中，业务代码依赖统一的 `ImageGenerationProvider` 接口。

每个 API 领域模块建议保持如下形状：

```text
modules/generation-tasks/
├── generation-tasks.controller.ts
├── generation-tasks.service.ts
├── generation-tasks.repository.ts
├── generation-tasks.dto.ts
├── generation-tasks.policy.ts
└── generation-tasks.module.ts
```

## 3. 开发阶段

### 阶段 A：工程骨架

先建立 workspace、`apps/web`、`apps/api`、`packages/{domain,api-contract,validation,config}` 和 CI；把 `prototype/` 作为视觉验收参考，不急于迁移全部代码。

### 阶段 B：用户端 MVP

优先实现灵感列表/详情、登录、会话、上传、生成任务、SSE 事件、结果下载和额度流水。管理端先只提供登录、灵感录入和任务查询，避免阻塞主链路。

### 阶段 C：异步与治理

接入 Redis/BullMQ、真实模型供应商、生成前后审核、图片处理、对象存储、重试/死信/对账；补齐 `moderation`、`providers`、`audit-logs`。

### 阶段 D：运营化与扩展

加入模型路由、供应商降级、批量内容运营、申诉、指标看板、备份恢复和基础设施即代码。只有出现明确的扩容需求后再启用 Kubernetes，不提前拆微服务。

## 4. 约定

- 路由使用小写短横线，数据库表使用复数 snake_case，TypeScript 类型使用 PascalCase。
- 所有时间在数据库以 UTC 保存；所有写接口支持 `Idempotency-Key`，列表接口使用游标分页。
- 公共类型从 `packages/api-contract` 导出，禁止用户端和管理端各自复制 DTO。
- `.env`、供应商密钥、真实手机号、真实图片和生产导出数据不进入仓库；仅维护 `.env.example` 和脱敏 fixtures。
- 迁移每完成一个可验收能力就提交一次，保持 PR 可回滚；不要把数据库迁移、页面改造和供应商接入混在一个提交中。

## 5. 原型迁移

`prototype/` 继续用于 GitHub Pages 和设计验收。正式开发时，按页面逐步迁移到 `apps/web`：先复用素材和交互验收清单，再将内联 CSS/脚本拆成组件、样式和服务端数据请求。迁移完成并稳定后再删除原型，不要在 MVP 开发中直接改造成生产应用。
