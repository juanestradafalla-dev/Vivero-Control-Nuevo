# Vivero Maestro: fundación técnica

Esqueleto para Windows con Electron, React, TypeScript y Vite.

- `appId` provisional: `com.arles.viveromaestro`.
- `contextIsolation=true`.
- `nodeIntegration=false`.
- sandbox habilitado.
- preload mínimo y tipado.
- CSP bloquea objetos, cambios de URL base y envíos de formularios.
- Firebase no está configurado.
- No existe empaquetado ni instalador en esta etapa.

El `appId` debe confirmarse antes de registrar la aplicación en Firebase o publicar instaladores.
Las excepciones `connect-src` para `127.0.0.1:5173` y WebSocket existen solo
para Vite durante desarrollo. La política final de producción debe generarse
sin conexiones locales que no sean necesarias.

## Comandos

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run dev
```
