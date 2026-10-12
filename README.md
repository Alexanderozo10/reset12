# RENOVA · v6 (Fases 1, 2 y 3)

## Fase 3: gym de verdad
- **Temporizador de descanso:** arranca al marcar una serie, usando el descanso de cada ejercicio. Tiene +15 s y Saltar, y avisa con vibración y sonido.
- **Última vez:** cada ejercicio muestra lo que hiciste en la sesión anterior, y cada serie trae ese peso y esas reps como sugerencia. Si marcas una serie sin escribir nada, se completa con la última vez.
- **Récords (PR):** aparece 🏆 en la serie que supera tu mejor marca, por peso o por 1RM estimado con la fórmula de Epley. La tarjeta "Mis récords" lista el mejor de cada ejercicio.
- **Autoguardado:** las series se suben solas unos segundos después de cada cambio. Sin señal, quedan en el teléfono y se suben al volver la conexión.
- **Terminar entreno:** marca la sesión como completada, da +50 XP (una sola vez) y muestra un resumen con series, volumen, duración y récords.
- **Formulario para ejercicios:** reemplaza las 5 ventanas `prompt()`. Conserva rangos como "30-45 segundos" y evita duplicados.
- Series en filas compactas (✓ · kg · reps), más cómodas en el móvil.

## Fase 2: limpieza
- 5 pestañas: Inicio, Hoy, Gym, Agenda y Progreso. Se quitó la pestaña Correo (Zimbra / sithonduras).
- **Nutrición** se abre desde Inicio, con el botón "🍽 Mi nutrición".
- **La tarjeta de perfil** ya no ocupa espacio arriba: pasó a Progreso → Mi cuenta. El chip con tu nombre en el encabezado lleva ahí.
- **Un solo nombre, RENOVA:** "día del ciclo"; los eventos de Calendar se crean como "RENOVA · …".
- **Calendar:** eliges qué bloques enviar. Por defecto solo Entrenamiento, para no llenar el calendario con 35 eventos.
- **Mensaje del día** que cambia cada día.
- Ajustes visuales: chip de cuenta legible y tamaño de botones uniforme.

## Fase 1: datos sólidos

## Qué cambió
- **La nube es la fuente principal.** Al abrir la app se descargan tus datos de Supabase. El navegador solo guarda una copia para abrir rápido y trabajar sin señal.
- **Cola de sincronización:** cada cambio se guarda en el teléfono y se sube solo. Si no hay red, queda pendiente y se sube cuando vuelve la conexión, aunque recargues la app. Arriba a la derecha se ve el estado: ☁️ Sincronizado / ⏳ por subir / 📴 Sin conexión.
- **Hábitos** → `habit_definitions` + `daily_habit_checks`. El checklist y los "hábitos adicionales" ahora son una sola lista. Al quitar un hábito, su historial se conserva.
- **Peso y cintura** → `body_measurements`, con una medición por día.
- **Agua** guardada en ml de verdad: 2.5 L se guarda como 2500.
- **Las sesiones de gym** que solo estaban en el teléfono se suben solas la primera vez.
- **Un dispositivo nuevo ya no reinicia** el ciclo de 84 días ni el XP.
- **Se quitó Google Drive.** El respaldo manual en JSON sigue en Progreso.
- Contraste corregido (botones secundarios, etiquetas, campos oscuros) y "Mi cuenta" sin `\n`.
- `supabase-js` fijado en la versión 2.45.4.

## Cómo publicar (en este orden)
1. Supabase → SQL Editor → pega y ejecuta `supabase/01_fase1_migracion.sql`. Al final, todas las tablas deben salir con `rls = true` y `politicas = 1`.
2. En GitHub, en el repo `reset12`, reemplaza `index.html`, `sw.js` y `README.md` con estos archivos.
3. **Borra `check.js` del repo:** es una versión vieja que no se usa.
4. En el teléfono, abre la app y espera a que diga ☁️ Sincronizado. Si ves la versión anterior, cierra la app del todo y vuelve a abrirla.

## Pendiente (siguientes fases)
- Fase 4: tablero semanal con gráficas y `agenda_events`.
- Fase 5: separar el código en módulos.
