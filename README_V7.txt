RESET 12 V7 — LOGIN + CLOUD SYNC

Incluye:
- Inicio de sesión con Google (Google Identity Services).
- Client ID configurado para GitHub Pages.
- Datos locales separados por cuenta de Google en el dispositivo.
- Migración del respaldo local V6 a la primera cuenta que inicia sesión.
- Google Drive con respaldo automático cuando Drive está conectado.
- Actualiza el mismo RESET12-backup.json para evitar duplicados.
- Funciona offline para el contenido de la app tras la primera carga.

URL:
https://alexanderozo10.github.io/reset12/

Seguridad:
- El Client ID es público y está pensado para una app web.
- Nunca publicar un Client Secret.
- El login es una identificación del lado del cliente; para una app multiusuario de alta seguridad se requeriría backend y verificación de tokens.
