# 部署说明

## GitHub Pages

仓库的 `.github/workflows/deploy-pages.yml` 会将 `prototype/` 作为静态站点部署。

首次启用：

1. 打开仓库 `Settings > Pages`。
2. 在 `Build and deployment` 中选择 `GitHub Actions`。
3. 合并到 `main` 后，等待 `Deploy prototype to GitHub Pages` 工作流完成。
4. 在工作流的 deployment 结果中打开站点地址。

后续每次合并到 `main`，工作流都会自动部署。

## 本地部署验证

```bash
python3 -m http.server 8080 -d prototype
```

访问 `http://localhost:8080`，至少验证：

- 首页资源返回成功。
- 灵感图片正常加载。
- 页面路由、主题和语言切换正常。
- 生成结果预览和下载正常。
- 浏览器控制台无阻断性错误。

## 回滚

部署内容始终来自 `main`。出现问题时：

1. 使用 PR 回滚有问题的合并提交。
2. 合并回滚 PR。
3. 等待 Pages 工作流重新部署。

不要直接修改 Pages 产物，也不要对 `main` 强制推送。

## 其他静态托管

部署到 Nginx、对象存储、Vercel 或 Netlify 时，将发布目录设置为 `prototype/`，无需构建命令。
