-- RENOVA · 09 · Pasos automáticos desde el iPhone (Atajos) · v21
-- Guarda solo la huella (SHA-256) de tu clave personal; la clave nunca se guarda.
-- Idempotente: puedes correrlo varias veces.
create table if not exists public.health_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  token_hash    text not null unique check (char_length(token_hash) = 64),
  label         text not null default 'iPhone',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);
create index if not exists health_tokens_user on public.health_tokens (user_id);

alter table public.health_tokens enable row level security;
drop policy if exists renova_own_rows on public.health_tokens;
create policy renova_own_rows on public.health_tokens
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
grant select, insert, delete on public.health_tokens to authenticated;

-- Verificación
select 'health_tokens' as tabla, count(*) as claves,
       (select relrowsecurity from pg_class where oid = 'public.health_tokens'::regclass) as rls
from public.health_tokens;
