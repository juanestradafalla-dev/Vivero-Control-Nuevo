# Criterios de aceptación — ETAPA 10

- [x] La base es `4fc6099d01b7a53efd738d9076e2f1741987b172`.
- [x] Supervisor y administrador pueden crear jornadas `BORRADOR` con identidad y hora centrales.
- [x] Auxiliares no crean ni consultan borradores.
- [x] Creación y actualización conservan idempotencia y detectan conflictos de payload.
- [x] Supervisor administra solo sus borradores y administrador puede administrar todos.
- [x] La selección exige IDs únicos y líneas existentes, activas y libres de jornadas activas.
- [x] La preparación se guarda separada de `jornadaLineas` operativas.
- [x] Maestro crea, abre, busca, filtra, agrupa y selecciona líneas de un borrador.
- [x] Maestro muestra `BORRADOR — AÚN NO DISPONIBLE EN CAMPO` y confirma antes de guardar.
- [x] No existen acciones para activar, cerrar, cancelar o eliminar jornadas.
- [x] Campo continúa listando únicamente jornadas `ACTIVA` autorizadas.
- [x] Las reglas rechazan escrituras directas de jornadas, selecciones y datos críticos.
- [x] No se crean estados `DISPONIBLE` ni se modifica inventario oficial.
- [x] Todo funciona únicamente en Firebase Emulator Suite con datos ficticios.
- [x] No se configuró Firebase real ni se agregó despliegue.
