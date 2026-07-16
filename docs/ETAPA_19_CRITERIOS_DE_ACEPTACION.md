# ETAPA 19 — Criterios de aceptación

- [x] Las tres Callables están limitadas a administradores activos y proyectos emulados `demo-*`.
- [x] La importación reutiliza el validador, normaliza, recalcula y confirma SHA-256 antes de escribir.
- [x] El estado actual se vuelve a validar dentro de una única transacción.
- [x] El máximo seguro es 450 escrituras y no existen lotes ni resultados parciales.
- [x] IDs, jerarquía, líneas, bloqueos, inventarios y cargas se crean centralmente.
- [x] No se crea movimiento inicial ni se mezcla con registros existentes.
- [x] Un hash tiene exactamente un ganador concurrente y nunca puede reimportarse.
- [x] El registro histórico no contiene el paquete original ni datos privados.
- [x] La reversión solo elimina recursos intactos y completamente sin uso.
- [x] Registro, mapa, auditoría, idempotencia y bloqueo de hash se conservan al revertir.
- [x] Maestro exige fragmento del hash, muestra proyección, mapa e historial y confirma el motivo de reversión.
- [x] Firestore Rules niega todo acceso directo a importaciones y bloqueos.
- [x] Campo no recibe cambios funcionales.
- [x] No existe Firebase real, despliegue, APK, instalador ni migración productiva.

Una importación usada deja de ser reversible automáticamente. Producción requiere datos, decisiones, respaldo, autorización y un procedimiento de corte y reversión adicionales.
