# API 服务

NestJS 模块化单体，是用户端和管理端访问业务数据的唯一入口。负责鉴权、权限、校验、数据库事务、任务创建、SSE 事件和审计。

业务代码放在 `src/modules/<domain>`，公共技术能力放在 `src/common`。禁止建立跨领域的巨大 `controllers`、`services` 或 `utils` 目录。

阶段 A1 只建立领域目录；阶段 A2 初始化 NestJS 和健康检查。
