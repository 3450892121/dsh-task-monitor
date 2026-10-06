# 00 · 项目全局地图 — dsh-task-monitor

## 定位
给 DeepSeek Harness（DSH）官方桌面版（当前 0.2.0-rc.2）做的本地插件：在**窗口右侧**提供一个**独立的任务监控面板**（挂在官方根级槽位 `shell.overlay`，不是侧边栏标签页），按会话显示五块只读信息，样式对齐 Qoder 的任务监控面板。

## 目标用户
- 使用 DSH 桌面版（Windows）的用户；插件全部在本机运行，数据不出机器。

## 总体边界

**做什么：**
1. 环境信息 —— 变更统计（+新增 -删除，绿红两色）、工作区路径、git 分支名、未推送提交数；块底另有「提交或推送」按钮：点击弹出提交对话框（分支选择 / 提交说明 / 包含未暂存变更 + 统计 / 提交 / 提交并推送 / 推送）；仓库有 GitHub 远端时，对话框内显示 GitHub 登录状态，未登录可就地登录（系统凭据助手弹浏览器，注册/登录不限时，登录一次长期有效）
2. 后台进程 —— 本会话的后台任务清单（官方 `ctx.jobs` 实时名单）：运行中转圈、完成打勾、失败打叉、已停止标注
3. 技能与 MCP —— 本会话调用过的技能清单 + MCP 服务清单（从 `mcp__服务__工具` 归并出服务）
4. 产出 —— 本会话新建 / 写入 / 修改过的文件，点击在右侧栏打开文件预览
5. 网页查阅 —— 本会话抓取过的 URL（点击开系统浏览器）+ 搜索过的关键词

**面板行为：**
- 独立浮层：占窗口右侧 300px，顶接标题栏下沿、底到窗口底部，左缘有分隔线，底色与会话区一致
- 显隐规则：**会话已建立**（非 hero 草稿态，即新会话发出第一条消息后）**且右侧边栏收起**时才显示；右侧边栏一展开就自动隐藏
- 让位：面板显示时给会话区加 300px 右边距——正文像打开侧边栏一样整体左移，不被面板遮住
- 快速开关：会话头部右上角有一个任务清单图标按钮（空框 + 对勾 + 三条横线，细线条按官方图标规格；悬停显示「隐藏/显示任务监控面板」）；「设置 → 通用 → 任务监控面板」里有同样的总开关（默认开）
- 动画：显示/隐藏与让位用同一条 180ms 缓动曲线

**明确不做：**
- 不自动执行 git 写操作：提交 / 推送 / 切换分支 / GitHub 登录**只发生在用户于「提交或推送」对话框里明确点击时**，没有别的触发路径
- 不做 Qoder 面板里的其它区块（任务回顾、来源、记忆、任务目标等）
- 不做编辑、不写文件、除提交对话框外不弹其它模态
- 不发布 npm 包、不做打包分发（安装走仓库根 `install.ps1`，符号链接进 profile）
- 不改 DSH 官方安装目录里的任何文件
- 推送/登录不依赖 `gh` 命令行，也不自建登录流程——一律走系统 Git 凭据助手（Windows 上是 Git for Windows 自带的 GCM，弹浏览器登录）

## 模块划分（与 `modules/` 一一对应）
| 模块 | 文档 | 一句话 |
|---|---|---|
| 宿主半边 | `modules/host-half.md` | DSH 主进程侧：读 git、读会话工具调用、开系统浏览器，全部经本机路由提供给界面 |
| 界面半边 | `modules/client-half.md` | 浏览器侧：注册 shell.overlay 浮层 + 渲染五块面板 + 显隐/让位规则 + 点击行为 |
| 数据契约 | `modules/api-contract.md` | 两个路由的请求/响应形状、工具调用归类表、安全边界 |
| 安装与启用 | `modules/install.md` | 怎么装进 desktop profile、怎么验证加载、怎么卸载 |

## 实现依据（来源标注）
- 独立浮层挂法来自 DSH 官方包文档（应用内 `app.asar`）：根级槽位 `shell.overlay`（list、scope root）由 `@deepseek-ai/dsh-client-ui-layout` 声明；`ctx.slots.register({name:'shell.overlay', id, order, locale, inject}, 组件)`。
- 显隐依据：`ctx.sidebarRight.mounted`（onScreen 快照 store，可 subscribe；会话在屏时返回 sessionId）、`ctx.sidebarRight.isExpanded()`（右栏是否展开）、会话根元素 `[data-phase]`（hero=草稿态 / active=已建立）。
- 让位做法：给会话根元素（`[data-conversation-header-corner]` 的 `[data-phase]` 祖先）设 `margin-right: 300px`；会话切换/重挂载后由 300ms 轮询兜底补上。
- 宿主路由做法参考社区插件 dsh-git-graph（`github.com/zhu1090093659/dsh-web`）：`ctx.webServer.register({kind:'prefix', path, handler})`，环回请求围栏 + 工作区门禁。
- 会话事件读取：宿主侧 `ctx.sessionQuery.readSession(id)`（官方非废弃读法；返回 `{session, events}`，`session` 即持久化 header，含 cwd）；工具名以本机 0.2.0-rc.2 实测为准（`skill`、`web_fetch`、`web_search`、`write`、`edit`、`str_replace_editor`、`mcp__*`）。

## 版本
当前 `v0.8.0`（版本号见 `dsh-task-monitor/package.json`）。
