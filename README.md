# RENOVA · v7

App web (PWA) personal: hábitos, gym, nutrición, agenda y progreso, con datos en Supabase y funcionamiento sin conexión.

## Estructura (Fase 5: código en módulos)
```
index.html            Solo el HTML de las pantallas
css/app.css           Todos los estilos
js/core.js            Configuración, estado, caché local, cola de sincronización y carga desde Supabase
js/ui.js              Navegación, render principal, hábitos y datos del día
js/gym-routines.js    Importar rutinas desde Excel; crear/duplicar/editar/archivar rutinas
js/gym-session.js     Sesión de gym: descanso, última vez, récords, autoguardado, terminar entreno
js/progress.js        Mediciones, racha, ciclo de 84 días, exportar/importar
js/dashboard.js       Tablero semanal y gráficas SVG
js/nutrition.js       Menús y lista de compras
js/agenda.js          Horarios y Google Calendar
js/auth.js            Login con Google (Supabase) y arranque
sw.js                 Service worker (red primero, caché si no hay señal)
supabase/             SQL de migración y seguridad (RLS)
```
Los scripts se cargan en ese orden al final de `index.html`. Son scripts clásicos: las funciones son globales porque los botones usan `onclick="…"`.

## Novedades
- **v7 · Tablero semanal** (Progreso): cumplimiento de hábitos, entrenos, volumen, pasos, sueño, agua y récords de la semana, comparados con la semana anterior. Incluye gráficas por día, peso de las últimas 8 semanas, vista de tabla y navegación entre semanas.
- **v7 · Código en módulos:** antes era un solo HTML de 120 KB.
- **v6 · Gym:** temporizador de descanso, última vez, récords (PR), autoguardado, terminar entreno y formulario de ejercicios.
- **v5 · Limpieza:** 5 pestañas, sin Correo, un solo nombre (RENOVA) y Calendar selectivo.
- **v4 · Datos:** Supabase como fuente principal, cola sin conexión, hábitos y mediciones en sus tablas, RLS y sin Drive.

## Cómo publicar una versión nueva
1. Sube en `index.html` el número `?v=7` de todos los `<script>` y del `<link>` del CSS. Pon el mismo número en `CACHE_VERSION` y en la lista `APP_SHELL` de `sw.js`.
2. Haz commit y push a GitHub; GitHub Pages publica solo.
3. En el teléfono, cierra la app del todo y vuelve a abrirla.

## Supabase
Ejecuta `supabase/01_fase1_migracion.sql` una vez en el SQL Editor. Es idempotente: no duplica nada si lo corres otra vez.
