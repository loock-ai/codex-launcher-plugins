        @android.webkit.JavascriptInterface
        fun voiceBackgroundStart(sessionId: String) {
            this@MainActivity.runOnUiThread { this@MainActivity.startVoiceBackground(sessionId) }
        }
        @android.webkit.JavascriptInterface
        fun voiceBackgroundStop(sessionId: String) {
            this@MainActivity.runOnUiThread {
                this@MainActivity.stopVoiceBackground(sessionId)
            }
        }
        @android.webkit.JavascriptInterface
        fun voiceBackgroundPulse(sessionId: String) {
            this@MainActivity.runOnUiThread {
                if (this@MainActivity.voiceTrustedPage() && this@MainActivity.voiceSessionId == sessionId) VoiceBackgroundService.pulse(sessionId)
            }
        }
