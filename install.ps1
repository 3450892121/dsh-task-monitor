<#
  一键安装：把 dsh-task-monitor 插件登记进 DSH 桌面版的 desktop profile。
  做三件事（均可逆，卸载方法见 README「卸载」节）：
    1) 在 profile 里建目录联接 node_modules\@local\dsh-task-monitor -> 本脚本目录\dsh-task-monitor
    2) 在 profile 的 package.json 登记 dependencies 与 dsh.profile.bundles
    3) 提示重启 DSH 生效
  用法：PowerShell 里进入本脚本所在目录，运行 .\install.ps1
  重复运行安全：已装的部分会跳过；仓库被移动/改名后重复运行，联接会自动重指到新位置。
#>
param(
  # profile 目录；默认是 DSH 桌面版的标准位置，一般不用改
  [string]$ProfileDir = (Join-Path $env:USERPROFILE '.dsh\profiles\desktop')
)

$ErrorActionPreference = 'Stop'
$pkgName = '@local/dsh-task-monitor'
$pluginSrc = Join-Path $PSScriptRoot 'dsh-task-monitor'
$linkTarget = $pluginSrc.Replace('\', '/')

if (-not (Test-Path (Join-Path $pluginSrc 'package.json'))) {
  Write-Host '没找到插件源码（本脚本目录下应有 dsh-task-monitor\package.json），请确认下载完整。' -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $ProfileDir)) {
  Write-Host "没找到 DSH 桌面版的 profile 目录：$ProfileDir" -ForegroundColor Red
  Write-Host '请先安装并至少启动过一次 DSH 桌面版，再运行本脚本。' -ForegroundColor Yellow
  exit 1
}

# 1) 目录联接（不需要管理员权限）
#    重复运行安全 + 自愈：联接已存在但指向别处（仓库被移动/改名后常见）或已断链时，重指到本目录。
$linkPath = Join-Path $ProfileDir 'node_modules\@local\dsh-task-monitor'
$existing = Get-Item -LiteralPath $linkPath -Force -ErrorAction SilentlyContinue
if ($existing) {
  $currentTarget = @($existing.Target) -join ';'
}
else {
  $currentTarget = ''
}
if ($existing -and ($currentTarget.TrimEnd('\') -ieq $pluginSrc.TrimEnd('\'))) {
  Write-Host "联接已存在且正确，跳过：$linkPath"
}
else {
  if ($existing) {
    Write-Host "联接已存在但指向别处（本目录被移动/改名过？）：$currentTarget" -ForegroundColor Yellow
    # 只删联接本身，不碰目标目录
    [System.IO.Directory]::Delete($linkPath, $false)
    Write-Host '已移除旧联接。'
  }
  New-Item -ItemType Directory -Path (Join-Path $ProfileDir 'node_modules\@local') -Force | Out-Null
  New-Item -ItemType Junction -Path $linkPath -Target $pluginSrc | Out-Null
  Write-Host "已建联接：$linkPath -> $pluginSrc" -ForegroundColor Green
}

# 2) 登记进 profile 的 package.json（只加两项，不动其它内容；重复运行不重复加）
$pkgJsonPath = Join-Path $ProfileDir 'package.json'
$json = Get-Content $pkgJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$changed = $false
if (-not $json.dependencies) {
  $json | Add-Member -NotePropertyName 'dependencies' -NotePropertyValue ([pscustomobject]@{})
}
$depValue = "link:$linkTarget"
if ($json.dependencies.$pkgName -ne $depValue) {
  $json.dependencies | Add-Member -NotePropertyName $pkgName -NotePropertyValue $depValue -Force
  $changed = $true
}
if ($json.dsh.profile.bundles -notcontains $pkgName) {
  $json.dsh.profile.bundles = @($json.dsh.profile.bundles) + $pkgName
  $changed = $true
}
if ($changed) {
  $text = $json | ConvertTo-Json -Depth 20
  # 必须无 BOM 的 UTF-8：Node 的 JSON.parse 不吃 BOM；此写法在 PowerShell 5.1 与 7 都正确
  [System.IO.File]::WriteAllText($pkgJsonPath, ($text + [Environment]::NewLine), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host '已在 profile 的 package.json 登记本插件。' -ForegroundColor Green
}
else {
  Write-Host 'package.json 里已登记过，无需改动。'
}

Write-Host ''
Write-Host '完成。请完全退出 DSH 桌面版再重新打开：会话在屏且右侧边栏收起时，窗口右侧会出现「任务监控」面板。' -ForegroundColor Cyan
