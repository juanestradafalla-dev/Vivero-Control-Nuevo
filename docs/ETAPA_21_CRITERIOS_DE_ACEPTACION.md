# ETAPA 21 — Preparación de FASE B: criterios de aceptación

> Este documento conserva el cierre histórico de la preparación anterior. El estado posterior de la limpieza manual se registra en `ETAPA_21_FASE_B1_LIMPIEZA_MANUAL.md`; no deben reinterpretarse las casillas siguientes como el estado remoto actual.

## Rama y alcance

- [x] La rama parte exactamente de `8060f1ec04bf93b0f02c94d4dbd205ab4f834c7c`.
- [x] El trabajo se realiza en `ops/etapa-21-preparacion-fase-b`, sin publicar, fusionar o modificar directamente `main`.
- [x] FASE B, despliegue, limpieza, importación, alta de cuentas y creación de aplicaciones definitivas no se iniciaron.

## Clasificación privada

- [x] La hoja identificable existe solo bajo `.private/`.
- [x] Las 3 aplicaciones se clasificaron como 2 candidatas futuras por nombre Staging y 1 en revisión.
- [x] Las 3 cuentas, sus 3 perfiles y referencias operativas quedaron inventariados; las 3 decisiones siguen `REQUIERE_REVISION`.
- [x] Firestore quedó navegable en privado: 12 grupos y 41 documentos, todos `REQUIERE_REVISION`.
- [x] Los 20 documentos con marcadores de prueba no se reclasificaron automáticamente.
- [x] Los 5 principales IAM siguen `REQUIERE_REVISION`.
- [x] Las 11 Functions permanecen `CONSERVAR_HASTA_REEMPLAZO_CONTROLADO`.
- [x] Los 2 buckets técnicos y sus objetos permanecen `CONSERVAR`; los objetos no fueron abiertos, descargados ni eliminados.
- [x] No se publicó correo, UID completo, App ID completo, principal IAM ni ruta privada.

## Datos reales

- [x] Existe copia Markdown privada y JSON editable por bloques.
- [x] El validador comprueba estructura, ciclos, relaciones, cantidades, totales, usuarios, roles y secretos.
- [x] La plantilla vacía se reconoce como válida pero incompleta, sin inventar información.
- [ ] Estructura real aprobada por el propietario.
- [ ] Inventario inicial real, fuente y corte aprobados.
- [ ] Usuarios y roles reales aprobados.
- [ ] Históricos definidos o `SIN_HISTORICOS_A_MIGRAR` confirmado.
- [ ] Dispositivos y conectividad medidos.

Los cinco controles pendientes requieren información del propietario; no son fallos técnicos ni pueden cerrarse con fixtures.

## Paquete privado

- [x] La generación exige estructura e inventario completos y un conjunto sin errores; no confunde los otros tres bloques con el contrato de catálogo.
- [x] El formato y hash se prueban localmente con fixtures ficticios.
- [x] Un conjunto incompleto falla antes de escribir un paquete.
- [x] No se llama validación remota, importación o reversión.
- [x] No existe paquete preliminar de datos reales porque no se recibió información completa.

## Seguridad operacional

- [x] El Project ID permitido continúa siendo únicamente `viverocontrol-3f83f`.
- [x] La lectura manual aborta en CI y la lógica de CI usa solo fixtures y emuladores.
- [x] Las rutas locales de entrada y salida deben estar bajo `.private/`.
- [x] `.private/` continúa ignorado y no versionado.
- [x] `BACKUP_PENDIENTE` bloquea cualquier limpieza.
- [x] No hubo escrituras, borrados, despliegues, backups, PITR, protección contra borrado, cambios IAM, reglas, índices, Functions, Apps, Auth, Storage o APIs.

## Pruebas de cierre

- [x] Pruebas puras de auditoría y preparación aprobadas.
- [x] Contratos compartidos repetidos en la ejecución final.
- [x] Android debug/release, unit tests y lint repetidos en la ejecución final.
- [x] Maestro lint, typecheck, tests, build y audit repetidos en la ejecución final.
- [x] Backend lint, typecheck, tests, build, Emulator Suite, Rules y audit repetidos en la ejecución final.
- [x] Escaneo final de secretos, privados, artefactos y estado Git aprobado.

La matriz técnica está verde. Los cinco controles de información real continúan pendientes y FASE B permanece bloqueada; este cierre no los sustituye.

## Condición que impide iniciar FASE B

Aunque el código de preparación quede verde, FASE B sigue bloqueada hasta que:

1. el propietario cierre las clasificaciones privadas;
2. los cinco bloques reales estén completos y aprobados;
3. exista, en una etapa posterior autorizada, backup restaurable y prueba de restauración;
4. se resuelvan responsables, RPO, RTO, retención, costos, alertas y ventana;
5. se autorice expresamente el corte, las cuentas, las Apps productivas y el despliegue completo.
