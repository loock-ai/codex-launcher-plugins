    // codex-voice-background: generated integration
    private var voiceActivityResumed = false
    private var voiceDestroyed = false
    private var voiceNotificationAsked = false
    private var voiceSessionId: String? = null
    private var voiceBackgroundListener: ((String, String, String?) -> Unit)? = null
    private var voicePreviousRendererPriority: Int? = null
    private var voicePreviousRendererWaived = false
    private fun voiceTrustedPage(): Boolean = !voiceDestroyed && webView.url?.startsWith("file:///android_asset/") == true
    private fun voiceRenderer(active: Boolean) {
        if (voiceDestroyed) return
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            if (active) {
                if (voicePreviousRendererPriority == null) {
                    voicePreviousRendererPriority = webView.rendererRequestedPriority
                    voicePreviousRendererWaived = webView.rendererPriorityWaivedWhenNotVisible
                }
                webView.setRendererPriorityPolicy(android.webkit.WebView.RENDERER_PRIORITY_IMPORTANT, false)
            } else {
                voicePreviousRendererPriority?.let { webView.setRendererPriorityPolicy(it, voicePreviousRendererWaived) }
                voicePreviousRendererPriority = null
            }
        }
        if (!active && !voiceActivityResumed) { webView.onPause(); webView.pauseTimers() }
    }
    private fun voiceEvent(type: String, id: String, reason: String? = null) {
        if (voiceDestroyed || voiceSessionId != id) return
        if (type == "started" && voiceActivityResumed && !voiceNotificationAsked && android.os.Build.VERSION.SDK_INT >= 33 &&
            checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            voiceNotificationAsked = true
            requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 5103)
        }
        val ended = type != "started"
        if (ended) voiceSessionId = null
        val detail = org.json.JSONObject().put("type", type).put("sessionId", id)
        if (reason != null) detail.put("reason", reason)
        // Dispatch termination before pausing background JS so it can synchronously close tracks.
        if (voiceTrustedPage()) webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('codex-mobile-voice-background',{detail:" + detail.toString() + "}));"
        ) { if (ended && voiceSessionId == null) voiceRenderer(false) }
        else if (ended && voiceSessionId == null) voiceRenderer(false)
    }
    private fun startVoiceBackground(id: String) {
        if (!VoiceSessionLease.valid(id) || !voiceTrustedPage()) return
        if ((voiceSessionId != null && voiceSessionId != id) ||
            (VoiceBackgroundService.desiredSession != null && VoiceBackgroundService.desiredSession != id)) {
            val detail = org.json.JSONObject().put("type", "error").put("sessionId", id).put("reason", "busy")
            webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('codex-mobile-voice-background',{detail:" + detail.toString() + "}));", null)
            return
        }
        if (voiceSessionId == id) return
        voiceSessionId = id
        if (!voiceActivityResumed) { voiceEvent("error", id, "not_foreground"); return }
        if (checkSelfPermission(android.Manifest.permission.RECORD_AUDIO) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            voiceEvent("error", id, "permission"); return
        }
        val callback: (String, String, String?) -> Unit = { type, session, reason -> runOnUiThread { voiceEvent(type, session, reason) } }
        voiceBackgroundListener = callback
        VoiceBackgroundService.listener = callback
        VoiceBackgroundService.desiredSession = id
        voiceRenderer(true)
        try {
            val intent = android.content.Intent(this, VoiceBackgroundService::class.java)
                .setAction(VoiceBackgroundService.START).putExtra("sessionId", id)
            if (android.os.Build.VERSION.SDK_INT >= 26) startForegroundService(intent) else startService(intent)
        } catch (_: Exception) {
            VoiceBackgroundService.stop(id, "start_failed")
            voiceEvent("error", id, "start_failed")
        }
    }
    private fun stopVoiceBackground(id: String) {
        if (voiceSessionId != id) return
        VoiceBackgroundService.stop(id, "app-stop")
        if (voiceSessionId == id) voiceEvent("stopped", id, "app-stop")
    }
