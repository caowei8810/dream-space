# 本机开发依赖

该目录保存不依赖 Docker 的本机服务配置。当前覆盖 PostgreSQL、Redis、MinIO 和本地文件存储。

- PostgreSQL 由 Homebrew service 管理，数据保存在 Homebrew 默认数据目录。
- Redis 使用项目独立配置，数据、PID 和日志保存在仓库根目录的 `.local/redis/`，该目录不会提交到 Git。
- MinIO 使用项目独立进程，数据、PID、日志和隔离的 `mc` 配置保存在 `.local/minio/`；默认 API 端口为 `9000`，控制台端口为 `9001`，启动时自动创建 `dreamspace-local` bucket。
- `OBJECT_STORAGE_MODE=local` 时，API 与 Worker 将对象写入共享的 `LOCAL_STORAGE_DIR`；设为 `s3` 时必须连接 MinIO/S3，不会回退到本地目录。
- `EXTERNAL_SERVICES_MODE` 只控制验证码、天气、励志语和模型等外围服务是否模拟，不再与对象存储实现耦合。
- 本机依赖统一通过根目录的 `pnpm local:infra:*` 命令管理。

不要在这里写入生产连接信息、个人凭据或真实用户数据。
