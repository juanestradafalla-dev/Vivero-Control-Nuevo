# Reglas de autorrevisión — Etapa 5

| Actor | Conteo ajeno | Conteo propio |
|---|---|---|
| Auxiliar | No puede revisar | No puede revisar |
| Supervisor autorizado | Puede aprobar o devolver | No puede aprobar; puede devolver con motivo |
| Administrador autorizado | Puede aprobar o devolver | Puede aprobar excepcionalmente con advertencia y motivo; puede devolver con motivo |

El rol se obtiene de la autorización activa de jornada y debe pertenecer también a los roles vigentes del perfil. Ningún rol enviado por Maestro participa en la decisión.

## Excepción administrativa

Cuando `autorUsuarioId == request.auth.uid` y el rol efectivo es `ADMINISTRADOR`:

- Maestro muestra una advertencia antes de confirmar;
- `motivoExcepcion` es obligatorio;
- la decisión guarda `autorrevisionAdministrativa=true` y el motivo;
- la auditoría registra la condición excepcional;
- idempotencia incluye el motivo en el hash del payload.

Un supervisor autor recibe `SELF_APPROVAL_FORBIDDEN`. La excepción no se extiende al supervisor ni al auxiliar.

## Inmutabilidad

La revisión crea una decisión separada. Nunca añade campos de revisión al conteo ni modifica sus cantidades, observaciones, autor o tiempos.
