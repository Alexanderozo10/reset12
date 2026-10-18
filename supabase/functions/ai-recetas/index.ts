// RENOVA · Edge Function "ai-recetas" (N4)
// Crea una receta con Claude usando SOLO los alimentos de tu recetario, para que la app
// la pueda ajustar a tu meta y llevarla a la lista de compras.
// La clave ANTHROPIC_API_KEY vive en los Secrets de Supabase: nunca en el código de la app.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";

export const MODEL = "claude-haiku-5-5";
export const DAILY_LIMIT = 20;
const ROLES = ["proteina", "carbohidrato", "grasa", "libre"];
const MEALS = ["desayuno", "almuerzo", "cena", "merienda", "cualquiera"];
const ALLOWED_ORIGINS = ["https://alexanderozo10.github.io"];

function cors(origin: string | null) {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

export async function handler(req: Request, deps: { fetch?: typeof fetch; env?: (k: string) => string | undefined; db?: any } = {}) {
  const h = cors(req.headers.get("Origin"));
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405, h);
  const env = deps.env || ((k: string) => Deno.env.get(k));
  const doFetch = deps.fetch || fetch;
  const key = env("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Falta configurar ANTHROPIC_API_KEY en los Secrets de Supabase." }, 500, h);

  // Quién llama: el token de sesión de RENOVA (Google vía Supabase)
  const auth = req.headers.get("Authorization") || "";
  const db = deps.db || createClient(env("SUPABASE_URL")!, publicKey(env), { global: { headers: { Authorization: auth } } });
  const { data: u, error: ue } = await db.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
  if (ue || !u?.user) return json({ error: "Inicia sesión en RENOVA para usar la IA." }, 401, h);

  // Tope diario (últimas 24 h)
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count, error: ce } = await db.from("ai_usage").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).gte("created_at", since);
  if (ce) return json({ error: "Falta ejecutar supabase/04_ia.sql en Supabase." }, 500, h);
  if ((count || 0) >= DAILY_LIMIT) return json({ error: `Llegaste al tope de ${DAILY_LIMIT} recetas con IA en 24 horas.`, remaining: 0 }, 429, h);

  let inp: Input;
  try { inp = await req.json(); } catch { return json({ error: "Solicitud inválida" }, 400, h); }
  if (!Array.isArray(inp.foods) || inp.foods.length < 3) return json({ error: "No hay alimentos en tu recetario para armar la receta." }, 400, h);

  const ai = await doFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(buildRequest(inp)),
  });
  const out = await ai.json().catch(() => ({}));
  if (!ai.ok) {
    const msg = String(out?.error?.message || "");
    const low = /credit|balance|billing/i.test(msg);
    return json({ error: low ? "Sin saldo en la API de Claude: recarga en console.anthropic.com → Billing." : ai.status === 401 ? "La clave de la API no es válida: revísala en los Secrets de Supabase." : ai.status === 429 || ai.status === 529 ? "Claude está ocupado, intenta en un minuto." : "La IA no respondió (" + ai.status + ")." }, low ? 402 : 502, h);
  }
  const tool = (out.content || []).find((c: any) => c.type === "tool_use" && c.name === "receta");
  const recipe = tool && cleanRecipe(tool.input, inp.foods);
  if (!recipe) return json({ error: "La IA devolvió una receta incompleta, intenta de nuevo." }, 502, h);

  await db.from("ai_usage").insert({ user_id: u.user.id, kind: "receta", model: MODEL, input_tokens: out.usage?.input_tokens || 0, output_tokens: out.usage?.output_tokens || 0 });
  return json({ recipe, remaining: DAILY_LIMIT - (count || 0) - 1, usage: out.usage || null }, 200, h);
}

if (import.meta.main) Deno.serve((req) => handler(req));
