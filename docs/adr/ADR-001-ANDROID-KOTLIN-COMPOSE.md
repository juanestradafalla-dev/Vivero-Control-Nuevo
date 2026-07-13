# ADR-001: Android con Kotlin y Jetpack Compose

## Contexto

Vivero Campo necesita una aplicación nativa para dispositivos Android aún por
inventariar y una base que permita trabajo local controlado.

## Decisión

Usar Kotlin, Jetpack Compose, Gradle Kotlin DSL y MVVM, separados en
presentación, dominio, datos y núcleo. Room y WorkManager se integrarán detrás
de puertos definidos por el dominio. El `applicationId` provisional es
`com.arles.viverocampo`.

## Alternativas

- Java con vistas XML.
- Aplicación web o multiplataforma.
- Persistencia y sincronización acopladas directamente a la interfaz.

## Consecuencias

Se obtiene tipado uniforme y UI declarativa. El equipo debe mantener límites de
capas y pruebas. `minSdk` es provisional hasta conocer los celulares reales.

## Estado

Aceptada para la ETAPA 2.
