# Vivero Control Nuevo

Sistema nuevo para operar inventario por línea mediante Vivero Campo (Android), Vivero Maestro (Windows) y un backend transaccional. Este repositorio no consulta, modifica ni reutiliza el proyecto anterior `Vivero-Control`.

## Estado: ETAPA 11

La vertical disponible funciona exclusivamente con Firebase Emulator Suite y datos ficticios:

1. Campo reserva una línea, captura el conteo offline y lo sincroniza idempotentemente.
2. Después de `ENVIADA`, la persona finaliza y puede tomar otra línea sin perder el historial local.
3. `enviarConteo` deja la línea en `PENDIENTE_REVISION` sin tocar inventario.
4. Maestro presenta una bandeja con conteo, inventario oficial actual y diferencias.
5. Supervisor o administrador autorizado solicita `aprobarConteo` o `devolverConteo`.
6. La aprobación reemplaza la fotografía oficial y crea un movimiento histórico en una sola transacción.
7. La devolución conserva el inventario intacto y permite que el autor inicie una reserva `CORRECCION`.
8. Campo restaura los valores devueltos como un borrador nuevo; el reenvío crea la versión siguiente y conserva las anteriores.
9. Maestro muestra el historial, el motivo de devolución y cuál versión es vigente; aprobar y devolver siguen operando solo sobre la vigente.

10. Supervisor o administrador autorizado puede reasignar una corrección `DEVUELTA` a otro usuario activo y autorizado.
11. La reasignación es inmutable, idempotente y auditada; no cambia el conteo original, su autor ni el inventario.
12. Solo el responsable actual inicia la reserva `CORRECCION`; la nueva versión conserva el enlace anterior y registra como autor a quien corrigió.

13. Supervisor o administrador autorizado puede liberar manualmente una reserva `ACTIVA` mediante `liberarReservaLinea`.
14. Una reserva inicial vuelve de `EN_CONTEO` a `DISPONIBLE`; una reserva `CORRECCION` vuelve a `DEVUELTA` y restaura su reasignación vigente.
15. Campo conserva el borrador local, cancela reintentos y muestra el rechazo supervisado sin borrar el token cifrado.
16. La liberación es inmutable, auditada e idempotente; competir con `enviarConteo` produce exactamente un ganador.

17. `listarJornadasActivas` devuelve solo jornadas `ACTIVA` autorizadas para la cuenta autenticada.
18. Campo selecciona automáticamente una única jornada o muestra selector cuando existen varias y bloquea el cambio con trabajo pendiente.
19. Maestro cambia todas sus suscripciones al seleccionar otra jornada y nunca mezcla líneas, reservas, conteos o inventario.
20. El ID histórico `JORNADA-PRUEBA-ETAPA-3` permanece solo como fixture del seed; ya no dirige consultas funcionales.

21. Supervisor y administrador pueden crear jornadas `BORRADOR` mediante `crearJornadaBorrador`.
22. Maestro permite seleccionar líneas activas del catálogo y guarda la preparación mediante `actualizarLineasJornadaBorrador`, sin crear `jornadaLineas` operativas.
23. Supervisor administra exclusivamente sus borradores; administrador puede administrar todos y auxiliares no los consultan.
24. Campo continúa recibiendo únicamente jornadas `ACTIVA`; un borrador no genera estados `DISPONIBLE` ni modifica inventario.

25. Supervisor y administrador pueden preparar participantes de una jornada `BORRADOR` mediante `listarParticipantesJornadaBorrador` y `actualizarParticipantesJornadaBorrador`.
26. El backend obtiene nombre y rol desde perfiles centrales activos; el cliente solo selecciona la cuenta e indica si puede contar.
27. La preparación se guarda en `seleccionesParticipantesJornada`, separada de las autorizaciones operativas, con auditoría e idempotencia.
28. Maestro permite buscar, filtrar, seleccionar y confirmar participantes sin activar la jornada ni exponer borradores en Campo.

> **MODO DE PRUEBA — EMULADOR.** No existe Firebase real configurado, no hay credenciales de producción y ningún comando despliega recursos.

Los conteos y las decisiones son inmutables desde clientes. Maestro no escribe directamente inventario, movimientos, decisiones, auditoría ni estados de línea.

## Reglas de revisión

- Un auxiliar no revisa conteos.
- Supervisor y administrador requieren autorización activa de la jornada.
- Un supervisor no puede aprobar su propio conteo.
- Un administrador puede hacerlo excepcionalmente con advertencia y motivo obligatorio auditado.
- Toda devolución exige motivo.
- Repetir la misma clave con el mismo payload recupera el resultado anterior.
- Una misma clave con otro payload produce `IDEMPOTENCY_CONFLICT`.
- Si dos decisiones compiten, solo una puede confirmar la transición y sus efectos.
- Nunca se asume inventario cero: si falta la fotografía inicial, la aprobación se rechaza íntegramente.

## Inventario ficticio del emulador

El seed repetible crea estas fotografías claramente ficticias:

| Línea | Hembras | Machos | Patrones | Total |
|---|---:|---:|---:|---:|
| `LINEA-PRUEBA-1` | 500 | 300 | 200 | 1.000 |
| `LINEA-PRUEBA-2` | 380 | 220 | 150 | 750 |
| `LINEA-PRUEBA-3` | 270 | 180 | 90 | 540 |

Una aprobación de 450 hembras, 320 machos y 210 patrones para la primera línea reemplaza 1.000 por 980 y registra diferencias `-50`, `+20`, `+10` y `-20`.

## Estructura

```text
Vivero-Control-Nuevo/
|-- .github/workflows/       # CI y auditoría, sin despliegue
|-- apps/campo-android/      # Kotlin, Compose, Room, WorkManager y Keystore
|-- apps/maestro-desktop/    # Electron, React y bandeja de revisión
|-- backend/                 # Callables, reglas, emuladores y seed ficticio
|-- contracts/               # JSON Schema y ejemplos compartidos
|-- data/templates/          # plantillas vacías para levantamiento futuro
|-- docs/                    # definición, arquitectura y pruebas
`-- tests/                   # espacio para escenarios integrales futuros
```

## Emuladores

Requisitos: JDK 21, Android SDK 36.1, Node.js 22 o posterior y npm.

```powershell
Set-Location backend/functions
npm ci
npm run build
npm run emulators:start
```

En otra terminal:

```powershell
Set-Location backend/functions
npm run emulator:seed
```

Servicios: Auth `9099`, Firestore `8180`, Functions `5001` y Emulator UI `4000`. El seed y las trece Functions se niegan a operar fuera de `FUNCTIONS_EMULATOR=true` y un proyecto `demo-*`.

| Correo ficticio | Rol |
|---|---|
| `auxiliar1@prueba.local` | Auxiliar |
| `auxiliar2@prueba.local` | Auxiliar |
| `supervisor@prueba.local` | Supervisor |
| `administrador@prueba.local` | Administrador |

Contraseña exclusiva del emulador: `SoloEmulador-Etapa3!`. Es pública y no debe reutilizarse.

## Verificación

```powershell
# contratos
Set-Location contracts
npm ci
npm run validate
npm test

# Android
Set-Location ../apps/campo-android
./gradlew.bat assembleDebug
./gradlew.bat testDebugUnitTest
./gradlew.bat lintDebug

# Maestro
Set-Location ../maestro-desktop
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev --audit-level=high

# backend, reglas y concurrencia
Set-Location ../../backend/functions
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:emulators
npm audit --omit=dev --audit-level=high
```

## Documentación de la ETAPA 11

- [Participantes de jornadas en borrador](docs/arquitectura/PARTICIPANTES_JORNADA_BORRADOR_ETAPA_11.md)
- [Pruebas](docs/pruebas/PRUEBAS_ETAPA_11.md)
- [Criterios de aceptación](docs/ETAPA_11_CRITERIOS_DE_ACEPTACION.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)

## Documentación de la ETAPA 10

- [Jornadas en borrador y selección de líneas](docs/arquitectura/JORNADAS_BORRADOR_ETAPA_10.md)
- [Pruebas](docs/pruebas/PRUEBAS_ETAPA_10.md)
- [Criterios de aceptación](docs/ETAPA_10_CRITERIOS_DE_ACEPTACION.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)

## Documentación de la ETAPA 9

- [Jornadas activas dinámicas](docs/arquitectura/JORNADAS_DINAMICAS_ETAPA_09.md)
- [Pruebas](docs/pruebas/PRUEBAS_ETAPA_09.md)
- [Criterios de aceptación](docs/ETAPA_09_CRITERIOS_DE_ACEPTACION.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)

## Documentación de la ETAPA 8

- [Liberación manual supervisada](docs/arquitectura/LIBERACION_RESERVAS_ETAPA_08.md)
- [Pruebas y concurrencia](docs/pruebas/PRUEBAS_ETAPA_08.md)
- [Criterios de aceptación](docs/ETAPA_08_CRITERIOS_DE_ACEPTACION.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)
- [Decisiones pendientes](docs/DECISIONES_PENDIENTES.md)

## Documentación de la ETAPA 7

- [Reasignación supervisada](docs/arquitectura/REASIGNACION_CORRECCIONES_ETAPA_07.md)
- [Pruebas y concurrencia](docs/pruebas/PRUEBAS_ETAPA_07.md)
- [Criterios de aceptación](docs/ETAPA_07_CRITERIOS_DE_ACEPTACION.md)
- [Dependencias y riesgos](docs/arquitectura/DEPENDENCIAS_Y_RIESGOS.md)
- [Decisiones pendientes](docs/DECISIONES_PENDIENTES.md)

## Exclusiones vigentes

No están implementados: activación, cierre, cancelación, reapertura o eliminación de jornadas; materialización de autorizaciones operativas desde la selección; creación de cuentas; cambio de roles o perfiles; creación de ubicaciones o líneas; vencimiento automático; temporizadores de abandono; eliminación o recuperación administrativa de borradores locales; corrección simultánea por varios usuarios; datos reales; migración; Firebase de producción; despliegues; APK de producción; instalador Windows definitivo; descartes, despachos, químicos, aplicaciones ni reingresos.
