package com.arles.viverocampo.data.security

import javax.crypto.KeyGenerator
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class ReservationTokenVaultTest {
    @Test
    fun `AES GCM cifra token sin persistir texto plano y usa IV aleatorio`() {
        val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        val token = "token-reserva-ficticio-que-nunca-debe-persistirse"
        val first = AesGcmCodec.encrypt(key, token.toByteArray())
        val second = AesGcmCodec.encrypt(key, token.toByteArray())
        assertFalse(first.ciphertext.toString(Charsets.UTF_8).contains(token))
        assertNotEquals(first.iv.toList(), second.iv.toList())
        assertTrue(AesGcmCodec.decrypt(key, first).contentEquals(token.toByteArray()))
    }

    @Test(expected = Exception::class)
    fun `AES GCM rechaza ciphertext alterado`() {
        val key = KeyGenerator.getInstance("AES").apply { init(256) }.generateKey()
        val encrypted = AesGcmCodec.encrypt(key, "token".toByteArray())
        encrypted.ciphertext[0] = (encrypted.ciphertext[0].toInt() xor 1).toByte()
        AesGcmCodec.decrypt(key, encrypted)
    }
}
