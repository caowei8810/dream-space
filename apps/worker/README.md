# 异步 Worker

BullMQ 后台进程，负责消费生成、审核、图片处理和对账任务。供应商 SDK 只能通过 `src/providers` 中的适配器调用。

Worker 与 API 共同使用 `packages/core` 的状态机和额度规则，使用 `packages/db` 持久化结果，不能自行复制一套业务状态迁移逻辑。

隐私留存清理默认关闭。生产启用前必须由数据保护负责人确认 `PRIVACY_RETENTION_DAYS`，再设置
`PRIVACY_CLEANUP_ENABLED=true`；任务先删除对象存储，再删除已软删除的上传元数据，失败对象会留待下一轮重试。

当前消费 `image-generation` 队列，原子领取排队任务，通过确定性模拟生成器写回结果，持久化生成中/成功/失败事件，并完成预留额度的消费或返还。重复队列任务无法再次领取，已取消任务不会被结果覆盖。
