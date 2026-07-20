package com.arles.viverocampo.data

import com.arles.viverocampo.domain.CampoRepositoryException
import com.arles.viverocampo.domain.DeadPlantsSource
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ActiveJourneySummaryParserTest {
    @Test
    fun `parsea configuracion completa del informe mensual`() {
        val journey = parseActiveJourneySummary(
            baseJourney() + mapOf(
                "configuracionInformeInventario" to mapOf(
                    "habilitado" to true,
                    "mes" to 7L,
                    "anio" to 2026L,
                    "fuentePlantasMuertas" to "CONTEO_FISICO",
                ),
            ),
        )

        val configuration = requireNotNull(journey.inventoryReportConfiguration)
        assertTrue(configuration.enabled)
        assertEquals(7, configuration.month)
        assertEquals(2026, configuration.year)
        assertEquals(DeadPlantsSource.CONTEO_FISICO, configuration.deadPlantsSource)
        assertTrue(configuration.requiresPhysicalDeadPlants)
    }

    @Test
    fun `configuracion ausente conserva compatibilidad con jornadas anteriores`() {
        assertNull(parseActiveJourneySummary(baseJourney()).inventoryReportConfiguration)
    }

    @Test
    fun `rechaza CERRANDO porque Campo solo lista jornadas ACTIVA`() {
        val closingJourney = baseJourney() + ("estado" to "CERRANDO")

        val error = assertThrows(CampoRepositoryException::class.java) {
            parseActiveJourneySummary(closingJourney)
        }

        assertEquals("INVALID_RESPONSE", error.code)
    }

    @Test
    fun `configuracion deshabilitada se normaliza como ausente`() {
        val journey = parseActiveJourneySummary(
            baseJourney() + mapOf(
                "configuracionInformeInventario" to mapOf("habilitado" to false),
            ),
        )

        assertNull(journey.inventoryReportConfiguration)
    }

    @Test
    fun `rechaza fuente o periodo malformados`() {
        val invalid = baseJourney() + mapOf(
            "configuracionInformeInventario" to mapOf(
                "habilitado" to true,
                "mes" to 13,
                "anio" to 2026,
                "fuentePlantasMuertas" to "DESCONOCIDA",
            ),
        )
        assertThrows(CampoRepositoryException::class.java) { parseActiveJourneySummary(invalid) }
    }

    @Test
    fun `rechaza anio fuera del rango del contrato`() {
        listOf(1999, 2101).forEach { year ->
            val invalid = baseJourney() + mapOf(
                "configuracionInformeInventario" to mapOf(
                    "habilitado" to true,
                    "mes" to 7,
                    "anio" to year,
                    "fuentePlantasMuertas" to "CONTEO_FISICO",
                ),
            )

            assertThrows(CampoRepositoryException::class.java) { parseActiveJourneySummary(invalid) }
        }
    }

    private fun baseJourney(): Map<String, Any> = mapOf(
        "jornadaId" to "jornada-1",
        "nombreVisible" to "Julio 2026",
        "estado" to "ACTIVA",
        "rolEfectivo" to "AUXILIAR",
        "puedeContar" to true,
        "cantidadLineas" to 3L,
    )
}
