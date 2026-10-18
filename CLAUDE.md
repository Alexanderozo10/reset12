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
Además (v9+): nutrition_plans, food_items, recipes, recipe_ingredients, meal_plan_items, meal_entries, progress photos, ai_usage, cardio_logs, weekly_reviews, agenda_items, push_subscriptions (push_log y push_config solo el servidor). daily_tasks es legado.
Todas tienen RLS con la política `renova_own_rows` (`user_id = auth.uid()`; en profiles es `id`).

## Al publicar
Sube la versión `?v=N` en `index.html` y la misma en `CACHE_VERSION`/`APP_SHELL` de `sw.js`.


## Accesos directos (v13)
`manifest.webmanifest` → `shortcuts` abre `./?accion=…`. `js/shortcuts.js` lee la acción al cargar, la borra de la URL con `history.replaceState` y la ejecuta en `runLaunchAction()` (llamada desde `handleSupabaseSession` después de `pullFromCloud`). Android muestra máximo 4.

## Ciclo según meta (v13)
`js/progress.js` (14_cycle): `data.cycle={goal_kg,start_kg,pace,kg_week,days}`; `cycleDays()` reemplaza el 84 fijo. Se guarda en `user_app_state` (`cycle_duration_days` + columnas del SQL 03). `cycleCols` indica si el SQL 03 ya corrió; si no, la meta queda solo en el teléfono y la cola no falla.

## Efectividad de hábitos (v13)
`js/ui.js` (15_effect): `habitEffect()` cuenta desde `cycle_start_date` hasta ayer con la lista actual de hábitos; `renderEffect()` actualiza los anillos SVG de cada `.effcard` sin recrearlos (así anima `stroke-dashoffset`). El bono de día perfecto se calcula por transición en `toggleCheck` (antes/después de `allDone`), no se guarda estado.

## Medidas corporales (v13)
`js/progress.js` (16_body): `MEAS_FIELDS` (cintura, cuello, pecho, brazo, cadera, muslo, pantorrilla) ↔ columnas `*_cm` de `body_measurements` (SQL 03). `measCols` se detecta con una consulta de prueba a `neck_cm`; sin el SQL las medidas extra quedan solo en el teléfono. Guardar mezcla con la medición del día; el peso es obligatorio. `bodyFat()` = fórmula de la Marina de EE. UU. (estatura y sexo del plan de nutrición).

## Recetas con IA (v14 · N4)
`js/nutrition.js` (17_ai) llama `supabaseClient.functions.invoke(AI_FUNCTION)` (slug real en Supabase: `smooth-task`) con meta de la comida y la lista de alimentos; el resultado abre `editRecipe(null,draft)` para revisar y guardar. La función (`supabase/functions/ai-recetas/index.ts`, Deno) verifica la sesión, aplica tope de 20/24 h con la tabla `ai_usage` (SQL 04), fuerza la herramienta `receta` con enum de alimentos y valida la salida. La clave `ANTHROPIC_API_KEY` solo vive en Secrets de Supabase. Pruebas de la función: `tests/edge/ai_test.ts` con Deno.

## v16
- Nutrición: tarjetas `.fold` (18_fold en nutrition.js); `isFolded/toggleFold/openFold`, estado en localStorage `renova_fold`; `applyFolds()` corre en `render()`.
- Gym: `routineDoneOnWeek()` (gymSessionsLog + gymDone, semana lun–dom) y `weekStrip()`; caminadora en 19_cardio (gym-session.js): `data.cardio['fecha|rutina']`, tabla `cardio_logs` (SQL 05, `cardioCloud` si existe), `cardioCalc()` deduce velocidad/distancia y estima kcal (ACSM).

## v17
- Gym: `progressionFor(item)` (20_progresion) = doble progresión con `data.gymHistory`; `parseRange()` lee "10-12".
- Hábitos: `habitSince(id)` = mín(created_at, primer check); `data.habitSince` se llena en el pull.
- Nutrición: 21_offplan → `data.mealExtra[fecha][comida]={note,kcal,protein,ai}`; columnas nuevas de `meal_entries` solo si `mealCols`. `eatenToday()`.
- Revisión: 22_review (dashboard.js) → `data.reviews[lunes]`, tabla `weekly_reviews` (`reviewsCloud`).
- Agenda: 23_myagenda (agenda.js) → `data.agendaItems`, tabla `agenda_items` (`agendaCloud`).
- Push: 24_push (agenda.js) + handlers `push`/`notificationclick` en sw.js. La función (`kind`: receta|estimar|revision|vapid|push_test|cron) genera las claves VAPID en `push_config`; el cron (SQL 07, pg_cron + pg_net) la llama cada 15 min con `x-renova-cron`.
- Ojo con nombres globales repetidos entre módulos (todos los scripts comparten ámbito): `tests/check_globals.sh`.

## v18
- 25_shopexport (nutrition.js): `shopText()`, `whatsappShopping/shareShopping/copyShopping/excelShopping/pdfShopping`; jsPDF 2.5.1 se carga bajo demanda desde cdnjs; Excel usa el XLSX ya cargado.
