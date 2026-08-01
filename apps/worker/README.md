# 异步 Worker

BullMQ 后台进程，负责消费生成、审核、图片处理和对账任务。供应商 SDK 只能通过 `src/providers` 中的适配器调用。

Worker 与 API 共同使用 `packages/core` 的状态机和额度规则，使用 `packages/db` 持久化结果，不能自行复制一套业务状态迁移逻辑。

阶段 A1 只建立目录；阶段 A2 初始化队列连接，阶段 B 使用模拟生成器。
