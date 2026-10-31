package com.app.pakeplus

import android.Manifest
import android.app.*
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.*

/** Owns only foreground execution and the bounded CPU lock; WebView owns WebRTC. */
class VoiceBackgroundService : Service() {
    private val lease = VoiceSessionLease()
    private val handler = Handler(Looper.getMainLooper())
    private var lastStartId = 0
    private var wakeLock: PowerManager.WakeLock? = null
    private val watchdog = object : Runnable {
        override fun run() {
            val id = lease.sessionId ?: return
            if (lease.expired(SystemClock.elapsedRealtime())) { finish(id, "timeout"); return }
            renewLock()
            handler.postDelayed(this, 15_000L)
        }
    }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        lastStartId = startId
        val id = intent?.getStringExtra("sessionId")
        if (id == null || !VoiceSessionLease.valid(id)) { stopIfIdle(startId); return START_NOT_STICKY }
        when (intent?.action) {
            STOP -> finish(id, "notification")
            START -> {
                if (desiredSession != id) { stopIfIdle(startId); return START_NOT_STICKY }
                if (lease.sessionId == id) { emit("started", id, null); return START_NOT_STICKY }
                if (!lease.start(id, SystemClock.elapsedRealtime())) { emit("error", id, "busy"); return START_NOT_STICKY }
                try {
                    check(checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
                    if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel(CHANNEL, "Dot 语音通话", NotificationManager.IMPORTANCE_LOW))
                    val open = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP).setAction("codex.voice.OPEN.$id")
                    val stop = Intent(this, VoiceBackgroundService::class.java).setAction(STOP).putExtra("sessionId", id).setData(Uri.parse("codex-voice://stop/$id"))
                    val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
                    val notification = builder.setSmallIcon(android.R.drawable.ic_btn_speak_now)
                        .setContentTitle("Dot 语音通话中").setContentText("点击返回 App，或挂断通话")
                        .setOngoing(true).setCategory(Notification.CATEGORY_CALL)
                        .setContentIntent(PendingIntent.getActivity(this, 0, open, pendingFlags))
                        .addAction(Notification.Action.Builder(null, "挂断", PendingIntent.getService(this, 0, stop, pendingFlags)).build()).build()
                    if (Build.VERSION.SDK_INT >= 30) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
                    else startForeground(NOTIFICATION, notification)
                    wakeLock = (getSystemService(POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:DotVoice").apply { setReferenceCounted(false) }
                    renewLock()
                    handler.postDelayed(watchdog, 15_000L)
                    emit("started", id, null)
                } catch (_: Exception) { finish(id, "start_failed", "error") }
            }
        }
        stopIfIdle(startId)
        return START_NOT_STICKY
    }
    private fun stopIfIdle(startId: Int) {
        if (lease.sessionId == null && desiredSession == null) stopSelfResult(startId)
    }
    private fun renewLock() { wakeLock?.acquire(120_000L) }
    private fun finish(id: String, reason: String, type: String = "stopped") {
        val endingStartId = lastStartId
        if (!lease.stop(id)) return
        if (desiredSession == id) desiredSession = null
        handler.removeCallbacks(watchdog)
        wakeLock?.let { if (it.isHeld) it.release() }; wakeLock = null
        stopForeground(STOP_FOREGROUND_REMOVE)
        emit(type, id, reason)
        stopIfIdle(endingStartId)
    }
    override fun onTaskRemoved(rootIntent: Intent?) { lease.sessionId?.let { finish(it, "destroyed") }; super.onTaskRemoved(rootIntent) }
    override fun onDestroy() { lease.sessionId?.let { finish(it, "destroyed") }; if (instance === this) instance = null; super.onDestroy() }
    companion object {
        const val START = "codex.voice.START"
        const val STOP = "codex.voice.STOP"
        private const val CHANNEL = "codex-dot-voice"
        private const val NOTIFICATION = 5301
        var desiredSession: String? = null
        var listener: ((String, String, String?) -> Unit)? = null
        private var instance: VoiceBackgroundService? = null
        fun pulse(id: String) { instance?.let { if (it.lease.pulse(id, SystemClock.elapsedRealtime())) it.renewLock() } }
        fun stop(id: String, reason: String) {
            if (desiredSession == id) desiredSession = null
            instance?.let { it.finish(id, reason); it.stopIfIdle(it.lastStartId) }
        }
        private fun emit(type: String, id: String, reason: String?) { listener?.invoke(type, id, reason) }
    }
    override fun onCreate() { super.onCreate(); instance = this }
}
