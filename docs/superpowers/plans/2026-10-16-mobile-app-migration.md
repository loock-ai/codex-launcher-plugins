# Mobile 客户端构建归属迁移实施计划

> 按用户“全部迁移”执行已确认的 Android 与 Web 共用 Mobile 插件 UI 方案。本计划在当前会话逐项实施并验证。

**目标：** Android 的构建、封装、资源、更新与发布完整归属 Mobile 插件仓库，Launcher 停止构建移动客户端。

**架构：** `plugins/mobile/source/src` 是 Web 和移动 WebView 的唯一 UI。`plugins/mobile/app` 保存客户端版本与图标，仓库级 Actions 仅作调度。共享移动流水线的 iOS 封装同步迁移，避免留在 Launcher 依赖已移走的 Android。现有独立 npm CLI 兼容发布不属于安卓 App，不与 App 版本绑定。

**约束：** 名称 Codex Mobile、包名 vip.loock.codexmobile 不变；沿用固定 PakePlus 来源及其签名；不接触本地旧文档草稿，不重置用户配置。不自动发布或覆盖历史 APK；旧客户端仅允许旧仓库下载地址，跨仓库首装需手动下载安装。

## 检查重点

- 新仓库的 latest 可能是插件 ZIP，客户端必须使用固定 App 更新频道。
- 新仓库 run_number 从头计数，Android versionCode 必须独立且不回退。
- Web 与 APK 必须直接使用同一 Vite 构建入口，不下载旧 Mobile 插件包充当源码。
- 现有更新下载白名单、文件 SHA-256、FileProvider、音频与附件桥接不得退化。
- 内置 UI 可离线；局域网地址和令牌不得进入构建资源。

## 实施步骤

- [x] 迁移旧移动打包回归；新增版本、更新频道及 ZIP 排除封装资源的失败测试。
- [x] 将 Android/iOS 工作流、图标脚本和资源移到插件仓库，解除 npm 发布耦合。
- [x] 提供独立客户端版本解析脚本、直接共用 UI 构建命令和固定 App 更新索引。
- [x] 更新 Web 更新解析及原生下载白名单，发布前校验、下载回读 APK 后再更新频道。
- [x] 删除 Launcher 旧客户端流水线与专属测试／图标脚本，更新两个仓库文档。
- [x] 完整测试、类型检查、Web/插件打包和工作流语法检查；记录本地验证与远端构建边界。

## 验证记录与边界

- 插件仓库：15 项 Node 测试、6 项移动封装回归、432 项 Mobile 测试通过；类型检查通过。
- 共用 Web 与 Mobile 插件包构建通过；两份工作流的 Shell/Python 语法检查通过。
- Launcher：671 项测试通过、11 项跳过；既有文档草稿保留；迁移提交已推送两个仓库。
- GitHub Actions 38767520170 已完成 Android 原生构建与正式 Release v0.2.33；iOS 未启用。
- 独立下载 APK，确认 ZIP 结构、校验文件及公开 App 更新索引的 SHA-256 一致，App 解析实际索引得到 0.2.33。
- APK 内置新更新索引地址，签名证书 SHA-256 与旧版 0.2.32 一致；首次跨仓库更新手动覆盖安装，后续使用新索引。
- 决策：npm CLI 仍是单独兼容入口，不随安卓 App 发布；iOS 因共用移动流水线一并迁走，默认不占用 macOS 构建资源。
