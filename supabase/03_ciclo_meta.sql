-- RENOVA · 03 · Ciclo calculado según la meta de peso (v13)
-- Agrega a user_app_state la meta, el peso inicial y el ritmo elegido.
-- Idempotente: puedes correrlo varias veces sin problema. No borra datos.
alter table public.user_app_state
  add column if not exists cycle_goal_weight_kg  numeric(5,1) check (cycle_goal_weight_kg between 30 and 250),
  add column if not exists cycle_start_weight_kg numeric(5,1) check (cycle_start_weight_kg between 30 and 250),
  add column if not exists cycle_pace            text check (cycle_pace in ('plan','conservador','moderado','rapido'));

alter table public.user_app_state
  drop constraint if exists user_app_state_cycle_days_chk;
alter table public.user_app_state
  add constraint user_app_state_cycle_days_chk check (cycle_duration_days between 7 and 1825);

-- Verificación
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'user_app_state'
  and column_name like 'cycle%'
order by column_name;
