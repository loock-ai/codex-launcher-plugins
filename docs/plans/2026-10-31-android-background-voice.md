# Android Dot 后台与锁屏语音实施方案

用户确认目标：已发起的 Dot 语音在切换到其他 App、锁屏、熄屏后继续，直到手动挂断或连接失败；不以强制常亮代替后台能力。

## 方案与边界

保留 WebView 内的既有 WebRTC 和网关协议，增加 microphone 类型前台服务、常驻通话通知和仅通话期间的 PARTIAL_WAKE_LOCK。相较只设置屏幕常亮，该方案允许熄屏；相较迁移整套原生 WebRTC，它保持当前已验证信令和音频链路。使用 Android 正规前台服务，不隐藏麦克风指示，不开机恢复通话，不申请电池优化豁免。

服务由 App 前台的通话操作启动，且必须已获得 RECORD_AUDIO。Native 只接收随机 sessionId，不接收网关口令。Android API 34 声明 FOREGROUND_SERVICE_MICROPHONE；通知权限允许后可在通知栏返回 App 或挂断。拒绝通知权限不阻止已获准的语音。

通话活动时不执行 WebView.onPause/pauseTimers，并提升 renderer 优先级；停止后恢复后台暂停。正常 Home/锁屏不结束会话；Activity 真正销毁、从任务列表移除、系统终止进程均结束或由原网关租约兜底清理，不能承诺绕过系统强行停止。

## 接口与生命周期

- JS Bridge：`voiceBackgroundStart(sessionId)`、`voiceBackgroundStop(sessionId)`、`voiceBackgroundPulse(sessionId)`。
- Native 事件：`codex-mobile-voice-background`，detail 为 `{type:'started'|'stopped'|'error',sessionId,reason?,message?}`，不携带凭据。
- TS `NativeVoiceBackground.start(id,onEnded)` 等待 started（8 秒超时）；`pulse(id)` 和 `stop(id)` 只作用于本实例 id，stop 取消未完成 start。
- DotVoiceCall 在获取音轨后、发起网关请求前等待 Native 前台服务；原 15 秒 heartbeat 同步 pulse。挂断、启动失败、取消、通知挂断都关闭音轨/PeerConnection、停止 Native 并清理网关通话。
- Native 90 秒 lease，15 秒 watchdog；唤醒锁按需续期且带 120 秒超时，停止必须释放。旧 id 的通知和延迟回调不能结束新会话。
- 无此 Bridge 的浏览器保持原有前台通话行为；本轮不改服务端协议、token 和桌面程序。

## 实施与验证

- [x] Web：先写 Native Bridge 握手/取消/旧事件隔离测试及 Dot 控制器的后台启动、失败、通知挂断、pulse、资源清理测试，再实现。
- [x] Native：独立 Kotlin service 与纯 Kotlin lease；保留上游 MainActivity 其他逻辑，通过专用脚本注入 Bridge 和生命周期保护。Android JUnit 覆盖 lease 超时、续期、忙状态及旧 id 停止隔离。
- [x] Packaging：保留/补齐 FOREGROUND_SERVICE、FOREGROUND_SERVICE_MICROPHONE、WAKE_LOCK、POST_NOTIFICATIONS；APK 成品校验服务类型、exported=false、权限和类文件。执行真实项目变换的测试；流水线运行 Android unit test 后构建。
- [x] 独立审查及完整回归；先推 feature 分支并 dispatch `publish=false` 编译验证，再推 main 自动发布 App 补丁；下载回读验证。
- [ ] 用户手机验收：通话后 Home 与锁屏各保持至少 5 分钟，双向听说、通知栏挂断、返回 App 后状态一致，挂断后无麦克风/唤醒锁残留。没有实机时明确未验收，不用桌面浏览器结果代替。

依据：[Android 前台服务类型](https://developer.android.com/develop/background-work/services/fgs/service-types)、[麦克风前台服务启动限制](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start)。

## 发布验证结果

- 功能源码 `d5abe9d6f44ca09e857881e1dda4f00cd088aa3d`。
- Node 测试 21 项、CI 脚本测试 6 项、Mobile 456 项通过；类型检查和既有受控 Chromium WebRTC 回归通过。
- [不发布的验证构建](https://github.com/loock-ai/codex-launcher-plugins/actions/runs/41198703335) 先通过，再将同一提交快进 main；[正式构建](https://github.com/loock-ai/codex-launcher-plugins/actions/runs/41199006562) 的 Kotlin/JUnit、APK 校验与发布均成功。
- [App 0.2.36](https://github.com/loock-ai/codex-launcher-plugins/releases/tag/v0.2.36) 已公开，下载回读 SHA-256：`fc67232431c599c8db325e3ca301ec5dcf45d6bd838a5b107e464851a3ce44a5`。
- 成品检查确认录音、音频设置、前台麦克风服务、通知和唤醒锁权限，以及服务、租约类和三个 Bridge 方法存在；更新索引版本和 APK 摘要匹配。
- 没有连接用户手机调试，真实锁屏持续双向声音及通知挂断仍需用户验收，未将包级验证当成实机通过。
