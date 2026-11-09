-- RENOVA · 06 · v17: comidas fuera del plan, revisión semanal, agenda propia y recordatorios
-- Idempotente: puedes correrlo varias veces. No borra datos.

-- 1) Comidas fuera del plan: qué comiste y cuánto
alter table public.meal_entries add column if not exists kcal          int check (kcal between 0 and 5000);
alter table public.meal_entries add column if not exists protein_g     int check (protein_g between 0 and 400);
alter table public.meal_entries add column if not exists ai_estimated  boolean not null default false;

-- 2) Revisión del domingo
create table if not exists public.weekly_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start  date not null,
  metrics     jsonb not null default '{}'::jsonb,
  wins        text,
  struggles   text,
  focus       text,
  ai_tips     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

-- 3) Agenda propia
create table if not exists public.agenda_items (
  id            uuid primary key,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 120),
  starts_at     timestamptz not null,
  duration_min  int not null default 60 check (duration_min between 5 and 1440),
  remind_min    int check (remind_min between 0 and 1440),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists agenda_items_user_start on public.agenda_items (user_id, starts_at);

-- 4) Recordatorios (Web Push)
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  prefs       jsonb not null default '{}'::jsonb,
  tz          text not null default 'America/Bogota',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
-- Lo que ya se envió (para no repetir). Solo lo usa la función del servidor.
create table if not exists public.push_log (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references auth.users(id) on delete cascade,
  kind      text not null,
  ref       text not null default '',
  sent_on   date not null,
  sent_at   timestamptz not null default now(),
  unique (user_id, kind, ref, sent_on)
);
-- Claves del servidor (VAPID y secreto del cron). Sin acceso para la app.
create table if not exists public.push_config (
  key    text primary key,
  value  text not null
);
insert into public.push_config (key, value)
values ('cron_secret', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
on conflict (key) do nothing;

-- 5) Seguridad (RLS)
do $$
declare t text;
begin
  foreach t in array array['weekly_reviews','agenda_items','push_subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists renova_own_rows on public.%I', t);
    execute format('create policy renova_own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
alter table public.push_log    enable row level security;   -- sin políticas: solo el servidor
alter table public.push_config enable row level security;   -- sin políticas: solo el servidor
revoke all on public.push_log, public.push_config from anon, authenticated;

-- 6) Registro de uso de IA: nuevos tipos
alter table public.ai_usage drop constraint if exists ai_usage_kind_check;
alter table public.ai_usage add constraint ai_usage_kind_check check (kind in ('receta','revision','estimar'));

-- Verificación
select t as tabla, to_regclass('public.' || t) is not null as existe,
       coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || t)), false) as rls
from unnest(array['weekly_reviews','agenda_items','push_subscriptions','push_log','push_config']) as t
union all
select 'meal_entries.kcal', exists (select 1 from information_schema.columns where table_name = 'meal_entries' and column_name = 'kcal'), null;
