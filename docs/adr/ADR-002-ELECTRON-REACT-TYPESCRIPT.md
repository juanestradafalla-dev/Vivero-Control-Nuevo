# ADR-002: Electron, React y TypeScript para Maestro

## Contexto

Vivero Maestro será una aplicación Windows y necesita una interfaz modular sin
depender de código del sistema anterior.

## Decisión

Usar Electron, React, TypeScript y Vite. El renderer permanece aislado de Node;
el preload será mínimo y tipado. El `appId` provisional es
`com.arles.viveromaestro`.

## Alternativas

- Aplicación web alojada.
- Plataforma Windows nativa.
- Electron con integración directa de Node en el renderer.

## Consecuencias

Permite compartir prácticas web y empaquetar para Windows. Aumenta la atención
a actualizaciones y seguridad de Electron. Cualquier nueva API IPC requerirá
validación de origen, argumentos y permisos.

## Estado

Aceptada para la ETAPA 2.
