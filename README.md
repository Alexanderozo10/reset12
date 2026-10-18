# RENOVA · v17

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
js/shortcuts.js       Accesos directos del ícono (?accion=agua|habitos|entreno|comi)
js/auth.js            Login con Google (Supabase) y arranque
icons/                Íconos de los accesos directos
sw.js                 Service worker (red primero, caché si no hay señal)
supabase/             SQL de migración y seguridad (RLS)
```
Los scripts se cargan en ese orden al final de `index.html`. Son scripts clásicos: las funciones son globales porque los botones usan `onclick="…"`.

## Novedades
- **v17 · Progresión automática (gym):** ⬆️ sube el peso si hiciste todas las series en el tope del rango, ⬇️ baja ~10 % tras dos sesiones sin llegar al mínimo, = mantén y busca +1 rep. El peso sugerido aparece en las casillas.
- **v17 · Revisión del domingo:** en Progreso, resumen de la semana (hábitos, rutinas, caminadora, peso, comidas, sueño), tu reflexión y 3 ajustes con IA. Aviso en Inicio domingo y lunes. +30 XP por semana.
- **v17 · Comidas fuera del plan:** al marcar "⇄ Otra" anotas qué comiste, con kcal/proteína a mano o estimadas con IA (texto o foto). Inicio muestra lo comido de verdad en el día.
- **v17 · Agenda propia:** eventos en RENOVA con aviso opcional; los de hoy salen en Inicio.
- **v17 · Recordatorios:** notificaciones en el teléfono para agua, gym, cerrar el checklist, pesarte los lunes y tus eventos (solo si te falta hacerlo).
- **v17 · Hábitos justos:** cada hábito cuenta desde el día en que lo creaste.
- **v16 · Nutrición plegable:** cada sección se pliega tocando su título (se recuerda); "✨ Crear receta con IA" quedó arriba.
- **v16 · Gym:** franja "Esta semana" con ✅ en las rutinas ya hechas (lun–dom) y en el selector; **Caminadora** en todas las rutinas: tiempo, distancia, velocidad, inclinación y calorías (velocidad/distancia se calculan solas y las calorías se estiman con la fórmula ACSM si no pones las de la máquina).
- **v14 · Recetas con IA (N4):** botón "✨ Crear con IA" en el recetario. Claude (Haiku 5.5) arma la receta solo con alimentos de tu recetario, sin pescado ni mariscos, apuntando a la meta de esa comida; se abre en el editor para revisarla y guardarla. La clave vive en los Secrets de Supabase (función con slug `smooth-task`, nombre visible `ai-recetas`; el slug se configura en `AI_FUNCTION` de `js/nutrition.js`), con tope de 20 recetas por día.
- **v13 · Medidas completas:** además de peso y cintura: cuello, pecho, brazo, cadera/glúteos, muslo y pantorrilla (con guía de cómo medir). Composición corporal estimada (% grasa con la fórmula de la Marina de EE. UU., masa grasa y magra), cintura/estatura, cintura/cadera (OMS) y cuánto de lo que bajas es grasa vs masa magra. Tendencia por medida.
- **v13 · Efectividad de hábitos:** anillo animado en Inicio y en Hoy. Exterior: hábitos cumplidos ÷ posibles desde el inicio del ciclo (se acumula cada día). Interior: hoy. Barra de nivel (500 XP por nivel), +25 XP flotante por hábito, bono de +50 por día perfecto (se devuelve si desmarcas) y % por hábito en el checklist.
- **v13 · Ciclo según tu meta:** en Progreso → "Calcular la duración según mi meta de peso". Con peso, meta, estatura, edad, sexo y actividad calcula tu gasto (Mifflin-St Jeor) y simula semana a semana cuánto tardas a 4 ritmos: tu plan de comidas, 0,5 %, 0,75 % o 1 % del peso por semana (rango que conserva músculo). Valida que la meta esté en IMC saludable, avisa si un ritmo te deja por debajo del basal, calcula tu ritmo real con tus mediciones (regresión lineal, 6 semanas) y al terminar muestra el cierre del ciclo con botón para iniciar otro.
- **v13 · Accesos directos:** mantén presionado el ícono de RENOVA → 💧 +500 ml, ✅ Hábitos, 🏋️ Entreno de hoy y 🍽️ Comí (marca la comida según la hora). Se pueden arrastrar a la pantalla de inicio. Requiere reinstalar la app una vez.
- **v12 · Plan semanal (N3):** "Llenar semana" con recetas ajustadas a tu meta (sin repetir días seguidos), cambiar cualquier comida, registro ✓ Comí / ⇄ Otra / ✗ Salté (en Inicio y en Nutrición), lista de compras generada desde el plan (cocido → crudo, redondeo a libras/kg/unidades, por sección del súper) y cumplimiento del plan en el tablero semanal.
- **v11 · Recetario (N2):** 12 recetas base y las tuyas; "Ajustar a mi comida" calcula gramos para tu meta (proteína primero, topes realistas por porción, aviso si falta proteína); "Hoy te sugiero" reemplaza los menús fijos; crear recetas y alimentos propios.
- **v11 · Hoy:** se quitó "Datos rápidos" (duplicaba el Registro rápido); la nota del día pasó al Registro rápido de Inicio.
- **v10 · Fotos de progreso (M3):** en Progreso, frente/perfil/espalda por fecha, comprimidas en el teléfono, guardadas en la carpeta privada `progress-photos` de Supabase y comparación lado a lado con el peso de cada fecha.
- **v9 · Registro rápido (M1):** en Inicio, agua con +250/+500 ml, sueño con un toque y pasos, cada uno con su meta.
- **v9 · Metas de nutrición (N1):** formulario único → calorías, proteína, carbohidratos y grasa del día, con reparto por comida (3 o 4) y recálculo automático cuando cambia tu peso.
- **v8 · Gym:** ejercicios plegables; "Terminar entreno" guarda y deja la rutina en blanco; panel "Entrenamiento de hoy" en Inicio con rotación sugerida; peso promedio por serie en lugar de kilos acumulados; crear e importar rutinas pasó a una sección plegable al final de Gym.
- **v8 · Otros:** hora y fecha en Inicio; borrar eventos de Google Calendar con la ✕; editor de la fecha de inicio del ciclo de 84 días (Progreso).
- **v7 · Tablero semanal** (Progreso): cumplimiento de hábitos, entrenos, volumen, pasos, sueño, agua y récords de la semana, comparados con la semana anterior. Incluye gráficas por día, peso de las últimas 8 semanas, vista de tabla y navegación entre semanas.
- **v7 · Código en módulos:** antes era un solo HTML de 120 KB.
- **v6 · Gym:** temporizador de descanso, última vez, récords (PR), autoguardado, terminar entreno y formulario de ejercicios.
- **v5 · Limpieza:** 5 pestañas, sin Correo, un solo nombre (RENOVA) y Calendar selectivo.
- **v4 · Datos:** Supabase como fuente principal, cola sin conexión, hábitos y mediciones en sus tablas, RLS y sin Drive.

## Cómo publicar una versión nueva
1. Sube en `index.html` el número de versión (`?v=8` → `?v=9`) de todos los `<script>` y del `<link>` del CSS. Pon el mismo número en `CACHE_VERSION` y en la lista `APP_SHELL` de `sw.js`.
2. Haz commit y push a GitHub; GitHub Pages publica solo.
3. En el teléfono, cierra la app del todo y vuelve a abrirla.

## Supabase
Ejecuta en orden, una vez cada uno, en el SQL Editor: `supabase/01_fase1_migracion.sql`, `supabase/02_nutricion_y_mejoras.sql` `supabase/03_ciclo_y_medidas.sql`, `supabase/04_ia.sql`, `supabase/05_caminadora.sql`, `supabase/06_v17.sql` y (después de desplegar la función) `supabase/07_cron_recordatorios.sql`. Son idempotentes: no duplican nada si los corres otra vez.

## IA (Edge Function `ai-recetas`)
1. Supabase → **Edge Functions → Secrets**: agrega `ANTHROPIC_API_KEY` con tu clave de console.anthropic.com.
2. Supabase → **Edge Functions → Deploy a new function → Via Editor**: nombre `ai-recetas`, pega `supabase/functions/ai-recetas/index.ts` y despliega. En los ajustes de la función **desactiva *Verify JWT***: la función ya verifica tu sesión por su cuenta, y así no falla con las claves nuevas de Supabase.
   Con la CLI: `supabase functions deploy ai-recetas`.
3. Recarga saldo en console.anthropic.com → Settings → Billing. Cada receta cuesta ~0,001 USD.
**Nunca** pongas la clave en `js/` ni en el repositorio.
