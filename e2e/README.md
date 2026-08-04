# 端到端测试

本目录存放跨用户端、管理端、API、Worker、PostgreSQL 和 Redis 的 Playwright 测试。单个应用内部的测试仍留在对应应用目录。

## 运行条件

- PostgreSQL 和 Redis 已启动并完成 migration/seed。
- 用户端、管理端、API 和 Worker 分别运行在 `3000`/`3001`/`4000` 和 `image-generation` 队列。
- 本地可设置 `PLAYWRIGHT_CHANNEL=chrome` 复用已安装的 Chrome；CI 使用 Playwright Chromium。

```bash
pnpm local:infra:up
pnpm db:seed
pnpm dev
PLAYWRIGHT_CHANNEL=chrome pnpm e2e
```

用户端和管理端可分别执行 `pnpm e2e:user` 和 `pnpm e2e:admin`。测试使用 Mock 模式的演示验证码，但所有页面动作、数据读写和生成任务都经过真实服务接口。
