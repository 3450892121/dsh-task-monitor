/**
 * 任务监控 · 宿主半边（DSH 主进程侧）。
 *
 * 提供本机路由，全部经环回围栏：
 *   POST /taskmonitor/data        —— 四块数据（环境信息 / 技能与 MCP / 产出 / 网页查阅）
 *   POST /taskmonitor/open-url    —— 用系统默认浏览器打开 http(s) 链接
 *   POST /taskmonitor/git/info    —— 提交对话框数据（分支列表 + 变更统计；fast:true 时不含 GitHub 状态）
 *   POST /taskmonitor/git/github-status —— GitHub 状态单独查（避免网络慢拖住对话框）
 *   POST /taskmonitor/git/remote-alive  —— 远端仓库是否还存在（删库后本地上游是旧的，同步状态会撒谎）
 *   POST /taskmonitor/git/commit  —— 提交（用户在对话框里明确点击才触发）
 *   POST /taskmonitor/git/push    —— 推送（同上）
 *   POST /taskmonitor/git/commit-push —— 提交并推送（同上）
 *   POST /taskmonitor/git/switch  —— 切换分支（同上）
 *   POST /taskmonitor/git/github-login —— 登录 GitHub（同上，走系统凭据助手弹浏览器）
 *   POST /taskmonitor/git/github-login-token —— 令牌登录（同上的可靠替代：网页复制 PAT 粘进来）
 *   POST /taskmonitor/git/github-publish —— 一键发布：建 GitHub 仓库 + 配远端 + 首推（同上）
 *
 * 安全：读取类 git 一律只读；写类 git（commit / push / switch）只由用户在
 * 面板对话框里点击触发，没有其它触发路径；所有路由只服务已注册工作区。
 */
import { realpath, readFile, stat, mkdir, writeFile, rm } from 'node:fs/promises'
import { connect } from 'node:net'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/** Loader 身份。 */
export const name = 'task-monitor'

/** 依赖的宿主服务：路由注册、子进程、工作区注册表、会话、会话查询。 */
export const inject = ['webServer', 'subprocess', 'workspaceRegistry', 'sessions', 'sessionQuery']

const OUTPUT_CAP_BYTES = 1 << 20
const GIT_TIMEOUT_MS = 15000
// 写操作要等用户：推送时若碰到登录流程，浏览器里的操作（注册 + 登录）没法限时，30 分钟兜底
const GIT_WRITE_TIMEOUT_MS = 1800000
// 登录动作：等用户在浏览器里注册/登录 GitHub；超时只用来兜底「窗口没弹出来」这种情况
const GIT_LOGIN_TIMEOUT_MS = 1800000
// 登录状态探测：查已存凭据，正常毫秒级；给 15 秒是防止凭据助手尝试弹窗
const GIT_CRED_TIMEOUT_MS = 15000
const BODY_MAX_BYTES = 256 * 1024
const MAX_ARTIFACTS = 500
const UNTRACKED_MAX_FILES = 200
const UNTRACKED_MAX_BYTES = 2 * 1024 * 1024

// ── 环回围栏（语义同 dsh 共享的 loopback 实现）────────────────────────────

function isIPv4Loopback(v4) {
  const parts = String(v4).split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

function isLoopbackAddress(address) {
  if (address === undefined) return false
  const normalized = String(address).toLowerCase()
  if (normalized === '::1') return true
  if (normalized.startsWith('::ffff:')) return isIPv4Loopback(normalized.slice(7))
  return isIPv4Loopback(normalized)
}

function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  return isIPv4Loopback(hostname)
}

function isLoopbackRequest(req) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostUrl
  try {
    hostUrl = new URL('http://' + host)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === hostUrl.host
  } catch {
    return false
  }
}

// ── HTTP 小工具 ────────────────────────────────────────────────────────────

function writeJson(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'cache-control': 'no-store',
  })
  res.end(text)
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let size = 0
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_MAX_BYTES) {
        resolve(undefined)
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'))
      } catch {
        resolve(undefined)
      }
    })
    req.on('error', () => resolve(undefined))
  })
}

// ── git 执行（argv 直传，不走 shell）────────────────────────────────────────

function runGit(ctx, argv, cwd, signal, options) {
  return new Promise((resolve) => {
    let child
    const stdio = {
      stdin: options && typeof options.stdin === 'string' ? options.stdin : 'ignore',
      stdout: { maxBytes: OUTPUT_CAP_BYTES },
      stderr: { maxBytes: OUTPUT_CAP_BYTES },
    }
    try {
      child = ctx.subprocess.spawn({
        argv: ['git', ...argv],
        cwd,
        stdio,
        graceMs: 2000,
        signal,
        env: options && options.env ? options.env : undefined,
      })
    } catch (error) {
      resolve({ exitCode: 127, stdout: '', stderr: String(error?.message ?? error) })
      return
    }
    child.done.then(
      ({ exitCode }) => {
        let stdout = ''
        let stderr = ''
        try {
          stdout = child.collected?.stdout?.readFrom(0)?.text ?? ''
          stderr = child.collected?.stderr?.readFrom(0)?.text ?? ''
        } catch {
          /* 收集失败按空串处理 */
        }
        resolve({ exitCode, stdout, stderr })
      },
      (error) => resolve({ exitCode: 127, stdout: '', stderr: String(error?.message ?? error) }),
    )
  })
}

async function runGitTimed(ctx, argv, cwd, timeoutMs = GIT_TIMEOUT_MS, options) {
  const controller = new AbortController()
  const deadline = setTimeout(() => controller.abort(new Error('git 超时')), timeoutMs)
  try {
    return await runGit(ctx, argv, cwd, controller.signal, options)
  } finally {
    clearTimeout(deadline)
  }
}

/** 把 git 报错翻译成人话（对齐 Qoder 对话框的错误文案风格）。 */
function friendlyGitError(stderr) {
  const text = String(stderr || '')
  if (/ENOENT/i.test(text) && /spawn|git/i.test(text)) return '没找到 Git，请先安装 Git for Windows（https://git-scm.com/downloads/win）后重试。'
  if (/git 超时/.test(text)) return '操作超时了。可能网络不通，或 GitHub 登录等太久——重试一次即可（登录窗口会再弹出来）。'
  if (/not a git repository|not a git work tree/i.test(text)) return '所选目录不是 Git 仓库。'
  if (/nothing to commit|no changes added to commit|nothing added to commit/i.test(text)) return '没有可提交的变更。'
  if (/Please tell me who you are|empty ident|unable to auto-detect email/i.test(text)) return '尚未配置 Git 用户名或邮箱。'
  if (/has no upstream branch|no upstream/i.test(text)) return '当前分支没有上游分支。'
  if (/No configured push destination|no remote|does not appear to be a git repository/i.test(text)) return '仓库没有可用的远端。可在对话框下方用「发布到 GitHub」一键建好并推上去。'
  if (/Repository not found|repository .* not found/i.test(text)) return '远端仓库已不存在（可能在 GitHub 上被删除），或登录的账号没有权限。可在对话框下方用「重新发布到 GitHub」一键重建并推送（可改仓库名）。'
  if (/Authentication failed|could not read Username|could not read Password|terminal prompts disabled/i.test(text))
    return '本机还没有 GitHub 登录信息。再点一次推送，会自动弹出登录窗口；在浏览器里登录完就会继续。'
  if (/Could not resolve host|unable to access|Failed to connect|Connection timed out|Couldn't connect/i.test(text))
    return '连不上 Git 远端。国内访问 GitHub 经常时好时坏，稍等一会儿重试即可。'
  if (/non-fast-forward|fetch first|rejected/i.test(text)) return '远端包含本地尚未同步的提交，请先同步后重试。'
  if (/would be overwritten|local changes/i.test(text)) return '当前改动会阻止此操作，请先提交或暂存改动。'
  if (/index\.lock|another git process/i.test(text)) return '仓库正被另一个 Git 进程占用，请稍后重试。'
  const first = text.split(/\r?\n/).find((line) => line.trim() !== '')
  return first || 'Git 操作未完成，请刷新后重试。'
}

// ── 工作区解析（realpath + 注册表门禁）──────────────────────────────────────

async function resolveWorkspace(ctx, cwd) {
  if (!cwd) return { ok: false, error: '找不到这个会话的工作区路径' }
  let canonical
  try {
    canonical = await realpath(cwd)
  } catch {
    return { ok: false, error: '工作区路径在磁盘上不存在' }
  }
  const registered = ctx.workspaceRegistry.list?.() ?? []
  if (!registered.some((workspace) => workspace?.path === canonical)) {
    return { ok: false, error: '这个路径不是已注册的工作区' }
  }
  return { ok: true, canonical }
}

/** 解析会话工作区：优先会话自身，其次请求里带的 cwd；都要过门禁。 */
async function resolveSessionWorkspace(ctx, sessionId, providedCwd) {
  let cwd = null
  if (sessionId) {
    try {
      const live = ctx.sessions.get(sessionId) ?? null
      cwd = live?.header?.cwd ?? live?.meta?.cwd ?? null
    } catch {
      cwd = null
    }
  }
  if (!cwd && providedCwd) cwd = providedCwd
  return resolveWorkspace(ctx, cwd)
}

// ── 环境信息 ───────────────────────────────────────────────────────────────

/** 解析 `git status --porcelain -b` 的首行与正文计数。 */
function parseStatus(stdout) {
  const lines = String(stdout).split(/\r?\n/)
  const header = lines[0]?.startsWith('##') ? lines[0].slice(2).trim() : ''
  let branch = null
  let ahead = null
  let behind = null
  let upstream = null
  let detached = false
  if (header) {
    if (header.startsWith('No commits yet on ')) {
      branch = header.slice('No commits yet on '.length).trim()
    } else if (header.startsWith('HEAD (no branch)')) {
      branch = null
      detached = true
    } else {
      const bracket = header.match(/\[([^\]]+)\]\s*$/)
      const core = bracket ? header.slice(0, bracket.index).trim() : header
      const [left, right] = core.split('...')
      branch = left.trim()
      if (right !== undefined && right.trim() !== '') upstream = right.trim()
      if (bracket) {
        const a = bracket[1].match(/ahead (\d+)/)
        const b = bracket[1].match(/behind (\d+)/)
        if (a) ahead = Number(a[1])
        if (b) behind = Number(b[1])
      } else if (upstream !== null) {
        ahead = 0
        behind = 0
      }
    }
  }
  const changes = lines.slice(1).filter((line) => line.trim() !== '').length
  return { branch, upstream, ahead, behind, changes, detached }
}

async function environmentOf(ctx, cwd) {
  const base = {
    workspace: cwd ?? null,
    isRepo: false,
    branch: null,
    upstream: null,
    changes: null,
    ahead: null,
    behind: null,
    detached: false,
    error: null,
  }
  const resolved = await resolveWorkspace(ctx, cwd)
  if (!resolved.ok) return { ...base, error: resolved.error }
  const canonical = resolved.canonical
  const result = await runGitTimed(ctx, ['--no-optional-locks', 'status', '--porcelain', '-b'], canonical)
  if (result.exitCode !== 0) {
    const stderr = String(result.stderr || '').trim()
    const notRepo = /not a git repository|not a git work tree/i.test(stderr)
    return { ...base, workspace: canonical, isRepo: false, error: notRepo ? null : stderr || 'git 执行失败' }
  }
  const parsed = parseStatus(result.stdout)
  return { ...base, workspace: canonical, isRepo: true, ...parsed }
}

// ── 变更统计（+X -Y，含未跟踪文件）──────────────────────────────────────────

async function countUntrackedLines(canonical, paths) {
  let added = 0
  let truncated = false
  let budget = UNTRACKED_MAX_BYTES
  for (const path of paths.slice(0, UNTRACKED_MAX_FILES)) {
    if (budget <= 0) {
      truncated = true
      break
    }
    try {
      const absolute = isAbsolute(path) ? path : join(canonical, path)
      const info = await stat(absolute)
      if (!info.isFile() || info.size > budget) {
        truncated = truncated || info.size > budget
        continue
      }
      const buffer = await readFile(absolute)
      budget -= buffer.length
      if (buffer.includes(0)) continue
      const text = buffer.toString('utf8')
      added += text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0)
    } catch {
      /* 读不到就跳过这一只 */
    }
  }
  return { added, truncated }
}

/** 面板轮询用：统计结果短缓存，避免每 4 秒重复跑 numstat。 */
const statsCache = new Map()

async function cachedStats(ctx, canonical, maxAgeMs = 12000) {
  const now = Date.now()
  const hit = statsCache.get(canonical)
  if (hit && now - hit.at < maxAgeMs) return hit.value
  const value = await commitStats(ctx, canonical)
  statsCache.set(canonical, { at: now, value })
  return value
}

async function commitStats(ctx, canonical) {
  const stats = { added: 0, deleted: 0, files: 0, untracked: 0, staged: 0, unstaged: 0, truncated: false }
  const numstat = async (argv) => {
    const result = await runGitTimed(ctx, argv, canonical)
    if (result.exitCode !== 0) return new Set()
    const paths = new Set()
    for (const line of String(result.stdout).split(/\r?\n/)) {
      if (!line.trim()) continue
      const [a, d, ...rest] = line.split('\t')
      const path = rest.join('\t')
      if (a !== '-' ) stats.added += Number(a) || 0
      if (d !== '-') stats.deleted += Number(d) || 0
      if (path) paths.add(path)
    }
    return paths
  }
  const unstaged = await numstat(['--no-optional-locks', 'diff', '--numstat'])
  const staged = await numstat(['--no-optional-locks', 'diff', '--cached', '--numstat'])
  // -z：路径按原样返回（中文/空格路径不被引号转义），否则未跟踪文件会统计不到
  const status = await runGitTimed(ctx, ['--no-optional-locks', 'status', '--porcelain', '-z'], canonical)
  const untrackedPaths = []
  if (status.exitCode === 0) {
    for (const entry of String(status.stdout).split('\0')) {
      if (entry.startsWith('?? ')) untrackedPaths.push(entry.slice(3))
    }
  }
  const untracked = await countUntrackedLines(canonical, untrackedPaths)
  stats.added += untracked.added
  stats.truncated = untracked.truncated
  stats.untracked = untrackedPaths.length
  stats.staged = staged.size
  stats.unstaged = unstaged.size
  stats.files = new Set([...staged, ...unstaged, ...untrackedPaths]).size
  return stats
}

async function gitInfo(ctx, canonical, options) {
  const environment = await environmentOf(ctx, canonical)
  if (!environment.isRepo) return { environment, branches: [], stats: null, github: null, githubChecked: false }
  const stats = await commitStats(ctx, canonical)
  const branchResult = await runGitTimed(ctx, ['branch', '--format=%(refname:short)'], canonical)
  const branches = String(branchResult.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  // fast：只给本地信息，GitHub 状态另走一次请求（避免网络慢时对话框迟迟不出来）
  if (options && options.fast === true) return { environment, branches, stats, github: null, githubChecked: false }
  return { environment, branches, stats, github: await githubInfo(ctx, canonical), githubChecked: true }
}

// ── GitHub 登录（插件自管令牌文件，不依赖系统凭据助手）────────────────────────
//
// 登录态与令牌一律以插件自己的文件为准：~/.dsh/task-monitor-github-token
// （git credential-store 的格式：每行 `https://用户名:令牌@github.com`）。
// 状态检查直接读文件——不调 git、不发网络、不碰系统凭据库，毫秒级且完全确定性。
// 「弹出系统登录窗口」这条路已实测不可靠（从 DSH 进程里弹不出来），不再使用。

/** 从 `git remote -v` 输出里取 origin 的地址（首行即 fetch 行）。 */
function originUrlOf(remoteText) {
  for (const line of String(remoteText).split(/\r?\n/)) {
    const match = line.match(/^origin\s+(\S+)/)
    if (match) return match[1]
  }
  return ''
}

/** 仓库是否有 GitHub 远端（决定要不要显示 GitHub 登录相关 UI）。 */
async function githubRemoteOf(ctx, canonical) {
  const result = await runGitTimed(ctx, ['remote', '-v'], canonical)
  if (result.exitCode !== 0) return { github: false, any: false, url: '' }
  const text = String(result.stdout || '')
  return { github: /github\.com/i.test(text), any: text.trim() !== '', url: originUrlOf(text) }
}

/** 凭据请求体（git credential fill / store 的标准输入）。 */
function credentialProbeInput() {
  return 'protocol=https\nhost=github.com\n\n'
}

/** 插件令牌文件路径（必须正斜杠：helper/store 命令经 sh 解析，反斜杠会被吃掉）。 */
function tokenStorePath() {
  return join(homedir(), '.dsh', 'task-monitor-github-token').replace(/\\/g, '/')
}

/** 读插件令牌文件（本地读，毫秒级）。返回 { token, account } 或 null。 */
async function readStoredToken() {
  try {
    const text = await readFile(tokenStorePath(), 'utf8')
    const line = text.split(/\r?\n/).find((row) => row.includes('github.com'))
    if (!line) return null
    const match = line.match(/^https:\/\/([^:@\/]+):([^@]+)@github\.com/)
    if (!match) return null
    const token = decodeURIComponent(match[2])
    if (token === '') return null
    return { token, account: decodeURIComponent(match[1]) }
  } catch {
    return null
  }
}

/** 登录态检查：直接读文件。 */
async function githubLoggedIn() {
  return (await readStoredToken()) !== null
}

async function githubInfo(ctx, canonical) {
  const remote = await githubRemoteOf(ctx, canonical)
  // 没有远端也要查登录状态：发布功能需要先登录，UI 依赖这个字段决定是否显示登录入口
  const stored = await readStoredToken()
  return { remote: remote.github, anyRemote: remote.any, url: remote.url, loggedIn: stored !== null, account: stored === null ? '' : stored.account }
}

/**
 * 远端仓库是否还真实存在：`git ls-remote` 真问一次远端。
 * 仓库在 GitHub 上被删除后，本地仍留着旧的上游跟踪引用，`git status` 会说「已同步」——
 * 这条探测就是戳破这个谎言用的（missing = 远端仓库已不存在）。
 */
async function remoteAlive(ctx, canonical) {
  const remote = await githubRemoteOf(ctx, canonical)
  if (remote.url === '') return { state: 'no-remote', url: '' }
  const result = await runGitTimed(ctx, await networkGitArgs(['ls-remote', 'origin']), canonical, GIT_TIMEOUT_MS)
  if (result.exitCode === 0) return { state: 'alive', url: remote.url }
  const stderr = String(result.stderr || '')
  if (/Repository not found|repository .* not found/i.test(stderr)) return { state: 'missing', url: remote.url }
  return { state: 'unknown', url: remote.url }
}

/** 退出登录：删掉插件令牌文件（只影响本插件，不动系统凭据库与全局配置）。 */
async function githubLogout() {
  try {
    await rm(tokenStorePath(), { force: true })
    return { ok: true }
  } catch {
    return { ok: false, error: '退出登录失败，请重试。' }
  }
}

/** 取插件令牌文件里的令牌；没有返回 ''。 */
async function githubTokenOf() {
  const found = await readStoredToken()
  return found === null ? '' : found.token
}

/** 把令牌写进插件令牌文件（直接写文件，格式就是 git credential-store 的一行式）。 */
async function writeStoredToken(ctx, canonical, token, account) {
  const user = encodeURIComponent(account === '' ? 'github' : account)
  const line = `https://${user}:${encodeURIComponent(token)}@github.com\n`
  try {
    await mkdir(join(homedir(), '.dsh'), { recursive: true })
    await writeFile(tokenStorePath(), line, { encoding: 'utf8', mode: 0o600 })
    return true
  } catch {
    return false
  }
}

/** 验证令牌能否建/删仓库（GitHub 对无权限令牌返回 404 而不是 403，得实际试一下）。 */
async function tokenCanCreateRepo(token) {
  await ensureFetchProxy()
  const name = 'dsh-permission-check-' + Date.now().toString(36)
  const headers = { accept: 'application/vnd.github+json', authorization: 'Bearer ' + token, 'user-agent': 'dsh-task-monitor' }
  try {
    const created = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: Object.assign({ 'content-type': 'application/json' }, headers),
      body: JSON.stringify({ name, private: true, description: 'permission check, safe to delete' }),
      signal: AbortSignal.timeout(20000),
    })
    if (!created.ok) return false
    const body = await created.json().catch(() => null)
    const fullName = String(body?.full_name || '')
    if (fullName !== '') {
      await fetch('https://api.github.com/repos/' + fullName, { method: 'DELETE', headers, signal: AbortSignal.timeout(20000) }).catch(() => {})
    }
    return true
  } catch {
    return false
  }
}

/** 令牌登录：用户从 GitHub 网页复制来的 Personal Access Token，验证后存进插件令牌文件。 */
async function githubLoginWithToken(ctx, canonical, token) {
  const value = String(token || '').trim()
  if (value === '' || /\s/.test(value)) return { ok: false, error: '令牌内容不对（不应包含空格），请重新复制。' }
  if (!/^(ghp_|github_pat_|gho_|ghu_|ghs_)/.test(value)) {
    return { ok: false, error: '这看起来不是 GitHub 令牌（应以 ghp_ 或 github_pat_ 开头），请重新复制。' }
  }
  await ensureFetchProxy()
  let who = null
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: { accept: 'application/vnd.github+json', authorization: 'Bearer ' + value, 'user-agent': 'dsh-task-monitor' },
      signal: AbortSignal.timeout(20000),
    })
    if (!response.ok) {
      if (response.status === 401) return { ok: false, error: 'GitHub 说这个令牌无效，请检查是否复制完整、或是否已过期。' }
      return { ok: false, error: '验证令牌时 GitHub 返回 ' + response.status + '，稍后重试。' }
    }
    who = await response.json()
    // 细粒度令牌（x-oauth-scopes 为空）无法建仓库：在登录这步就拦住，不让用户白折腾
    if (value.startsWith('github_pat_') || String(response.headers.get('x-oauth-scopes') || '') === '') {
      if (!(await tokenCanCreateRepo(value))) {
        return { ok: false, error: '这个令牌没有「建仓库」权限（细粒度令牌默认没有）。请点「打开令牌页面」重新生成——页面已预设为经典令牌，直接点最底下绿色按钮即可。' }
      }
    }
  } catch (error) {
    return { ok: false, error: '连不上 GitHub（国内网络时好时坏），检查网络后重试：' + String(error?.message ?? error) }
  }
  const login = String(who?.login || '')
  if (!(await writeStoredToken(ctx, canonical, value, login))) {
    return { ok: false, error: '令牌存到本机失败，请重试。' }
  }
  return { ok: true, account: login }
}

/** 从系统凭据助手读一次（非交互：没存过就快速失败，不弹窗）。 */
async function systemCredentialProbe(ctx, canonical) {
  const helper = await runGitTimed(ctx, ['config', '--get', 'credential.helper'], canonical)
  if (helper.exitCode !== 0 || String(helper.stdout || '').trim() === '') return null
  const result = await runGitTimed(ctx, ['credential', 'fill'], canonical, GIT_CRED_TIMEOUT_MS, {
    stdin: credentialProbeInput(),
    env: { GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
  })
  if (result.exitCode !== 0) return null
  const stdout = String(result.stdout || '')
  const token = (stdout.match(/(?:^|\n)password=(.*)/) || [])[1] || ''
  if (token.trim() === '') return null
  return { token: token.trim(), account: ((stdout.match(/(?:^|\n)username=(.*)/) || [])[1] || '').trim() }
}

/**
 * 导入系统里已有的 GitHub 登录：从系统凭据助手读出令牌 → 向 GitHub 验证 →
 * 存进插件自己的令牌文件。这样「电脑上登录过 GitHub」的用户不用重新弄一遍。
 */
async function githubImportFromSystem(ctx, canonical) {
  if (await githubLoggedIn()) return { ok: true, already: true, account: '' }
  const found = await systemCredentialProbe(ctx, canonical)
  if (found === null) {
    return { ok: false, error: '系统里没有现成的 GitHub 登录信息，请按下面的两步登录。' }
  }
  return githubLoginWithToken(ctx, canonical, found.token)
}

/** 让宿主的 fetch 也走探测到的本机代理（Node 24 支持用环境变量启用；不影响 git 与用户配置）。 */
async function ensureFetchProxy() {
  const port = await detectLocalProxy()
  if (port === null) return
  const url = 'http://127.0.0.1:' + port
  process.env.HTTP_PROXY = url
  process.env.HTTPS_PROXY = url
  process.env.NODE_USE_ENV_PROXY = '1'
}

/** 快速探测 GitHub 是否连得上（发布/推送前的友好提示用）。 */
async function githubReachable() {
  await ensureFetchProxy()
  try {
    const response = await fetch('https://api.github.com/', {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-task-monitor' },
      signal: AbortSignal.timeout(6000),
    })
    return response.status === 200
  } catch {
    return false
  }
}

/**
 * 把远端地址写进本地：origin 不存在就建，已存在就改地址。
 * 重新发布（远端仓库被删后重建、或换仓库名）时必须更新旧地址，
 * 否则推送会照旧地址走——推去一个已不存在的仓库。
 */
async function ensureRemoteUrl(ctx, canonical, url) {
  const add = await runGitTimed(ctx, ['remote', 'add', 'origin', url], canonical, GIT_CRED_TIMEOUT_MS)
  if (add.exitCode === 0) return { ok: true }
  if (!/already exists/i.test(String(add.stderr || ''))) return { ok: false, error: friendlyGitError(add.stderr) }
  const set = await runGitTimed(ctx, ['remote', 'set-url', 'origin', url], canonical, GIT_CRED_TIMEOUT_MS)
  if (set.exitCode !== 0) return { ok: false, error: friendlyGitError(set.stderr) }
  return { ok: true }
}

/**
 * 一键发布：建 GitHub 仓库 → 配远端 → 首推。
 * 仓库用插件令牌文件里的令牌调 GitHub API 创建（不需要 gh 命令行、不需要去网页建仓库）。
 */
async function githubPublish(ctx, canonical, payload) {
  let name = String(payload?.name ?? '').trim()
  if (name === '') return { ok: false, error: '请先填仓库名。' }
  if (!/^[A-Za-z0-9._-]+$/.test(name) || !/[A-Za-z0-9]/.test(name)) {
    return { ok: false, error: '仓库名要用英文字母或数字，只能用英文字母、数字、点、下划线和减号。' }
  }
  const isPrivate = payload?.private !== false
  const token = await githubTokenOf(ctx, canonical)
  if (token === '') {
    return { ok: false, error: '还没有登录 GitHub，先在上面的「登录 GitHub」里登录，再发布。' }
  }
  if (!(await githubReachable())) {
    return { ok: false, error: '现在连不上 GitHub（国内网络经常时好时坏）。有梯子的话打开它再试，或者稍等一会儿重试。' }
  }
  let created
  try {
    const response = await fetch('https://api.github.com/user/repos', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/vnd.github+json',
        authorization: 'Bearer ' + token,
        'user-agent': 'dsh-task-monitor',
      },
      body: JSON.stringify({ name, private: isPrivate }),
    })
    const body = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = String(body?.message || response.status)
      if (response.status === 422) return { ok: false, error: `GitHub 上已经有叫「${name}」的仓库了，换一个名字再试。` }
      if (response.status === 401 || response.status === 403 || response.status === 404) {
        return { ok: false, error: '这个登录没有「建仓库」的权限（GitHub 对无权限会回 Not Found）。请重新用令牌登录：点「打开令牌页面」生成经典令牌（页面已预设好），再粘回来。' }
      }
      return { ok: false, error: '在 GitHub 上建仓库失败：' + detail }
    }
    created = body
  } catch (error) {
    return { ok: false, error: '连接 GitHub 失败（国内网络时好时坏），稍等重试即可：' + String(error?.message ?? error) }
  }
  const cloneUrl = String(created?.clone_url || created?.html_url || '')
  if (cloneUrl === '') return { ok: false, error: 'GitHub 没返回仓库地址，请去网页确认后再重试。' }
  // 地址里带上账号名：推送时 git 就知道用哪个账号，不会弹「选择账号」窗口
  const account = String(created?.owner?.login || '')
  const remoteUrl = account === '' ? cloneUrl : cloneUrl.replace(/^https:\/\//, 'https://' + account + '@')

  const remote = await ensureRemoteUrl(ctx, canonical, remoteUrl)
  if (!remote.ok) {
    return { ok: false, error: '已经在 GitHub 建好了仓库，但把地址记到本地时失败：' + remote.error + `（仓库地址：${cloneUrl}）`, value: { url: String(created?.html_url || cloneUrl) } }
  }
  const push = await runGitTimed(ctx, await networkGitArgs(['push', '-u', 'origin', 'HEAD']), canonical, GIT_WRITE_TIMEOUT_MS)
  if (push.exitCode !== 0) {
    return { ok: false, error: '仓库建好了但推送失败：' + friendlyGitError(push.stderr), value: { url: String(created?.html_url || cloneUrl) } }
  }
  return { ok: true, value: { url: String(created?.html_url || cloneUrl), fullName: String(created?.full_name || (account ? account + '/' + name : name)) } }
}

// ── git 写操作（仅对话框触发）───────────────────────────────────────────────

function defaultCommitMessage(stats) {
  const count = stats?.files ?? 0
  return count > 0 ? `chore: 更新 ${count} 个文件` : 'chore: 更新工作区'
}

async function gitCommit(ctx, canonical, payload) {
  const message = typeof payload.message === 'string' && payload.message.trim() !== '' ? payload.message.trim() : null
  const includeUnstaged = payload.includeUnstaged === true
  if (includeUnstaged) {
    const add = await runGitTimed(ctx, ['add', '-A'], canonical, GIT_WRITE_TIMEOUT_MS)
    if (add.exitCode !== 0) return { ok: false, error: friendlyGitError(add.stderr) }
  }
  const stats = await commitStats(ctx, canonical)
  const finalMessage = message ?? defaultCommitMessage(stats)
  const commit = await runGitTimed(ctx, ['commit', '-m', finalMessage], canonical, GIT_WRITE_TIMEOUT_MS)
  if (commit.exitCode !== 0) return { ok: false, error: friendlyGitError(commit.stderr) }
  const head = await runGitTimed(ctx, ['rev-parse', '--short', 'HEAD'], canonical)
  return { ok: true, message: finalMessage, head: String(head.stdout || '').trim() }
}

/** 推送/联网时的认证与网络参数：插件令牌 + 探测到的本机代理（都不改用户全局配置）。 */
const COMMON_PROXY_PORTS = [7897, 7890, 7891, 10809, 10808, 1080, 8889]
let proxyCache = { port: null, checkedAt: 0 }

/** 探测本机常见的代理端口（Clash / V2Ray 等）。命中了就返回端口号。 */
async function detectLocalProxy() {
  const now = Date.now()
  if (proxyCache.checkedAt !== 0 && now - proxyCache.checkedAt < 60000) return proxyCache.port
  for (const port of COMMON_PROXY_PORTS) {
    const alive = await new Promise((resolve) => {
      const socket = connect({ host: '127.0.0.1', port }, () => { socket.destroy(); resolve(true) })
      socket.setTimeout(500)
      socket.on('error', () => { socket.destroy(); resolve(false) })
      socket.on('timeout', () => { socket.destroy(); resolve(false) })
    })
    if (alive) {
      proxyCache = { port, checkedAt: now }
      return port
    }
  }
  proxyCache = { port: null, checkedAt: now }
  return null
}

/** 网络类 git 命令的额外参数（插件令牌认证 + 探测到的本机代理），都不改用户全局配置。 */
async function networkGitArgs(extra) {
  const base = []
  const stored = await readStoredToken()
  if (stored !== null) base.push('-c', `credential.https://github.com.helper=store --file=${tokenStorePath()}`)
  const proxyPort = await detectLocalProxy()
  if (proxyPort !== null) base.push('-c', `http.proxy=http://127.0.0.1:${proxyPort}`)
  return base.concat(extra)
}

/** 推送失败的错误码：远端仓库不存在单独一类，界面据此弹出「重新发布」。 */
function pushFailureCode(stderr) {
  return /Repository not found|repository .* not found/i.test(String(stderr || '')) ? 'remote-not-found' : 'git-failed'
}

async function gitPush(ctx, canonical) {
  // 用户用「粘贴令牌」方式登录时，推送用插件令牌文件认证；没登录过则走系统默认凭据
  let result = await runGitTimed(ctx, await networkGitArgs(['push']), canonical, GIT_WRITE_TIMEOUT_MS)
  if (result.exitCode !== 0 && /has no upstream branch|no upstream/i.test(String(result.stderr || ''))) {
    result = await runGitTimed(ctx, await networkGitArgs(['push', '-u', 'origin', 'HEAD']), canonical, GIT_WRITE_TIMEOUT_MS)
  }
  if (result.exitCode !== 0) return { ok: false, error: friendlyGitError(result.stderr), code: pushFailureCode(result.stderr) }
  const head = await runGitTimed(ctx, ['rev-parse', '--short', 'HEAD'], canonical)
  const branch = await runGitTimed(ctx, ['rev-parse', '--abbrev-ref', 'HEAD'], canonical)
  return { ok: true, head: String(head.stdout || '').trim(), branch: String(branch.stdout || '').trim() }
}

async function gitSwitch(ctx, canonical, branch) {
  const result = await runGitTimed(ctx, ['switch', '--no-guess', branch], canonical, GIT_WRITE_TIMEOUT_MS)
  if (result.exitCode !== 0) return { ok: false, error: friendlyGitError(result.stderr) }
  return { ok: true, branch }
}

// ── 会话事件归类 ───────────────────────────────────────────────────────────

function str(value) {
  return typeof value === 'string' && value !== '' ? value : null
}

/**
 * 事件里 tool/call 的 arguments 是「JSON 字符串」而不是对象（实测：这样取 file_path/name 全为空）。
 * 对象形态也一并兼容。
 */
function parseArgs(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }
  return {}
}

function displayPathOf(absolute, workspace) {
  if (!absolute) return ''
  const normalized = String(absolute).replace(/\\/g, '/')
  if (!workspace) return normalized
  const root = String(workspace).replace(/\\/g, '/').replace(/\/+$/, '')
  const lowerRoot = root.toLowerCase()
  if (normalized.toLowerCase() === lowerRoot) return ''
  if (normalized.toLowerCase().startsWith(lowerRoot + '/')) return normalized.slice(root.length + 1)
  return normalized
}

function classifyEvents(events, workspace) {
  const calls = new Map()
  const failed = new Set()
  for (const event of events ?? []) {
    if (!event || typeof event !== 'object') continue
    if (event.type === 'tool/call') {
      const data = event.data ?? {}
      if (typeof data.callId === 'string' || typeof data.callId === 'number') {
        calls.set(String(data.callId), data)
      }
      continue
    }
    if (event.type === 'tool/result') {
      const message = event.data?.message
      if (message?.isError === true) {
        const callId = message.source?.callId
        if (typeof callId === 'string' || typeof callId === 'number') failed.add(String(callId))
      }
    }
  }

  const skills = new Map()
  const mcp = new Map()
  const artifacts = new Map()
  const fetched = new Map()
  const searched = []

  for (const [callId, data] of calls) {
    if (failed.has(callId)) continue
    const tool = str(data.name) ?? ''
    const args = parseArgs(data.arguments)
    if (tool === 'skill') {
      const skillName = str(args.name)
      if (skillName) skills.set(skillName, (skills.get(skillName) ?? 0) + 1)
      continue
    }
    if (tool.startsWith('mcp__')) {
      const parts = tool.split('__')
      const server = parts[1] || '未知服务'
      const toolName = parts.slice(2).join('__')
      const entry = mcp.get(server) ?? { server, count: 0, tools: new Set() }
      entry.count += 1
      if (toolName) entry.tools.add(toolName)
      mcp.set(server, entry)
      continue
    }
    if (tool === 'write') {
      const path = str(args.file_path)
      if (path) addArtifact(artifacts, path, 'write', workspace)
      continue
    }
    if (tool === 'edit') {
      const path = str(args.file_path)
      if (path) addArtifact(artifacts, path, 'edit', workspace)
      continue
    }
    if (tool === 'str_replace_editor') {
      const command = str(args.command)
      if (command === 'view' || command === null) continue
      const path = str(args.path) ?? str(args.file_path)
      if (path) addArtifact(artifacts, path, command === 'create' ? 'write' : 'edit', workspace)
      continue
    }
    if (tool === 'web_fetch') {
      const url = str(args.url)
      if (url) fetched.set(url, true)
      continue
    }
    if (tool === 'web_search') {
      const queries = Array.isArray(args.queries) ? args.queries : []
      for (const query of queries) {
        const text = str(query)?.trim()
        if (text && !searched.includes(text)) searched.push(text)
      }
    }
  }

  return {
    skills: [...skills.entries()].map(([skillName, count]) => ({ name: skillName, count })),
    mcp: [...mcp.values()].map((entry) => ({ server: entry.server, count: entry.count, tools: [...entry.tools] })),
    artifacts: [...artifacts.values()],
    web: { fetched: [...fetched.keys()].map((url) => ({ url })), searched: searched.map((query) => ({ query })) },
  }
}

function addArtifact(artifacts, path, kind, workspace) {
  if (artifacts.size >= MAX_ARTIFACTS && !artifacts.has(path)) return
  const existing = artifacts.get(path)
  if (existing) {
    if (kind === 'write') existing.kind = 'write'
    return
  }
  artifacts.set(path, { path, display: displayPathOf(path, workspace) || path, kind })
}

function extractEvents(read) {
  if (Array.isArray(read)) return { events: read, header: null }
  if (read && typeof read === 'object') {
    const events = Array.isArray(read.events) ? read.events : Array.isArray(read.log) ? read.log : Array.isArray(read.entries) ? read.entries : []
    // readSession 的返回里 header 就是 read.session 本身；兼容嵌一层 header 的形态。
    const header = read.header ?? read.session?.header ?? (read.session && typeof read.session === 'object' ? read.session : null)
    return { events, header }
  }
  return { events: [], header: null }
}

async function sessionData(ctx, sessionId) {
  let live = null
  try {
    live = ctx.sessions.get(sessionId) ?? null
  } catch {
    live = null
  }
  let cwd = live?.header?.cwd ?? live?.meta?.cwd ?? null

  let events = []
  let queryError = null
  try {
    const read = await ctx.sessionQuery.readSession(sessionId)
    const extracted = extractEvents(read)
    events = extracted.events
    if (!cwd && extracted.header?.cwd) cwd = extracted.header.cwd
  } catch (error) {
    queryError = String(error?.message ?? error)
  }
  if (events.length === 0 && live && typeof live.snapshotEvents === 'function') {
    try {
      events = live.snapshotEvents() ?? []
    } catch {
      /* 快照读失败保留空数组 */
    }
  }
  return { cwd, events, queryError }
}

// ── 打开系统浏览器 ─────────────────────────────────────────────────────────

function openExternal(ctx, url) {
  const platform = process.platform
  // Windows 走 cmd：URL 里的 & 会被 cmd 当命令分隔符截断（令牌页地址就带 &scopes=…），必须加双引号
  const argv =
    platform === 'win32'
      ? ['cmd', '/c', 'start', '""', '"' + String(url).replace(/"/g, '') + '"']
      : platform === 'darwin'
        ? ['open', url]
        : ['xdg-open', url]
  try {
    ctx.subprocess.spawn({
      argv,
      cwd: homedir(),
      stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
      graceMs: 2000,
    })
    return true
  } catch {
    return false
  }
}

// ── 路由 ──────────────────────────────────────────────────────────────────

export function apply(ctx) {
  const handler = async (req, res) => {
    if (!isLoopbackRequest(req)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: '只允许本机环回请求' } })
      return
    }
    if (req.method !== 'POST') {
      res.writeHead(405)
      res.end()
      return
    }
    const contentType = String(req.headers['content-type'] ?? '')
    if (!contentType.toLowerCase().startsWith('application/json')) {
      res.writeHead(415)
      res.end()
      return
    }
    const payload = await readJsonBody(req)
    if (payload === null || typeof payload !== 'object') {
      writeJson(res, 200, { ok: false, error: { code: 'bad-request', message: '请求体必须是 JSON 对象' } })
      return
    }
    const pathname = new URL(req.url ?? '/', 'http://x').pathname

    const fail = (code, message) => writeJson(res, 200, { ok: false, error: { code, message } })

    if (pathname === '/taskmonitor/data') {
      const sessionId = str(payload.sessionId)
      if (!sessionId) {
        fail('bad-request', '缺少 sessionId')
        return
      }
      try {
        const { cwd, events, queryError } = await sessionData(ctx, sessionId)
        const providedCwd = str(payload.cwd)
        const workspace = cwd ?? providedCwd ?? null
        const classified = classifyEvents(events, workspace)
        const environment = await environmentOf(ctx, workspace)
        if (environment.isRepo && environment.workspace) {
          try {
            environment.stats = await cachedStats(ctx, environment.workspace)
          } catch {
            environment.stats = null
          }
        }
        writeJson(res, 200, {
          ok: true,
          value: {
            environment,
            skills: classified.skills,
            mcp: classified.mcp,
            artifacts: classified.artifacts,
            web: classified.web,
            diagnostics: { events: events.length, sessionQueryError: queryError },
          },
        })
      } catch (error) {
        ctx.logger?.warn?.(`task-monitor: data failed for ${sessionId}: ${String(error)}`)
        fail('internal', String(error?.message ?? error))
      }
      return
    }

    if (pathname === '/taskmonitor/open-url') {
      const url = str(payload.url)
      let parsed = null
      try {
        parsed = url ? new URL(url) : null
      } catch {
        parsed = null
      }
      if (!parsed || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
        fail('bad-url', '只允许 http/https 链接')
        return
      }
      const opened = openExternal(ctx, parsed.href)
      writeJson(res, 200, opened ? { ok: true } : { ok: false, error: { code: 'spawn-failed', message: '无法唤起系统浏览器' } })
      return
    }

    if (pathname.startsWith('/taskmonitor/git/')) {
      const resolved = await resolveSessionWorkspace(ctx, str(payload.sessionId), str(payload.cwd))
      if (!resolved.ok) {
        fail('workspace-unknown', resolved.error)
        return
      }
      const canonical = resolved.canonical
      try {
        if (pathname === '/taskmonitor/git/info') {
          writeJson(res, 200, { ok: true, value: await gitInfo(ctx, canonical, { fast: payload.fast === true }) })
          return
        }
        if (pathname === '/taskmonitor/git/github-status') {
          const remote = await githubRemoteOf(ctx, canonical)
          const stored = await readStoredToken()
          writeJson(res, 200, { ok: true, value: { remote: remote.github, anyRemote: remote.any, url: remote.url, loggedIn: stored !== null, account: stored === null ? '' : stored.account } })
          return
        }
        if (pathname === '/taskmonitor/git/remote-alive') {
          writeJson(res, 200, { ok: true, value: await remoteAlive(ctx, canonical) })
          return
        }
        if (pathname === '/taskmonitor/git/github-logout') {
          const result = await githubLogout()
          writeJson(res, 200, result.ok ? { ok: true, value: {} } : { ok: false, error: { code: 'logout-failed', message: result.error } })
          return
        }
        if (pathname === '/taskmonitor/git/commit') {
          const result = await gitCommit(ctx, canonical, payload)
          writeJson(res, 200, result.ok ? { ok: true, value: { message: result.message, head: result.head } } : { ok: false, error: { code: 'git-failed', message: result.error } })
          return
        }
        if (pathname === '/taskmonitor/git/push') {
          const result = await gitPush(ctx, canonical)
          writeJson(res, 200, result.ok
            ? { ok: true, value: { head: result.head ?? '', branch: result.branch ?? '' } }
            : { ok: false, error: { code: result.code ?? 'git-failed', message: result.error } })
          return
        }
        if (pathname === '/taskmonitor/git/commit-push') {
          const commit = await gitCommit(ctx, canonical, payload)
          if (!commit.ok) {
            fail('git-failed', commit.error)
            return
          }
          const push = await gitPush(ctx, canonical)
          if (!push.ok) {
            writeJson(res, 200, { ok: false, error: { code: 'push-failed-after-commit', pushCode: push.code ?? 'git-failed', message: '提交成功，但推送失败：' + push.error }, value: { message: commit.message, head: commit.head } })
            return
          }
          writeJson(res, 200, { ok: true, value: { message: commit.message, head: commit.head, branch: push.branch ?? '' } })
          return
        }
        if (pathname === '/taskmonitor/git/switch') {
          const branch = str(payload.branch)
          if (!branch) {
            fail('bad-request', '缺少 branch')
            return
          }
          const result = await gitSwitch(ctx, canonical, branch)
          writeJson(res, 200, result.ok ? { ok: true, value: { branch: result.branch } } : { ok: false, error: { code: 'git-failed', message: result.error } })
          return
        }
        if (pathname === '/taskmonitor/git/github-login-token') {
          const result = await githubLoginWithToken(ctx, canonical, payload.token)
          writeJson(res, 200, result.ok ? { ok: true, value: { account: result.account ?? '' } } : { ok: false, error: { code: 'login-failed', message: result.error } })
          return
        }
        if (pathname === '/taskmonitor/git/github-import') {
          const result = await githubImportFromSystem(ctx, canonical)
          writeJson(res, 200, result.ok ? { ok: true, value: { account: result.account ?? '', already: result.already === true } } : { ok: false, error: { code: 'login-failed', message: result.error } })
          return
        }
        if (pathname === '/taskmonitor/git/github-publish') {
          const result = await githubPublish(ctx, canonical, payload)
          writeJson(res, 200, result.ok
            ? { ok: true, value: result.value }
            : { ok: false, error: { code: 'publish-failed', message: result.error }, value: result.value ?? null })
          return
        }
      } catch (error) {
        ctx.logger?.warn?.(`task-monitor: git route failed (${pathname}): ${String(error)}`)
        fail('internal', String(error?.message ?? error))
        return
      }
    }

    res.writeHead(404)
    res.end()
  }

  ctx.effect(() => {
    const dispose = ctx.webServer.register({ kind: 'prefix', path: '/taskmonitor', handler })
    return () => dispose()
  }, 'task-monitor: /taskmonitor routes')
}
