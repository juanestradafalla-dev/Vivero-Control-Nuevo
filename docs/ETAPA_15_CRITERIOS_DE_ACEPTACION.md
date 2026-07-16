# Criterios de aceptación — ETAPA 15

- Solo un administrador central activo lista o modifica perfiles.
- El listado contiene únicamente datos administrativos necesarios y advertencias de trabajo activo.
- Estado y rol se actualizan con versión, motivo, auditoría, idempotencia y hora central.
- No es posible autodesactivarse, retirar el propio rol administrador ni dejar el sistema sin administrador activo.
- Los roles se limitan a auxiliar, supervisor y administrador.
- Un cambio de rol se rechaza con jornada, reserva o corrección activa.
- Desactivar bloquea nuevas operaciones sin liberar, reasignar ni modificar historia.
- Reactivar conserva el rol anterior.
- La misma clave y payload recuperan el resultado; otro payload produce conflicto.
- Dos administradores sobre la misma versión producen un solo ganador.
- Firestore Rules niegan listado y escrituras directas de perfiles.
- Maestro muestra “Usuarios” solo a administradores y refresca la versión tras cada cambio.
- Maestro y Campo invalidan una sesión desactivada y muestran “Cuenta desactivada”.
- Campo conserva Room, borradores, payload congelado y token cifrado.
- Firebase Auth, autorizaciones históricas, reservas, conteos, inventario, movimientos y auditorías anteriores permanecen intactos.
- Todo funciona solo con Emulator Suite y datos ficticios; no existe configuración ni despliegue real.
