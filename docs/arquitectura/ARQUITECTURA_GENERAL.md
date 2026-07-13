# Arquitectura general

## Alcance

La ETAPA 2 instala una base compilable y verificable. No implementa jornadas,
conteos, reservas ni actualización de inventario. Los contratos describen esas
operaciones para que las próximas etapas partan de límites explícitos.

## Componentes y responsabilidades

| Componente | Responsabilidad en la arquitectura | Estado en ETAPA 2 |
|---|---|---|
| Vivero Campo | Cliente Android para reservar una línea, conservar un borrador y enviar un conteo. | Esqueleto Kotlin/Compose con MVVM y puertos locales. |
| Vivero Maestro | Cliente Windows para administrar jornadas y revisar conteos. | Esqueleto Electron/React seguro, sin módulos administrativos. |
| Firebase Authentication | Identidad de usuarios. | Previsto; sin proyecto ni configuración real. |
| Firestore | Estado central y persistencia autoritativa. | Emulador local con reglas de denegación total. |
| Firebase Functions | Frontera transaccional para operaciones críticas. | Interfaces que responden “no disponible”; no se exportan funciones. |
| Contratos | Vocabulario independiente de las interfaces. | Enumeraciones y JSON Schema versionados. |

## Flujo previsto

1. Campo o Maestro autentica al usuario cuando exista un ambiente configurado.
2. El cliente solicita una operación crítica al backend y aporta una clave de
   idempotencia global.
3. El backend valida identidad, rol, estado y versión dentro de una transacción.
4. Firestore almacena el nuevo estado, los timestamps del servidor y la
   auditoría de forma consistente.
5. El cliente recibe el resultado autoritativo. Una repetición con la misma
   clave no debe duplicar el efecto.

Los clientes nunca escribirán directamente el inventario oficial. Aprobar un
conteo reemplazará la fotografía actual de la línea y registrará, en la misma
operación central, el valor anterior, el nuevo y su diferencia histórica.

## Límites de confianza

- El renderer de Electron, la aplicación Android, el almacenamiento local y la
  red son entradas no confiables.
- Las validaciones visuales mejoran la experiencia, pero no conceden permisos.
- Authentication identifica; las reglas y Functions autorizan.
- Los timestamps del cliente no son autoritativos.
- Firestore y el backend transaccional forman la frontera central de confianza.

## Estado local y central

Campo podrá conservar borradores y los estados locales `PENDIENTE`,
`SINCRONIZANDO`, `ENVIADA` y `ERROR`. Estos estados describen la sincronización
del dispositivo. Los estados centrales de una línea son `DISPONIBLE`,
`EN_CONTEO`, `PENDIENTE_REVISION`, `DEVUELTA` y `APROBADA`. `ENVIADA` nunca es un
estado central.

## Desarrollo y producción

El desarrollo usa identificadores `demo-*`, Emulator Suite y datos ficticios.
No existe proyecto Firebase real, credencial, despliegue ni enlace de las
aplicaciones. Producción requerirá una decisión separada sobre proyectos,
regiones, responsables, secretos, copias de seguridad y procedimiento de
liberación. Ningún comando de CI despliega recursos.

## Decisiones relacionadas

- [ADR-003: Firebase y Emulator Suite](../adr/ADR-003-FIREBASE-Y-EMULADORES.md)
- [ADR-004: backend transaccional](../adr/ADR-004-BACKEND-TRANSACCIONAL.md)
- [ADR-006: estados centrales y locales](../adr/ADR-006-ESTADOS-CENTRALES-Y-LOCALES.md)
