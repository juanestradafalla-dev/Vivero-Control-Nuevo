# Datos ficticios del emulador

Todos los registros de la ETAPA 3 usan el marcador
`entorno=FICTICIO_EMULADOR`, nombres de prueba y el proyecto
`demo-vivero-control-etapa3`. No representan el vivero real.

## Catálogo y jornada

- Vivero: `VIVERO-PRUEBA`.
- Módulo: `MODULO-PRUEBA-1`.
- Cama: `CAMA-PRUEBA-1`.
- Líneas: `LINEA-PRUEBA-1`, `LINEA-PRUEBA-2` y `LINEA-PRUEBA-3`.
- Jornada activa: `JORNADA-PRUEBA-ETAPA-3`.
- Jornada negativa de prueba: `JORNADA-PRUEBA-INACTIVA`.

Las líneas 1 y 2 se cargan `DISPONIBLE`. La línea 3 se carga `EN_CONTEO` con
una reserva ficticia preexistente para verificar lecturas y conflictos.

## Cuentas operativas

| Correo ficticio | Rol |
|---|---|
| `auxiliar1@prueba.local` | `AUXILIAR` |
| `auxiliar2@prueba.local` | `AUXILIAR` |
| `supervisor@prueba.local` | `SUPERVISOR` |
| `administrador@prueba.local` | `ADMINISTRADOR` |

Contraseña común: `SoloEmulador-Etapa3!`.

Esta contraseña es pública, deliberadamente ficticia y no debe reutilizarse en
ningún ambiente ni servicio. El dominio `.local` evita confundir las cuentas con
correo real.

El seed también crea `inactivo@prueba.local`, `sin-acceso@prueba.local` y
`sin-perfil@prueba.local` para pruebas negativas automatizadas. No son cuentas
operativas.

## Carga reproducible

Con los emuladores activos, desde `backend/functions`:

```powershell
npm run emulator:seed
```

El script:

- cancela la ejecución si el ID no empieza por `demo-`;
- configura únicamente hosts locales de Auth y Firestore;
- crea o actualiza las cuentas con UID estable;
- sobrescribe los documentos ficticios con IDs estables;
- limpia reservas, idempotencia, auditoría y líneas de jornada antes de
  reconstruir el escenario;
- puede repetirse sin duplicar registros.

No ejecute el script con variables de emulador dirigidas a hosts no controlados.
No existe comando de importación de datos reales en esta etapa.
