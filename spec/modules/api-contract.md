# 模块 · 数据契约（宿主 ↔ 界面）

## 路由
全部挂在 DSH 共享 webServer 上，前缀 `/taskmonitor`；一律 POST + JSON。

### POST /taskmonitor/data
请求体：`{ "sessionId": "<会话 id>", "cwd": "<可选，工作区路径>" }`

响应体（一律 HTTP 200，用 ok 区分成败）：
```json
{
  "ok": true,
  "value": {
    "environment": {
      "workspace": "C:\\path\\to\\workspace",
      "isRepo": true,
      "branch": "main",
      "changes": 3,          // 未提交变更文件数
      "ahead": 1,            // 未推送提交数（无 upstream 时为 null）
      "behind": 0,
      "detached": false,
      "error": null,         // git 不可用时的说明，有值时上面字段为 null/0
      "stats": {             // 变更统计（+X -Y）；12 秒短缓存的轮询视图
        "added": 1839,
        "deleted": 30,
        "files": 12,
        "untracked": 3,
        "staged": 0,
        "unstaged": 9,
        "truncated": false
      }
    },
    "skills":  [ { "name": "office-pptx", "count": 2 } ],
    "mcp":     [ { "server": "jiyi-zhishiku", "count": 5, "tools": ["memory_search"] } ],
    "artifacts": [ { "path": "src/a.js", "display": "src/a.js", "kind": "write" } ],
    "web": {
      "fetched": [ { "url": "https://example.com/a" } ],
      "searched": [ { "query": "关键词" } ]
    },
    "diagnostics": { "events": 42, "sessionQueryError": null }
  }
}
```

### POST /taskmonitor/open-url
请求体：`{ "url": "https://..." }`，只放行 `http:` / `https:`。
副作用：在宿主机上把 URL 交给系统默认浏览器（Windows: `cmd /c start`）。

### git 组（都要求 `sessionId`，都过工作区门禁）
| 路由 | 请求体 | 行为 |
|---|---|---|
| `/taskmonitor/git/info` | `{ sessionId }` | 返回 `{ environment, branches: ["main",…], stats, github }`，供提交对话框使用；`github = { remote, anyRemote, url, loggedIn }`（remote=有 GitHub 远端；anyRemote=有任何远端；url=origin 地址；loggedIn=本机存有 GitHub 凭据，离屏检查不弹窗）；`fast:true` 时不查 GitHub |
| `/taskmonitor/git/github-status` | `{ sessionId }` | 同上 `github` 对象的独立路由（对话框秒开用，避免网络慢拖住界面） |
| `/taskmonitor/git/remote-alive` | `{ sessionId }` | 用 `git ls-remote origin` 真问一次远端：返回 `{ state: "alive" \| "missing" \| "unknown" \| "no-remote", url }`；`missing` = 远端仓库已不存在（GitHub 上删了仓库后本地仍留旧上游，`git status` 的「已同步」是谎言，界面据此改说真话并弹出重新发布区） |
| `/taskmonitor/git/commit` | `{ sessionId, message, includeUnstaged }` | `includeUnstaged=true` 先 `git add -A`，再 `git commit -m <message>`；message 为空时用兜底文案（`chore: 更新 N 个文件`） |
| `/taskmonitor/git/push` | `{ sessionId }` | `git push`；无上游时回退 `git push -u origin HEAD`；远端仓库不存在时错误码为 `remote-not-found`（其余失败为 `git-failed`） |
| `/taskmonitor/git/commit-push` | 同 commit | 先提交再推送；推送失败返回 `code:"push-failed-after-commit"`（提交已成功），并附 `pushCode`（如 `remote-not-found`） |
| `/taskmonitor/git/switch` | `{ sessionId, branch }` | `git switch --no-guess <branch>` |
| `/taskmonitor/git/github-login-token` | `{ sessionId, token }` | 令牌登录：向 GitHub 验证令牌（细粒度令牌再试建/删临时仓库验权限），通过后存进插件令牌文件；返回 `{ account }` |
| `/taskmonitor/git/github-import` | `{ sessionId }` | 从系统凭据助手读回已有 GitHub 登录 → 验证 → 存进插件令牌文件；返回 `{ account, already }` |
| `/taskmonitor/git/github-logout` | `{ sessionId }` | 删除插件令牌文件（不动系统凭据库与全局配置） |
| `/taskmonitor/git/github-publish` | `{ sessionId, name, private }` | 一键发布/重新发布：用已登录令牌调 GitHub API 建仓库 → 写本地远端（origin 不存在则 `remote add`，**已存在则 `remote set-url` 更新地址**——重发布时必须改指向新仓库）→ 首推；`name` 原样校验（只允许英文字母/数字/点/下划线/减号，中文等直接报错不静默替换）；成功返回 `{ url, fullName }`，推送失败时 `value.url` 仍带仓库地址 |

`stats` 形状：`{ added, deleted, files, untracked, staged, unstaged, truncated }` —— 跟踪文件用 `git diff --numstat`（含 `--cached`），未跟踪文件逐个读文本数行（上限 200 个文件 / 2MB，超了 `truncated: true`）。

错误统一形态：`{ ok:false, error:{ code, message } }`；`message` 是中文人话（对齐 Qoder 文案）：没有可提交的变更。/ 尚未配置 Git 用户名或邮箱。/ 当前分支没有上游分支。/ 仓库没有可用的远端（可在对话框下方用「发布到 GitHub」一键建好并推上去）。/ 远端仓库已不存在（可能在 GitHub 上被删除），或登录的账号没有权限；可在对话框下方用「重新发布到 GitHub」一键重建并推送（可改仓库名）。/ 操作超时（可能网络不通或登录等太久，重试即可）。/ 连不上 Git 远端（国内访问 GitHub 时好时坏）。/ 远端包含本地尚未同步的提交，请先同步后重试。/ 当前改动会阻止此操作，请先提交或暂存改动。/ 没找到 Git（提示安装 Git for Windows）。等。

### GitHub 凭据约定（插件自管令牌文件）
- 凭据只存插件自己的文件 `~/.dsh/task-monitor-github-token`（git credential-store 一行式，权限 0600）；**不动系统凭据库、不改用户全局 git 配置**（从 DSH 子进程弹系统凭据窗口不可靠，且系统库里残留凭据可能弹「选择账号」阻断推送）。
- 推送/ls-remote 等网络类 git 命令用 `-c credential.https://github.com.helper=store --file=<令牌文件>` 指定凭据（先 `-c credential.helper=` 清空整条链——`-c` 是追加不是覆盖）；远端地址里带账号名（`https://账号@github.com/…`），git 直接知道用哪个账号。
- 登录态检查只读令牌文件（毫秒级、不发网络）；登录入口为「粘贴令牌」与「从系统凭据导入」两条，都先向 GitHub 验证再落盘。
- 凭据内容（token）不打印、不外传；发布建仓库用 `Authorization: Bearer <token>` 调 `api.github.com`。
- GitHub 对「令牌无权限」返回 404 而不是 403（实测）；细粒度令牌默认无建仓库权限，登录时以「建/删临时仓库」试探拦截并引导经典令牌。

## 工具调用归类表（DSH 0.2.0-rc.2 的工具名）
| 归类 | 规则 | 取值来源（tool/call 事件 data.arguments） |
|---|---|---|
| 技能 | `name === "skill"` | `arguments.name` |
| MCP | `name` 以 `mcp__` 开头 | 拆分 `mcp__<server>__<tool>` |
| 产出-写入 | `name === "write"` | `arguments.file_path` |
| 产出-修改 | `name === "edit"` 或 `"str_replace_editor"` | `arguments.file_path` / `arguments.path` |
| 网页-抓取 | `name === "web_fetch"` | `arguments.url` |
| 网页-搜索 | `name === "web_search"` | `arguments.queries[]` |

去重口径：同一文件按首次出现顺序保留一条（写入优先于修改）；技能 / MCP 服务按出现次数聚合；失败的调用（tool/result 里 `isError`）不计入。

## 安全边界
- 所有 `/taskmonitor/*` 请求必须通过环回围栏：socket 地址 127/8 或 ::1、Host 头是环回地址、非跨站来源、content-type 为 application/json。
- 所有 git 操作（含只读）只允许作用于「已注册工作区」目录（realpath 后与 `workspaceRegistry.list()` 精确比对）。
- git 写操作（commit / push / switch）与 GitHub 动作（login / publish）**只有用户在面板对话框里点击才会触发**，没有别的调用方。
- 仅允许 http/https 交给系统浏览器；其余一律拒绝。
- GitHub 凭据不做任何形式的打印 / 落盘 / 外传（详见上文「GitHub 凭据约定」）。
