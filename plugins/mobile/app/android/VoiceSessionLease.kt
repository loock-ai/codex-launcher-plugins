package com.app.pakeplus

/** Monotonic clock supplied by the service; no credentials or persistence. */
class VoiceSessionLease(private val timeoutMs: Long = 90_000L) {
    var sessionId: String? = null
        private set
    private var deadline = 0L
    fun start(id: String, now: Long): Boolean {
        if (!valid(id) || (sessionId != null && sessionId != id)) return false
        if (sessionId == null) { sessionId = id; deadline = now + timeoutMs }
        return true
    }
    fun pulse(id: String, now: Long): Boolean {
        if (sessionId != id || now >= deadline) return false
        deadline = now + timeoutMs
        return true
    }
    fun stop(id: String): Boolean {
        if (sessionId != id) return false
        sessionId = null
        deadline = 0L
        return true
    }
    fun expired(now: Long): Boolean = sessionId != null && now >= deadline
    companion object {
        fun valid(id: String): Boolean = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$").matches(id)
    }
}
