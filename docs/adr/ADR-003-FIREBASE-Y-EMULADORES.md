# ADR-003: Firebase y Emulator Suite

## Contexto

El sistema necesita identidad, estado central, operaciones concurrentes y un
entorno de pruebas que no consuma recursos reales.

## Decisión

Preparar Firebase Authentication, Firestore y Functions TypeScript, desarrollando
primero contra Emulator Suite y proyectos ficticios `demo-*`. Desarrollo y
producción permanecerán separados.

## Alternativas

- Crear inmediatamente un proyecto Firebase real.
- Backend y base de datos autogestionados.
- Simulaciones unitarias sin emuladores.

## Consecuencias

Las pruebas locales son reproducibles y no requieren credenciales. El
comportamiento real deberá validarse nuevamente al aprobar ambientes, región y
responsables. Esta decisión no autoriza despliegues.

## Estado

Aceptada; proyecto real pendiente.
