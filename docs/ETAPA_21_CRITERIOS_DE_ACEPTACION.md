# ETAPA 21 — FASE A: criterios de aceptación

## Seguridad y sesión

- [x] La rama parte del commit `c9edc0eb711e7b5f7ecf314f1bbb28ab0a31ec86` de `main`.
- [x] Se confirmó una sesión Firebase autorizada sin publicar identidad o credenciales.
- [x] Todas las lecturas remotas usaron el Project ID literal `viverocontrol-3f83f`.
- [x] La salida real está en `.private/`, ignorada por Git.
- [x] No se leyó el contenido de archivos privados locales.
- [x] No hubo escrituras, borrados, despliegues, altas, importaciones, activación de APIs, cambios IAM o backups reales.

## Inventario y clasificación

- [x] Firestore se verificó en `nam5` y Functions en `us-central1`.
- [x] Proyecto, apps, Authentication, Firestore, Functions, Storage, reglas, índices, IAM, facturación y observabilidad tienen inventario sanitizado.
- [x] Las 3 cuentas y los 38 documentos ambiguos permanecen `REQUIERE_REVISION`.
- [x] Ninguna cuenta o documento se clasificó ficticio sin evidencia inequívoca.
- [x] Los dos registros explícitamente Staging se clasificaron `FICTICIO_CONFIRMADO` sin autorizar su eliminación.
- [x] La comparación registra 11/30 Functions, ausencia de apps productivas y 10 colecciones todavía no materializadas.
- [x] Reglas e índices locales coinciden con lo remoto.
- [x] Se documentaron los límites de Secret Manager, presupuestos y cuotas sin intentar evadirlos.

## Planes y datos requeridos

- [x] Existe un plan verificable de respaldo y restauración, sin ejecución.
- [x] Existe un plan de limpieza por objetivos exactos, sin globs ni comandos ejecutables amplios.
- [x] Existe un plan de corte de 13 pasos con detención y rollback por grupo.
- [x] El plan prohíbe limpiar `REQUIERE_REVISION` y conserva proyecto, `nam5` y `us-central1`.
- [x] Existe una plantilla vacía para la información real del propietario.
- [x] Se declara que no hay backup/PITR comprobado y que FASE B está bloqueada.

## Herramienta y pruebas

- [x] La herramienta rechaza otro Project ID, enmascara PII y clasifica conservadoramente.
- [x] La herramienta no contiene métodos de escritura/borrado y aborta en CI.
- [x] Contratos compartidos aprobados en la ejecución final.
- [x] Android debug/release, unit tests y lint aprobados.
- [x] Maestro lint, typecheck, tests y build aprobados.
- [x] Backend lint, typecheck, unit tests y build aprobados.
- [x] Emulator Suite, integración y Firestore Rules aprobados sin reducir suites ni aumentar timeouts.
- [x] Auditorías npm ejecutadas y riesgos registrados.
- [x] Escaneo final de secretos, artefactos y archivos no ignorados aprobado.

## Condición operativa

FASE A puede documentarse y revisarse, pero FASE B no puede comenzar hasta que el propietario:

1. apruebe o descarte cada recurso ambiguo;
2. defina responsables, RPO, RTO, retención, presupuesto y alertas;
3. aporte la información real requerida;
4. autorice y compruebe un backup restaurable;
5. apruebe los registros productivos de Android y Maestro;
6. apruebe el despliegue completo de 30 Functions y smoke tests;
7. resuelva o acepte formalmente los bloqueos de permisos/herramientas.
