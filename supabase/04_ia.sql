-- RENOVA · 04 · Registro de uso de la IA (N4 · recetas con Claude)
-- Guarda cada receta generada (tokens usados) para el tope diario y para ver el gasto.
-- Idempotente: puedes correrlo varias veces.
create table if not exists public.ai_usage (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind           text not null default 'receta' check (kind in ('receta')),
  model          text not null,
  input_tokens   int not null default 0 check (input_tokens >= 0),
  output_tokens  int not null default 0 check (output_tokens >= 0),
  created_at     timestamptz not null default now()
);
create index if not exists ai_usage_user_time on public.ai_usage (user_id, created_at desc);

alter table public.ai_usage enable row level security;
drop policy if exists renova_own_rows on public.ai_usage;
create policy renova_own_rows on public.ai_usage
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert on public.ai_usage to authenticated;

-- Verificación
select 'ai_usage' as tabla, count(*) as filas,
       (select relrowsecurity from pg_class where oid = 'public.ai_usage'::regclass) as rls
from public.ai_usage;
