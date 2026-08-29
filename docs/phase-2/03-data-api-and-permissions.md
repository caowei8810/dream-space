# Phase 2 数据、API 与权限边界

## 1. 核心领域实体

| 领域     | 核心实体                                                              |
| -------- | --------------------------------------------------------------------- |
| 用户     | User、UserSession、UserRiskEvent、UserStatusHistory                   |
| 审核     | ModerationCase、ModerationDecision、ModerationRuleVersion、Appeal     |
| 模型     | Model、Provider、ModelCapability、ModelRoute、ModelConfigVersion      |
| 计费     | BillingRule、Campaign、PriceQuote、ChargeReservation、Settlement      |
| 套餐     | Plan、PlanVersion、RedemptionCode、UserEntitlement、EntitlementLedger |
| 现金账务 | WalletAccount、WalletLedger、Refund                                   |
| 内容     | GenerationTask、GenerationResult、InspirationCuration、Asset          |
| 运营     | MetricSnapshot、Announcement                                          |
| 系统     | ScheduledJob、JobRun、SystemConfigVersion、AdminAuditLog              |

套餐权益账与现金账分开。数据库中的账户聚合字段用于快速读取，不是可绕过流水直接修改的事实；所有变化必须同时产生不可变流水。

## 2. 计费快照

每个生成任务至少保存：

- 标准单价（分）
- 活动 ID 和活动版本
- 折扣比例
- 最终单价（分）
- 图片张数
- 套餐预扣张数
- 现金预扣金额
- 计费规则版本
- 幂等键

## 3. 并发与幂等

- 任务创建、套餐预扣、现金预扣和账本流水在同一数据库事务中完成。
- 使用条件更新、行级锁或等价原子方案，只有 `available >= requested` 才能扣减。
- 唯一幂等键覆盖任务提交、支付回调、退款、人工补偿和结算。
- Worker 只能结算已经存在的预扣；重复成功、失败或回调返回同一终态。
- 套餐和现金混合支付时必须全部预扣成功才允许入队，任一失败则整笔回滚。

## 4. API 边界

| 模块 | 主要 API                                                                                            |
| ---- | --------------------------------------------------------------------------------------------------- |
| 用户 | `/admin/users`、`/admin/users/:id/status`、`/admin/users/:id/sessions`                              |
| 审核 | `/admin/moderation/cases`、`/admin/moderation/cases/:id/decision`                                   |
| 模型 | `/admin/models`、`/admin/model-routes`、`/admin/model-config-versions`                              |
| 风控 | `/admin/risk-rules`、`/admin/risk-rules/test`、`/admin/risk-events`                                 |
| 计费 | `/admin/billing/rules`、`/billing/quote`、`/admin/billing/ledger`                                   |
| 套餐 | `/billing/plans`、`/billing/redemptions`、`/admin/billing/plans`、`/admin/billing/redemption-codes` |
| 运营 | `/admin/dashboard/summary`、`/admin/analytics/*`、`/admin/announcements`                            |
| 灵感 | `/admin/inspiration-candidates`、`/admin/inspirations/:resultId/publish`                            |
| 系统 | `/admin/scheduled-jobs`、`/admin/audit-logs`、`/admin/system-configs`                               |

管理端和用户端只调用 API，不直接访问数据库、Redis、对象存储或第三方供应商。

## 5. 权限域

权限使用 `resource:action`：

- `dashboard:read`
- `users:read`、`users:write`、`users:ban`、`user-sessions:revoke`
- `moderation:read`、`moderation:decide`、`moderation:appeal-review`
- `models:read`、`models:write`、`models:publish`
- `risk-rules:read`、`risk-rules:write`、`risk-rules:publish`
- `billing:read`、`billing:write`、`billing:publish`
- `plans:read`、`plans:write`、`plans:publish`
- `orders:read`、`refunds:create`、`wallet:adjust`
- `analytics:read`、`announcements:write`
- `inspirations:read`、`inspirations:publish`
- `scheduled-jobs:read`、`scheduled-jobs:execute`
- `admin-accounts:*`、`roles:*`、`audit-logs:read`

发布计费规则、发布风控规则、退款、钱包调整、解封和物理删除属于高风险动作，要求原因、二次确认、请求 ID 和审计；达到配置阈值时要求操作者与审批者分离。
