# Pruebas de concurrencia de `reservarLinea`

## Ejecución integrada

Desde `backend/functions`:

```powershell
npm ci
npm run test:emulators
```

El comando compila Functions, inicia Auth, Firestore y Functions Emulator con
el proyecto `demo-vivero-control-etapa3`, carga el seed, ejecuta las pruebas de
integración y después las reglas. Los procesos se detienen al finalizar.

## Escenario concurrente

1. El seed deja `JORNADA-PRUEBA-ETAPA-3__LINEA-PRUEBA-1` disponible y con
   versión 0.
2. `auxiliar1@prueba.local` y `auxiliar2@prueba.local` inician sesión en Auth
   Emulator.
3. Ambos invocan la Callable Function en paralelo, con dispositivos y claves
   idempotentes válidos.
4. Las promesas se esperan con `Promise.allSettled`.
5. La prueba consulta el estado final mediante Admin SDK conectado al emulador.

## Invariantes comprobadas

- exactamente una invocación termina con `EN_CONTEO`;
- exactamente una termina con `LINE_NOT_AVAILABLE`;
- existe una sola reserva para la línea;
- la línea apunta a esa reserva y su versión es 1;
- existe un único evento `LINEA_RESERVADA`;
- existe un único resultado idempotente del ganador;
- la repetición con la misma cuenta, clave y payload devuelve el resultado
  original sin nuevas escrituras;
- la misma clave con otro payload produce `IDEMPOTENCY_CONFLICT`.

La verificación consulta Firestore después de las llamadas; no se limita al
código HTTP.

## Cobertura integrada adicional

La suite también rechaza usuario anónimo, cuenta sin perfil, usuario inactivo,
usuario sin autorización, jornada inexistente o inactiva, línea inexistente y
línea ocupada. Las pruebas de reglas permiten las lecturas mínimas y rechazan
reserva ajena, auditoría, idempotencia y toda escritura crítica directa.

## Visualización

Campo y Maestro usan listeners de Firestore sobre `jornadaLineas`. Maestro tiene
una prueba de componente que inyecta un nuevo snapshot y comprueba el cambio
visible. La prueba integrada confirma el documento central producido por la
Callable Function; no automatiza una ventana Electron y un emulador Android
reales en la misma ejecución.

## Resultado de referencia

El 13 de julio de 2026 la ejecución local completó 13 pruebas integradas de la
Callable Function y 7 pruebas de reglas. El caso concurrente produjo un ganador,
un conflicto y una sola reserva. CI repite el mismo comando sin despliegue.
