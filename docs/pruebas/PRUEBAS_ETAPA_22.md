# ETAPA 22 — Pruebas

## Alcance

Las pruebas nuevas cubren la excepción controlada para líneas vacías sin relajar el rechazo del cero no confirmado:

- preparación privada acepta cero solo con confirmación y observación;
- el paquete conserva `lineaVaciaConfirmada`;
- el preflight rechaza cero no confirmado;
- el preflight admite cero confirmado con advertencia;
- una cantidad positiva marcada como vacía se bloquea;
- la importación conserva la marca y el total cero en inventario oficial y carga inicial.

## Comandos de cierre

```powershell
Set-Location backend/functions
npm run lint
npm run typecheck
npm run test:audit
npm run test:emulators
```

La validación privada se ejecuta por separado y escribe solo bajo `.private/`. Ninguna prueba apunta al proyecto de producción ni despliega recursos.

## Estado

- pruebas puras de auditoría: aprobadas;
- lint: aprobado;
- typecheck: aprobado;
- Emulator Suite: aprobada en CI con Java 21;
- contratos, Campo, Maestro y escaneo de secretos: aprobados en CI;
- operaciones remotas: cero.
