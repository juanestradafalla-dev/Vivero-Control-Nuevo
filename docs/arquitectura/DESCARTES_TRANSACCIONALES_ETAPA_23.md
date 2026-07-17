# ETAPA 23 — Descartes transaccionales

## Decisión funcional

Se implementa el flujo A: Campo captura y Maestro revisa. Una captura sincronizada queda `PENDIENTE_REVISION`; no descuenta inventario por sí sola. Solo `aprobarDescarte` aplica la disminución oficial. `devolverDescarte` conserva la captura y el motivo sin cambiar cantidades.

Las categorías descontables son hembras, machos y patrones. El total único es su suma. Las causas —muertos, nematodos, cuello de ganso, raíces bifurcadas y doble injertación— son etiquetas superpuestas: una misma planta puede explicar varias causas, por lo que la suma de causas puede superar el total único. Ninguna causa individual puede superarlo.

## Operaciones centrales

| Callable | Actor | Efecto |
|---|---|---|
| `listarLineasDescarte` | Cuenta activa de Campo | Devuelve líneas activas con ubicación, inventario y versión. |
| `registrarDescarte` | Auxiliar, supervisor o administrador | Crea una captura inmutable pendiente; no modifica inventario. |
| `aprobarDescarte` | Supervisor o administrador | Valida versión y descuenta inventario en una transacción. |
| `devolverDescarte` | Supervisor o administrador | Guarda decisión y motivo; no modifica inventario. |

Cada mutación autentica la cuenta, vuelve a leer su perfil y usa una clave idempotente asociada al actor y a la operación. Repetir el mismo payload devuelve el mismo resultado; reutilizar la clave con otro payload se rechaza.

## Aprobación atómica

La aprobación lee el descarte pendiente y la fotografía oficial de la línea dentro de la misma transacción. Exige que `versionInventarioObservada` siga siendo la versión vigente y que cada categoría descartada sea menor o igual a su inventario disponible. Luego:

1. calcula la nueva fotografía sin valores negativos;
2. incrementa exactamente una vez la versión de inventario;
3. crea `decisionesDescartes` y un movimiento `DESCARTE_APROBADO`;
4. marca la captura como aprobada;
5. crea auditoría e idempotencia.

Dos descartes pueden registrarse contra la misma versión. La primera aprobación incrementa esa versión; la segunda recibe `DISCARD_STALE_INVENTORY` y debe volver a capturarse contra el inventario actualizado. Esto evita dobles descuentos silenciosos.

## Operación sin señal

Campo almacena en Room el catálogo consultado, la fotografía observada y un único borrador pendiente por cuenta y dispositivo. Al confirmar, congela cantidades, hora del dispositivo y clave idempotente. WorkManager espera conectividad y reintenta el mismo payload. Una sesión de Firebase ya iniciada se restaura al reiniciar; si no existe caché previa, el dispositivo debe conectarse una vez antes de entrar a los módulos sin cobertura.

Los módulos 3–5 no necesitan alcanzar directamente la antena para capturar. La confirmación central ocurre al regresar a cobertura. Si el inventario cambió durante ese intervalo, el backend rechaza el payload obsoleto en lugar de descontarlo.

## Autorrevisión y seguridad

Un supervisor nunca puede aprobar su propio descarte. Un administrador puede hacerlo solo como excepción y con motivo. Toda decisión usa hora de servidor y queda auditada. Firestore Rules permiten leer al autor o a revisores globales según corresponda, pero deniegan escrituras directas de capturas, decisiones, inventario, movimientos, auditoría e idempotencia.

Esta etapa no despliega, no importa inventario real y no crea cuentas.
