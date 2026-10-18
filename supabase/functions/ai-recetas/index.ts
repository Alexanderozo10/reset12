// RENOVA · Edge Function (slug en Supabase: smooth-task)
// Según "kind" en el cuerpo:
//   (vacío) | "receta" → receta con IA usando solo alimentos de tu recetario (N4)
//   "estimar"          → calorías y proteína de una comida fuera del plan (texto o foto)
//   "revision"         → 3 ajustes para la próxima semana (revisión del domingo)
//   "vapid"            → clave pública para activar recordatorios en el teléfono
//   "push_test"        → envía una notificación de prueba a tus teléfonos
//   "cron"             → lo llama Supabase cada 15 min (secreto x-renova-cron) y envía recordatorios
// La clave ANTHROPIC_API_KEY vive en los Secrets de Supabase: nunca en el código de la app.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

export const MODEL = "claude-haiku-5-5";
export const DAILY_LIMIT = 20;
const ROLES = ["proteina", "carbohidrato", "grasa", "libre"];
const MEALS = ["desayuno", "almuerzo", "cena", "merienda", "cualquiera"];
const ALLOWED_ORIGINS = ["https://alexanderozo10.github.io"];

function cors(origin: string | null) {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-renova-cron",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
const json = (body: unknown, status: number, h: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...h, "Content-Type": "application/json" } });

type Food = { name: string; category?: string };
type Input = { prompt?: string; meal_type?: string; target?: { kcal?: number; protein?: number }; foods?: Food[] };

export function buildRequest(inp: Input) {
  const foods = (inp.foods || []).map((f) => String(f.name).slice(0, 80)).filter(Boolean).slice(0, 200);
  const meal = MEALS.includes(inp.meal_type || "") ? inp.meal_type! : "almuerzo";
  const kcal = Math.round(Number(inp.target?.kcal) || 0), prot = Math.round(Number(inp.target?.protein) || 0);
  const system = [
    "Eres el nutricionista de RENOVA, una app personal en Colombia. Creas recetas caseras, fáciles y rápidas (máximo 30 minutos salvo que pidan otra cosa), en español de Colombia.",
    "Reglas obligatorias:",
    "- Usa SOLO alimentos de la lista permitida, escritos exactamente igual.",
    "- Nunca uses pescado ni mariscos. El atún en lata sí está permitido.",
    "- Los gramos son del alimento COCIDO o listo para comer, para una porción.",
    "- Marca cada ingrediente con su rol: proteina, carbohidrato, grasa o libre (verduras, condimentos). Incluye al menos uno con rol proteina.",
    "- Entre 3 y 7 ingredientes. Pasos cortos y numerados, sin relleno.",
    "- Apunta a la meta de calorías y proteína de esa comida; la app ajusta los gramos después.",
  ].join("\n");
  const user = `Comida: ${meal}.${kcal ? ` Meta de esta comida: ~${kcal} kcal y ~${prot} g de proteína.` : ""}\n` +
    `Lo que quiero: ${String(inp.prompt || "algo rico y fácil").slice(0, 300)}\n\nAlimentos permitidos:\n${foods.join("\n")}`;
  return {
    model: MODEL,
    max_tokens: 1500,
    system,
    messages: [{ role: "user", content: user }],
    tool_choice: { type: "tool", name: "receta" },
    tools: [{
      name: "receta",
      description: "Devuelve la receta lista para guardar en el recetario de RENOVA.",
      input_schema: {
        type: "object",
        required: ["name", "meal_type", "prep_minutes", "items", "steps"],
        properties: {
          name: { type: "string", description: "Nombre corto y apetitoso (máx. 60 caracteres)" },
          meal_type: { type: "string", enum: MEALS },
          prep_minutes: { type: "integer", minimum: 1, maximum: 240 },
          items: {
            type: "array", minItems: 2, maxItems: 8,
            items: {
              type: "object", required: ["food", "role", "grams"],
              properties: {
                food: { type: "string", enum: foods.length ? foods : ["Pechuga de pollo"] },
                role: { type: "string", enum: ROLES },
                grams: { type: "number", minimum: 1, maximum: 1000 },
              },
            },
          },
          steps: { type: "array", minItems: 1, maxItems: 8, items: { type: "string" } },
          tip: { type: "string", description: "Un consejo corto opcional" },
        },
      },
    }],
  };
}

// Limpia y valida lo que devuelve el modelo (nunca se confía a ciegas)
export function cleanRecipe(r: any, foods: Food[]) {
  const names = new Map(foods.map((f) => [String(f.name).toLowerCase(), String(f.name)]));
  const seen = new Set<string>();
  const items = (Array.isArray(r?.items) ? r.items : []).map((i: any) => ({
    food: names.get(String(i?.food || "").toLowerCase()),
    role: ROLES.includes(i?.role) ? i.role : "libre",
    grams: Math.min(1000, Math.max(1, Math.round(Number(i?.grams) || 0))),
  })).filter((i: any) => i.food && i.grams > 0 && !seen.has(i.food) && seen.add(i.food));
  if (!items.length || !items.some((i: any) => i.role === "proteina")) return null;
  const steps = (Array.isArray(r?.steps) ? r.steps : []).map((s: any) => String(s).trim()).filter(Boolean).slice(0, 8);
  return {
    name: String(r?.name || "Receta RENOVA").trim().slice(0, 100).padEnd(2, "."),
    meal_type: MEALS.includes(r?.meal_type) ? r.meal_type : "cualquiera",
    prep_minutes: Math.min(240, Math.max(1, Math.round(Number(r?.prep_minutes) || 20))),
    items,
    instructions: steps.map((s: string, n: number) => `${n + 1}. ${s.replace(/^\d+[.)]\s*/, "")}`).join("\n") +
      (r?.tip ? `\n💡 ${String(r.tip).slice(0, 200)}` : ""),
  };
}

// Clave pública del proyecto: la legada (SUPABASE_ANON_KEY) o la nueva publicable (SUPABASE_PUBLISHABLE_KEYS)
export function publicKey(env: (k: string) => string | undefined): string {
  const legacy = env("SUPABASE_ANON_KEY");
  if (legacy) return legacy;
  const raw = env("SUPABASE_PUBLISHABLE_KEYS") || "";
  try { const v = JSON.parse(raw); if (typeof v === "string") return v; if (Array.isArray(v)) return String(v[0]); if (v && typeof v === "object") return String(v.default ?? Object.values(v)[0]); } catch { /* texto plano */ }
  return raw.split(",")[0].trim();
}

// Clave secreta del proyecto (solo para el cron y los recordatorios): legada o nueva
export function secretKey(env: (k: string) => string | undefined): string {
  const legacy = env("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const raw = env("SUPABASE_SECRET_KEYS") || "";
  try { const v = JSON.parse(raw); if (typeof v === "string") return v; if (Array.isArray(v)) return String(v[0]); if (v && typeof v === "object") return String(v.default ?? Object.values(v)[0]); } catch { /* texto plano */ }
  return raw.split(",")[0].trim();
}

type Deps = { fetch?: typeof fetch; env?: (k: string) => string | undefined; db?: any; admin?: any; now?: Date };
const AI_KINDS = ["receta", "estimar", "revision"];

async function callClaude(doFetch: typeof fetch, key: string, body: unknown) {
  const ai = await doFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const out = await ai.json().catch(() => ({}));
  if (!ai.ok) {
    const msg = String(out?.error?.message || "");
    const low = /credit|balance|billing/i.test(msg);
    return { error: low ? "Sin saldo en la API de Claude: recarga en console.anthropic.com → Billing." : ai.status === 401 ? "La clave de la API no es válida: revísala en los Secrets de Supabase." : ai.status === 429 || ai.status === 529 ? "Claude está ocupado, intenta en un minuto." : "La IA no respondió (" + ai.status + ").", status: low ? 402 : 502 };
  }
  return { out };
}
const toolInput = (out: any, name: string) => (out?.content || []).find((c: any) => c.type === "tool_use" && c.name === name)?.input;

// ---- Estimar una comida fuera del plan (texto y/o foto)
export function buildEstimate(inp: any) {
  const content: any[] = [];
  const img = typeof inp.image === "string" ? inp.image.replace(/^data:image\/\w+;base64,/, "") : "";
  if (img) content.push({ type: "image", source: { type: "base64", media_type: /^data:image\/png/.test(inp.image) ? "image/png" : "image/jpeg", data: img } });
  content.push({ type: "text", text: `Comida: ${String(inp.meal_type || "comida")}. ${img ? "Mira la foto. " : ""}Descripción: ${String(inp.text || "(sin texto)").slice(0, 400)}\nEstima la porción tal como se ve o se describe.` });
  return {
    model: MODEL, max_tokens: 600,
    system: "Eres nutricionista en Colombia. Estimas calorías y macronutrientes de comidas caseras y de restaurante colombianas con porciones realistas. Si la información es poca, haz la mejor estimación razonable e indica confianza baja. Responde en español.",
    messages: [{ role: "user", content }],
    tool_choice: { type: "tool", name: "estimacion" },
    tools: [{ name: "estimacion", description: "Estimación nutricional de la comida", input_schema: { type: "object", required: ["descripcion", "kcal", "protein_g", "confianza"], properties: {
      descripcion: { type: "string", description: "Qué es, en pocas palabras (máx. 80 caracteres)" },
      kcal: { type: "integer", minimum: 0, maximum: 5000 }, protein_g: { type: "integer", minimum: 0, maximum: 400 },
      carbs_g: { type: "integer", minimum: 0, maximum: 800 }, fat_g: { type: "integer", minimum: 0, maximum: 400 },
      confianza: { type: "string", enum: ["alta", "media", "baja"] } } } }],
  };
}
// ---- Revisión semanal: 3 ajustes concretos
export function buildReview(inp: any) {
  const m = JSON.stringify(inp.metrics || {}).slice(0, 4000);
  const r = (k: string) => String(inp[k] || "").slice(0, 600);
  return {
    model: MODEL, max_tokens: 900,
    system: "Eres el coach de RENOVA: entrenador y nutricionista práctico, directo y motivador, en español de Colombia. Analizas la semana de Alexander (meta: bajar de peso conservando músculo; come 3 veces al día, sin pescado ni mariscos; entrena gym y caminadora) y das exactamente 3 ajustes concretos y medibles para la próxima semana, basados en sus números. Nada genérico.",
    messages: [{ role: "user", content: `Métricas de la semana (JSON): ${m}\nLo que salió bien: ${r("wins")}\nLo que costó: ${r("struggles")}\nEnfoque que quiere: ${r("focus")}` }],
    tool_choice: { type: "tool", name: "ajustes" },
    tools: [{ name: "ajustes", description: "Resumen y 3 ajustes", input_schema: { type: "object", required: ["resumen", "ajustes"], properties: {
      resumen: { type: "string", description: "Una o dos frases sobre la semana" },
      ajustes: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", required: ["titulo", "accion"], properties: { titulo: { type: "string" }, accion: { type: "string" } } } } } } }],
  };
}

// ---- Recordatorios (Web Push)
export function localNow(now: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz || "America/Bogota", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false }).formatToParts(now).map((x) => [x.type, x.value]));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(p.weekday);
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute), dow };
}
const hm = (t: string) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const WINDOW = 45;   // minutos de tolerancia (el cron corre cada 15)
export const DEFAULT_PREFS = { agua: { on: true, horas: ["10:00", "13:00", "16:00", "19:00"] }, gym: { on: true, hora: "18:00" }, checklist: { on: true, hora: "21:00" }, peso: { on: true, hora: "07:00" }, eventos: { on: true } };
// Decide qué recordatorios tocan ahora (función pura: fácil de probar)
export function dueReminders(prefsIn: any, now: { date: string; minutes: number; dow: number }, f: any, nowMs: number) {
  const p = { ...DEFAULT_PREFS, ...(prefsIn || {}) }, out: any[] = [];
  const due = (t: string) => { const x = hm(t); return x != null && now.minutes >= x && now.minutes - x < WINDOW; };
  if (p.agua?.on && f.waterMl < f.waterGoalMl) for (const t of p.agua.horas || []) if (due(t)) out.push({ kind: "agua", ref: t, title: "💧 Hora de tomar agua", body: `Llevas ${(f.waterMl / 1000).toFixed(1).replace(".", ",")} de ${(f.waterGoalMl / 1000).toFixed(1).replace(".", ",")} L hoy.`, url: "./?accion=agua" });
  if (p.gym?.on && !f.gymDone && due(p.gym.hora)) out.push({ kind: "gym", ref: "", title: "🏋️ Hora del gym", body: f.nextRoutine ? `Hoy te toca: ${f.nextRoutine}` : "Tu entreno de hoy te espera.", url: "./?accion=entreno" });
  if (p.checklist?.on && f.habitsTotal > 0 && f.habitsDone < f.habitsTotal && due(p.checklist.hora)) out.push({ kind: "checklist", ref: "", title: "✅ Cierra tu día", body: `Te faltan ${f.habitsTotal - f.habitsDone} de ${f.habitsTotal} hábitos.`, url: "./?accion=habitos" });
  if (p.peso?.on && now.dow === 1 && !f.measuredToday && due(p.peso.hora)) out.push({ kind: "peso", ref: "", title: "⚖️ Lunes de pesarte", body: "En ayunas y después del baño: registra tu peso y cintura.", url: "./?accion=peso" });
  if (p.eventos?.on) for (const ev of f.events || []) {
    const start = new Date(ev.starts_at).getTime(), at = start - (Number(ev.remind_min) || 0) * 60000;
    if (nowMs >= at && nowMs - at < WINDOW * 60000 && start > nowMs - 5 * 60000) out.push({ kind: "evento", ref: String(ev.id), title: `📌 ${ev.title}`, body: Number(ev.remind_min) ? `Empieza en ${ev.remind_min} min.` : "Empieza ahora.", url: "./?accion=agenda" });
  }
  return out;
}
async function vapidKeys(admin: any) {
  const get = async () => { const { data } = await admin.from("push_config").select("key,value").in("key", ["vapid_public", "vapid_private"]); const m = Object.fromEntries((data || []).map((r: any) => [r.key, r.value])); return m.vapid_public && m.vapid_private ? { publicKey: m.vapid_public, privateKey: m.vapid_private } : null; };
  let k = await get();
  if (!k) { const g = webpush.generateVAPIDKeys(); await admin.from("push_config").upsert([{ key: "vapid_public", value: g.publicKey }, { key: "vapid_private", value: g.privateKey }], { onConflict: "key", ignoreDuplicates: true }); k = await get(); }
  return k;
}
async function sendPush(doFetch: typeof fetch, keys: any, sub: any, msg: any) {
  const det = webpush.generateRequestDetails({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(msg), { TTL: 3600, urgency: "normal", vapidDetails: { subject: "mailto:renova@renova.app", publicKey: keys.publicKey, privateKey: keys.privateKey } });
  const r = await doFetch(det.endpoint, { method: det.method, headers: det.headers as any, body: det.body });
  return r.status;
}
async function userFacts(admin: any, uid: string, date: string, nowMs: number) {
  const q = (t: string) => admin.from(t);
  const [logs, plan, defs, checks, sess, meas, routines, evs] = await Promise.all([
    q("daily_logs").select("water_ml").eq("user_id", uid).eq("log_date", date).maybeSingle(),
    q("nutrition_plans").select("weight_kg").eq("user_id", uid).eq("is_active", true).maybeSingle(),
    q("habit_definitions").select("id").eq("user_id", uid).eq("is_active", true),
    q("daily_habit_checks").select("habit_id,completed").eq("user_id", uid).eq("check_date", date),
    q("workout_sessions").select("routine_id,session_date,status").eq("user_id", uid).eq("status", "completed").order("session_date", { ascending: false }).limit(20),
    q("body_measurements").select("id").eq("user_id", uid).eq("measured_on", date),
    q("workout_routines").select("id,name,created_at").eq("user_id", uid).eq("is_active", true).order("created_at"),
    q("agenda_items").select("id,title,starts_at,remind_min").eq("user_id", uid).not("remind_min", "is", null).gte("starts_at", new Date(nowMs - 3600000).toISOString()).lte("starts_at", new Date(nowMs + 26 * 3600000).toISOString()),
  ]);
  const active = new Set((defs.data || []).map((h: any) => String(h.id)));
  const done = new Set((checks.data || []).filter((c: any) => c.completed !== false && active.has(String(c.habit_id))).map((c: any) => String(c.habit_id)));
  const rs = routines.data || [], last = (sess.data || []).find((s: any) => rs.some((r: any) => r.id === s.routine_id));
  const next = rs.length ? (last ? rs[(rs.findIndex((r: any) => r.id === last.routine_id) + 1) % rs.length] : rs[0]) : null;
  return {
    waterMl: Number(logs.data?.water_ml) || 0,
    waterGoalMl: plan.data?.weight_kg ? Math.round(Number(plan.data.weight_kg) * 35 / 250) * 250 : 3000,
    habitsTotal: active.size, habitsDone: done.size,
    gymDone: (sess.data || []).some((s: any) => s.session_date === date),
    nextRoutine: next?.name || null,
    measuredToday: (meas.data || []).length > 0,
    events: evs.error ? [] : (evs.data || []),
  };
}
async function runCron(admin: any, doFetch: typeof fetch, nowDate: Date) {
  const keys = await vapidKeys(admin);
  const { data: subs } = await admin.from("push_subscriptions").select("*");
  const byUser = new Map<string, any[]>();
  for (const s of subs || []) (byUser.get(s.user_id) || byUser.set(s.user_id, []).get(s.user_id)!).push(s);
  let sent = 0, removed = 0;
  for (const [uid, list] of byUser) {
    const tz = list[0].tz || "America/Bogota", now = localNow(nowDate, tz);
    const facts = await userFacts(admin, uid, now.date, nowDate.getTime());
    const prefs = list.find((s: any) => s.prefs && Object.keys(s.prefs).length)?.prefs || {};
    for (const msg of dueReminders(prefs, now, facts, nowDate.getTime())) {
      const { error: dup } = await admin.from("push_log").insert({ user_id: uid, kind: msg.kind, ref: msg.ref, sent_on: now.date });
      if (dup) continue;   // ya se envió hoy
      for (const s of list) {
        const st = await sendPush(doFetch, keys, s, { title: msg.title, body: msg.body, url: msg.url, tag: msg.kind + msg.ref });
        if (st === 404 || st === 410) { await admin.from("push_subscriptions").delete().eq("id", s.id); removed++; } else if (st < 300) sent++;
      }
    }
  }
  return { sent, removed, users: byUser.size };
}

export async function handler(req: Request, deps: Deps = {}) {
  const h = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, h);
  const env = deps.env || ((k: string) => Deno.env.get(k));
  const doFetch = deps.fetch || fetch;
  let inp: any;
  try { inp = await req.json(); } catch { return json({ error: "Solicitud inválida" }, 400, h); }
  const kind = String(inp?.kind || "receta");
  const admin = () => deps.admin || createClient(env("SUPABASE_URL")!, secretKey(env), { auth: { persistSession: false } });

  // Cron de recordatorios: sin usuario, protegido con el secreto guardado en push_config
  if (kind === "cron") {
    const a = admin();
    const { data: cs } = await a.from("push_config").select("value").eq("key", "cron_secret").maybeSingle();
    if (!cs?.value || req.headers.get("x-renova-cron") !== cs.value) return json({ error: "No autorizado" }, 401, h);
    return json(await runCron(a, doFetch, deps.now || new Date()), 200, h);
  }

  const key = env("ANTHROPIC_API_KEY");
  if (AI_KINDS.includes(kind) && !key) return json({ error: "Falta configurar ANTHROPIC_API_KEY en los Secrets de Supabase." }, 500, h);

  // Quién llama: el token de sesión de RENOVA (Google vía Supabase)
  const auth = req.headers.get("Authorization") || "";
  const db = deps.db || createClient(env("SUPABASE_URL")!, publicKey(env), { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (ue || !u?.user) return json({ error: "Inicia sesión en RENOVA para usar esta función." }, 401, h);

  if (kind === "vapid") {
    const k = await vapidKeys(admin());
    return k ? json({ publicKey: k.publicKey }, 200, h) : json({ error: "Falta ejecutar supabase/06_v17.sql en Supabase." }, 500, h);
  }
  if (kind === "push_test") {
    const a = admin(), k = await vapidKeys(a);
    const { data: subs } = await a.from("push_subscriptions").select("*").eq("user_id", u.user.id);
    let ok = 0;
    for (const s of subs || []) { const st = await sendPush(doFetch, k, s, { title: "🔔 RENOVA", body: "¡Listo! Así te llegarán los recordatorios.", url: "./", tag: "prueba" }); if (st < 300) ok++; else if (st === 404 || st === 410) await a.from("push_subscriptions").delete().eq("id", s.id); }
    return json({ sent: ok, devices: (subs || []).length }, 200, h);
  }
  if (!AI_KINDS.includes(kind)) return json({ error: "Tipo de solicitud desconocido" }, 400, h);

  // Tope diario de IA (últimas 24 h, todos los usos)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: ce } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).gte("created_at", since);
  if (ce) return json({ error: "Falta ejecutar supabase/04_ia.sql en Supabase." }, 500, h);
  if ((count || 0) >= DAILY_LIMIT) return json({ error: `Llegaste al tope de ${DAILY_LIMIT} usos de IA en 24 horas.`, remaining: 0 }, 429, h);
  const logUse = (out: any) => db.from("ai_usage").insert({ user_id: u.user.id, kind, model: MODEL, input_tokens: out.usage?.input_tokens || 0, output_tokens: out.usage?.output_tokens || 0 });
  const remaining = DAILY_LIMIT - (count || 0) - 1;

  if (kind === "estimar") {
    if (!inp.text && !inp.image) return json({ error: "Escribe qué comiste o toma una foto." }, 400, h);
    if (typeof inp.image === "string" && inp.image.length > 2_800_000) return json({ error: "La foto es muy pesada." }, 413, h);
    const r = await callClaude(doFetch, key!, buildEstimate(inp));
    if (r.error) return json({ error: r.error }, r.status!, h);
    const t = toolInput(r.out, "estimacion");
    if (!t || !(Number(t.kcal) >= 0)) return json({ error: "No se pudo estimar, intenta de nuevo." }, 502, h);
    await logUse(r.out);
    const n = (v: any, max: number) => Math.min(max, Math.max(0, Math.round(Number(v) || 0)));
    return json({ estimate: { descripcion: String(t.descripcion || "").slice(0, 120), kcal: n(t.kcal, 5000), protein_g: n(t.protein_g, 400), carbs_g: n(t.carbs_g, 800), fat_g: n(t.fat_g, 400), confianza: ["alta", "media", "baja"].includes(t.confianza) ? t.confianza : "media" }, remaining }, 200, h);
  }
  if (kind === "revision") {
    const r = await callClaude(doFetch, key!, buildReview(inp));
    if (r.error) return json({ error: r.error }, r.status!, h);
    const t = toolInput(r.out, "ajustes");
    if (!t || !Array.isArray(t.ajustes) || !t.ajustes.length) return json({ error: "La IA no devolvió ajustes, intenta de nuevo." }, 502, h);
    await logUse(r.out);
    return json({ review: { resumen: String(t.resumen || "").slice(0, 400), ajustes: t.ajustes.slice(0, 3).map((a: any) => ({ titulo: String(a.titulo || "").slice(0, 80), accion: String(a.accion || "").slice(0, 300) })) }, remaining }, 200, h);
  }

  // receta (por defecto)
  if (!Array.isArray(inp.foods) || inp.foods.length < 3) return json({ error: "No hay alimentos en tu recetario para armar la receta." }, 400, h);
  const r = await callClaude(doFetch, key!, buildRequest(inp));
  if (r.error) return json({ error: r.error }, r.status!, h);
  const recipe = toolInput(r.out, "receta") && cleanRecipe(toolInput(r.out, "receta"), inp.foods);
  if (!recipe) return json({ error: "La IA devolvió una receta incompleta, intenta de nuevo." }, 502, h);
  await logUse(r.out);
  return json({ recipe, remaining, usage: r.out.usage || null }, 200, h);
}

if (import.meta.main) Deno.serve((req) => handler(req));
