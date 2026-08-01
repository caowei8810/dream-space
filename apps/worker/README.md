# 异步 Worker

BullMQ 后台进程，负责消费生成、审核、图片处理和对账任务。供应商 SDK 只能通过 `src/providers` 中的适配器调用。

Worker 与 API 共同使用 `packages/core` 的状态机和额度规则，使用 `packages/db` 持久化结果，不能自行复制一套业务状态迁移逻辑。

当前已提供 Redis/BullMQ 连接和基础队列消费者。阶段 B 在此基础上实现模拟生成器。
