/**
 * 任务监控 · 界面半边（浏览器侧）。
 *
 * 独立浮层：挂在官方根级槽位 shell.overlay 上，占住窗口右侧（内容区头部之下），
 * 不是侧边栏标签页。显隐规则：会话已建立（不是 hero 草稿态）、右侧边栏收起、
 * 总开关打开时才显示；侧边栏一展开就自动隐藏。
 * 数据来源：环境信息与三张清单来自宿主半边 /taskmonitor/*；后台进程用官方
 * ctx.jobs 客户端名单（实时，与被监控会话同源）。git 写操作只在用户于
 * 「提交或推送」对话框里点击时触发。开关在 设置 → 通用。
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-task-monitor',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    let ReactDOM = null
    try {
      ReactDOM = require('react-dom')
    } catch {
      ReactDOM = null
    }

    const ID = '@local/dsh-task-monitor'
    const NS = 'taskMonitor'
    const DATA_ROUTE = '/taskmonitor/data'
    const OPEN_ROUTE = '/taskmonitor/open-url'
    const GIT_INFO_ROUTE = '/taskmonitor/git/info'
    const GIT_COMMIT_ROUTE = '/taskmonitor/git/commit'
    const GIT_PUSH_ROUTE = '/taskmonitor/git/push'
    const GIT_COMMIT_PUSH_ROUTE = '/taskmonitor/git/commit-push'
    const GIT_GITHUB_LOGIN_TOKEN_ROUTE = '/taskmonitor/git/github-login-token'
    const GIT_GITHUB_IMPORT_ROUTE = '/taskmonitor/git/github-import'
    const GIT_GITHUB_STATUS_ROUTE = '/taskmonitor/git/github-status'
    const GIT_REMOTE_ALIVE_ROUTE = '/taskmonitor/git/remote-alive'
    const GIT_GITHUB_LOGOUT_ROUTE = '/taskmonitor/git/github-logout'
    const GIT_GITHUB_PUBLISH_ROUTE = '/taskmonitor/git/github-publish'
    const GIT_SWITCH_ROUTE = '/taskmonitor/git/switch'
    const POLL_MS = 4000
    const STATE_POLL_MS = 350
    const VERSION = '0.8.0'
    const PANEL_ENABLED_KEY = 'dsh-task-monitor/panelEnabled'
    const SETTINGS_EVENT = 'dsh-task-monitor/setting-changed'
    const PANEL_WIDTH = 300
    const SLIDE = '.18s cubic-bezier(.2,0,0,1)'
    const MONO = 'ui-monospace, SFMono-Regular, Consolas, monospace'
    const DEFAULT_COLLAPSED = { environment: true, jobs: true, runtime: true, artifact: true, browser: true }

    const zh = {
      'type.label': '任务监控',
      'section.environment': '环境信息',
      'section.jobs': '后台进程',
      'section.runtime': '技能与 MCP',
      'section.artifact': '产出',
      'section.browser': '网页查阅',
      'environment.workspace': '工作区',
      'environment.branch': '分支',
      'environment.changes': '未提交变更',
      'environment.ahead': '未推送提交',
      'environment.noChanges': '无变更',
      'environment.noValue': '无',
      'environment.noRemote': '无远程',
      'environment.notRepo': '不是 git 仓库',
      'environment.count': '{count} 个',
      'empty.jobs': '暂无后台任务 :)',
      'empty.runtime': '暂无技能与 MCP 数据 :)',
      'empty.artifact': '暂无产出数据 :)',
      'empty.browser': '暂无网页查阅数据 :)',
      'empty.environment': '读不到环境信息',
      'loading': '正在读取…',
      'error': '任务监控暂时无法读取',
      'retry': '重试',
      'refresh': '刷新',
      'openFailed': '打开失败：{message}',
      'mcp.detail': 'MCP · {count} 次',
      'skill.detail': '技能 · {count} 次',
      'kind.write': '新建/写入',
      'kind.edit': '修改',
      'web.searchTag': '搜索',
      'web.fetchTag': '网页',
      'jobs.running': '运行中',
      'jobs.stopping': '停止中',
      'jobs.completed': '已完成',
      'jobs.failed': '失败',
      'jobs.killed': '已停止',
      'commit.open': '提交或推送',
      'commit.title': '提交或推送',
      'commit.description': '提交 {repo} 中的变更。',
      'commit.branch': '分支',
      'commit.detached': '分离的 HEAD',
      'commit.messagePlaceholder': '输入提交说明（留空则自动生成）…',
      'commit.includeUnstaged': '包含未暂存变更',
      'commit.working': '正在执行…',
      'commit.action': '提交',
      'commit.andPush': '提交并推送',
      'commit.push': '推送',
      'commit.commitDone': '提交成功',
      'commit.pushDone': '推送成功',
      'commit.pushDoneHead': '推送成功（{branch} 分支 · {head}）',
      'commit.commitPushDone': '提交并推送成功',
      'commit.sync.ok': '本地与远端已同步',
      'commit.sync.ahead': '本地有 {count} 个提交还没推上去',
      'commit.sync.behind': '远端有 {count} 个提交还没拉下来',
      'commit.sync.diverged': '本地与远端各有未同步的提交（领先 {ahead} / 落后 {behind}）',
      'commit.sync.remoteMissing': '远端仓库已不存在（可能在 GitHub 上被删除），这里的同步状态是本地旧记录，不算数',
      'commit.sync.noUpstream': '远端还没有这个分支',
      'commit.switchDone': '已切换到 {branch}',
      'commit.needPublish': '还没有远端仓库，请先发布到 GitHub',
      'commit.loading': '正在读取仓库信息…',
      'commit.loadFailed': '读不到仓库信息',
      'commit.close': '关闭',
      'commit.github.loggedIn': 'GitHub：已登录',
      'commit.github.loggedInAs': 'GitHub：已登录（{account}）',
      'commit.github.logout': '换账号 / 退出登录',
      'commit.github.notLoggedIn': 'GitHub：还没有登录。按下面两步登一次，以后就不用管了',
      'commit.github.checking': 'GitHub：正在检查登录状态…',
      'commit.github.unknown': 'GitHub：登录状态没查到（网络可能不通）',
      'commit.github.register': '还没有账号？去注册',
      'commit.github.loginFailed': '登录没完成',
      'commit.github.tokenTitle': '两步登录 GitHub',
      'commit.github.tokenStep1': '1. 打开下面这个页面（建仓库/推送需要的权限已自动勾好），滚到最底点绿色按钮生成令牌',
      'commit.github.tokenOpen': '打开令牌页面',
      'commit.github.tokenStep2': '2. 复制页面上的令牌（ghp_ 开头的一串），粘到下面框里',
      'commit.github.tokenPlaceholder': '在这里粘贴令牌…',
      'commit.github.tokenSubmit': '验证并登录',
      'commit.github.tokenWorking': '正在验证…',
      'commit.github.tokenDone': '已登录 GitHub（账号：{account}）',
      'commit.github.import': '我电脑上登录过 GitHub，自动导入',
      'commit.github.importing': '正在导入…',
      'commit.publish.none': '这个仓库还没有远端仓库。可以一键发布到 GitHub：',
      'commit.publish.republish': '远端仓库已不存在（可能在 GitHub 上被删除）。重新发布会新建一个仓库，并把本地远端改指向新地址（可以换个仓库名）：',
      'commit.publish.name': '仓库名',
      'commit.publish.visibility': '可见性',
      'commit.publish.private': '私有（只有自己可见）',
      'commit.publish.public': '公开（开源，所有人可见）',
      'commit.publish.button': '发布到 GitHub',
      'commit.publish.buttonPrivate': '发布到 GitHub（私有）',
      'commit.publish.buttonPublic': '发布到 GitHub（公开）',
      'commit.publish.working': '正在创建并推送…',
      'commit.publish.done': '已发布：{url}',
      'commit.publish.view': '在浏览器打开',
      'settings.panel.title': '任务监控面板',
      'settings.panel.description': '侧边栏收起时，在窗口右侧显示任务监控；新会话建立后出现。',
      'toggle.hide': '隐藏任务监控面板',
      'toggle.show': '显示任务监控面板',
    }
    const en = {
      'type.label': 'Task Monitor',
      'section.environment': 'Environment',
      'section.jobs': 'Background Jobs',
      'section.runtime': 'Skills & MCP',
      'section.artifact': 'Artifacts',
      'section.browser': 'Web Pages',
      'environment.workspace': 'Workspace',
      'environment.branch': 'Branch',
      'environment.changes': 'Uncommitted changes',
      'environment.ahead': 'Unpushed commits',
      'environment.noChanges': 'No changes',
      'environment.noValue': 'None',
      'environment.noRemote': 'No remote',
      'environment.notRepo': 'Not a git repository',
      'environment.count': '{count}',
      'empty.jobs': 'No background jobs yet :)',
      'empty.runtime': 'No skills or MCP used yet :)',
      'empty.artifact': 'No artifacts yet :)',
      'empty.browser': 'No web pages yet :)',
      'empty.environment': 'Environment unavailable',
      'loading': 'Loading…',
      'error': 'Task monitor is temporarily unavailable',
      'retry': 'Retry',
      'refresh': 'Refresh',
      'openFailed': 'Open failed: {message}',
      'mcp.detail': 'MCP · {count}x',
      'skill.detail': 'Skill · {count}x',
      'kind.write': 'written',
      'kind.edit': 'edited',
      'web.searchTag': 'search',
      'web.fetchTag': 'page',
      'jobs.running': 'running',
      'jobs.stopping': 'stopping',
      'jobs.completed': 'done',
      'jobs.failed': 'failed',
      'jobs.killed': 'stopped',
      'commit.open': 'Commit or Push',
      'commit.title': 'Commit or Push',
      'commit.description': 'Commit the changes in {repo}.',
      'commit.branch': 'Branch',
      'commit.detached': 'Detached HEAD',
      'commit.messagePlaceholder': 'Commit message (auto-generated when empty)…',
      'commit.includeUnstaged': 'Include unstaged changes',
      'commit.working': 'Working…',
      'commit.action': 'Commit',
      'commit.andPush': 'Commit & Push',
      'commit.push': 'Push',
      'commit.commitDone': 'Commit succeeded',
      'commit.pushDone': 'Push succeeded',
      'commit.pushDoneHead': 'Push succeeded ({branch} · {head})',
      'commit.commitPushDone': 'Commit & push succeeded',
      'commit.sync.ok': 'Local and remote are in sync',
      'commit.sync.ahead': '{count} local commit(s) not pushed yet',
      'commit.sync.behind': '{count} remote commit(s) not pulled yet',
      'commit.sync.diverged': 'Local and remote have diverged (ahead {ahead} / behind {behind})',
      'commit.sync.remoteMissing': 'The remote repository no longer exists (probably deleted on GitHub); the sync state shown is stale local info',
      'commit.sync.noUpstream': 'Remote has no such branch yet',
      'commit.switchDone': 'Switched to {branch}',
      'commit.needPublish': 'No remote yet — publish to GitHub first',
      'commit.loading': 'Loading repository…',
      'commit.loadFailed': 'Cannot read the repository',
      'commit.close': 'Close',
      'commit.github.loggedIn': 'GitHub: signed in',
      'commit.github.notLoggedIn': 'GitHub: not signed in yet. Two quick steps below, once only',
      'commit.github.checking': 'GitHub: checking sign-in state…',
      'commit.github.unknown': 'GitHub: sign-in state unavailable (network may be blocked)',
      'commit.github.register': 'No account yet? Register',
      'commit.github.loginFailed': 'Sign-in not completed',
      'commit.github.loggedInAs': 'GitHub: signed in ({account})',
      'commit.github.logout': 'Switch account / sign out',
      'commit.github.tokenTitle': 'Sign in to GitHub in two steps',
      'commit.github.tokenStep1': '1. Open the page below (permissions pre-filled). Scroll to the bottom and click the green button',
      'commit.github.tokenOpen': 'Open token page',
      'commit.github.tokenStep2': '2. Copy the token (ghp_…) and paste it below',
      'commit.github.tokenPlaceholder': 'Paste token here…',
      'commit.github.tokenSubmit': 'Verify and sign in',
      'commit.github.tokenWorking': 'Verifying…',
      'commit.github.tokenDone': 'Signed in to GitHub (account: {account})',
      'commit.github.import': 'I signed in on this PC before — import it',
      'commit.github.importing': 'Importing…',
      'commit.publish.none': 'This repo has no remote yet. Publish it to GitHub in one click:',
      'commit.publish.republish': 'The remote repository is gone (probably deleted on GitHub). Republishing creates a new repo and re-points the local remote at it (you may pick a new name):',
      'commit.publish.name': 'Repository name',
      'commit.publish.visibility': 'Visibility',
      'commit.publish.private': 'Private (only you)',
      'commit.publish.public': 'Public (open source)',
      'commit.publish.button': 'Publish to GitHub',
      'commit.publish.buttonPrivate': 'Publish to GitHub (private)',
      'commit.publish.buttonPublic': 'Publish to GitHub (public)',
      'commit.publish.working': 'Creating and pushing…',
      'commit.publish.done': 'Published: {url}',
      'commit.publish.view': 'Open in browser',
      'settings.panel.title': 'Task Monitor panel',
      'settings.panel.description': 'Show the Task Monitor on the right while the sidebar is collapsed; it appears once a session exists.',
      'toggle.hide': 'Hide Task Monitor',
      'toggle.show': 'Show Task Monitor',
    }

    // ── 文件地址（语法对齐官方 @deepseek-ai/dsh-util-workspace-path）────────
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':')
    }
    function sessionFileAddress(sessionId, path) {
      const normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      const encoded = normalized.split('/').map(encodeSegment).join('/')
      return 'dsh-resource://file/session/' + encodeSegment(String(sessionId)) + '/' + encoded
    }

    // ── 总开关（localStorage 持久化）───────────────────────────────────────
    function getPanelEnabled() {
      try {
        const raw = window.localStorage.getItem(PANEL_ENABLED_KEY)
        return raw === null ? true : raw === '1'
      } catch {
        return true
      }
    }
    function setPanelEnabled(value) {
      try {
        window.localStorage.setItem(PANEL_ENABLED_KEY, value ? '1' : '0')
      } catch {
        /* 存不了就只影响本次会话 */
      }
      try {
        window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: { enabled: value } }))
      } catch {
        /* 事件派发失败不影响开关本身 */
      }
    }

    // ── 主题色 ─────────────────────────────────────────────────────────────
    const C = {
      primary: 'var(--dsw-alias-label-primary, #e6edf3)',
      secondary: 'var(--dsw-alias-label-secondary, #8b949e)',
      tertiary: 'var(--dsw-alias-label-tertiary, #6e7681)',
      quaternary: 'var(--dsw-alias-label-quaternary, #57606a)',
      link: 'var(--dsw-alias-link, #409eff)',
      hover: 'var(--dsw-alias-interactive-bg-hover, rgba(127,127,127,0.12))',
      rowBg: 'var(--dsw-alias-bg-layer-1, rgba(127,127,127,0.04))',
      border: 'var(--dsw-alias-border-l2, rgba(127,127,127,0.18))',
      warn: 'var(--dsw-alias-state-warn-primary, #d29922)',
      error: 'var(--dsw-alias-state-error-primary, #f85149)',
      success: 'var(--dsw-alias-state-success-primary, #3fb950)',
      info: 'var(--dsw-alias-link, #409eff)',
      infoBg: 'var(--dsw-alias-interactive-bg-hover-accent, rgba(64,158,255,0.14))',
      cardBg: 'var(--dsw-alias-bg-layer-3, #ffffff)',
      primaryFill: 'var(--dsw-alias-button-primary-fill, #2f6f4f)',
      primaryFillHover: 'var(--dsw-alias-button-primary-hover, #3a8560)',
      onPrimary: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
      switchOff: 'var(--dsw-alias-fill-l2, rgba(127,127,127,0.28))',
      panelBg: 'var(--dsw-alias-bg-base, #ffffff)',
      divider: 'var(--dsw-alias-border-l3, rgba(127,127,127,0.24))',
    }

    // ── 图标（16 视窗、描边跟随 currentColor）──────────────────────────────
    function icon(paths) {
      return function Icon(props) {
        return h(
          'svg',
          Object.assign(
            {
              viewBox: '0 0 16 16',
              width: 14,
              height: 14,
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.3,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
              'aria-hidden': true,
              style: { flex: '0 0 auto' },
            },
            props,
          ),
          paths.map((d, index) => h('path', { key: index, d })),
        )
      }
    }
    const IconChevron = icon(['M6 3.5 10.5 8 6 12.5'])
    const IconFolder = icon(['M2 4.5A1.5 1.5 0 0 1 3.5 3h2.2l1.2 1.5h5.6A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5z'])
    const IconBranch = icon(['M4.5 5v6', 'M4.5 5a1.5 1.5 0 1 0 0-.01', 'M11.5 5.5a1.5 1.5 0 1 0 0-.01', 'M11.5 7v.5A2.5 2.5 0 0 1 9 10H6a1.5 1.5 0 0 0-1.5 1.5'])
    const IconChanges = icon(['M2.5 13.5v-9', 'M6 13.5v-6', 'M9.5 13.5V4', 'M13 13.5V7'])
    const IconPushed = icon(['M8 12.5V4', 'M4.5 7.5 8 4l3.5 3.5'])
    const IconCommit = icon(['M2 8h4', 'M10 8h4', 'M8 6.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z'])
    const IconTerminal = icon(['M3 3.5h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z', 'M4.5 6.5 6.5 8l-2 1.5', 'M8 10h3.5'])
    const IconHammer = icon(['M9.5 2.5 6.8 5.2a1.4 1.4 0 0 0 0 2l2 2a1.4 1.4 0 0 0 2 0l2.7-2.7', 'M7.4 8.6 3 13', 'M11.5 2.5l2 2'])
    const IconPlug = icon(['M6 2.5v3', 'M10 2.5v3', 'M4.5 5.5h7v2a3.5 3.5 0 0 1-7 0z', 'M8 11v2.5'])
    const IconFile = icon(['M4 2.5h5l3 3V13a.5.5 0 0 1-.5.5h-7A.5.5 0 0 1 4 13z', 'M9 2.5V6h3'])
    const IconGlobe = icon(['M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z', 'M2.5 8h11', 'M8 2c1.8 1.6 2.7 3.6 2.7 6S9.8 12.4 8 14C6.2 12.4 5.3 10.4 5.3 8S6.2 3.6 8 2z'])
    const IconSearch = icon(['M7 2.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z', 'M10.4 10.4 13.5 13.5'])
    const IconRefresh = icon(['M13 8a5 5 0 1 1-1.6-3.7', 'M13 2.5V5h-2.5'])
    const IconClose = icon(['M4 4l8 8', 'M12 4l-8 8'])

    /**
     * 任务清单图标（空框 + 对勾 + 右侧三条横线）。
     * 线条规格对齐官方图标：viewBox 16、1px 描边、直角线帽（与 DSH 自带图标同族画风）。
     */
    function IconChecklist(props) {
      return h(
        'svg',
        Object.assign(
          {
            viewBox: '0 0 16 16',
            width: 16,
            height: 16,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1,
            'aria-hidden': true,
            style: { flex: '0 0 auto', display: 'block' },
          },
          props,
        ),
        h('rect', { key: 0, x: 2.25, y: 2.75, width: 3.5, height: 3.5, rx: 1.1 }),
        h('path', { key: 1, d: 'M7.75 4.5H13.75' }),
        h('path', { key: 2, d: 'M2.5 10.9 4.4 12.8 6.6 9.6' }),
        h('path', { key: 3, d: 'M7.75 8.7H13.75' }),
        h('path', { key: 4, d: 'M7.75 12.8H13.75' }),
      )
    }

    // ── 小工具 ─────────────────────────────────────────────────────────────
    let spinStyleReady = false
    function ensureSpinStyle() {
      if (spinStyleReady || typeof document === 'undefined') return
      spinStyleReady = true
      const tag = document.createElement('style')
      tag.dataset.plugin = ID
      tag.textContent = '@keyframes dsh-tm-spin{to{transform:rotate(360deg)}}'
      document.head.appendChild(tag)
    }

    /** 网站自己的小图标：直接取该站 /favicon.ico，取不到退回地球图标。 */
    function Favicon(props) {
      const { url, ...rest } = props
      const [failed, setFailed] = React.useState(false)
      const host = React.useMemo(() => {
        try {
          return new URL(String(url)).hostname
        } catch {
          return ''
        }
      }, [url])
      const size = rest.width || 14
      if (failed || !host) {
        return h(IconGlobe, Object.assign({}, rest, { width: size, height: size, style: Object.assign({}, rest.style, { color: rest.style && rest.style.color ? rest.style.color : 'inherit' }) }))
      }
      return h(
        'img',
        Object.assign({}, rest, {
          src: 'https://' + host + '/favicon.ico',
          width: size,
          height: size,
          alt: '',
          loading: 'lazy',
          referrerPolicy: 'no-referrer',
          onError: () => setFailed(true),
          style: { display: 'block', borderRadius: 3, objectFit: 'contain' },
        }),
      )
    }

    function Spinner(props) {
      ensureSpinStyle()
      const size = props.size || 12
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: size,
          height: size,
          'aria-hidden': true,
          style: { flex: '0 0 auto', animation: 'dsh-tm-spin 1s linear infinite', color: props.color || 'inherit' },
        },
        h('path', { d: 'M8 2.5a5.5 5.5 0 1 1-5.4 6.4', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' }),
      )
    }

    function postJson(route, body) {
      return fetch(route, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        cache: 'no-store',
      }).then((response) => response.json())
    }

    /** 用系统默认浏览器打开外链（宿主侧只放行 http/https）。 */
    function postOpenUrl(url) {
      return postJson(OPEN_ROUTE, { url }).then((body) => {
        if (!body || body.ok !== true) throw new Error((body && body.error && body.error.message) || '打开失败')
        return body
      })
    }

    /** 给一个 promise 加超时（超时抛错，调用方自行兜底）。 */
    function withTimeout(promise, ms) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout')), ms)
        promise.then(
          (value) => { clearTimeout(timer); resolve(value) },
          (error) => { clearTimeout(timer); reject(error) },
        )
      })
    }

    function formatNumber(value) {
      try {
        return Number(value).toLocaleString('zh-CN')
      } catch {
        return String(value)
      }
    }

    function repoNameOf(workspace) {
      const parts = String(workspace || '').split(/[\\/]/).filter(Boolean)
      return parts.length > 0 ? parts[parts.length - 1] : '工作区'
    }

    /** 把仓库名收拾成 GitHub 允许的字符（中文等换成减号，首尾去符号）。 */
    function sanitizeRepoName(text) {
      const cleaned = String(text || '')
        .replace(/[^A-Za-z0-9._-]+/g, '-')
        .replace(/^[-._]+|[-._]+$/g, '')
      return cleaned || 'my-repo'
    }

    function toArray(value) {
      if (Array.isArray(value)) return value
      if (value && typeof value === 'object') return Object.values(value)
      return []
    }

    function hexToRgba(hex, alpha) {
      const value = String(hex).replace('#', '')
      const full = value.length === 3 ? value.split('').map((c) => c + c).join('') : value
      const int = parseInt(full, 16)
      if (Number.isNaN(int)) return 'rgba(127,127,127,0.14)'
      const r = (int >> 16) & 255
      const g = (int >> 8) & 255
      const b = int & 255
      return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
    }

    /** 产出文件的类型徽标：命中后缀给彩色角标，否则用通用文件图标。 */
    const FILE_TYPES = [
      [/\.md$/i, 'MD', '#409eff'],
      [/\.(json|jsonc)$/i, 'JSON', '#d29922'],
      [/\.(js|mjs|cjs)$/i, 'JS', '#c9a227'],
      [/\.(ts|tsx)$/i, 'TS', '#3178c6'],
      [/\.py$/i, 'PY', '#3572a5'],
      [/\.(html|htm)$/i, 'HTML', '#e34c26'],
      [/\.css$/i, 'CSS', '#8250df'],
      [/\.(svg|png|jpe?g|gif|webp)$/i, 'IMG', '#3fb950'],
      [/\.(yml|yaml)$/i, 'YML', '#e34c26'],
      [/\.(txt|log)$/i, 'TXT', '#8b949e'],
    ]
    function fileBadgeOf(path) {
      const text = String(path || '')
      for (const [pattern, label, color] of FILE_TYPES) {
        if (pattern.test(text)) return { badge: label, color }
      }
      return null
    }

    function useEmptySelector() {
      return null
    }

    function isLiveJob(job) {
      return job.status === 'running' || job.status === 'stopping'
    }

    function normalizeJobs(value) {
      const rows = toArray(value).filter((job) => job && typeof job === 'object')
      const live = rows.filter(isLiveJob).sort((a, b) => (a.startedAt || 0) - (b.startedAt || 0))
      const settled = rows.filter((job) => !isLiveJob(job)).sort((a, b) => (b.finishedAt || b.startedAt || 0) - (a.finishedAt || a.startedAt || 0))
      return live.concat(settled)
    }

    // ── 数据拉取 ───────────────────────────────────────────────────────────
    function useMonitorData(sessionId, visible) {
      const [state, setState] = React.useState({ phase: 'loading', data: null, error: null })
      const abortRef = React.useRef(null)
      const load = React.useCallback(() => {
        if (!sessionId) {
          setState({ phase: 'error', data: null, error: 'no session' })
          return
        }
        if (abortRef.current) abortRef.current.abort()
        const controller = typeof AbortController === 'function' ? new AbortController() : null
        abortRef.current = controller
        fetch(DATA_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ sessionId }),
          cache: 'no-store',
          signal: controller ? controller.signal : undefined,
        })
          .then((response) => response.json())
          .then((body) => {
            if (!body || body.ok !== true) throw new Error(body?.error?.message || '读取失败')
            setState({ phase: 'ready', data: body.value, error: null })
          })
          .catch((error) => {
            if (controller && controller.signal.aborted) return
            setState((previous) => ({ phase: 'error', data: previous.data, error: String(error?.message || error) }))
          })
      }, [sessionId])
      React.useEffect(() => {
        load()
      }, [load])
      React.useEffect(() => {
        if (!visible) return undefined
        const timer = setInterval(load, POLL_MS)
        const wake = () => {
          if (document.visibilityState === 'visible') load()
        }
        document.addEventListener('visibilitychange', wake)
        window.addEventListener('focus', wake)
        return () => {
          clearInterval(timer)
          document.removeEventListener('visibilitychange', wake)
          window.removeEventListener('focus', wake)
        }
      }, [load, visible])
      React.useEffect(
        () => () => {
          if (abortRef.current) abortRef.current.abort()
        },
        [],
      )
      return Object.assign({}, state, { reload: load })
    }

    // ── 浮层显隐与留白 ─────────────────────────────────────────────────────
    /** 会话根元素（带 data-phase 的祖先）：hero=草稿态，active=已建立的会话。 */
    function findConversationRoot() {
      try {
        const corner = document.querySelector('[data-conversation-header-corner]')
        return corner ? corner.closest('[data-phase]') : null
      } catch {
        return null
      }
    }

    function readPhase() {
      const root = findConversationRoot()
      return root ? root.getAttribute('data-phase') : null
    }

    /**
     * 面板显示时给会话根元素加右边距——正文像打开侧边栏一样整体左移，不被浮层遮住。
     * 轮询兜底：会话切换 / 重挂载后自动补上；卸载时还原。
     */
    function useConversationView() {
      const [phase, setPhase] = React.useState(readPhase)
      const reserveRef = React.useRef(false)
      const apply = React.useCallback(() => {
        const root = findConversationRoot()
        setPhase((previous) => {
          const next = root ? root.getAttribute('data-phase') : null
          return previous === next ? previous : next
        })
        if (!root) return
        const margin = reserveRef.current ? PANEL_WIDTH + 'px' : '0px'
        if (root.style.marginRight === margin) return
        if (!root.style.transition) root.style.transition = 'margin-right ' + SLIDE
        root.style.marginRight = margin
      }, [])
      React.useEffect(() => {
        const timer = setInterval(apply, 300)
        window.addEventListener('resize', apply)
        apply()
        return () => {
          clearInterval(timer)
          window.removeEventListener('resize', apply)
          const root = findConversationRoot()
          if (root) {
            root.style.marginRight = ''
            root.style.transition = ''
          }
        }
      }, [apply])
      const reserve = React.useCallback(
        (next) => {
          const value = next === true
          if (reserveRef.current === value) return
          reserveRef.current = value
          apply()
        },
        [apply],
      )
      return { phase, reserve }
    }

    /** 右侧边栏是否展开：订阅会话 store 即时响应，轮询兜底。 */
    function useSidebarExpanded(sidebarRight) {
      const [expanded, setExpanded] = React.useState(false)
      React.useEffect(() => {
        let unsubscribe = null
        let boundStore = null
        const read = () => {
          try {
            setExpanded((previous) => {
              const next = sidebarRight.isExpanded() === true
              return previous === next ? previous : next
            })
          } catch {
            setExpanded(false)
          }
          try {
            const sessionId = sidebarRight.mounted.getSnapshot()
            const adopted = sidebarRight.adopted
            const store =
              sessionId !== undefined && adopted && typeof adopted.get === 'function'
                ? adopted.get(sessionId)?.store
                : null
            if (store !== boundStore) {
              if (unsubscribe) unsubscribe()
              boundStore = store
              unsubscribe = store && typeof store.subscribe === 'function' ? store.subscribe(read) : null
            }
          } catch {
            /* 内部字段不可用时靠轮询兜底 */
          }
        }
        const offMounted = sidebarRight.mounted.subscribe(read)
        const timer = setInterval(read, STATE_POLL_MS)
        read()
        return () => {
          offMounted()
          if (unsubscribe) unsubscribe()
          clearInterval(timer)
        }
      }, [sidebarRight])
      return expanded
    }

    function useSyncExternalStoreSafe(subscribe, getSnapshot) {
      if (typeof React.useSyncExternalStore === 'function') {
        return React.useSyncExternalStore(subscribe, getSnapshot)
      }
      const [value, setValue] = React.useState(getSnapshot)
      React.useEffect(() => subscribe(() => setValue(getSnapshot())), [subscribe, getSnapshot])
      return value
    }

    // ── 基础组件 ───────────────────────────────────────────────────────────
    function Section(props) {
      const { title, badge, expanded, onToggle } = props
      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        h(
          'button',
          {
            type: 'button',
            onClick: onToggle,
            'aria-expanded': expanded,
            style: {
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              width: '100%',
              padding: '3px 4px',
              border: 'none',
              borderRadius: 8,
              background: 'transparent',
              color: C.primary,
              fontSize: 13,
              lineHeight: '20px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
            },
          },
          h('span', { style: { minWidth: 0 } }, title),
          h(IconChevron, {
            width: 12,
            height: 12,
            style: { flex: '0 0 auto', transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .12s ease', color: C.tertiary },
          }),
          h('span', { style: { flex: 1 } }),
          badge
            ? h(
                'span',
                {
                  style: {
                    flex: '0 0 auto',
                    fontSize: 11,
                    lineHeight: '18px',
                    padding: '0 8px',
                    borderRadius: 999,
                    color: C.info,
                    background: C.infoBg,
                  },
                },
                badge,
              )
            : null,
        ),
        expanded ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, props.children) : null,
      )
    }

    /** 行内图标块（圆角方块；有 badge 时显示彩色后缀角标，否则放图标）。 */
    function rowTile(leading) {
      const color = leading.color || C.secondary
      const tile = {
        width: 26,
        height: 26,
        flex: '0 0 auto',
        borderRadius: 8,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: leading.badge ? hexToRgba(color, 0.14) : 'var(--dsw-alias-fill-l2, rgba(127,127,127,0.10))',
      }
      if (leading.badge) {
        return h('span', { style: tile }, h('span', { style: { fontSize: 9, fontWeight: 700, letterSpacing: '0.02em', color } }, leading.badge))
      }
      const iconProps = Object.assign({ width: 14, height: 14, style: { color } }, leading.iconProps)
      return h('span', { style: tile }, h(leading.icon, iconProps))
    }

    function Row(props) {
      const { leading, text, title, onClick, trailing, tone, mono, nowrap } = props
      const interactive = typeof onClick === 'function'
      const base = {
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        minHeight: 40,
        boxSizing: 'border-box',
        padding: '6px 10px 6px 6px',
        border: '1px solid ' + C.border,
        borderRadius: 10,
        color: tone || C.primary,
        fontSize: 12.5,
        lineHeight: '17px',
        fontFamily: mono ? MONO : undefined,
        textAlign: 'left',
      }
      const common = {
        title: title || undefined,
        onClick: interactive ? onClick : undefined,
        style: Object.assign({}, base, { background: C.rowBg, cursor: interactive ? 'pointer' : 'default' }),
      }
      const textStyle = nowrap
        ? { flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
        : { flex: 1, minWidth: 0, wordBreak: 'break-all' }
      const content = [
        leading ? h('span', { key: 'tile', style: { display: 'inline-flex', flex: '0 0 auto' } }, rowTile(leading)) : null,
        h('span', { key: 'text', style: textStyle }, text),
        trailing
          ? h(
              'span',
              { key: 'trailing', style: { flex: '0 0 auto', fontSize: 11, color: C.tertiary, display: 'inline-flex', alignItems: 'center', gap: 4 } },
              trailing,
            )
          : null,
      ]
      if (!interactive) return h('div', common, content)
      return h(
        'button',
        Object.assign({}, common, {
          type: 'button',
          onMouseEnter: (event) => {
            event.currentTarget.style.background = C.hover
          },
          onMouseLeave: (event) => {
            event.currentTarget.style.background = C.rowBg
          },
        }),
        content,
      )
    }

    function EmptyLine(props) {
      return h('div', { style: { padding: '2px 6px', fontSize: 12, lineHeight: '16px', color: C.quaternary } }, props.text)
    }

    function Button(props) {
      const { variant, busy, disabled, onClick, children, title } = props
      const base = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: 30,
        padding: '0 14px',
        border: 'none',
        borderRadius: 8,
        fontSize: 13,
        lineHeight: '18px',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        whiteSpace: 'nowrap',
      }
      const variants = {
        primary: { background: C.primaryFill, color: C.onPrimary },
        soft: { background: C.hover, color: C.primary },
        ghost: { background: 'transparent', color: C.secondary },
      }
      return h(
        'button',
        Object.assign({ type: 'button', title: title || undefined, disabled: disabled === true, onClick }, base, variants[variant] || variants.soft),
        busy ? props.busyLabel : children,
      )
    }

    function Switch(props) {
      const { checked, onChange, disabled } = props
      return h(
        'button',
        {
          type: 'button',
          role: 'switch',
          'aria-checked': checked === true,
          disabled: disabled === true,
          onClick: () => {
            if (!disabled) onChange(!checked)
          },
          style: {
            position: 'relative',
            flex: '0 0 auto',
            width: 36,
            height: 20,
            padding: 0,
            border: 'none',
            borderRadius: 999,
            background: checked ? C.primaryFill : C.switchOff,
            cursor: disabled ? 'default' : 'pointer',
            transition: 'background .15s ease',
            opacity: disabled ? 0.55 : 1,
          },
        },
        h('span', {
          style: {
            position: 'absolute',
            top: 2,
            left: checked ? 18 : 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: '#ffffff',
            boxShadow: '0 1px 2px rgba(0,0,0,0.28)',
            transition: 'left .15s ease',
          },
        }),
      )
    }

    // ── 浮层（portal 到 body；DSH 面板内浮层会被父容器裁剪）─────────────────
    function Overlay(props) {
      const container = React.useMemo(() => document.createElement('div'), [])
      React.useEffect(
        () => {
          document.body.appendChild(container)
          return () => {
            document.body.removeChild(container)
          }
        },
        [container],
      )
      React.useEffect(() => {
        const onKey = (event) => {
          if (event.key === 'Escape') props.onEscape()
        }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [props])
      if (!ReactDOM || typeof ReactDOM.createPortal !== 'function') return null
      return ReactDOM.createPortal(props.children, container)
    }

    // ── 设置行：任务监控总开关（设置 → 通用）──────────────────────────────
    function PanelEnabledRow(props) {
      const t = props.t
      const [on, setOn] = React.useState(getPanelEnabled)
      React.useEffect(() => {
        const onChange = () => setOn(getPanelEnabled())
        window.addEventListener(SETTINGS_EVENT, onChange)
        return () => window.removeEventListener(SETTINGS_EVENT, onChange)
      }, [])
      return h(
        'div',
        { style: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 0', borderBottom: '1px solid ' + C.border } },
        h(
          'div',
          { style: { flex: 1, minWidth: 0 } },
          h('div', { style: { fontSize: 14, lineHeight: '22px', color: C.primary } }, t('settings.panel.title')),
          h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.secondary, marginTop: 2 } }, t('settings.panel.description')),
        ),
        h(Switch, {
          checked: on,
          onChange: (next) => {
            setOn(next)
            setPanelEnabled(next)
          },
        }),
      )
    }

    // ── 顶部按钮：快速隐藏/显示任务监控（会话头部右上角）──────────────────
    function PanelToggle(props) {
      const t = props.t
      const [on, setOn] = React.useState(getPanelEnabled)
      const [hover, setHover] = React.useState(false)
      React.useEffect(() => {
        const onChange = () => setOn(getPanelEnabled())
        window.addEventListener(SETTINGS_EVENT, onChange)
        return () => window.removeEventListener(SETTINGS_EVENT, onChange)
      }, [])
      const label = on ? t('toggle.hide') : t('toggle.show')
      return h(
        'button',
        {
          type: 'button',
          title: label,
          'aria-label': label,
          'aria-pressed': on,
          onClick: () => setPanelEnabled(!on),
          onMouseEnter: () => setHover(true),
          onMouseLeave: () => setHover(false),
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            border: 'none',
            borderRadius: 999,
            background: hover ? C.hover : 'transparent',
            color: on ? C.primary : C.tertiary,
            cursor: 'pointer',
            flex: '0 0 auto',
          },
        },
        h(IconChecklist),
      )
    }

    // ── 提交对话框 ─────────────────────────────────────────────────────────
    function CommitDialog(props) {
      const { t, sessionId, workspace, onClose, onDone } = props
      const [info, setInfo] = React.useState({ phase: 'loading', data: null, error: null })
      const [message, setMessage] = React.useState('')
      const [includeUnstaged, setIncludeUnstaged] = React.useState(true)
      const [busy, setBusy] = React.useState(null)
      const [result, setResult] = React.useState(null)
      // 远端仓库是否还真实存在：仓库在 GitHub 被删后本地仍留着旧上游，同步状态会撒谎
      const [remoteState, setRemoteState] = React.useState({ phase: 'idle', state: 'unknown', url: '' })

      const checkRemoteAlive = React.useCallback(() => {
        withTimeout(postJson(GIT_REMOTE_ALIVE_ROUTE, { sessionId }), 10000)
          .then((body) => {
            const value = body && body.ok === true ? body.value : null
            setRemoteState({ phase: 'ready', state: value ? value.state : 'unknown', url: value && value.url ? value.url : '' })
          })
          .catch(() => setRemoteState((previous) => Object.assign({}, previous, { phase: 'ready', state: 'unknown' })))
      }, [sessionId])

      const loadInfo = React.useCallback(() => {
        setInfo((previous) => Object.assign({}, previous, { phase: previous.data ? previous.phase : 'loading' }))
        postJson(GIT_INFO_ROUTE, { sessionId, fast: true })
          .then((body) => {
            if (!body || body.ok !== true) throw new Error(body?.error?.message || t('commit.loadFailed'))
            setInfo({ phase: 'ready', data: body.value, error: null })
          })
          .catch((error) => setInfo({ phase: 'error', data: null, error: String((error && error.message) || error) }))
        // GitHub 状态（只读本地令牌文件，正常毫秒级）单独查：慢或不通都不拖住对话框出现
        withTimeout(postJson(GIT_GITHUB_STATUS_ROUTE, { sessionId }), 3000)
          .then((body) => {
            if (body && body.ok === true) setGithub({ phase: 'ready', data: body.value, error: null })
            else setGithub({ phase: 'unknown', data: null, error: (body && body.error ? body.error.message : null) || t('commit.github.unknown') })
          })
          .catch(() => setGithub({ phase: 'unknown', data: null, error: t('commit.github.unknown') }))
      }, [sessionId, t])

      React.useEffect(() => {
        loadInfo()
        checkRemoteAlive()
      }, [loadInfo, checkRemoteAlive])

      const [github, setGithub] = React.useState({ phase: 'loading', data: null, error: null })
      const [token, setToken] = React.useState({ value: '', phase: 'idle', error: null, doneAccount: '' })
      const [publish, setPublish] = React.useState({ phase: 'idle', error: null, url: null, name: null, isPrivate: true })

      const githubImport = () => {
        if (token.phase === 'working') return
        setToken((previous) => Object.assign({}, previous, { phase: 'working', error: null }))
        withTimeout(postJson(GIT_GITHUB_IMPORT_ROUTE, { sessionId }), 30000)
          .then((body) => {
            if (body && body.ok === true) {
              const account = String((body.value && body.value.account) || '')
              setToken({ value: '', phase: 'idle', error: null, doneAccount: account === '' ? '已登录' : account })
              loadInfo()
              return
            }
            setToken((previous) => Object.assign({}, previous, { phase: 'idle', error: (body && body.error ? body.error.message : null) || t('commit.github.loginFailed') }))
          })
          .catch(() => setToken((previous) => Object.assign({}, previous, { phase: 'idle', error: t('commit.github.loginFailed') })))
      }

      const githubLoginToken = () => {
        const value = token.value.trim()
        if (token.phase === 'working' || value === '') return
        setToken((previous) => Object.assign({}, previous, { phase: 'working', error: null }))
        withTimeout(postJson(GIT_GITHUB_LOGIN_TOKEN_ROUTE, { sessionId, token: value }), 30000)
          .then((body) => {
            if (body && body.ok === true) {
              const account = String((body.value && body.value.account) || '')
              setToken({ value: '', phase: 'idle', error: null, doneAccount: account })
              loadInfo()
              return
            }
            setToken((previous) => Object.assign({}, previous, { phase: 'idle', error: (body && body.error ? body.error.message : null) || t('commit.github.loginFailed') }))
          })
          .catch(() => setToken((previous) => Object.assign({}, previous, { phase: 'idle', error: t('commit.github.loginFailed') })))
      }

      const githubLogout = () => {
        if (token.phase === 'working') return
        setToken((previous) => Object.assign({}, previous, { phase: 'working', error: null, doneAccount: '' }))
        withTimeout(postJson(GIT_GITHUB_LOGOUT_ROUTE, { sessionId }), 10000)
          .then(() => {
            setToken({ value: '', phase: 'idle', error: null, doneAccount: '' })
            setGithub({ phase: 'loading', data: null, error: null })
            loadInfo()
          })
          .catch((error) => setToken((previous) => Object.assign({}, previous, { phase: 'idle', error: String((error && error.message) || error) })))
      }

      const githubPublish = () => {
        if (busy || publish.phase === 'working') return
        // 仓库名原样交给宿主校验（中文等不合法名字要明报错误，不能静默替换成别的名字）
        const name = String(publish.name !== null ? publish.name : defaultPublishName).trim()
        setPublish((previous) => Object.assign({}, previous, { phase: 'working', error: null, name }))
        // 发布期间锁住对话框（关按钮/Esc/遮罩点击都禁），避免中途关掉把结果弄丢
        setBusy('publish')
        postJson(GIT_GITHUB_PUBLISH_ROUTE, { sessionId, name, private: publish.isPrivate })
          .then((body) => {
            if (body && body.ok === true) {
              setPublish((previous) => Object.assign({}, previous, { phase: 'done', error: null, url: body.value ? body.value.url : null }))
              loadInfo()
              checkRemoteAlive()
              return
            }
            const url = body && body.value && body.value.url ? body.value.url : null
            setPublish((previous) => Object.assign({}, previous, { phase: 'idle', error: (body && body.error ? body.error.message : null) || t('error'), url }))
          })
          .catch((error) => setPublish((previous) => Object.assign({}, previous, { phase: 'idle', error: String((error && error.message) || error) })))
          .then(() => setBusy(null))
      }

      /** 结果留在对话框里显示（不自动关闭）；成功后刷新同步状态。 */
      const showResult = (text, tone) => {
        setResult({ text, tone })
        loadInfo()
      }

      const run = (kind, route) => {
        if (busy) return
        setBusy(kind)
        setResult(null)
        postJson(route, { sessionId, message, includeUnstaged })
          .then((body) => {
            if (body && body.ok === true) {
              const value = body.value || {}
              if (kind !== 'commit') setRemoteState((previous) => Object.assign({}, previous, { phase: 'ready', state: 'alive' }))
              if (kind === 'commit') {
                showResult(t('commit.commitDone') + (value.head ? '（' + value.head + '）' : ''), 'success')
              } else if (kind === 'push') {
                showResult(value.head
                  ? t('commit.pushDoneHead', { branch: value.branch || currentBranch || '', head: value.head })
                  : t('commit.pushDone'), 'success')
              } else {
                showResult(t('commit.commitPushDone') + (value.head ? '（' + value.head + '）' : ''), 'success')
              }
              return
            }
            const text = body && body.error ? body.error.message : t('error')
            const code = body && body.error ? body.error.code : ''
            const pushCode = body && body.error ? body.error.pushCode : ''
            if (code === 'remote-not-found' || pushCode === 'remote-not-found') {
              setRemoteState((previous) => Object.assign({}, previous, { phase: 'ready', state: 'missing' }))
            }
            if (code === 'push-failed-after-commit') {
              showResult(text, 'warn')
              return
            }
            showResult(text, 'error')
          })
          .catch((error) => showResult(String((error && error.message) || error), 'error'))
          .then(() => setBusy(null))
      }

      const switchBranch = (branch) => {
        if (busy || !branch) return
        setBusy('switch')
        setResult(null)
        postJson(GIT_SWITCH_ROUTE, { sessionId, branch })
          .then((body) => {
            if (body && body.ok === true) {
              showResult(t('commit.switchDone', { branch }), 'success')
              return
            }
            showResult(body && body.error ? body.error.message : t('error'), 'error')
          })
          .catch((error) => showResult(String((error && error.message) || error), 'error'))
          .then(() => setBusy(null))
      }

      const env = info.data ? info.data.environment : null
      const branches = info.data ? info.data.branches : []
      const stats = info.data ? info.data.stats : null
      const currentBranch = env && env.isRepo ? env.branch : null
      const statusData = github.phase === 'ready' ? github.data : null
      const githubEnabled = !!(statusData && statusData.remote === true)
      const hasAnyRemote = !!(statusData && statusData.anyRemote === true)
      const loggedIn = !!(statusData && statusData.loggedIn === true) || token.doneAccount !== ''
      const statusChecking = github.phase === 'loading' && token.doneAccount === ''
      const statusUnknown = github.phase === 'unknown' && token.doneAccount === ''
      const remoteMissing = remoteState.state === 'missing' && /github\.com/i.test(remoteState.url || (statusData && statusData.url) || '')
      // 确知「没有任何远端」：推送类按钮禁用并指引去发布（状态没查回来时不禁用，免得网络抖动误伤）
      const noRemoteAtAll = !!(info.data && info.phase === 'ready' && github.phase === 'ready' && !hasAnyRemote)
      // 发布区仓库名默认值：有 GitHub 远端地址时取地址里的仓库名（重发布时就是旧仓库名），否则取文件夹名
      const defaultPublishName = (() => {
        const url = remoteState.url || (statusData && statusData.url) || ''
        const match = String(url).match(/github\.com[/:][^/]+\/([^/]+?)(?:\.git)?\/?$/)
        return match ? match[1] : sanitizeRepoName(repoNameOf(workspace))
      })()
      // 没有远端 → 可一键发布；远端仓库已不存在 → 可重新发布（换名字也行）；有 GitHub 远端 → 显示登录状态；有其它远端（如 Gitee）→ 不显示 GitHub 区块
      const canPublish = !!(info.data && info.phase === 'ready' && github.phase === 'ready' && (!hasAnyRemote || remoteMissing))
      // 状态还没回来时也先占位显示（不能让用户觉得「没有登录这回事」）
      const showGithub = !!(info.data && info.phase === 'ready' && (githubEnabled || canPublish || statusChecking))

      const label = { fontSize: 12, lineHeight: '18px', color: C.secondary }
      const field = {
        width: '100%',
        boxSizing: 'border-box',
        border: '1px solid ' + C.border,
        borderRadius: 8,
        background: 'transparent',
        color: C.primary,
        fontSize: 13,
        padding: '6px 10px',
        outline: 'none',
      }
      const linkButton = { flex: '0 0 auto', height: 26, padding: '0 10px', borderRadius: 6, border: 'none', background: 'transparent', color: C.tertiary, fontSize: 12, cursor: 'pointer' }
      const openPublished = () => { if (publish.url) postOpenUrl(publish.url).catch(() => {}) }

      const tokenSection = h(            'div',
            { style: { display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid ' + C.border, borderRadius: 8, padding: '8px 10px' } },
            h('div', { style: { fontSize: 12, lineHeight: '18px', fontWeight: 600, color: C.primary } }, t('commit.github.tokenTitle')),
            h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.secondary } }, t('commit.github.tokenStep1')),
            h(
              'button',
              {
                type: 'button',
                onClick: () => {
                  postOpenUrl('https://github.com/settings/tokens/new?type=classic&scopes=repo&description=DSH%20Task%20Monitor').catch(() => {})
                },
                style: { alignSelf: 'flex-start', height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid ' + C.border, background: 'transparent', color: C.primary, fontSize: 12, cursor: 'pointer' },
              },
              t('commit.github.tokenOpen'),
            ),
            h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.secondary } }, t('commit.github.tokenStep2')),
            h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8 } },
              h('input', {
                type: 'password',
                value: token.value,
                placeholder: t('commit.github.tokenPlaceholder'),
                disabled: token.phase === 'working',
                onChange: (event) => setToken((previous) => Object.assign({}, previous, { value: event.target.value })),
                style: Object.assign({}, field, { flex: 1, minWidth: 0, height: 30, fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace' }),
              }),
              h(
                'button',
                {
                  type: 'button',
                  disabled: token.phase === 'working' || token.value.trim() === '',
                  onClick: githubLoginToken,
                  style: { flex: '0 0 auto', height: 30, padding: '0 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.primary, fontSize: 12, cursor: 'pointer', opacity: token.phase === 'working' || token.value.trim() === '' ? 0.55 : 1 },
                },
                token.phase === 'working' ? t('commit.github.tokenWorking') : t('commit.github.tokenSubmit'),
              ),
            ),
            token.error
              ? h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.error, wordBreak: 'break-all' } }, token.error)
              : null,
          )

      /** 同步状态行：本地和远端差多少（有 upstream 才显示）；未知值当 0 处理。远端仓库已删除时改说真话。 */
      const syncRow = (() => {
        if (!env || !env.isRepo || !env.upstream) return null
        if (remoteMissing) {
          return h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.error } }, '✗ ' + t('commit.sync.remoteMissing'))
        }
        const ahead = Number.isFinite(env.ahead) ? env.ahead : 0
        const behind = Number.isFinite(env.behind) ? env.behind : 0
        if (ahead === 0 && behind === 0) {
          return h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.success } }, '✓ ' + t('commit.sync.ok'))
        }
        if (ahead > 0 && behind === 0) {
          return h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.warn } }, t('commit.sync.ahead', { count: ahead }))
        }
        if (behind > 0 && ahead === 0) {
          return h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.warn } }, t('commit.sync.behind', { count: behind }))
        }
        return h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.warn } }, t('commit.sync.diverged', { ahead, behind }))
      })()

      const githubStatusRow = !showGithub
        ? null
        : statusChecking
          ? h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.tertiary } }, t('commit.github.checking'))
          : loggedIn
            ? h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
                h(
                  'span',
                  { style: { fontSize: 12, lineHeight: '18px', color: C.success } },
                  (() => {
                    const account = (statusData && statusData.account) || token.doneAccount || ''
                    return account === '' || account === '已登录' ? t('commit.github.loggedIn') : t('commit.github.loggedInAs', { account })
                  })(),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    disabled: token.phase === 'working',
                    onClick: githubLogout,
                    style: { flex: '0 0 auto', height: 24, padding: '0 8px', borderRadius: 6, border: 'none', background: 'transparent', color: C.tertiary, fontSize: 12, cursor: 'pointer', textDecoration: 'underline', opacity: token.phase === 'working' ? 0.55 : 1 },
                  },
                  t('commit.github.logout'),
                ),
              )
            : h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                h('div', { style: { fontSize: 12, lineHeight: '18px', color: statusUnknown ? C.warn : C.secondary } }, statusUnknown ? t('commit.github.unknown') : t('commit.github.notLoggedIn')),
                h(
                  'button',
                  {
                    type: 'button',
                    disabled: token.phase === 'working',
                    onClick: githubImport,
                    style: { alignSelf: 'flex-start', height: 28, padding: '0 12px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.primary, fontSize: 12, cursor: 'pointer', opacity: token.phase === 'working' ? 0.55 : 1 },
                  },
                  token.phase === 'working' ? t('commit.github.importing') : t('commit.github.import'),
                ),
                tokenSection,
                h(
                  'button',
                  {
                    type: 'button',
                    onClick: () => { postOpenUrl('https://github.com/signup').catch(() => {}) },
                    style: { alignSelf: 'flex-start', border: 'none', background: 'transparent', color: C.tertiary, fontSize: 12, cursor: 'pointer', padding: 0 },
                  },
                  t('commit.github.register'),
                ),
              )

      const publishSection = !canPublish
        ? null
        : publish.phase === 'done'
          ? h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              h(
                'div',
                { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('span', { style: { flex: 1, minWidth: 0, fontSize: 12, lineHeight: '18px', color: C.success, wordBreak: 'break-all' } }, t('commit.publish.done', { url: publish.url || '' })),
                publish.url ? h('button', { type: 'button', onClick: openPublished, style: linkButton }, t('commit.publish.view')) : null,
              ),
            )
          : h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
              h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.secondary } }, remoteMissing ? t('commit.publish.republish') : t('commit.publish.none')),
              h(
                'div',
                { style: { display: 'flex', alignItems: 'flex-end', gap: 8 } },
                h(
                  'div',
                  { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 } },
                  h('span', { style: { fontSize: 12, color: C.tertiary } }, t('commit.publish.name')),
                  h('input', {
                    type: 'text',
                    value: publish.name !== null ? publish.name : defaultPublishName,
                    disabled: publish.phase === 'working' || busy !== null,
                    onChange: (event) => setPublish((previous) => Object.assign({}, previous, { name: event.target.value })),
                    style: Object.assign({}, field, { height: 30, fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace' }),
                  }),
                ),
              ),
              h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                h('span', { style: { fontSize: 12, color: C.tertiary } }, t('commit.publish.visibility')),
                h(
                  'div',
                  { style: { display: 'flex', gap: 8 } },
                  [
                    { key: 'private', label: t('commit.publish.private') },
                    { key: 'public', label: t('commit.publish.public') },
                  ].map((option) => {
                    const active = (option.key === 'private') === (publish.isPrivate === true)
                    return h(
                      'button',
                      {
                        key: option.key,
                        type: 'button',
                        'aria-pressed': active,
                        disabled: publish.phase === 'working' || busy !== null,
                        onClick: () => setPublish((previous) => Object.assign({}, previous, { isPrivate: option.key === 'private' })),
                        style: {
                          height: 28,
                          padding: '0 12px',
                          borderRadius: 8,
                          border: '1px solid ' + (active ? C.primaryFill : C.border),
                          background: active ? C.primaryFill : 'transparent',
                          color: active ? C.onPrimary : C.secondary,
                          fontSize: 12,
                          cursor: 'pointer',
                          opacity: publish.phase === 'working' || busy !== null ? 0.55 : 1,
                        },
                      },
                      option.label,
                    )
                  }),
                ),
              ),
              publish.error
                ? h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.error, wordBreak: 'break-all' } }, publish.error)
                : null,
              publish.url
                ? h(
                    'button',
                    {
                      type: 'button',
                      onClick: openPublished,
                      style: { alignSelf: 'flex-start', height: 24, padding: '0 8px', borderRadius: 6, border: 'none', background: 'transparent', color: C.tertiary, fontSize: 12, cursor: 'pointer', textDecoration: 'underline' },
                    },
                    t('commit.publish.view') + '：' + publish.url,
                  )
                : null,
              h(
                'button',
                {
                  type: 'button',
                  disabled: publish.phase === 'working' || busy !== null,
                  onClick: githubPublish,
                  style: { alignSelf: 'flex-start', height: 30, padding: '0 14px', borderRadius: 8, border: '1px solid ' + C.border, background: 'transparent', color: C.primary, fontSize: 13, cursor: 'pointer', opacity: publish.phase === 'working' || busy !== null ? 0.55 : 1 },
                },
                publish.phase === 'working'
                  ? t('commit.publish.working')
                  : publish.isPrivate
                    ? t('commit.publish.buttonPrivate')
                    : t('commit.publish.buttonPublic'),
              ),
            )

      const githubBlock = showGithub
        ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } }, githubStatusRow, publishSection)
        : null

      const card = h(
        'div',
        {
          onClick: (event) => event.stopPropagation(),
          style: {
            width: 460,
            maxWidth: '92vw',
            boxSizing: 'border-box',
            borderRadius: 12,
            border: '1px solid ' + C.border,
            background: C.cardBg,
            boxShadow: '0 12px 40px rgba(0,0,0,0.26)',
            color: C.primary,
            padding: '16px 18px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'flex-start', gap: 8 } },
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            h('div', { style: { fontSize: 14, fontWeight: 600, lineHeight: '20px' } }, t('commit.title')),
            h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.secondary, marginTop: 2 } },
              info.phase === 'loading' ? t('commit.loading') : t('commit.description', { repo: repoNameOf(workspace) })),
          ),
          h(
            'button',
            {
              type: 'button',
              title: t('commit.close'),
              'aria-label': t('commit.close'),
              disabled: busy !== null,
              onClick: onClose,
              style: { flex: '0 0 auto', width: 24, height: 24, border: 'none', borderRadius: 6, background: 'transparent', color: C.tertiary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: busy ? 0.55 : 1 },
            },
            h(IconClose, { width: 12, height: 12 }),
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h('span', { style: label }, t('commit.branch')),
          h(
            'div',
            { style: { display: 'flex', alignItems: 'center', gap: 8, border: '1px solid ' + C.border, borderRadius: 8, padding: '0 10px', height: 34 } },
            h(IconBranch, { style: { color: C.secondary } }),
            h(
              'select',
              {
                value: currentBranch || '',
                disabled: busy !== null || !env || !env.isRepo,
                onChange: (event) => switchBranch(event.target.value),
                style: { flex: 1, minWidth: 0, height: 32, border: 'none', background: 'transparent', color: C.primary, fontSize: 13, outline: 'none', cursor: 'pointer' },
              },
              env && env.detached
                ? [h('option', { key: 'detached', value: currentBranch || '' }, t('commit.detached'))]
                : branches.map((name) => h('option', { key: name, value: name }, name)),
            ),
          ),
        ),
        h(
          'div',
          { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          h('textarea', {
            value: message,
            rows: 3,
            placeholder: t('commit.messagePlaceholder'),
            disabled: busy !== null,
            onChange: (event) => setMessage(event.target.value),
            style: Object.assign({}, field, { resize: 'vertical', fontFamily: 'inherit', lineHeight: '19px' }),
          }),
        ),
        h(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: includeUnstaged,
            disabled: busy !== null,
            onChange: (event) => setIncludeUnstaged(event.target.checked),
            style: { width: 15, height: 15, accentColor: C.primaryFill },
          }),
          h('span', { style: { flex: 1, minWidth: 0 } }, t('commit.includeUnstaged')),
          stats
            ? h(
                'span',
                { style: { flex: '0 0 auto', fontSize: 12, fontFamily: 'ui-monospace, Consolas, monospace' } },
                h('span', { style: { color: C.success } }, '+' + formatNumber(stats.added)),
                ' ',
                h('span', { style: { color: C.error } }, '-' + formatNumber(stats.deleted)),
              )
            : null,
        ),
        result
          ? h(
              'div',
              { style: { fontSize: 12, lineHeight: '18px', wordBreak: 'break-all', color: result.tone === 'success' ? C.success : result.tone === 'warn' ? C.warn : C.error } },
              result.text,
            )
          : null,
        syncRow,
        info.phase === 'error'
          ? h('div', { style: { fontSize: 12, lineHeight: '18px', color: C.error, wordBreak: 'break-all' } }, info.error || t('commit.loadFailed'))
          : null,
        githubBlock,
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' } },
          h(Button, { variant: 'ghost', busy: busy === 'push', busyLabel: t('commit.working'), disabled: busy !== null || noRemoteAtAll, title: noRemoteAtAll ? t('commit.needPublish') : undefined, onClick: () => run('push', GIT_PUSH_ROUTE) }, t('commit.push')),
          h(Button, { variant: 'soft', busy: busy === 'commit-push', busyLabel: t('commit.working'), disabled: busy !== null || noRemoteAtAll, title: noRemoteAtAll ? t('commit.needPublish') : undefined, onClick: () => run('commit-push', GIT_COMMIT_PUSH_ROUTE) }, t('commit.andPush')),
          h(Button, { variant: 'primary', busy: busy === 'commit', busyLabel: t('commit.working'), disabled: busy !== null, onClick: () => run('commit', GIT_COMMIT_ROUTE) }, t('commit.action')),
        ),
      )

      return h(
        Overlay,
        { onEscape: () => { if (busy === null) onClose() } },
        h(
          'div',
          {
            onClick: () => {
              if (busy === null) onClose()
            },
            style: { position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.34)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
          },
          card,
        ),
      )
    }

    // ── 面板主体 ───────────────────────────────────────────────────────────
    function PanelBody(props) {
      const t = props.t
      const sessionId = props.sessionId
      const visible = props.visible !== false
      const state = useMonitorData(sessionId, visible)
      const [collapsed, setCollapsed] = React.useState(DEFAULT_COLLAPSED)
      const [notice, setNotice] = React.useState(null)
      const [dialogOpen, setDialogOpen] = React.useState(false)

      const useJobsFn = typeof props.useJobs === 'function' ? props.useJobs : useEmptySelector
      const jobRowsRaw = useJobsFn((jobsState) => (jobsState && jobsState.rows ? jobsState.rows[sessionId] : null))
      React.useEffect(() => {
        if (typeof props.watchRows !== 'function') return undefined
        try {
          return props.watchRows(sessionId)
        } catch {
          return undefined
        }
      }, [sessionId, props.watchRows])
      const jobs = React.useMemo(() => normalizeJobs(jobRowsRaw), [jobRowsRaw])

      React.useEffect(() => {
        if (!notice) return undefined
        const timer = setTimeout(() => setNotice(null), 4000)
        return () => clearTimeout(timer)
      }, [notice])

      const toggle = (key) =>
        setCollapsed((previous) => Object.assign({}, previous, { [key]: !previous[key] }))

      const data = state.data
      const environment = data && data.environment ? data.environment : null
      const skills = (data && data.skills) || []
      const mcp = (data && data.mcp) || []
      const artifacts = (data && data.artifacts) || []
      const web = (data && data.web) || { fetched: [], searched: [] }

      // 折叠策略：默认全折叠；某个区块「有变更」时只自动展开该区块
      const sectionSignatures = {
        environment: environment
          ? [environment.isRepo, environment.branch, environment.changes, environment.ahead, environment.error, environment.stats ? environment.stats.added + '/' + environment.stats.deleted : ''].join('|')
          : 'none',
        jobs: jobs.map((job) => job.id + ':' + job.status).join(','),
        runtime: skills.map((skill) => skill.name + ':' + skill.count).join(',') + '#' + mcp.map((server) => server.server + ':' + server.count).join(','),
        artifact: artifacts.map((artifact) => artifact.path).join(','),
        browser: web.fetched.map((item) => item.url).join(',') + '#' + web.searched.map((item) => item.query).join(','),
      }
      const hasContent = {
        environment: environment !== null,
        jobs: jobs.length > 0,
        runtime: skills.length + mcp.length > 0,
        artifact: artifacts.length > 0,
        browser: web.fetched.length + web.searched.length > 0,
      }
      const signaturesRef = React.useRef(null)
      const hasContentRef = React.useRef(hasContent)
      hasContentRef.current = hasContent
      const signatureLine = JSON.stringify(sectionSignatures)
      React.useEffect(() => {
        const previous = signaturesRef.current
        signaturesRef.current = sectionSignatures
        if (previous === null) return
        const content = hasContentRef.current
        setCollapsed((current) => {
          let next = null
          for (const key of Object.keys(sectionSignatures)) {
            // 后台进程不参与自动展开：进程状态频繁变化，自动弹开会一直打扰
            if (key === 'jobs') continue
            if (previous[key] !== sectionSignatures[key] && content[key] === true && current[key] !== false) {
              next = next || Object.assign({}, current)
              next[key] = false
            }
          }
          return next || current
        })
      }, [signatureLine])

      const openFile = (artifact) => {
        try {
          const address = sessionFileAddress(sessionId, artifact.path)
          const open = props.openResource
          if (typeof open === 'function') {
            open(address)
          } else {
            setNotice(t('openFailed', { message: '当前没有可用的打开入口' }))
          }
        } catch (error) {
          setNotice(t('openFailed', { message: String((error && error.message) || error) }))
        }
      }

      const openUrl = (url) => {
        postJson(OPEN_ROUTE, { url })
          .then((body) => {
            if (!body || body.ok !== true) throw new Error((body && body.error && body.error.message) || '打开失败')
          })
          .catch((error) => setNotice(t('openFailed', { message: String((error && error.message) || error) })))
      }

      const envRows = []
      if (environment) {
        const stats = environment.stats
        if (environment.isRepo && stats) {
          envRows.push(
            h(Row, {
              key: 'stats',
              leading: { icon: IconChanges },
              text:
                environment.changes === 0
                  ? h('span', { style: { color: C.tertiary } }, t('environment.noChanges'))
                  : h(
                      React.Fragment,
                      null,
                      h('span', { style: { color: C.success } }, '+' + formatNumber(stats.added)),
                      '  ',
                      h('span', { style: { color: C.error } }, '-' + formatNumber(stats.deleted)),
                    ),
              title: stats.truncated ? t('environment.changes') + '（统计已截断）' : undefined,
            }),
          )
        }
        if (environment.workspace) {
          envRows.push(
            h(Row, { key: 'workspace', leading: { icon: IconFolder }, text: environment.workspace, title: environment.workspace, mono: true }),
          )
        }
        if (environment.isRepo) {
          envRows.push(h(Row, { key: 'branch', leading: { icon: IconBranch }, text: environment.branch || '—' }))
          envRows.push(
            h(Row, {
              key: 'ahead',
              leading: { icon: IconPushed },
              text:
                environment.ahead === null || environment.ahead === undefined
                  ? t('environment.noRemote')
                  : environment.ahead === 0
                    ? t('environment.noValue')
                    : t('environment.count', { count: environment.ahead }),
              trailing: t('environment.ahead'),
            }),
          )
          envRows.push(
            h(Row, {
              key: 'commit',
              leading: { icon: IconCommit },
              text: t('commit.open'),
              onClick: () => setDialogOpen(true),
            }),
          )
        } else {
          envRows.push(h(EmptyLine, { key: 'notrepo', text: environment.error || t('environment.notRepo') }))
        }
      } else {
        envRows.push(
          h(EmptyLine, { key: 'env-empty', text: state.phase === 'loading' ? t('loading') : t('empty.environment') }),
        )
      }

      const jobList = []
      for (const job of jobs) {
        const status = job.status
        let trailing = null
        if (status === 'running' || status === 'stopping') {
          trailing = h(
            'span',
            { style: { display: 'inline-flex', alignItems: 'center', gap: 4, color: C.info } },
            h(Spinner, { size: 11 }),
            status === 'running' ? t('jobs.running') : t('jobs.stopping'),
          )
        } else if (status === 'completed') {
          trailing = h('span', { style: { color: C.secondary } }, '✓ ' + t('jobs.completed'))
        } else if (status === 'failed') {
          trailing = h('span', { style: { color: C.error } }, '✗ ' + t('jobs.failed'))
        } else {
          trailing = h('span', { style: { color: C.tertiary } }, t('jobs.killed'))
        }
        jobList.push(
          h(Row, {
            key: 'job:' + job.id,
            leading: { icon: IconTerminal },
            text: job.label || job.id,
            title: job.label ? job.label + (job.detail ? ' — ' + job.detail : '') : job.id,
            mono: true,
            nowrap: true,
            trailing,
          }),
        )
      }
      if (jobList.length === 0) jobList.push(h(EmptyLine, { key: 'jobs-empty', text: t('empty.jobs') }))

      const runtimeRows = []
      for (const skill of skills) {
        runtimeRows.push(
          h(Row, {
            key: 'skill:' + skill.name,
            leading: { icon: IconHammer },
            text: skill.name,
            title: skill.name,
            trailing: t('skill.detail', { count: skill.count }),
          }),
        )
      }
      for (const server of mcp) {
        runtimeRows.push(
          h(Row, {
            key: 'mcp:' + server.server,
            leading: { icon: IconPlug },
            text: server.server,
            title: server.tools && server.tools.length ? server.tools.join(', ') : server.server,
            trailing: t('mcp.detail', { count: server.count }),
          }),
        )
      }
      if (runtimeRows.length === 0) runtimeRows.push(h(EmptyLine, { key: 'rt-empty', text: t('empty.runtime') }))

      const artifactRows = []
      for (const artifact of artifacts) {
        const fileBadge = fileBadgeOf(artifact.path)
        artifactRows.push(
          h(Row, {
            key: 'artifact:' + artifact.path,
            leading: fileBadge ? { badge: fileBadge.badge, color: fileBadge.color } : { icon: IconFile },
            text: artifact.display || artifact.path,
            title: artifact.path,
            mono: true,
            onClick: () => openFile(artifact),
            trailing: artifact.kind === 'write' ? t('kind.write') : t('kind.edit'),
          }),
        )
      }
      if (artifactRows.length === 0) artifactRows.push(h(EmptyLine, { key: 'art-empty', text: t('empty.artifact') }))

      const webRows = []
      for (const item of web.fetched) {
        webRows.push(
          h(Row, {
            key: 'fetch:' + item.url,
            leading: { icon: Favicon, iconProps: { url: item.url }, tone: C.link },
            text: item.url,
            title: item.url,
            tone: C.link,
            nowrap: true,
            onClick: () => openUrl(item.url),
            trailing: t('web.fetchTag'),
          }),
        )
      }
      for (const item of web.searched) {
        webRows.push(
          h(Row, {
            key: 'search:' + item.query,
            leading: { icon: IconSearch },
            text: item.query,
            title: item.query,
            nowrap: true,
            trailing: t('web.searchTag'),
          }),
        )
      }
      if (webRows.length === 0) webRows.push(h(EmptyLine, { key: 'web-empty', text: t('empty.browser') }))

      const liveJobs = jobs.filter(isLiveJob).length
      const jobsBadge = jobs.length > 0 ? String(jobs.length) : null
      const runtimeBadge = skills.length + mcp.length > 0 ? String(skills.length + mcp.length) : null
      const artifactBadge = artifacts.length > 0 ? String(artifacts.length) : null
      const webBadge = web.fetched.length + web.searched.length > 0 ? String(web.fetched.length + web.searched.length) : null

      return h(
        'div',
        {
          'data-task-monitor': VERSION,
          'data-session-id': sessionId || '',
          style: {
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            fontFamily: 'inherit',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px 4px' } },
          h('span', { style: { flex: 1, fontSize: 12, fontWeight: 600, color: C.primary } }, t('type.label')),
          liveJobs > 0 ? h(Spinner, { size: 11, color: C.info }) : null,
          h(
            'button',
            {
              type: 'button',
              title: t('refresh'),
              'aria-label': t('refresh'),
              onClick: () => state.reload(),
              style: {
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                border: 'none',
                borderRadius: 6,
                background: 'transparent',
                color: C.tertiary,
                cursor: 'pointer',
              },
            },
            h(IconRefresh, { width: 13, height: 13 }),
          ),
        ),
        h(
          'div',
          {
            style: {
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              padding: '4px 12px 16px',
            },
          },
          h(Section, { title: t('section.environment'), expanded: !collapsed.environment, onToggle: () => toggle('environment') }, envRows),
          h(
            Section,
            { title: t('section.jobs'), badge: jobsBadge, expanded: !collapsed.jobs, onToggle: () => toggle('jobs') },
            jobList,
          ),
          h(
            Section,
            { title: t('section.runtime'), badge: runtimeBadge, expanded: !collapsed.runtime, onToggle: () => toggle('runtime') },
            runtimeRows,
          ),
          h(
            Section,
            { title: t('section.artifact'), badge: artifactBadge, expanded: !collapsed.artifact, onToggle: () => toggle('artifact') },
            artifactRows,
          ),
          h(
            Section,
            { title: t('section.browser'), badge: webBadge, expanded: !collapsed.browser, onToggle: () => toggle('browser') },
            webRows,
          ),
        ),
        state.phase === 'error'
          ? h(
              'div',
              { style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderTop: '1px solid ' + C.border, color: C.warn, fontSize: 12 } },
              h('span', { style: { flex: 1, minWidth: 0, wordBreak: 'break-all' } }, t('error') + (state.error ? '：' + state.error : '')),
              h(
                'button',
                {
                  type: 'button',
                  onClick: () => state.reload(),
                  style: { flex: '0 0 auto', border: 'none', borderRadius: 6, padding: '2px 8px', background: C.hover, color: C.primary, fontSize: 12, cursor: 'pointer' },
                },
                t('retry'),
              ),
            )
          : notice
            ? h(
                'div',
                { style: { padding: '6px 10px', borderTop: '1px solid ' + C.border, color: C.tertiary, fontSize: 12, wordBreak: 'break-all' } },
                notice,
              )
            : null,
        dialogOpen
          ? h(CommitDialog, {
              t,
              sessionId,
              workspace: environment ? environment.workspace : null,
              onClose: () => setDialogOpen(false),
              onDone: () => {
                setDialogOpen(false)
                state.reload()
              },
            })
          : null,
      )
    }

    // ── 独立浮层（挂在官方根级槽位 shell.overlay）──────────────────────────
    function MonitorOverlay(props) {
      const t = props.t
      const sidebarRight = props.sidebarRight
      const [enabled, setEnabled] = React.useState(getPanelEnabled)
      React.useEffect(() => {
        const onChange = () => setEnabled(getPanelEnabled())
        window.addEventListener(SETTINGS_EVENT, onChange)
        return () => window.removeEventListener(SETTINGS_EVENT, onChange)
      }, [])

      const subscribeMounted = React.useCallback((callback) => sidebarRight.mounted.subscribe(callback), [sidebarRight])
      const readMounted = React.useCallback(() => sidebarRight.mounted.getSnapshot(), [sidebarRight])
      const sessionId = useSyncExternalStoreSafe(subscribeMounted, readMounted)
      const expanded = useSidebarExpanded(sidebarRight)
      const { phase, reserve } = useConversationView()

      const hasSession = typeof sessionId === 'string' && sessionId !== ''
      const visible = enabled && hasSession && !expanded && phase === 'active'
      React.useLayoutEffect(() => {
        reserve(visible)
      }, [reserve, visible])

      return h(
        'div',
        {
          'data-task-monitor': VERSION,
          'data-visible': visible ? 'true' : 'false',
          style: {
            position: 'absolute',
            top: 'var(--dsh-frame-top-clearance, 48px)',
            right: 0,
            bottom: 0,
            width: PANEL_WIDTH,
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            background: C.panelBg,
            borderLeft: '0.5px solid ' + C.divider,
            color: C.primary,
            transform: visible ? 'translateX(0)' : 'translateX(100%)',
            opacity: visible ? 1 : 0,
            pointerEvents: visible ? 'auto' : 'none',
            transition: 'transform ' + SLIDE + ', opacity ' + SLIDE,
          },
        },
        hasSession
          ? h(PanelBody, {
              key: sessionId,
              t,
              sessionId,
              visible,
              useJobs: props.useJobs,
              watchRows: props.watchRows,
              openResource: (address) => {
                if (typeof sidebarRight.openResource === 'function') sidebarRight.openResource(address)
              },
            })
          : null,
      )
    }

    // ── 注册 ───────────────────────────────────────────────────────────────
    function apply(ctx) {
      const t = ctx.locale.bind(NS)
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'task-monitor: dictionaries')
      ctx.effect(
        () =>
          ctx.slots.inject('shell.overlay', () =>
            ctx.slots.register(
              {
                name: 'shell.overlay',
                id: ID,
                order: 40,
                locale: NS,
                inject: () => ({
                  hooks: { jobs: ctx.jobs.state },
                  watchRows: (id) => ctx.jobs.watchRows(id),
                  sidebarRight: ctx.sidebarRight,
                }),
              },
              MonitorOverlay,
            ),
          ),
        'task-monitor: overlay panel',
      )
      ctx.effect(
        () =>
          ctx.slots.inject('conversation.session.header.utilities', () =>
            ctx.slots.register(
              {
                name: 'conversation.session.header.utilities',
                id: 'task-monitor-toggle',
                order: 40,
                locale: NS,
              },
              PanelToggle,
            ),
          ),
        'task-monitor: header toggle',
      )
      ctx.effect(
        () =>
          ctx.slots.inject('settings.general.item', () =>
            ctx.slots.register(
              {
                name: 'settings.general.item',
                id: 'task-monitor-panel-toggle',
                order: 30,
                locale: NS,
              },
              PanelEnabledRow,
            ),
          ),
        'task-monitor: settings row',
      )
    }

    return {
      inject: ['slots', 'locale', 'sidebarRight', 'jobs'],
      apply,
    }
  },
})
