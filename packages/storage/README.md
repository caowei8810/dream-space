# @dream-space/storage

项目统一对象存储边界，供 API 与 Worker 共同使用。

- `LocalObjectStorage`：开发与 CI 默认实现，原子写入 `.local/storage`。
- `S3ObjectStorage`：MinIO、AWS S3 等兼容实现，支持短期签名 GET URL。
- 对象键仅允许 `references/`、`results/`、`thumbnails/` 三类受控前缀。

运行时通过 `OBJECT_STORAGE_MODE=local|s3` 选择实现。第三方验证码、天气、模型等外围服务仍由 `EXTERNAL_SERVICES_MODE=mock|live` 统一控制，两者职责独立。
