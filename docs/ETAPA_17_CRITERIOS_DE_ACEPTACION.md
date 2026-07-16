# Criterios de aceptación — ETAPA 17

- [x] Solo un administrador central activo registra inventario inicial.
- [x] La solicitud es estricta y el total se calcula exclusivamente en el backend.
- [x] Total cero, cantidades inválidas, fuente no ficticia y actividad previa se rechazan sin escrituras parciales.
- [x] Inventario versión 1, carga inmutable, auditoría e idempotencia se crean en una transacción.
- [x] La inicialización no crea movimiento ni supone inventario cero.
- [x] Dos operaciones concurrentes sobre la misma línea producen un solo ganador.
- [x] Una aprobación posterior crea versión 2 y diferencias correctas sin alterar la carga inicial.
- [x] Firestore Rules bloquea escrituras directas críticas.
- [x] Maestro presenta estado, detalle, elegibilidad y confirmación solo a administradores.
- [x] Campo no cambia funcionalmente.
- [x] Todas las cifras son ficticias; no hay importación, migración, Firebase real ni despliegue.
