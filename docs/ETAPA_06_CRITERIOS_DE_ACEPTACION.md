# Criterios de aceptación — Etapa 6

- [x] Solo el autor vigente puede iniciar la corrección de una línea `DEVUELTA`.
- [x] La reserva de corrección se crea atómicamente, usa token criptográfico y persiste solo su hash central.
- [x] Idempotencia y concurrencia producen una sola reserva y una sola transición.
- [x] Campo muestra motivo, precarga valores y conserva un borrador Room aislado y recuperable.
- [x] WorkManager y el cifrado de token existentes se reutilizan sin almacenar secretos en texto plano.
- [x] `enviarConteo` crea una versión nueva que apunta a la anterior inmutable.
- [x] La corrección vuelve a `PENDIENTE_REVISION` sin modificar inventario oficial.
- [x] Maestro muestra historial, motivo y versión vigente sin editar versiones anteriores.
- [x] Aprobar y devolver continúan validados contra `conteoVigenteId`.
- [x] Las escrituras directas críticas siguen prohibidas por reglas.
- [x] Todo funciona exclusivamente en Firebase Emulator Suite con datos ficticios.
- [x] Reasignación, liberación, datos reales, producción y despliegues permanecen fuera de alcance.
