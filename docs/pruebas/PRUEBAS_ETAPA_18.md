# Pruebas de la ETAPA 18

## Contratos

- compila el esquema `paquete-migracion-catalogo-v1` y el informe;
- acepta la plantilla ficticia;
- rechaza IDs internos, `total` y campos adicionales.

## Backend y emuladores

- paquete ficticio válido;
- versión desconocida, estructura adicional y límite de tamaño;
- claves, códigos e inventarios duplicados;
- padres inexistentes, ciclos, línea sin ubicación e inventario sin línea;
- línea activa sin inventario;
- negativos, decimales, desbordamiento y total cero;
- catálogo coincidente, clave incompatible, inventario existente y ocupación activa;
- hash idéntico con orden y representación normalizada equivalentes;
- administrador permitido; supervisor y auxiliar rechazados;
- secretos y datos privados rechazados;
- Firestore completo idéntico antes y después.

## Maestro y compatibilidad

- valida localmente formato, JSON y tamaño antes del envío;
- muestra hash, cantidades, errores, advertencias y conflictos;
- filtra por entidad y severidad;
- exporta un informe sin el paquete original;
- confirma visualmente que no importó ni escribió datos;
- la sección solo aparece para administradores;
- Campo conserva compilación y pruebas sin cambios funcionales.

La matriz final ejecuta contratos, Android, Maestro, backend, reglas, emuladores y auditorías. No contiene `firebase deploy`.
