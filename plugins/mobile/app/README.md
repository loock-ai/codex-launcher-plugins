# Codex Mobile App

Android App 和 Mobile Web 使用同一套 UI：`../source/src/`。安卓不包含另一份前端，也不从 Launcher 或已发布插件包下载旧 UI。启动器插件、Web 和移动 App 共用业务与界面，平台差异通过现有原生桥处理。

## 代码与构建

| 位置 | 职责 |
| --- | --- |
| `plugins/mobile/source/src/` | Web、Android 和 iOS 共用 React UI |
| `plugins/mobile/source/vite.config.ts` | 共用 Vite 配置，相对资源路径 |
| `scripts/build-mobile-web.mjs` | 共用 UI 构建入口，默认输出 `dist/mobile-web/` |
| `plugins/mobile/app/assets/` | 客户端图标 |
| `plugins/mobile/app/compose-icon.sh` | 图标合成工具，可显式指定底图 |
| `plugins/mobile/app/version.json` | 客户端版本下限与安卓版本码基数 |
| `.github/workflows/build-android.yml` | Android 打包、校验、Release 和更新索引 |
| `.github/workflows/build-ios.yml` | 可选 iOS 封装，输出未签名 IPA |

在仓库根目录运行：

```bash
npm ci
npm test
npm run typecheck
npm run build:mobile:web
```

插件 ZIP 构建也调用同一 UI 构建入口，封装资源和 APK 不进入插件运行 ZIP。

## Actions 与产物

运行 **Build Mobile Apps** 工作流，默认只构建 APK，不发布。输入可选 `release_version`，勾选 `publish` 后才发布正式 Release；`main` 的客户端相关代码 push 会自动构建发布。发布只允许 main，串行运行，不取消正在发布的任务。

Android 沿用固定提交的 PakePlus 容器和既有 keystore，应用名称 **Codex Mobile**、包名 **vip.loock.codexmobile** 不变。流水线保留附件、实时音频、更新安装桥、FileProvider、下载来源与 SHA-256 校验，以及离线资源和私有地址扫描。SDK 初始化显式安装 platform-tools。

设置仓库变量 `ENABLE_IOS_BUILD=true` 才同时构建 iOS；默认关闭。IPA 未签名，真机安装或 TestFlight 仍需要 Apple 开发者签名。

APK、校验文件与可选 IPA 发布在本仓库 `vX.Y.Z` Release。插件使用 `mobile-vX.Y.Z`，两种版本独立；不修改插件目录 `plugins.json`。

## 版本与 App 更新

版本解析分页读取本仓库所有 Release，忽略插件 tag，以客户端版本下限和最高 `vX.Y.Z` 为基础。自动构建取下一个 patch；显式版本必须高于历史与下限。迁移时已核对旧仓库最新 App 为 `0.2.32`，版本下限据此设置。API 查询失败停止，不猜测版本；不再与 npm CLI 版本绑定。

安卓 versionCode 使用 `200000000 + major×1000000 + minor×1000 + patch`，不依赖新仓库从头计数的 run_number；minor/patch 不超过 999，结果不超过 Android 上限。不得随意降低版本码基数。

发布先上传草稿，下载回读验证 APK/IPA 的哈希，再转为正式 Release。最后把正式 Release 元数据写入 `plugins/mobile/app/latest.json` 并提交。新 App 从这个固定索引检查更新，不依赖可能指向插件 ZIP 的 releases/latest。索引初始为 null，表示尚未在本仓库发布 App；它不触发再次构建。

旧 App 的原生桥只允许旧仓库的下载地址，不能通过修改网页绕过。首次迁移请手动下载新 APK 安装；新版本之后使用新索引。覆盖安装仍需签名一致，用户数据不能以卸载重装方式自动迁移。历史 APK、Release 和旧仓库保持原样。

若 Release 已创建但索引提交失败，先核对现有 Release 与工作流结果，不重放发布或覆盖同版本；验证资产后可补交索引。独立 npm CLI 的兼容发布仍保留在 Launcher 仓库，与 App 构建无关。
