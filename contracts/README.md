# Contratos compartidos

JSON Schema Draft 2020-12 define el lenguaje común de Campo, Maestro y backend.
La ETAPA 3 agrega:

- `ReserveLineRequest` con solo línea de jornada, dispositivo y clave;
- `ReserveLineResult` con reserva, estado, token opaco, hora, versión y ubicación;
- error controlado;
- estado administrativo de jornada;
- autorización de jornada;
- resultado idempotente.

Los ejemplos de `examples/etapa-03/` son ficticios. Las pruebas comprueban que
los payload usados por Campo y backend cumplen los mismos esquemas y que una
solicitud que intenta enviar un actor es inválida.

```powershell
Set-Location contracts
npm ci
npm run validate
npm test
```

`validate` compila todos los esquemas con Ajv 2020. Las pruebas mantienen además
las invariantes aritméticas de contratos anteriores. Todavía no hay generación
automática de Kotlin/TypeScript; cualquier cambio de DTO debe actualizar el
esquema, sus ejemplos y las pruebas en el mismo commit.
