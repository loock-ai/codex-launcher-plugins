# Codex Launcher Plugins

Codex Launcher 的独立插件仓库。顶层 [plugins.json](plugins.json) 是启动器读取的版本目录；[JSON Schema](schemas/plugins.schema.json) 校验名称、描述、版本、Git 地址、源码位置、宿主 API 要求、下载地址和 SHA-256。

| 插件 | 功能 | 源码 |
| --- | --- | --- |
| 会话时间 | 桌面侧边栏显示会话活动时间 | [desktop-thread-time](plugins/desktop-thread-time) |
| Mobile | 手机 Web、Dots、配置页面与对话网关 | [mobile](plugins/mobile) |

插件使用独立 tag，例如 `mobile-v1.0.0`。Release ZIP 是完整运行包，不需要用户执行构建或安装依赖。Mobile 的 `source/` 还包含原 Android/npm 构建的兼容源码；它们由此仓库唯一维护。

配置保存在 `~/.codex-launcher/plugin-data/<id>/`，更新仅替换 `plugins/<id>/` 代码。插件后台调用宿主 `ctx` API，桌面连接由 Launcher 管理；注入入口通过 `context` 注册清理。

```bash
npm ci
npm test
npm run build
node scripts/release-plugin.mjs mobile
```

新增插件：新增 `plugins/<id>/manifest.json` 和入口，完善打包测试，发布独立版本后更新顶层目录。目录中只写已发布真实资产，禁止先填占位下载地址或哈希。

本仓库不是 OpenAI 官方项目；仅用于可信插件代码。源码链接和 SHA-256 表示来源与完整性，不等同于独立代码签名。
