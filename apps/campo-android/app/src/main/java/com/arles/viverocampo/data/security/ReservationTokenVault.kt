package com.arles.viverocampo.data.security

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

data class EncryptedReservationToken(val ciphertext: String, val iv: String)

interface ReservationTokenVault {
    fun encrypt(token: String): EncryptedReservationToken
    fun decrypt(encrypted: EncryptedReservationToken): String
}

object AesGcmCodec {
    data class EncryptedBytes(val ciphertext: ByteArray, val iv: ByteArray)

    fun encrypt(key: SecretKey, plaintext: ByteArray): EncryptedBytes {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, key)
        return EncryptedBytes(cipher.doFinal(plaintext), cipher.iv)
    }

    fun decrypt(key: SecretKey, encrypted: EncryptedBytes): ByteArray {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, encrypted.iv))
        return cipher.doFinal(encrypted.ciphertext)
    }

    const val TRANSFORMATION = "AES/GCM/NoPadding"
    private const val TAG_BITS = 128
}

class AndroidKeystoreReservationTokenVault(private val namespace: String = "emulator") : ReservationTokenVault {
    private val keyAlias = (if (namespace == "emulator") {
        "vivero_campo_reservation_token_v1"
    } else {
        "vivero_campo_${namespace}_reservation_token_v1"
    }).also {
        require(namespace.matches(Regex("[a-z0-9_-]+"))) { "El namespace del token no es seguro." }
    }

    override fun encrypt(token: String): EncryptedReservationToken {
        val encrypted = AesGcmCodec.encrypt(key(), token.toByteArray(Charsets.UTF_8))
        return EncryptedReservationToken(encode(encrypted.ciphertext), encode(encrypted.iv))
    }

    override fun decrypt(encrypted: EncryptedReservationToken): String {
        val cleartext = AesGcmCodec.decrypt(
            key(),
            AesGcmCodec.EncryptedBytes(decode(encrypted.ciphertext), decode(encrypted.iv)),
        )
        return cleartext.toString(Charsets.UTF_8)
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance(KEYSTORE_PROVIDER).apply { load(null) }
        (keyStore.getKey(keyAlias, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE_PROVIDER)
        generator.init(
            KeyGenParameterSpec.Builder(
                keyAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return generator.generateKey()
    }

    private fun encode(value: ByteArray): String = Base64.encodeToString(value, Base64.NO_WRAP)
    private fun decode(value: String): ByteArray = Base64.decode(value, Base64.NO_WRAP)

    private companion object {
        const val KEYSTORE_PROVIDER = "AndroidKeyStore"
    }
}
