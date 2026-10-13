# RENOVA — guía para Claude Code

App personal (PWA) de Alexander, publicada en GitHub Pages: https://alexanderozo10.github.io/reset12/
Sin build ni framework: HTML + CSS + JavaScript clásico. Backend: Supabase (auth con Google + Postgres con RLS).

## Reglas del proyecto
- Responde y escribe la interfaz en **español**.
- No agregues frameworks, bundlers ni npm. Las librerías van por CDN con **versión fija**: supabase-js 2.45.4 y xlsx 0.18.5.
- Los scripts son clásicos y comparten el ámbito global (los `onclick` del HTML llaman funciones globales). Si creas un módulo nuevo, agrégalo en `index.html` (respetando el orden) y en `APP_SHELL` de `sw.js`.
- Todo texto que venga del usuario o de la base se inserta con `escHtml()`.
- Tema oscuro únicamente. Los colores salen de las variables `:root` en `css/app.css`.

## Cómo fluyen los datos (core.js)
1. Cada acción modifica `data` y llama `save()`, que solo escribe la caché local (localStorage).
2. Para la nube se encola una operación con `cloud({key,t,table,...})` usando los `queue*()` (queueLog, queueCheck, queueHabit, queueMeasurement, queuePrefs, queueShop, queueState). La cola se reintenta sola (evento `online`, cada 60 s y al iniciar sesión).
3. Al iniciar sesión, `pullFromCloud()` descarga todo: **la nube manda**, salvo los cambios que siguen pendientes en la cola. También sube lo que solo existía en el teléfono.
4. El gym usa su propio autoguardado (`markGymDirty` → `flushGymDirty` → `saveGymSession`), porque reescribe todas las series de la sesión.
- **Nunca** escribas directo a Supabase desde una acción del usuario sin pasar por la cola, salvo en el gym y en la creación de rutinas/ejercicios (que necesitan el id que devuelve la base).
- Claves de las series del gym en `data.days[fecha].exercises`: `r<routineId>_e<exerciseId>_s<índice>`.

## Tablas que usa la app
profiles, user_preferences, user_app_state, daily_logs (agua en **ml**), habit_definitions, daily_habit_checks, body_measurements, shopping_list_items, workout_routines, routine_exercises, workout_sessions, workout_sets.
Todavía sin usar: daily_tasks (legado), nutrition_plans, meal_entries, agenda_events.
Todas tienen RLS con la política `renova_own_rows` (`user_id = auth.uid()`; en profiles es `id`).

## Al publicar
Sube la versión `?v=N` en `index.html` y la misma en `CACHE_VERSION`/`APP_SHELL` de `sw.js`.

## Pendiente
- Agenda propia guardada en `agenda_events` (Fase 4b).
- Nutrición desde `nutrition_plans`/`meal_entries` (hoy los menús están fijos en `js/nutrition.js`).
