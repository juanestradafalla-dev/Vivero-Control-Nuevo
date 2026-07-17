package com.arles.viverocampo.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DiscardFormValidatorTest {
    @Test
    fun `acepta causas superpuestas y conserva total unico por categorias`() {
        val result = DiscardFormValidator.validate(
            DiscardInput(
                females = "8",
                males = "2",
                rootstocks = "0",
                dead = "6",
                nematodes = "5",
                gooseNeck = "0",
                bifurcatedRoots = "0",
                doubleGrafting = "0",
            ),
        )

        assertTrue(result.valid)
        assertEquals(10L, result.uniqueTotal)
        assertEquals(11L, result.causesTotal)
        assertNull(result.errors.general)
    }

    @Test
    fun `exige plantas y una causa`() {
        val result = DiscardFormValidator.validate(
            DiscardInput("0", "0", "0", "0", "0", "0", "0", "0"),
        )

        assertFalse(result.valid)
        assertEquals("Registra al menos una planta descartada.", result.errors.general)
    }

    @Test
    fun `rechaza una causa individual mayor al total unico`() {
        val result = DiscardFormValidator.validate(
            DiscardInput("3", "2", "0", "6", "0", "0", "0", "0"),
        )

        assertFalse(result.valid)
        assertEquals("Una causa no puede superar el total único de plantas.", result.errors.general)
    }

    @Test
    fun `rechaza el desbordamiento del total unico`() {
        val result = DiscardFormValidator.validate(
            DiscardInput(
                females = CountFormValidator.MAX_SAFE_INTEGER.toString(),
                males = "1",
                rootstocks = "0",
                dead = "1",
                nematodes = "0",
                gooseNeck = "0",
                bifurcatedRoots = "0",
                doubleGrafting = "0",
            ),
        )

        assertFalse(result.valid)
        assertEquals("La suma de plantas supera el rango técnico permitido.", result.errors.general)
    }
}
