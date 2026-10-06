# 模块 · 安装与启用

## 目标
把插件装进用户的 DSH 桌面版 desktop profile，并在 DSH 里可见可用；随时可干净卸载。

## 装法（目录联接 + package.json 登记）
1. 插件源码放在本项目：`dsh-task-monitor/`
2. **一键脚本（仓库根 `install.ps1`，PowerShell）**：自动完成下面 3、4 两步（建联接 + 登记 package.json）；可重复运行（已装部分跳过）；写 package.json 用无 BOM 的 UTF-8（Node 的 `JSON.parse` 不吃 BOM，PowerShell 5.1 的 `Set-Content -Encoding utf8` 会带 BOM，故走 .NET API）；PS 5.1 下中文提示乱码仅显示问题
3. 在 profile 目录建符号链接，使其可被 Node 解析：
   `~/.dsh/profiles/desktop/node_modules/@local/dsh-task-monitor` → `本项目/dsh-task-monitor`
4. 在 profile 的 `package.json` 登记：
   - `dependencies` 增加 `"@local/dsh-task-monitor": "link:<本项目绝对路径>"`
   - `dsh.profile.bundles` 数组末尾追加 `"@local/dsh-task-monitor"`
5. 插件包内 `cordis.patch.yml` 声明 insert 行（bundle patch 的入口）
6. 重启 DSH 桌面版（或触发 profile 重载）后生效

## 验证加载
- 会话在屏、右侧边栏收起时，窗口右侧出现「任务监控」面板 = 界面半边已加载（新会话草稿态不出现，属正常）
- 面板能拉到数据 = 宿主半边路由已就绪
- 宿主报错看：`~/.dsh/logs/`（如插件行报错会有插件 id 与堆栈）

## 卸载（可逆）
1. 从 profile `package.json` 的 `dependencies` 与 `dsh.profile.bundles` 中删掉这一条
2. 删除 `node_modules/@local/dsh-task-monitor` 符号链接
3. 重启 DSH；插件源码目录可保留

## 非目标
- 不发布 npm、不做自动更新、不动 DSH 官方安装目录

## 依赖
- DSH 桌面版 ≥ 0.2.0-rc.2（当前支持版本）；profile 目录 `~/.dsh/profiles/desktop`
- 推送 / GitHub 登录 / 一键发布需要机器上装了 Git（推荐 Git for Windows，自带凭据管理器 GCM，首次推送自动弹浏览器登录；GitHub Desktop 自带的 Git 也可）；没装 Git 时推送会提示去官网安装，其它功能不受影响
- 不需要安装 `gh` 命令行，也不需要去 GitHub 网页预建仓库（对话框内可一键建已登录账号下的仓库）
