-- =====================================================================
-- RENOVA · Fase 1 · Migración de datos y seguridad (RLS)
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO → Run.
-- Es idempotente: si lo ejecutas dos veces no duplica nada.
-- Ejecútalo ANTES de publicar el nuevo index.html.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Tablas que la app nunca usó. Si existen y están VACÍAS se recrean
--    con el esquema exacto que usa RENOVA. Si tienen filas se conservan
--    (verás un NOTICE) y no se tocan.
-- ---------------------------------------------------------------------
do $$
declare t text; n bigint;
begin
  foreach t in array array['daily_habit_checks','habit_definitions','body_measurements'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n = 0 then
        execute format('drop table public.%I cascade', t);
      else
        raise notice 'La tabla % tiene % filas: se conserva tal cual. Revisa que tenga las columnas de la app.', t, n;
      end if;
    end if;
  end loop;
end $$;

-- Definición de hábitos (la "plantilla" del checklist diario)
create table if not exists public.habit_definitions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 100),
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists habit_definitions_user_idx on public.habit_definitions (user_id);

-- Cumplimiento diario: una fila = "cumplí este hábito este día"
create table if not exists public.daily_habit_checks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  habit_id    uuid not null references public.habit_definitions(id) on delete cascade,
  check_date  date not null,
  completed   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (user_id, habit_id, check_date)
);
create index if not exists daily_habit_checks_user_date_idx on public.daily_habit_checks (user_id, check_date);

-- Mediciones corporales: una por día
create table if not exists public.body_measurements (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  measured_on  date not null,
  weight_kg    numeric(5,1),
  waist_cm     numeric(5,1),
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, measured_on)
);

grant select, insert, update, delete on public.habit_definitions, public.daily_habit_checks, public.body_measurements to authenticated;

-- ---------------------------------------------------------------------
-- 2) Migrar las tareas del checklist (daily_tasks) a hábitos.
--    Se omiten las 8 tareas por defecto antiguas, igual que hace la app.
-- ---------------------------------------------------------------------
with src as (
  select user_id,
         min(left(trim(title), 100)) as title,
         min(created_at)             as first_at
  from public.daily_tasks
  where coalesce(trim(title), '') <> ''
    and lower(trim(title)) <> all (array[
      'tomé suficiente agua','cumplí mi proteína del día','respeté mis 3 comidas','cumplí mis pasos',
      'entrené / hice actividad','dormí lo planificado','evité picoteos innecesarios','hice algo positivo por mí'])
  group by user_id, lower(left(trim(title), 100))
)
insert into public.habit_definitions (user_id, title, sort_order)
select s.user_id, s.title, (row_number() over (partition by s.user_id order by s.first_at))::int - 1
from src s
where not exists (
  select 1 from public.habit_definitions h
  where h.user_id = s.user_id and lower(h.title) = lower(s.title)
);

-- Las tareas marcadas como completadas pasan a ser "checks" de ese día
insert into public.daily_habit_checks (user_id, habit_id, check_date, completed)
select distinct t.user_id, h.id, t.task_date, true
from public.daily_tasks t
join public.habit_definitions h
  on h.user_id = t.user_id and lower(h.title) = lower(left(trim(t.title), 100))
where t.completed is true and t.task_date is not null
on conflict (user_id, habit_id, check_date) do nothing;

-- ---------------------------------------------------------------------
-- 3) Corregir el agua: la app guardaba LITROS (2.5) en water_ml.
--    Solo toca valores < 20 (nadie toma 20 ml al día).
-- ---------------------------------------------------------------------
update public.daily_logs
set water_ml = water_ml * 1000
where water_ml is not null and water_ml > 0 and water_ml < 20;

-- ---------------------------------------------------------------------
-- 4) Seguridad: RLS en las 16 tablas. Cada usuario solo ve y modifica
--    sus propias filas. Se reemplazan las políticas anteriores de estas
--    tablas por una sola política clara ("renova_own_rows").
-- ---------------------------------------------------------------------
do $$
declare t text; col text; p record;
begin
  foreach t in array array[
    'profiles','user_preferences','user_app_state','daily_tasks','daily_logs',
    'daily_habit_checks','habit_definitions','body_measurements','nutrition_plans','meal_entries',
    'shopping_list_items','workout_routines','routine_exercises','workout_sessions','workout_sets','agenda_events'] loop
    if to_regclass('public.' || t) is null then
      raise notice 'No existe la tabla %, se omite', t; continue;
    end if;
    col := case when t = 'profiles' then 'id' else 'user_id' end;
    if not exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = t and column_name = col) then
      raise notice 'La tabla % no tiene columna %: revisar a mano', t, col; continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format(
      'create policy renova_own_rows on public.%I for all to authenticated using (%I = (select auth.uid())) with check (%I = (select auth.uid()))',
      t, col, col);
  end loop;
end $$;

commit;

-- ---------------------------------------------------------------------
-- 5) Verificación: todas deben salir con rls = true y 1 política.
-- ---------------------------------------------------------------------
select c.relname as tabla,
       c.relrowsecurity as rls,
       count(p.policyname) as politicas,
       (select count(*) from public.habit_definitions)   as habitos_totales,
       (select count(*) from public.daily_habit_checks)  as checks_totales
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p on p.schemaname = 'public' and p.tablename = c.relname
where n.nspname = 'public' and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;
