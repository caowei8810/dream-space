# 项目脚本

存放数据导入、契约生成、检查和发布辅助脚本。脚本必须支持明确的参数和失败退出码，不得内置凭据或真实用户数据。

- `local-services.sh`：启动和检查 Homebrew PostgreSQL 17，并在仓库 `.local` 目录中管理 Redis 与 MinIO，不依赖 Docker。
- `local-stack.sh`：统一执行基础服务、数据库迁移与种子、API、Worker、用户端和管理端的 `up/down/restart/status/logs`。
- `backup-restore.sh`：执行 PostgreSQL 自定义格式备份、对象文件备份、数据库对象引用清单校验和显式确认恢复；不内置凭据。
- `docker-compose.sh`：兼容 Docker Compose 插件和独立 `docker-compose` 命令。
- `extract-inspiration-seed.mjs`：使用 TypeScript AST 合并原型作品声明和素材 manifest，生成可重复导入的灵感 seed 数据。
- `auth-smoke.sh`：在本机服务已启动时，验证协议拒绝、错误验证码、安全 Cookie 会话和退出失效。
