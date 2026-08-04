# 本机开发依赖

该目录保存不依赖 Docker 的本机服务配置。当前覆盖 PostgreSQL、Redis 和 mock 模式的本地文件存储。

- PostgreSQL 由 Homebrew service 管理，数据保存在 Homebrew 默认数据目录。
- Redis 使用项目独立配置，数据、PID 和日志保存在仓库根目录的 `.local/redis/`，该目录不会提交到 Git。
- API 在 `EXTERNAL_SERVICES_MODE=mock` 时将已清洗参考图保存到 `LOCAL_STORAGE_DIR`；路径相对于 API 进程工作目录。
- 本机依赖统一通过根目录的 `pnpm local:infra:*` 命令管理。

不要在这里写入生产连接信息、个人凭据或真实用户数据。
