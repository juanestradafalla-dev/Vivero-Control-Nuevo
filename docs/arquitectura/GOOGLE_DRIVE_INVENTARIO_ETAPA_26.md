# ETAPA 26 — Configuración histórica de Google Drive

La configuración de esta etapa mediante identidad de servicio e IDs en variables quedó sustituida por la ETAPA 27B. No use los comandos ni las variables antiguas `GOOGLE_DRIVE_INVENTORY_MODE=google`, `GOOGLE_DRIVE_INVENTORY_FOLDER_ID` o `GOOGLE_DRIVE_INVENTORY_TEMPLATE_FILE_ID`.

La arquitectura vigente utiliza OAuth de usuario, alcance exclusivo `drive.file`, Google Picker y Secret Manager. Consulte [GOOGLE_DRIVE_OAUTH_ETAPA_27.md](GOOGLE_DRIVE_OAUTH_ETAPA_27.md).

El cierre durable, la generación XLSX y la deduplicación por jornada y periodo definidos en la ETAPA 26 permanecen vigentes. Este documento no autoriza despliegues ni escrituras en Google Drive.
