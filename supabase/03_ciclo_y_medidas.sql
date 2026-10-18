-- RENOVA · 03 · Ciclo según la meta de peso + medidas corporales completas (v13)
-- 1) user_app_state: meta, peso inicial y ritmo del ciclo.
-- 2) body_measurements: cuello, pecho, brazo, cadera, muslo y pantorrilla (cm).
-- Idempotente: puedes correrlo varias veces sin problema. No borra datos.
alter table public.user_app_state
  add column if not exists cycle_goal_weight_kg  numeric(5,1) check (cycle_goal_weight_kg between 30 and 250),
  add column if not exists cycle_start_weight_kg numeric(5,1) check (cycle_start_weight_kg between 30 and 250),
  add column if not exists cycle_pace            text check (cycle_pace in ('plan','conservador','moderado','rapido'));

alter table public.user_app_state
  drop constraint if exists user_app_state_cycle_days_chk;
alter table public.user_app_state
  add constraint user_app_state_cycle_days_chk check (cycle_duration_days between 7 and 1825);

alter table public.body_measurements
  add column if not exists neck_cm  numeric(5,1) check (neck_cm  between 10 and 250),
  add column if not exists chest_cm numeric(5,1) check (chest_cm between 10 and 250),
  add column if not exists arm_cm   numeric(5,1) check (arm_cm   between 10 and 250),
  add column if not exists hips_cm  numeric(5,1) check (hips_cm  between 10 and 250),
  add column if not exists thigh_cm numeric(5,1) check (thigh_cm between 10 and 250),
  add column if not exists calf_cm  numeric(5,1) check (calf_cm  between 10 and 250);

-- Verificación
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'user_app_state'
  and column_name like 'cycle%'
union all
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'body_measurements'
  and column_name in ('neck_cm','chest_cm','arm_cm','hips_cm','thigh_cm','calf_cm');
