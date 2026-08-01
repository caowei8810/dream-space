# 造梦空间（Dream Space）

造梦空间是一个专注文生图体验的 AI 图片创作平台。当前仓库包含产品方案、阶段 1 设计文档及可直接运行的高保真交互原型。

## 当前范围

- 灵感瀑布流与分类检索
- 灵感作品详情、提示词复用和参考图复用
- 文生图参数设置与模拟生成流程
- 创作会话、图片预览与下载
- 中英文界面、浅色/深色/跟随系统主题
- 登录、协议及账户设置原型

不包含视频生成、画布编辑和资产管理模块。

## 目录结构

```text
.
├── prototype/                # 高保真静态交互原型
│   ├── index.html
│   └── assets/inspiration/   # 原型图片素材
├── docs/phase-1/             # 阶段 1 产品与设计文档
├── docs/deployment.md        # 部署说明
├── CONTRIBUTING.md           # 分支、提交和 PR 规范
└── SECURITY.md               # 安全与凭据规范
```

## 本地运行

原型为静态页面。建议通过本地 HTTP 服务运行：

```bash
python3 -m http.server 8080 -d prototype
```

然后访问 [http://localhost:8080](http://localhost:8080)。

也可以直接打开 `prototype/index.html`，但部分浏览器会限制 `file://` 页面存储或下载能力。

## 部署

仓库已包含 GitHub Pages 自动部署工作流。部署配置、验证和回滚方式见 [docs/deployment.md](docs/deployment.md)。

## 协作流程

`main` 为稳定分支。所有后续修改必须：

1. 从最新 `main` 创建功能或修复分支。
2. 在分支中提交，提交信息明确说明改造内容。
3. 推送分支并创建 PR。
4. 完成检查和人工审核后合并。

具体规则见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 文档入口

- [项目目录规划](docs/project-structure.md)
- [阶段 1 文档索引](docs/phase-1/README.md)
- [产品需求](docs/phase-1/01-product-requirements.md)
- [信息架构与用户流程](docs/phase-1/02-information-architecture-and-user-flows.md)
- [页面与组件清单](docs/phase-1/03-page-and-component-inventory.md)
- [交互状态矩阵](docs/phase-1/04-interaction-state-matrix.md)
- [视觉规范](docs/phase-1/05-visual-specification.md)
- [验收清单](docs/phase-1/06-acceptance-checklist.md)

## 权利说明

本仓库用于造梦空间产品设计与研发。仓库内素材仅用于产品原型展示；正式商用前需完成素材授权、内容审核和版权复核。
