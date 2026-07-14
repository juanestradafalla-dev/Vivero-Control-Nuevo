# Protección del token de reserva en Android

## Diseño implementado

`ReservationTokenVault` separa persistencia y criptografía. `AndroidKeystoreReservationTokenVault` crea una clave AES no exportable dentro de `AndroidKeyStore` con propósitos cifrar/descifrar, modo GCM, sin padding y aleatoriedad obligatoria.

Cada cifrado usa `AES/GCM/NoPadding`, IV aleatorio generado por `Cipher` y etiqueta de 128 bits. Room guarda únicamente ciphertext e IV codificados. La clave no se guarda en archivo ni base de datos.

## Ciclo de vida

1. `reservarLinea` entrega el token una vez;
2. Campo lo cifra antes de guardar la reserva;
3. WorkManager lo descifra en memoria al construir la solicitud congelada;
4. ningún log, excepción, auditoría, analítica ni resultado contiene el token;
5. después de confirmar el servidor, una transacción Room marca `ENVIADA` y pone ciphertext e IV en `NULL`.

Si Keystore no puede cifrar, Campo muestra `TOKEN_ENCRYPTION_FAILED` y no persiste la reserva con token plano. Si el token no puede descifrarse, el envío queda en error controlado; no existe fallback inseguro.

## Pruebas

- AES-GCM recupera el valor original;
- dos cifrados del mismo token usan IV distintos;
- el ciphertext no contiene el texto plano;
- alterar ciphertext invalida autenticación;
- Room elimina ciphertext e IV junto con la transición local a `ENVIADA`;
- la búsqueda de repositorio impide token en logs y artefactos.

## Alcance

Esta protección resuelve el reinicio y el trabajo offline técnico. No cierra políticas futuras de bloqueo de pantalla, gestión corporativa, retención ni dispositivos reales.
