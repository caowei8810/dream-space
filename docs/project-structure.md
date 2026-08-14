# 项目目录规划

本文档回答两个问题：正式开发时目录怎么放，以及第一步应该创建哪些目录。

## 一、先看懂整体关系

项目先做成一个代码仓库，里面有四个可以独立运行的应用：

```text
用户浏览器  -> 用户端 web   -> API 服务 -> PostgreSQL
管理员浏览器 -> 管理端 admin -> API 服务 -> Redis 任务队列 -> Worker -> 图片模型供应商
                                               |
                                               -> 对象存储（原图和缩略图）
```

- `web`：普通用户浏览灵感、登录、提交生成、查看和下载图片。
- `admin`：运营人员管理灵感、用户、任务、审核和模型配置。
- `api`：统一处理登录、权限、业务校验、数据库读写和任务创建。
- `worker`：在后台执行耗时工作，例如调用图片模型、审核和处理图片。

用户端和管理端都不能直接连接数据库，也不能直接调用图片模型。

## 二、推荐目录

```text
.
├── apps/                         # 四个可独立运行和部署的应用
│   ├── web/                      # 用户端，Next.js
│   ├── admin/                    # 管理端，Next.js
│   ├── api/                      # 服务端接口，NestJS
│   └── worker/                   # 异步任务，BullMQ
├── packages/                     # 多个应用共同使用的代码
│   ├── ui/                       # web 和 admin 共用的基础组件
│   ├── contracts/                # 接口类型、错误码、SSE 事件类型
│   ├── core/                     # 业务规则和任务状态机
│   ├── db/                       # Prisma schema、迁移、seed 和数据库客户端
│   └── config/                   # 环境变量校验和公共工程配置
├── infrastructure/
│   └── docker/                   # 本地 PostgreSQL、Redis、对象存储和容器配置
├── e2e/                          # 跨应用关键流程测试
├── scripts/                      # 数据导入、类型生成等项目脚本
├── docs/                         # 产品、设计、架构和运维文档
├── prototype/                    # 已完成的静态用户端原型
├── .env.example                  # 环境变量示例，不包含真实密钥
├── package.json                  # 根项目命令
├── pnpm-workspace.yaml           # monorepo 工作区声明
├── turbo.json                    # 多应用构建任务
└── tsconfig.base.json            # TypeScript 公共配置
```

这就是开发初期需要的完整一级目录。暂时不创建 Kubernetes、Terraform、微服务等目录，出现实际部署需求后再增加。

## 三、各应用内部怎么放

### 1. 用户端 `apps/web`

```text
apps/web/
├── app/                          # Next.js 页面路由
│   ├── inspiration/              # 灵感列表
│   ├── inspiration/[id]/         # 灵感详情
│   ├── generate/                 # 新建生成会话
│   ├── generate/[sessionId]/     # 历史生成会话
│   ├── login/                    # 登录
│   ├── settings/                 # 账户设置
│   ├── layout.tsx
│   └── page.tsx                  # 首页，跳转到灵感页
├── components/                   # 页面使用的组件
│   ├── inspiration/
│   ├── generation/
│   ├── account/
│   └── shared/
├── lib/                          # API 请求、SSE、登录态、下载工具
├── stores/                       # 输入器草稿等临时前端状态
├── messages/                     # 中英文文案
├── styles/
└── tests/
```

页面专用组件留在对应页面附近；只有被多个页面使用的组件才放进 `components`。

### 2. 管理端 `apps/admin`

```text
apps/admin/
├── app/
│   ├── login/
│   ├── dashboard/                # 运营概览
│   ├── inspirations/             # 灵感内容管理
│   ├── users/                    # 用户与额度
│   ├── tasks/                    # 生成任务
│   ├── moderation/               # 审核与申诉
│   ├── models/                   # 模型和供应商配置
│   ├── system-configs/           # 系统配置
│   └── audit-logs/               # 操作审计
├── components/
├── lib/                          # API 请求和前端权限判断
└── tests/
```

管理端单独运行、单独登录。前端隐藏按钮只是改善体验，真正的管理员权限必须由 API 再校验一次。

管理端的完整产品需求和阶段切片见 [管理端产品需求](admin-console-requirements.md) 与 [管理端功能架构](admin-console-architecture.md)。当前代码只完成登录、灵感管理、任务查询和基础 RBAC；`users`、`moderation`、`models`、`audit-logs` 等目录是后续 ADM 切片的边界，不代表功能已经实现。

### 3. API 服务 `apps/api`

```text
apps/api/src/
├── modules/                      # 按业务领域划分
│   ├── auth/                     # 登录、刷新令牌、退出
│   ├── users/                    # 用户资料和状态
│   ├── inspirations/             # 灵感列表、详情和点赞
│   ├── sessions/                 # 生成会话和消息
│   ├── uploads/                  # 上传凭证和文件确认
│   ├── generation-tasks/         # 创建、取消、重试和事件订阅
│   ├── images/                   # 图片详情和下载凭证
│   ├── quota/                    # 额度余额和流水
│   ├── moderation/               # 审核记录和申诉
│   ├── model-providers/          # 模型配置和流量路由
│   └── admin/                    # 管理端专用接口
├── common/                       # 权限守卫、异常、分页和请求日志
├── config/
├── app.module.ts
└── main.ts
```

每个业务模块内部保持简单：

```text
generation-tasks/
├── generation-tasks.controller.ts   # 接收 HTTP 请求
├── generation-tasks.service.ts      # 编排业务流程
├── generation-tasks.repository.ts   # 读写数据
├── generation-tasks.dto.ts          # 输入和输出结构
└── generation-tasks.module.ts
```

不要在项目根部建立巨大的 `controllers/`、`services/`、`utils/`，否则业务增长后很难定位代码。

### 4. Worker `apps/worker`

```text
apps/worker/src/
├── jobs/                         # 任务名称和任务数据定义
├── processors/                   # 生成、审核、图片处理、对账
├── providers/                    # 火山、阿里等模型供应商适配器
├── queues/                       # BullMQ 队列连接和配置
└── main.ts
```

API 创建任务并放入 Redis 队列，Worker 消费任务。API 和 Worker 共同调用 `packages/core` 中的状态机和额度规则，避免两边各写一套业务逻辑。供应商 SDK 只放在 Worker 的 `providers` 中。

## 四、共享包什么时候用

- `packages/ui`：按钮、弹窗、表单等真正被用户端和管理端共同使用时再放入。
- `packages/contracts`：前后端共同使用的请求、响应、错误码和 SSE 事件定义，是接口类型的唯一来源。
- `packages/core`：排队、生成中、成功、失败等状态迁移，以及冻结、消费、返还额度规则。
- `packages/db`：只保留一份 Prisma schema、迁移和 seed，不再额外建立根目录 `database/`。
- `packages/config`：集中校验数据库地址、Redis 地址、对象存储和供应商配置，启动时发现缺失配置就立即报错。

不要为了“以后可能复用”提前拆包。代码至少被两个应用使用，或承担明确的业务规则时，再移入 `packages`。

## 五、实际开发顺序

### 第一步：建立工程骨架

创建 workspace、四个应用、五个共享包、基础 lint/typecheck/test 和 Docker 本地依赖。此时先使用模拟模型，不接真实供应商。

### 第二步：跑通最小业务闭环

按以下顺序开发：

```text
灵感列表 -> 灵感详情 -> 登录 -> 创建会话 -> 提交任务
-> Worker 模拟生成 -> SSE 返回进度 -> 展示结果 -> 下载
```

管理端这一阶段只做登录、灵感管理和任务查询。

### 第三步：接入真实生成能力

接入对象存储、真实模型供应商、上传、生成前后审核、图片转码、失败重试、额度冻结与结算。

### 第四步：补齐运营和上线能力

完善用户与额度管理、审核申诉、模型切换、审计日志、监控告警、备份恢复和部署配置。达到需要多机扩容时，再评估 Kubernetes。

## 六、现有原型怎么处理

保留 `prototype/`，继续作为视觉和交互验收基线，不要直接把单个 `index.html` 改造成生产代码。

正式用户端在 `apps/web` 中重新实现。每迁移一个页面，都对照 `prototype/` 和 `docs/phase-1/` 检查桌面/移动端、浅色/深色、中英文和完整交互状态。全部页面稳定后，再单独决定是否删除原型。

## 七、必须遵守的规则

- 用户端和管理端不直接访问数据库、Redis、对象存储或模型供应商。
- 所有管理员操作由 API 做 RBAC 权限校验，高风险操作写入审计日志。
- 所有写接口支持幂等控制；数据库时间统一保存为 UTC。
- `.env`、密钥、真实手机号、真实用户图片和生产数据不得提交到仓库。
- 数据库结构只通过 Prisma migration 变更，不手工修改生产数据库。
- 一次 PR 聚焦一个可验收目标，不把页面、数据库和供应商接入混成一次大改。
