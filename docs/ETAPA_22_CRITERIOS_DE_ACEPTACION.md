# ETAPA 22 — Criterios de aceptación

## Datos privados

- [x] Estructura real completa y validada localmente.
- [x] Inventario inicial completo, con fuente, corte y responsable.
- [x] Usuarios, roles, capacidades y responsables de acceso definidos.
- [x] Decisión de históricos cerrada explícitamente.
- [x] Dispositivos, computador y cobertura clasificados.
- [x] Cero errores y cero pendientes en el validador local.
- [x] Ningún nombre, correo, cantidad real, fuente identificable o paquete se añadió a Git.

## Ceros confirmados

- [x] El cero inicial no confirmado permanece bloqueado.
- [x] Una línea vacía exige `lineaVaciaConfirmada: true` y referencia trazable.
- [x] Una cantidad positiva marcada como vacía se rechaza.
- [x] El preflight genera una advertencia no bloqueante para el cero confirmado.
- [x] La importación conserva la confirmación en los dos documentos de inventario inicial.

## Paquete y seguridad

- [x] El paquete privado se construyó solo después de completar y validar los bloques requeridos.
- [x] La validación local no realizó operaciones remotas.
- [x] El paquete no fue validado ni importado contra Firebase.
- [x] No se crearon cuentas, Apps, secretos, backups, despliegues ni datos productivos.
- [x] El corte continúa bloqueado por los controles operativos posteriores.

## Pruebas

- [x] Pruebas puras de preparación y ceros confirmados aprobadas.
- [x] Lint y typecheck de Functions aprobados.
- [x] Integración de preflight e importación con Emulator Suite aprobada en CI con Java 21.
- [x] Escaneo final de privados, secretos, diff y estado Git aprobado.
