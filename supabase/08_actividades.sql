-- RENOVA · 08 · Otras actividades: fútbol y otros deportes, con distancia y ritmo (v19–v21)
-- Idempotente: puedes correrlo varias veces. No borra datos.
create table if not exists public.activity_logs (
  id              uuid primary key,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date        date not null,
  sport           text not null,
  name            text check (char_length(name) <= 40),
  minutes         int not null check (minutes between 1 and 600),
  intensity       text not null default 'moderada' check (intensity in ('suave','moderada','intensa')),
  distance        numeric(8,2) check (distance > 0 and distance <= 100000),   -- km (correr, caminata, bici), metros (natación) o saltos (lazo)
  kcal            int check (kcal between 0 and 5000),
  kcal_estimated  boolean not null default true,
  notes           text check (char_length(notes) <= 200),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.activity_logs add column if not exists distance numeric(8,2) check (distance > 0 and distance <= 100000);

-- Deportes permitidos (se puede ampliar volviendo a correr este archivo)
alter table public.activity_logs drop constraint if exists activity_logs_sport_check;
alter table public.activity_logs add constraint activity_logs_sport_check
  check (sport in ('futbol','baloncesto','natacion','ciclismo','correr','caminata','tenis','voleibol','baile','combate','lazo','otro'));
create index if not exists activity_logs_user_date on public.activity_logs (user_id, log_date);

alter table public.activity_logs enable row level security;
drop policy if exists renova_own_rows on public.activity_logs;
create policy renova_own_rows on public.activity_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.activity_logs to authenticated;

-- Verificación
select 'activity_logs' as tabla, count(*) as filas,
       (select relrowsecurity from pg_class where oid = 'public.activity_logs'::regclass) as rls
from public.activity_logs;
