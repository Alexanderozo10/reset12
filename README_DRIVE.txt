# RESET 12 V6 — Google Drive

Esta versión agrega respaldo en Google Drive mediante OAuth 2.0.

## Lo que hace
- Guarda localmente de forma automática.
- Permite conectar una cuenta Google.
- Crea una carpeta `RESET 12` en Mi Drive.
- Guarda/actualiza `RESET12-backup.json`.
- El backup contiene hábitos, progreso, mediciones y configuración del tracker.

## Lo que debes configurar una sola vez
Google requiere que la aplicación tenga un OAuth 2.0 Client ID para una aplicación web. No compartas contraseñas ni tokens.

1. Crea/configura un proyecto en Google Cloud.
2. Habilita Google Drive API.
3. Configura Google Auth Platform.
4. Crea un OAuth Client ID de tipo Web application.
5. Añade como origen autorizado el dominio HTTPS donde alojes RESET 12.
6. Abre RESET 12, pega ese Client ID en Configuración/Google Drive y pulsa Conectar.
7. Autoriza el acceso.
8. Pulsa `Guardar en Drive`.

Google documenta que una app web puede usar OAuth 2.0 y Drive API para subir archivos a Drive. La app usa el alcance `drive.file`, más limitado que dar acceso completo a todo tu Drive.

IMPORTANTE:
- Para que OAuth funcione, la app debe estar publicada en HTTPS (o ejecutarse en localhost durante desarrollo).
- No pongas un Client Secret en el navegador. Las aplicaciones web cliente usan el Client ID y OAuth; Google indica que los client secrets no se usan para aplicaciones web.
