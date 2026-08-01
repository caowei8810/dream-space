# 页面与组件清单

## 1. 全局框架

| 区域 | 组件 | 必要字段/动作 |
|---|---|---|
| 品牌 | `BrandMark` | 造梦空间标识、返回灵感 |
| 一级导航 | `PrimaryNav` | 灵感、生成、当前项 |
| 账户区 | `AccountDock` | 剩余额度、通知、头像、菜单 |
| 全局反馈 | `ToastRegion` | 成功、警告、错误、操作撤销 |
| 确认弹窗 | `ConfirmDialog` | 标题、说明、取消、确认 |
| 登录拦截 | `AuthGate` | 来源动作、草稿快照、恢复策略 |

## 2. 灵感页

### 2.1 页面区域

| 区域 | 组件 | 内容 |
|---|---|---|
| 顶部工具栏 | `InspirationToolbar` | 分类、搜索、搜索清除 |
| 图片区域 | `MasonryGrid` | 不同宽高比的作品卡片 |
| 作品卡片 | `InspirationCard` | 图片、作者、点赞、做同款 |
| 加载区域 | `MasonrySkeleton` | 与瀑布流列宽匹配的骨架 |
| 空状态 | `EmptyInspiration` | 搜索词、清空搜索、返回推荐 |
| 失败状态 | `LoadError` | 错误说明、重新加载 |

### 2.2 作品卡片字段

- `id`
- `title`
- `imageUrl`、`thumbnailUrl`
- `width`、`height`、`aspectRatio`
- `authorDisplayName`、`authorAvatarUrl`
- `likeCount`、`liked`
- `promptSummary`
- `categoryIds`
- `modelName`、`ratio`、`resolution`

## 3. 灵感详情页

| 区域 | 组件 | 内容/动作 |
|---|---|---|
| 大图舞台 | `ArtworkStage` | 原比例图片、加载、失败、AI 标识 |
| 作品导航 | `ArtworkPager` | 上一个、下一个、键盘方向键 |
| 关闭 | `DetailCloseButton` | 返回列表上下文 |
| 作者区 | `AuthorSummary` | 头像、展示名 |
| 互动区 | `ArtworkActions` | 点赞、下载、更多 |
| 信息区 | `ArtworkMetadata` | 描述、日期、提示词、模型、比例、清晰度 |
| 主操作 | `ReuseActions` | 做同款、用作参考图 |
| 快捷输入器 | `DetailComposer` | 参考图、提示词、参数、提交 |

## 4. 生成页

### 4.1 会话侧栏

| 组件 | 内容/动作 |
|---|---|
| `NewSessionButton` | 新建空白会话 |
| `SessionSearch` | 按会话标题搜索 |
| `SessionGroup` | 今天、昨天、更早 |
| `SessionItem` | 标题、选中、重命名、删除 |
| `SidebarCollapse` | 收起或展开二级侧栏 |

### 4.2 任务时间线

| 组件 | 内容/动作 |
|---|---|
| `DateDivider` | 日期分组 |
| `PromptBlock` | 提示词、参考图、参数快照 |
| `TaskStatus` | 排队、生成中、成功、部分成功、失败、取消 |
| `GenerationGrid` | 1/2/4 张结果图 |
| `ResultToolbar` | 下载、再次生成、修改提示词、更多 |
| `TaskError` | 用户可理解的错误、重试、反馈 |
| `ScrollToBottom` | 回到底部及未读任务数量 |

### 4.3 底部生成器

| 组件 | 字段/规则 |
|---|---|
| `ReferenceUploader` | 0-4 张、排序、删除、上传状态 |
| `PromptEditor` | 多行提示词、长度、粘贴、草稿 |
| `AdaptiveComposer` | 空闲收起，聚焦/有内容/有参考图时展开；占据独立布局行，不覆盖时间线 |
| `GenerationModeSelect` | 图片生成，固定单选 |
| `ModelSelect` | 通用、写实、动漫 |
| `RatioSelect` | 智能、21:9、16:9、3:2、4:3、1:1、3:4、2:3、9:16 |
| `ResolutionSelect` | 2K、4K，联动画面宽高预览 |
| `CountSelect` | 1-8 |
| `CostPreview` | 预计额度消耗 |
| `SubmitButton` | 禁用、提交、提交中 |

## 5. 登录页

| 组件 | 字段/动作 |
|---|---|
| `LoginBrandPanel` | 品牌标识、原创演示图 |
| `PhoneInput` | 国家区号、手机号、格式校验 |
| `CodeInput` | 验证码、发送、倒计时、重新发送 |
| `AgreementCheck` | 用户协议、隐私政策、AI 使用协议 |
| `LoginButton` | 禁用、验证中、成功、失败 |
| `ThirdPartyLogin` | 可配置展示，不影响手机号主路径 |

## 6. 弹层

- 图片全屏预览。
- 会话重命名。
- 会话删除确认。
- 额度不足。
- 下载失败与重新获取。
- 用户菜单。
- 参数选择菜单。
- 登录协议详情。

## 7. 字段命名约束

- 比例保存为枚举，不以自由文本保存。
- 模型展示名与供应商模型 ID 分离。
- 每个生成任务保存不可变参数快照。
- 图片必须保存宽、高、MIME、字节大小、AI 标识和审核状态。
- 灵感素材必须保存 `sourceType`、`sourceName`、授权依据及是否 AI 生成；公开摄影与 AI 作品不得使用同一来源文案。
- 所有时间字段使用 UTC 存储，前端按用户时区显示。
