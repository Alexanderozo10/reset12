# RENOVA — reconstrucción limpia

Esta carpeta contiene una reconstrucción de presentación RENOVA basada en el archivo original `index(1).html` recibido.

## Archivos
- `index.html`: aplicación principal, con checklist diario editable (crear/eliminar tareas) y guardado por perfil.
- `manifest.webmanifest`: nombre e identidad de la PWA.
- `sw.js`: caché con nombre de versión nuevo.
- `icon-192.png` y `icon-512.png`: iconos de la PWA.

## Importante antes de publicar
1. No borrar ni sobrescribir la rama `main`.
2. Subir primero a la rama `renova-redesign`.
3. Probar login, hábitos, mediciones, Drive y Calendar antes de usarla como aplicación principal.
4. Las claves de almacenamiento local existentes se mantienen deliberadamente para compatibilidad; no se renombró el espacio de datos.
5. Se conserva el Client ID OAuth que ya estaba en el HTML original. Verificar en Google Cloud que el dominio publicado está autorizado.
6. El respaldo de Drive no se importa automáticamente. No conectar Drive desde un perfil vacío antes de decidir cómo manejar el respaldo existente.
7. Esta entrega no ha sido probada de extremo a extremo en un navegador real. El checklist editable sí fue incorporado al código y se validará en navegador antes de usarla como versión principal.

El acceso al correo corporativo de la versión original también se conserva por ahora y debe revisarse si RENOVA será de uso personal.
