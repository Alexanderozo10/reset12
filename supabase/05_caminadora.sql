-- RENOVA · 05 · Caminadora (cardio) por rutina y día (v16)
-- Tiempo, distancia, velocidad, inclinación y calorías. Una fila por día y rutina.
-- Idempotente: puedes correrlo varias veces.
create table if not exists public.cardio_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  log_date        date not null,
  routine_id      uuid not null,
  minutes         numeric(5,1) check (minutes > 0 and minutes <= 600),
  distance_km     numeric(5,2) check (distance_km > 0 and distance_km <= 100),
  speed_kmh       numeric(4,1) check (speed_kmh > 0 and speed_kmh <= 30),
  incline_pct     numeric(4,1) check (incline_pct >= 0 and incline_pct <= 30),
  kcal            int check (kcal >= 0 and kcal <= 5000),
  kcal_estimated  boolean not null default false,
  raw             jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (user_id, log_date, routine_id)
);
create index if not exists cardio_logs_user_date on public.cardio_logs (user_id, log_date);

alter table public.cardio_logs enable row level security;
drop policy if exists renova_own_rows on public.cardio_logs;
create policy renova_own_rows on public.cardio_logs
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.cardio_logs to authenticated;

-- Verificación
select 'cardio_logs' as tabla, count(*) as filas,
       (select relrowsecurity from pg_class where oid = 'public.cardio_logs'::regclass) as rls
from public.cardio_logs;
