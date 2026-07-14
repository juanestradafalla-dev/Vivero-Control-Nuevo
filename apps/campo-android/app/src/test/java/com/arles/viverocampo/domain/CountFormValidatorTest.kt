package com.arles.viverocampo.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CountFormValidatorTest {
    @Test
    fun `calcula total sin confiar en un total editable`() {
        val result = CountFormValidator.validate(CountInput("450", "320", "210"))
        assertTrue(result.valid)
        assertEquals(980L, result.total)
    }

    @Test
    fun `rechaza incompletos negativos decimales texto y desbordamientos`() {
        for (value in listOf("", "-1", "1.5", "texto", "9007199254740992")) {
            val result = CountFormValidator.validate(CountInput(value, "0", "0"))
            assertFalse(result.valid)
            assertTrue(result.errors.females != null)
        }
        val unsafeSum = CountFormValidator.validate(CountInput(CountFormValidator.MAX_SAFE_INTEGER.toString(), "1", "0"))
        assertFalse(unsafeSum.valid)
    }

    @Test
    fun `acepta cero con advertencia y limita observaciones solo por transporte`() {
        val zero = CountFormValidator.validate(CountInput("0", "0", "0"))
        assertTrue(zero.valid)
        assertTrue(zero.zeroWarning)
        val oversized = CountFormValidator.validate(CountInput("0", "0", "0", "x".repeat(4001)))
        assertFalse(oversized.valid)
        assertTrue(oversized.errors.observations != null)
    }
}
