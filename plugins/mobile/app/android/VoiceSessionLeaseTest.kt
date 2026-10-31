package com.app.pakeplus

import org.junit.Assert.*
import org.junit.Test

class VoiceSessionLeaseTest {
    private val a = "11111111-1111-4111-8111-111111111111"
    private val b = "22222222-2222-4222-8222-222222222222"
    @Test fun duplicateStartDoesNotExtendLease() {
        val lease = VoiceSessionLease()
        assertTrue(lease.start(a, 0)); assertTrue(lease.start(a, 80_000))
        assertTrue(lease.expired(90_000)); assertFalse(lease.pulse(a, 90_000))
    }
    @Test fun pulseRenewsAndOldSessionCannotStopNewCall() {
        val lease = VoiceSessionLease()
        assertTrue(lease.start(a, 0)); assertTrue(lease.pulse(a, 15_000))
        assertFalse(lease.expired(90_000)); assertTrue(lease.expired(105_000))
        assertTrue(lease.stop(a)); assertTrue(lease.start(b, 110_000))
        assertFalse(lease.stop(a)); assertFalse(lease.pulse(a, 120_000))
        assertEquals(b, lease.sessionId)
    }
    @Test fun busyAndInvalidSessionAreRejected() {
        val lease = VoiceSessionLease()
        assertFalse(lease.start("token", 0)); assertTrue(lease.start(a, 0))
        assertFalse(lease.start(b, 0)); assertTrue(lease.stop(a))
        assertFalse(lease.expired(Long.MAX_VALUE))
    }
}
