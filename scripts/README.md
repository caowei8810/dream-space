# 项目脚本

存放数据导入、契约生成、检查和发布辅助脚本。脚本必须支持明确的参数和失败退出码，不得内置凭据或真实用户数据。

- `local-services.sh`：在 macOS 物理机上初始化、启动和检查 PostgreSQL 17 与 Redis。
- `docker-compose.sh`：兼容 Docker Compose 插件和独立 `docker-compose` 命令。
