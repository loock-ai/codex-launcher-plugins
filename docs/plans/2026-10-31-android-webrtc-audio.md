# 安卓 WebRTC 音频权限修复

问题：用户报告 App 拨号出现 `Could not start audio source`。已下载的正式 0.2.34 APK 包含 RECORD_AUDIO，但缺少 MODIFY_AUDIO_SETTINGS。上游固定版本原本声明该权限，本仓库构建脚本的权限白名单将其删除。

范围：修复 Android 构建的权限保留及缺省补齐，并让成品 APK 校验要求该权限。保留原运行时录音授权逻辑，不更改 token、桌面端或独立插件协议。手机未连接到本机调试工具，不能将包级修复声称为用户实机问题已完全消除。

- [x] 编写执行实际清理脚本和成品校验脚本的失败测试，覆盖保留、补齐、无关权限移除及缺权限拒绝发布。
- [x] 修复两处白名单和必需权限列表，运行全部测试与类型检查。
- [x] 提交并推送到 main，由现有流水线发布 App 补丁版本；下载后核对权限与 SHA-256。
- [ ] 交用户覆盖升级，并验证实体麦克风和通话。

## 发布验证

- 修复提交 `cd451efa5fad4db270766d6b89928ce8ba945efa`。
- [App 0.2.35](https://github.com/loock-ai/codex-launcher-plugins/releases/tag/v0.2.35) 已正式发布，[构建、成品校验与发布流水线](https://github.com/loock-ai/codex-launcher-plugins/actions/runs/41194954350) 成功。
- 本地完整测试、工作流内嵌脚本语法和类型检查通过；独立审查未发现重要问题。
- 下载回读 SHA-256 为 `a0d5fdc4534c6ab121101dcc389d66cb33c4a54b9f7210b7ae03fbb5fdfef2c3`，与发布校验文件一致；新 APK 同时声明 RECORD_AUDIO 和 MODIFY_AUDIO_SETTINGS。
- App 更新索引已指向 0.2.35，APK 摘要匹配。
- 未获取用户手机的系统日志或实际麦克风，不能据此声称实机已恢复。建议覆盖安装保留配置，再验证通话；若仍失败，继续检查手机型号、系统麦克风开关、录音占用及 WebView 日志。

权限用途参考：[Android AudioManager](https://developer.android.com/reference/android/media/AudioManager) 和 [Chromium Android 音频实现](https://chromium.googlesource.com/chromium/src/media/+/0176b00a5b61e24794e23e21d44ccf4432f6498f/audio/android/audio_manager_android.cc)。
