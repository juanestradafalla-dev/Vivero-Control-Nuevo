# Criterios de aceptación — ETAPA 4

## Campo

- [x] Auxiliar, supervisor y administrador usan el mismo flujo de Campo.
- [x] Ubicación, responsable, dispositivo, jornada, línea y reserva quedan ligados al formulario.
- [x] Tres cantidades obligatorias, enteras, no negativas y seguras; total visible derivado.
- [x] Cero aceptado con advertencia no bloqueante y observaciones opcionales con defensa técnica 4.000.
- [x] Resumen no editable y confirmación explícita.
- [x] Intento, payload y clave permanecen iguales durante reintentos.
- [x] Room restaura e impide mostrar borrador a otra cuenta.
- [x] WorkManager real usa conectividad, trabajo único y estados locales visibles.
- [x] `ENVIADA` aparece solo después de confirmación central.
- [x] Token cifrado con clave Keystore no exportable y eliminado tras éxito.

## Backend

- [x] `enviarConteo` está bloqueada a emulator y proyecto `demo-*`.
- [x] Request estricto sin identidad, rol, línea, jornada, total ni hora central.
- [x] Todas las identidades y autorizaciones se reconstruyen centralmente.
- [x] Token se compara por hash en tiempo constante y no se registra.
- [x] Una transacción crea conteo, consume reserva, cambia línea, audita e idempotentiza.
- [x] Reintento idéntico recupera resultado; payload distinto entra en conflicto.
- [x] Concurrencia crea exactamente un conteo.
- [x] Inventario oficial permanece ausente o intacto.

## Reglas y Maestro

- [x] Autor lee sus conteos; supervisor/administrador autorizado lee la jornada; auxiliar no lee ajenos.
- [x] Ningún cliente escribe conteos ni colecciones críticas.
- [x] Maestro observa `PENDIENTE_REVISION` y detalle autorizado en vivo.
- [x] Maestro ofrece búsqueda/filtro y ninguna acción de revisión o inventario.

## Calidad y seguridad

- [x] Contratos, Android, Maestro, backend y emuladores tienen comandos reproducibles.
- [x] CI contiene validación de secretos y artefactos prohibidos.
- [x] No existe configuración, credencial, despliegue ni acceso a Firebase real.

## Pendientes explícitos

No se cierran límites operativos, obligatoriedad de observaciones, política de cero, retención local, dispositivos reales, señal real, tolerancia de reloj ni Firebase de producción.
