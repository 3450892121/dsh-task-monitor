# 模块 · 界面半边（client half）

## 目标
在 DSH 网页界面挂一个**窗口右侧的独立任务监控面板**（官方根级槽位 `shell.overlay`），按会话渲染五块只读信息；不是侧边栏标签页。

## 范围
- 注册浮层组件：`ctx.slots.register({ name: 'shell.overlay', id, order, locale, inject }, MonitorOverlay)`（list、scope root，由 ui-layout 声明）
- 渲染五块面板（环境信息 / 后台进程 / 技能与 MCP / 产出 / 网页查阅），每块可折叠；空态给一句友好提示
- **视觉**：每行是白底圆角卡片（radius 10、细边框、minHeight 40），行首是 26×26 圆角图标块；产出行按文件后缀显示彩色角标（MD 蓝 / JSON 黄 / TS 蓝 / PY 蓝…）；区块标题 13px 半粗、标题后跟折叠箭头、右侧是蓝色胶囊徽标（计数）；面板底部保持空白（仅报错或提示时出现一行）
- **后台进程与网页查阅的行都是单行**（省略号收尾、悬停看全文）；网页抓取行的行首是该网站自己的 favicon（`https://<host>/favicon.ico`，取不到退回地球图标）
- **折叠策略**：默认**全部折叠**；刷新时按区块内容签名对比，哪个区块「有变更」才自动展开那一个（首帧只建基线不展开；手动折叠后，下次内容变化会再自动展开；后台进程不参与自动展开）
- **后台进程**：用官方客户端服务 `ctx.jobs`（`hooks.jobs` 选择器 + `watchRows(sessionId)`）拿本会话后台任务实时名单；运行中/停止中转圈，完成打勾（✓），失败打叉（✗ 红），已停止标注；运行中时面板标题旁也转圈
- **浮层外观**：右侧 300px、`top: var(--dsh-frame-top-clearance, 48px)`（Windows 标题栏/内容区顶条之下）、底到窗口底部、左缘 `0.5px` 分隔线、底色 `--dsw-alias-bg-base`（与会话区一致）；内部顶部一行标题「任务监控」+ 刷新按钮；面板始终挂载，用 `transform: translateX(100%)` + 透明度做 180ms 进出动画
- **显隐规则**：`总开关开 && 会话在屏（ctx.sidebarRight.mounted 返回 sessionId）&& 右栏收起（ctx.sidebarRight.isExpanded() 为 false）&& 会话根元素 data-phase === 'active'`（hero/settling 草稿态不显示——新会话发出第一条消息后才出现）。右栏展开状态订阅会话 store 即时响应，另有 300ms 轮询兜底
- **让位**：面板显示时给会话根元素（`[data-conversation-header-corner]` 的 `[data-phase]` 祖先）设 `margin-right: 300px`，正文像打开侧边栏一样整体左移、不被遮住；隐藏时还原 `0`；同一条 180ms 曲线；会话重挂载后由轮询补上，插件卸载时清掉
- **顶部快速开关**：往 `conversation.session.header.utilities` 槽注册一个 28px 圆形图标按钮（任务清单图标：空框 + 对勾 + 三条横线，线条按官方图标规格 1px 描边；显示态用主色、隐藏态用弱色），悬停有底色，点击切换总开关；标题提示「隐藏任务监控面板 / 显示任务监控面板」，带 `aria-pressed`
- **总开关**：localStorage 键 `dsh-task-monitor/panelEnabled`（默认开），变更时派发 `dsh-task-monitor/setting-changed` 事件，浮层 / 顶部按钮 / 设置行三处即时同步
- **设置项**：往 `settings.general.item` 槽注册一行「任务监控面板」开关（出现在 设置 → 通用，与官方设置行同款样式）
- 提交或推送对话框（对齐 Qoder 设计）：分支选择（可切换）、提交说明输入、包含未暂存变更勾选 + 「+新增 -删除」统计、同步状态行、三个动作按钮（推送 / 提交并推送 / 提交）；执行中禁用并显示「正在执行…」；**执行结果留在对话框里不自动关闭**（成功绿字带提交号/分支，失败留中文原因）；Esc 可关闭
- **GitHub 区块（对话框内）**：
  - 仓库有 GitHub 远端 → 显示登录状态行（已登录带账号名 / 没登录）+「换账号 / 退出登录」「去注册」；没登录时附两步令牌登录与「自动导入系统登录」
  - **同步状态行说真话**：打开对话框时调 `/git/remote-alive` 真问远端；远端仓库已不存在（GitHub 上删了）时不再显示绿的「已同步」，改红字说明远端已不存在、同步状态是本地旧记录
  - 仓库没有任何远端 → 显示「一键发布到 GitHub」：仓库名输入（默认取文件夹名并清洗成合法字符）+ 私有/公开选择 + 发布按钮；**此时「推送」「提交并推送」禁用**（悬停说明「还没有远端仓库，请先发布到 GitHub」）
  - **远端仓库已不存在 → 显示「重新发布」区**：仓库名输入默认填旧地址里的仓库名（想换名字直接改，名字原样交宿主校验、不合法明报错误不静默替换）；重新发布由宿主新建仓库并把本地 origin 改指向新地址后首推；发布中显示「正在创建并推送…」；成功后显示仓库地址 + 「在浏览器打开」；失败留中文原因（推送失败时会附仓库地址）
  - 仓库有非 GitHub 远端（如 Gitee）→ 不显示 GitHub 区块（远端存活性判定也只对 GitHub 地址生效）
- 点击行为：
  - 产出里的文件 → `dsh-resource://file/session/<sessionId>/<路径>` 交给 `ctx.sidebarRight.openResource()`（官方导航控制器，会自动展开右栏并打开预览）
  - 网页查阅里的 URL → 调 `/taskmonitor/open-url` 开系统浏览器（不用内置浏览器）
- 刷新策略：面板可见时每 4 秒拉一次 `/taskmonitor/data`；隐藏时暂停；会话切换重挂载即拉；后台进程不受此轮询影响（走 ctx.jobs 实时流）

## 输入 / 输出
- 输入：宿主路由的 JSON；注入的 `ctx.jobs` 名单 / `ctx.sidebarRight` 状态 / `t`（词条）
- 输出：DOM；localStorage 里一个开关值 + 会话根元素上的一处 `margin-right`；git 写操作全部发生在用户点击后，由宿主执行

## 非目标
- 不做编辑、不写文件、除提交对话框外不弹其它模态
- 不做快捷键（首版）

## 依赖的其他模块
- 宿主半边（`/taskmonitor/*` 路由）；官方客户端服务：`slots` / `locale` / `sidebarRight` / `jobs`（另需官方包声明的槽位：`shell.overlay`、`conversation.session.header.utilities`、`settings.general.item`）

## 关键实现约束
- 浏览器半边是 `window.__ModuleLoader__.load({ id, factory })` 形式的闭包工厂，React 从工厂参数 `require` 拿
- 样式只用 DSH 主题变量（`--dsw-*`），跟随明暗主题；主文案中文
- **对话框必须 portal 到 `document.body` 并用 fixed 定位**（DSH 面板内的浮层会被父容器裁剪）
- 数据里的长路径用 `wordBreak: break-all` 换行展示，不做省略号截断（信息直接可见）
- 显隐 / 让位逻辑整体包在 try/catch 里：任何一步失败都不影响其它功能
