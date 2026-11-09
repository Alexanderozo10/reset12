-- RENOVA · 10 · Arreglo de la revisión semanal
-- La tabla weekly_reviews ya existía de una versión anterior con otras columnas,
-- y el SQL 06 no la modificó (usa "create table if not exists").
-- Este archivo le agrega lo que falta sin borrar nada. Se puede correr varias veces.

alter table public.weekly_reviews add column if not exists user_id    uuid default auth.uid() references auth.users(id) on delete cascade;
alter table public.weekly_reviews add column if not exists week_start date;
alter table public.weekly_reviews add column if not exists metrics    jsonb not null default '{}'::jsonb;
alter table public.weekly_reviews add column if not exists wins       text;
alter table public.weekly_reviews add column if not exists struggles  text;
alter table public.weekly_reviews add column if not exists focus      text;
alter table public.weekly_reviews add column if not exists ai_tips    text;
alter table public.weekly_reviews add column if not exists created_at timestamptz not null default now();
alter table public.weekly_reviews add column if not exists updated_at timestamptz not null default now();
alter table public.weekly_reviews alter column user_id set default auth.uid();

-- Columnas viejas obligatorias sin valor por defecto: se vuelven opcionales para que la app pueda guardar
do $$
declare c record;
begin
  for c in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'weekly_reviews'
      and is_nullable = 'NO' and column_default is null
      and column_name not in ('id','user_id','week_start','metrics','created_at','updated_at')
  loop
    execute format('alter table public.weekly_reviews alter column %I drop not null', c.column_name);
  end loop;
end $$;

-- Una revisión por usuario y semana (la app guarda con "upsert" sobre estas dos columnas)
create unique index if not exists weekly_reviews_user_week on public.weekly_reviews (user_id, week_start);

-- Seguridad: cada quien ve solo lo suyo
alter table public.weekly_reviews enable row level security;
drop policy if exists renova_own_rows on public.weekly_reviews;
create policy renova_own_rows on public.weekly_reviews for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, insert, update, delete on public.weekly_reviews to authenticated;

-- Que la API vea las columnas nuevas de inmediato
notify pgrst, 'reload schema';

-- Verificación: deben salir las 6 columnas en "sí"
select c as columna, exists (select 1 from information_schema.columns
  where table_schema='public' and table_name='weekly_reviews' and column_name=c) as existe
from unnest(array['metrics','wins','struggles','focus','ai_tips','updated_at']) as c;
