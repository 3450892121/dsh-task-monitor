# 模块 · 宿主半边（host half）

## 目标
在 DSH 宿主进程里提供面板所需的数据与动作：git 状态、会话工具调用归类、提交对话框的 git 操作、打开系统浏览器。

## 范围
- 注册本机路由（细节见 `api-contract.md`）：
  - `POST /taskmonitor/data` —— 入参 `{ sessionId, cwd? }`，出参四块数据
  - `POST /taskmonitor/open-url` —— 用系统默认浏览器打开 http(s) 链接
  - `POST /taskmonitor/git/info` —— 提交对话框数据（分支列表 + 变更统计 + GitHub 登录状态）
  - `POST /taskmonitor/git/github-status` / `remote-alive` —— GitHub 登录状态（本地令牌文件，毫秒级）/ 远端仓库是否还真实存在（`git ls-remote`）
  - `POST /taskmonitor/git/commit` / `push` / `commit-push` / `switch` —— git 写操作，只由用户在对话框里点击触发
  - `POST /taskmonitor/git/github-login-token` / `github-import` / `github-logout` / `github-publish` —— 令牌登录 / 导入系统登录 / 退出 / 一键发布（重新发布）
- 读取 git（只读命令）：分支名、未提交变更数、未推送提交数、变更统计（+X -Y）
- 读取会话事件并归类：技能调用、MCP 调用、文件写/改、网页抓取/搜索
- 安全围栏：环回请求校验；git 只能作用于「已注册工作区」路径

## 输入 / 输出
- 输入：界面半边发来的 JSON 请求；DSH 服务（webServer / subprocess / workspaceRegistry / sessions / sessionQuery）
- 输出：结构化 JSON（形状见 `api-contract.md`）；副作用有两个：把 URL 交给系统浏览器；用户点击后对本机仓库执行 commit / push / switch，或调系统凭据助手发起 GitHub 登录（可能弹浏览器）

## 非目标
- 不**自动**执行 git 写操作（提交/推送/切换分支只由对话框点击触发）；不缓存不落盘；不注册任何模型可见工具

## 依赖的其他模块
- 无（是界面半边的数据来源）。打包形态上与界面半边同属一个 npm 包。

## 关键实现约束
- 依赖的服务用 `export const inject = [...]` 声明；路由用 `ctx.effect()` 包装以便随插件卸载自动注销
- git 命令超时与输出上限必须有界（argv 数组直接 spawn，不走 shell）；读操作 15s；写操作 30 分钟（推送可能撞上用户在浏览器里注册/登录 GitHub，不设限）
- GitHub 登录状态探测：`git credential fill`（stdin 传 `protocol=https` + `host=github.com`）+ 环境变量 `GIT_TERMINAL_PROMPT=0`、`GCM_INTERACTIVE=never`（离屏不弹窗，只看输出有没有凭据值行）；先查 `git config --get credential.helper`，未配置则直接算未登录，避免空等
- 凭据内容只在子进程输出里过一道，**不打印、不落盘、不外传**
- 会话数据以 `ctx.sessionQuery.readSession(sessionId)` 为准；服务不可用时该块返回空白，不抛错拖垮整面板
- 会话工作区（cwd）解析：先取 `ctx.sessions.get(id)` 的实时 header，拿不到时回退 `readSession` 返回的 `read.session.cwd`（它就是持久化 header，含 cwd）——重启 DSH 后会话还没变活跃时环境信息也能正常显示
- **会话事件里 `tool/call` 的 `data.arguments` 是 JSON 字符串，不是对象**（实测；直接按对象取值会全为空）——必须先 `JSON.parse` 再归类；事件里的 sessionId 要带 `session-` 前缀才能被 readSession 找到
- 未跟踪文件统计用 `git status --porcelain -z` 解析（`-z` 不做引号/八进制转义，中文文件名才不会漏）；二进制文件（含 NUL 字节）跳过行数统计
- git 报错统一翻译成中文人话（对齐 Qoder 对话框文案），不让原始 stderr 直接上屏；GitHub 场景补齐：未登录 / 仓库不存在 / 超时 / 未装 Git
- **发布写本地远端时：origin 不存在才 `remote add`，已存在必须 `remote set-url` 更新地址**——远端仓库在 GitHub 被删后重建（或换名重建）时，旧地址不更新就会推去已不存在的仓库
- **远端存活性探测**：`/git/remote-alive` 用 `git ls-remote origin`（带插件令牌凭据与本机代理参数）真问一次；仓库被删后本地仍留旧上游跟踪引用，`git status` 会说「已同步」，界面靠这条探测改说真话
- 推送失败按 stderr 细分错误码：远端仓库不存在 = `remote-not-found`（界面据此弹出重新发布区），其余 = `git-failed`
- Windows 打开外链走 `cmd /c start "" "<url>"`：URL 必须加双引号，否则 cmd 把 URL 里的 `&` 当命令分隔符截断（令牌页地址带 `&scopes=…`，截断后打开的是没勾权限的页面）
- 网络类 git 命令与宿主 fetch 自动套用探测到的本机代理端口（`-c http.proxy=…` / `NODE_USE_ENV_PROXY=1`），不改用户全局配置
