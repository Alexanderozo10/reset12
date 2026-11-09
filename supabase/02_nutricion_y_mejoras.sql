-- =====================================================================
-- RENOVA · 02 · Nutrición y mejoras (N1–N3, M2–M4)
-- Cómo usarlo: Supabase → SQL Editor → New query → pega TODO → Run.
-- Requiere haber corrido antes 01_fase1_migracion.sql.
-- Es idempotente: se puede ejecutar varias veces sin duplicar nada.
-- Los valores nutricionales son aproximados por 100 g (referencias
-- estándar tipo USDA/ICBF). Úsalos como guía, no como prescripción.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Tablas que existían sin uso: si están VACÍAS se recrean con el
--    esquema de la app. Si tienen filas se conservan (NOTICE).
-- ---------------------------------------------------------------------
do $$
declare t text; n bigint;
begin
  foreach t in array array['meal_entries','nutrition_plans','agenda_events'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into n;
      if n = 0 then execute format('drop table public.%I cascade', t);
      else raise notice 'La tabla % tiene % filas: se conserva tal cual.', t, n; end if;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2) N1 · Plan de nutrición (objetivo y metas diarias)
-- ---------------------------------------------------------------------
create table if not exists public.nutrition_plans (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  is_active       boolean not null default true,
  goal            text not null default 'bajar_grasa' check (goal in ('bajar_grasa','recomposicion','ganar_musculo')),
  sex             text check (sex in ('hombre','mujer')),
  age             int  check (age between 14 and 90),
  height_cm       numeric(5,1) check (height_cm between 120 and 230),
  weight_kg       numeric(5,1) check (weight_kg between 30 and 250),
  activity        text not null default 'moderado' check (activity in ('sedentario','ligero','moderado','alto')),
  gym_days        int  not null default 4 check (gym_days between 0 and 7),
  meals_per_day   int  not null default 3 check (meals_per_day in (3,4)),
  kcal_target     int,
  protein_g       int,
  fat_g           int,
  carbs_g         int,
  meal_split      jsonb not null default '{"desayuno":30,"almuerzo":40,"cena":30}'::jsonb,
  excluded_foods  text[] not null default array['mariscos','pescado'],
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
-- un solo plan activo por usuario
create unique index if not exists nutrition_plans_one_active on public.nutrition_plans (user_id) where is_active;

-- ---------------------------------------------------------------------
-- 3) N2 · Base de alimentos, recetas e ingredientes
--    user_id NULL = dato base de RENOVA (lo leen todos, nadie lo edita)
-- ---------------------------------------------------------------------
create table if not exists public.food_items (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users(id) on delete cascade,
  name             text not null check (char_length(name) between 2 and 80),
  category         text not null check (category in ('proteina','carbohidrato','fruta','verdura','grasa','lacteo','suplemento','otro')),
  store_section    text not null default 'Despensa',
  kcal_100g        numeric(6,1) not null check (kcal_100g >= 0),
  protein_100g     numeric(5,1) not null default 0,
  carbs_100g       numeric(5,1) not null default 0,
  fat_100g         numeric(5,1) not null default 0,
  cooked_factor    numeric(4,2) not null default 1,     -- peso cocido / peso crudo (arroz 2.5, pollo 0.75)
  unit_label       text,                                -- 'unidad', 'lata', 'scoop', 'cdta'
  unit_g           numeric(6,1),                        -- gramos de esa unidad
  purchase_label   text not null default 'kg',          -- cómo se compra: kg, libra, docena, lata, bolsa
  purchase_g       numeric(7,1) not null default 1000,  -- gramos de la unidad de compra
  is_active        boolean not null default true,
  created_at       timestamptz not null default now()
);
create unique index if not exists food_items_base_name on public.food_items (lower(name)) where user_id is null;
create unique index if not exists food_items_user_name on public.food_items (user_id, lower(name)) where user_id is not null;

create table if not exists public.recipes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 100),
  meal_type     text not null check (meal_type in ('desayuno','almuerzo','cena','merienda','cualquiera')),
  instructions  text,
  prep_minutes  int check (prep_minutes between 0 and 240),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists recipes_base_name on public.recipes (lower(name)) where user_id is null;

create table if not exists public.recipe_ingredients (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id) on delete cascade,
  recipe_id   uuid not null references public.recipes(id) on delete cascade,
  food_id     uuid not null references public.food_items(id) on delete restrict,
  role        text not null check (role in ('proteina','carbohidrato','grasa','libre')),
  base_grams  numeric(6,1) not null check (base_grams > 0),
  sort_order  int not null default 0
);
create index if not exists recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id);

-- ---------------------------------------------------------------------
-- 4) N3 · Plan semanal, registro de comidas y lista de compras
-- ---------------------------------------------------------------------
create table if not exists public.meal_plan_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  plan_date   date not null,
  meal_type   text not null check (meal_type in ('desayuno','almuerzo','cena','merienda')),
  recipe_id   uuid references public.recipes(id) on delete set null,
  portions    jsonb not null default '[]'::jsonb,   -- [{food_id, grams}] ya ajustados a la meta
  kcal        int,
  protein_g   numeric(5,1),
  carbs_g     numeric(5,1),
  fat_g       numeric(5,1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, plan_date, meal_type)
);

create table if not exists public.meal_entries (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  entry_date         date not null,
  meal_type          text not null check (meal_type in ('desayuno','almuerzo','cena','merienda')),
  status             text not null check (status in ('comida','otra','saltada')),
  meal_plan_item_id  uuid references public.meal_plan_items(id) on delete set null,
  note               text,
  created_at         timestamptz not null default now(),
  unique (user_id, entry_date, meal_type)
);

-- shopping_list_items ya existe y está en uso: solo se le agregan columnas
alter table public.shopping_list_items add column if not exists unit       text;
alter table public.shopping_list_items add column if not exists food_id    uuid references public.food_items(id) on delete set null;
alter table public.shopping_list_items add column if not exists week_start date;
alter table public.shopping_list_items add column if not exists source     text not null default 'manual';

-- ---------------------------------------------------------------------
-- 5) M2 · Agenda propia · M3 · Fotos de progreso · M4 · Revisión semanal
-- ---------------------------------------------------------------------
create table if not exists public.agenda_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title          text not null check (char_length(title) between 1 and 120),
  event_date     date not null,
  start_time     time,
  end_time       time,
  kind           text not null default 'otro' check (kind in ('comida','gym','reunion','estudio','otro')),
  location       text,
  notes          text,
  gcal_event_id  text,          -- id en Google Calendar si se envió
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists agenda_events_user_date on public.agenda_events (user_id, event_date);

create table if not exists public.progress_photos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  taken_on      date not null,
  angle         text not null check (angle in ('frente','perfil','espalda')),
  storage_path  text not null,  -- <user_id>/<fecha>-<angulo>.jpg en el bucket progress-photos
  created_at    timestamptz not null default now(),
  unique (user_id, taken_on, angle)
);

create table if not exists public.weekly_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  week_start  date not null,
  summary     jsonb not null default '{}'::jsonb,
  goal_text   text,
  goal_done   boolean,
  created_at  timestamptz not null default now(),
  unique (user_id, week_start)
);

grant select, insert, update, delete on
  public.nutrition_plans, public.food_items, public.recipes, public.recipe_ingredients,
  public.meal_plan_items, public.meal_entries, public.agenda_events,
  public.progress_photos, public.weekly_reviews
to authenticated;

-- ---------------------------------------------------------------------
-- 6) Seguridad (RLS)
--    Tablas personales: cada quien solo lo suyo.
--    Alimentos y recetas: se leen los propios + los base (user_id NULL);
--    solo se crean/editan/borran los propios.
-- ---------------------------------------------------------------------
do $$
declare t text; p record;
begin
  foreach t in array array['nutrition_plans','meal_plan_items','meal_entries','agenda_events','progress_photos','weekly_reviews'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy renova_own_rows on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
  foreach t in array array['food_items','recipes','recipe_ingredients'] loop
    execute format('alter table public.%I enable row level security', t);
    for p in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy %I on public.%I', p.policyname, t);
    end loop;
    execute format('create policy renova_read_base_and_own on public.%I for select to authenticated using (user_id is null or user_id = (select auth.uid()))', t);
    execute format('create policy renova_insert_own on public.%I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy renova_update_own on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy renova_delete_own on public.%I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Fotos: bucket privado; cada usuario solo su carpeta <user_id>/...
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'Storage no disponible aquí: se omite el bucket de fotos.'; return;
  end if;
  insert into storage.buckets (id, name, public) values ('progress-photos','progress-photos', false)
  on conflict (id) do nothing;
  drop policy if exists renova_photos_select on storage.objects;
  drop policy if exists renova_photos_insert on storage.objects;
  drop policy if exists renova_photos_update on storage.objects;
  drop policy if exists renova_photos_delete on storage.objects;
  create policy renova_photos_select on storage.objects for select to authenticated
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy renova_photos_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy renova_photos_update on storage.objects for update to authenticated
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
  create policy renova_photos_delete on storage.objects for delete to authenticated
    using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
end $$;

-- ---------------------------------------------------------------------
-- 7) Base de alimentos (por 100 g; carnes, granos y legumbres = COCIDOS)
-- ---------------------------------------------------------------------
insert into public.food_items (name, category, store_section, kcal_100g, protein_100g, carbs_100g, fat_100g, cooked_factor, unit_label, unit_g, purchase_label, purchase_g)
select v.* from (values
  -- Proteínas
  ('Pechuga de pollo (cocida)',      'proteina','Carnes',            165, 31.0,  0.0,  3.6, 0.75, null,      null, 'kg',      1000),
  ('Muslo de pollo sin piel (cocido)','proteina','Carnes',           209, 26.0,  0.0, 10.9, 0.75, null,      null, 'kg',      1000),
  ('Carne de res magra (cocida)',    'proteina','Carnes',            200, 30.0,  0.0,  8.5, 0.70, null,      null, 'libra',    500),
  ('Carne molida de res 90/10 (cocida)','proteina','Carnes',         217, 26.0,  0.0, 12.0, 0.75, null,      null, 'libra',    500),
  ('Lomo de cerdo (cocido)',         'proteina','Carnes',            160, 27.0,  0.0,  5.0, 0.75, null,      null, 'libra',    500),
  ('Huevo entero',                   'proteina','Lácteos y huevos',  143, 12.6,  0.7,  9.5, 1.00, 'unidad',    50, 'docena',   600),
  ('Clara de huevo',                 'proteina','Lácteos y huevos',   52, 10.9,  0.7,  0.2, 1.00, 'clara',     33, 'docena',   600),
  ('Atún en agua (escurrido)',       'proteina','Despensa',          116, 25.5,  0.0,  0.8, 1.00, 'lata',     120, 'lata',     120),
  ('Atún en aceite (escurrido)',     'proteina','Despensa',          198, 29.0,  0.0,  8.2, 1.00, 'lata',     120, 'lata',     120),
  ('Jamón de pavo',                  'proteina','Carnes',            110, 17.0,  2.0,  3.5, 1.00, 'tajada',    20, 'paquete',  250),
  ('Queso campesino',                'lacteo',  'Lácteos y huevos',  264, 18.0,  3.0, 20.0, 1.00, 'tajada',    30, 'libra',    500),
  ('Yogur griego natural',           'lacteo',  'Lácteos y huevos',   97,  9.0,  4.0,  5.0, 1.00, 'vaso',     150, 'unidad',   500),
  ('Leche descremada',               'lacteo',  'Lácteos y huevos',   34,  3.4,  5.0,  0.1, 1.00, 'vaso',     240, 'litro',   1000),
  ('Proteína whey (polvo)',          'suplemento','Suplementos',     400, 80.0,  8.0,  6.0, 1.00, 'scoop',     30, 'tarro',    900),
  -- Carbohidratos
  ('Arroz blanco (cocido)',          'carbohidrato','Granos y harinas',130, 2.7, 28.0,  0.3, 2.50, 'taza',     160, 'libra',    500),
  ('Arroz integral (cocido)',        'carbohidrato','Granos y harinas',123, 2.7, 25.6,  1.0, 2.50, 'taza',     160, 'libra',    500),
  ('Pasta (cocida)',                 'carbohidrato','Granos y harinas',158, 5.8, 31.0,  0.9, 2.20, 'taza',     140, 'paquete',  500),
  ('Arepa de maíz',                  'carbohidrato','Granos y harinas',218, 4.5, 45.0,  2.0, 1.00, 'unidad',    70, 'paquete',  500),
  ('Papa (cocida)',                  'carbohidrato','Frutas y verduras', 87, 1.9, 20.0,  0.1, 1.00, 'unidad',   150, 'kg',      1000),
  ('Plátano (cocido)',               'carbohidrato','Frutas y verduras',116, 0.8, 31.0,  0.2, 1.00, 'unidad',   200, 'unidad',   250),
  ('Yuca (cocida)',                  'carbohidrato','Frutas y verduras',125, 1.0, 30.0,  0.3, 1.00, null,      null, 'kg',      1000),
  ('Avena en hojuelas',              'carbohidrato','Granos y harinas',379,13.0, 68.0,  6.5, 1.00, 'cucharada', 10, 'bolsa',    500),
  ('Pan integral',                   'carbohidrato','Granos y harinas',247,13.0, 41.0,  3.4, 1.00, 'tajada',    30, 'paquete',  500),
  ('Fríjol rojo (cocido)',           'carbohidrato','Granos y harinas',127, 8.7, 22.8,  0.5, 2.40, 'taza',     170, 'libra',    500),
  ('Lenteja (cocida)',               'carbohidrato','Granos y harinas',116, 9.0, 20.0,  0.4, 2.50, 'taza',     200, 'libra',    500),
  ('Garbanzo (cocido)',              'carbohidrato','Granos y harinas',164, 8.9, 27.0,  2.6, 2.40, 'taza',     160, 'libra',    500),
  -- Frutas
  ('Banano',                         'fruta','Frutas y verduras',     89, 1.1, 23.0,  0.3, 1.00, 'unidad',   120, 'unidad',   120),
  ('Manzana',                        'fruta','Frutas y verduras',     52, 0.3, 14.0,  0.2, 1.00, 'unidad',   150, 'unidad',   150),
  ('Mango',                          'fruta','Frutas y verduras',     60, 0.8, 15.0,  0.4, 1.00, 'unidad',   300, 'unidad',   300),
  ('Papaya',                         'fruta','Frutas y verduras',     43, 0.5, 11.0,  0.3, 1.00, 'taza',     145, 'kg',      1000),
  ('Fresa',                          'fruta','Frutas y verduras',     32, 0.7,  7.7,  0.3, 1.00, 'taza',     150, 'caja',     250),
  ('Piña',                           'fruta','Frutas y verduras',     50, 0.5, 13.0,  0.1, 1.00, 'taza',     165, 'unidad',  1200),
  ('Guayaba',                        'fruta','Frutas y verduras',     68, 2.6, 14.0,  1.0, 1.00, 'unidad',    90, 'kg',      1000),
  ('Mandarina',                      'fruta','Frutas y verduras',     53, 0.8, 13.0,  0.3, 1.00, 'unidad',    90, 'kg',      1000),
  -- Verduras
  ('Tomate',                         'verdura','Frutas y verduras',   18, 0.9,  3.9,  0.2, 1.00, 'unidad',   120, 'kg',      1000),
  ('Cebolla cabezona',               'verdura','Frutas y verduras',   40, 1.1,  9.3,  0.1, 1.00, 'unidad',   150, 'kg',      1000),
  ('Lechuga',                        'verdura','Frutas y verduras',   15, 1.4,  2.9,  0.2, 1.00, 'taza',      50, 'unidad',   400),
  ('Pepino',                         'verdura','Frutas y verduras',   15, 0.7,  3.6,  0.1, 1.00, 'unidad',   200, 'unidad',   200),
  ('Brócoli (cocido)',               'verdura','Frutas y verduras',   35, 2.4,  7.2,  0.4, 1.00, 'taza',     150, 'unidad',   400),
  ('Zanahoria',                      'verdura','Frutas y verduras',   41, 0.9,  9.6,  0.2, 1.00, 'unidad',    80, 'kg',      1000),
  ('Habichuela (cocida)',            'verdura','Frutas y verduras',   35, 1.9,  7.9,  0.3, 1.00, 'taza',     125, 'libra',    500),
  ('Espinaca',                       'verdura','Frutas y verduras',   23, 2.9,  3.6,  0.4, 1.00, 'taza',      30, 'bolsa',    250),
  ('Pimentón',                       'verdura','Frutas y verduras',   31, 1.0,  6.0,  0.3, 1.00, 'unidad',   150, 'unidad',   150),
  ('Champiñones',                    'verdura','Frutas y verduras',   22, 3.1,  3.3,  0.3, 1.00, 'taza',      70, 'bandeja',  250),
  ('Ahuyama (cocida)',               'verdura','Frutas y verduras',   20, 0.7,  4.9,  0.1, 1.00, 'taza',     245, 'kg',      1000),
  -- Grasas
  ('Aceite de oliva',                'grasa','Despensa',             884, 0.0,  0.0,100.0, 1.00, 'cdta',       5, 'botella',  500),
  ('Aceite vegetal',                 'grasa','Despensa',             884, 0.0,  0.0,100.0, 1.00, 'cdta',       5, 'botella', 1000),
  ('Aguacate',                       'grasa','Frutas y verduras',    160, 2.0,  8.5, 14.7, 1.00, 'unidad',   200, 'unidad',   200),
  ('Maní tostado',                   'grasa','Despensa',             585,24.0, 21.0, 50.0, 1.00, 'puñado',    30, 'bolsa',    250),
  ('Mantequilla de maní',            'grasa','Despensa',             588,25.0, 20.0, 50.0, 1.00, 'cucharada', 16, 'frasco',   340),
  ('Almendras',                      'grasa','Despensa',             579,21.0, 22.0, 50.0, 1.00, 'puñado',    30, 'bolsa',    200)
) as v(name, category, store_section, kcal_100g, protein_100g, carbs_100g, fat_100g, cooked_factor, unit_label, unit_g, purchase_label, purchase_g)
where not exists (select 1 from public.food_items f where f.user_id is null and lower(f.name) = lower(v.name));

-- ---------------------------------------------------------------------
-- 8) 12 recetas base: fáciles, con pollo, carne, huevo o atún, sin mariscos
--    Los gramos son la porción base; la app los ajusta a cada comida.
-- ---------------------------------------------------------------------
-- Un solo comando (sin tablas temporales) para que funcione igual en el
-- SQL Editor de Supabase, que confirma cada instrucción por separado.
with seed_recipes(name, meal_type, prep, instructions) as (values
  ('Huevos revueltos con arepa',          'desayuno', 10, 'Sofríe tomate y cebolla con el aceite, agrega los huevos y revuelve. Asa la arepa.'),
  ('Omelette de claras con jamón',        'desayuno', 10, 'Bate claras y huevo, agrega espinaca y jamón picado, cocina tapado a fuego bajo. Acompaña con pan integral.'),
  ('Avena con banano y yogur griego',     'desayuno',  5, 'Mezcla la avena con el yogur, agrega banano y fresas en trozos. Con proteína whey: mezcla 1 scoop en el yogur.'),
  ('Calentado light con huevo',           'desayuno', 10, 'Calienta el arroz con el fríjol en sartén antiadherente y sirve con huevo cocido o en tortilla.'),
  ('Pollo a la plancha con arroz y ensalada','almuerzo', 20, 'Sazona el pollo con sal, pimienta y ajo; plancha 5–6 min por lado. Sirve con arroz y ensalada con aceite de oliva.'),
  ('Carne asada con papa y ensalada',     'almuerzo', 25, 'Asa la carne en sartén caliente. Cocina la papa en agua con sal 20 min. Ensalada de lechuga y tomate.'),
  ('Pasta con atún y tomate',             'almuerzo', 15, 'Cocina la pasta. Sofríe tomate y cebolla, agrega el atún escurrido y mezcla con la pasta.'),
  ('Bowl de carne molida, arroz y fríjol','almuerzo', 20, 'Dora la carne molida con cebolla y tomate. Sirve en bowl con arroz y fríjol.'),
  ('Pollo con plátano y brócoli',         'almuerzo', 25, 'Plancha el pollo. Cocina el plátano en agua 15 min y el brócoli al vapor 5 min.'),
  ('Ensalada de atún con aguacate y papa','cena',     10, 'Mezcla atún, lechuga, tomate, pepino y aguacate. Acompaña con papa cocida.'),
  ('Pechuga con verduras salteadas',      'cena',     20, 'Corta el pollo en tiras y saltéalo con brócoli, zanahoria y habichuela. Porción pequeña de arroz.'),
  ('Huevos con champiñones y arepa',      'cena',     10, 'Saltea champiñones, pimentón y cebolla; agrega los huevos. Acompaña con arepa pequeña.')
), seed_ing(recipe, food, role, grams, ord) as (values
  ('Huevos revueltos con arepa','Huevo entero','proteina',150,1),('Huevos revueltos con arepa','Arepa de maíz','carbohidrato',70,2),('Huevos revueltos con arepa','Tomate','libre',60,3),('Huevos revueltos con arepa','Cebolla cabezona','libre',30,4),('Huevos revueltos con arepa','Aceite vegetal','grasa',3,5),
  ('Omelette de claras con jamón','Clara de huevo','proteina',132,1),('Omelette de claras con jamón','Huevo entero','proteina',50,2),('Omelette de claras con jamón','Jamón de pavo','proteina',40,3),('Omelette de claras con jamón','Pan integral','carbohidrato',60,4),('Omelette de claras con jamón','Espinaca','libre',30,5),
  ('Avena con banano y yogur griego','Yogur griego natural','proteina',150,1),('Avena con banano y yogur griego','Avena en hojuelas','carbohidrato',40,2),('Avena con banano y yogur griego','Banano','carbohidrato',80,3),('Avena con banano y yogur griego','Fresa','libre',50,4),
  ('Calentado light con huevo','Huevo entero','proteina',100,1),('Calentado light con huevo','Arroz blanco (cocido)','carbohidrato',100,2),('Calentado light con huevo','Fríjol rojo (cocido)','carbohidrato',80,3),
  ('Pollo a la plancha con arroz y ensalada','Pechuga de pollo (cocida)','proteina',180,1),('Pollo a la plancha con arroz y ensalada','Arroz blanco (cocido)','carbohidrato',150,2),('Pollo a la plancha con arroz y ensalada','Lechuga','libre',50,3),('Pollo a la plancha con arroz y ensalada','Tomate','libre',60,4),('Pollo a la plancha con arroz y ensalada','Pepino','libre',50,5),('Pollo a la plancha con arroz y ensalada','Aceite de oliva','grasa',5,6),
  ('Carne asada con papa y ensalada','Carne de res magra (cocida)','proteina',170,1),('Carne asada con papa y ensalada','Papa (cocida)','carbohidrato',250,2),('Carne asada con papa y ensalada','Lechuga','libre',50,3),('Carne asada con papa y ensalada','Tomate','libre',70,4),('Carne asada con papa y ensalada','Aceite de oliva','grasa',5,5),
  ('Pasta con atún y tomate','Atún en agua (escurrido)','proteina',120,1),('Pasta con atún y tomate','Pasta (cocida)','carbohidrato',160,2),('Pasta con atún y tomate','Tomate','libre',80,3),('Pasta con atún y tomate','Cebolla cabezona','libre',30,4),('Pasta con atún y tomate','Aceite de oliva','grasa',5,5),
  ('Bowl de carne molida, arroz y fríjol','Carne molida de res 90/10 (cocida)','proteina',150,1),('Bowl de carne molida, arroz y fríjol','Arroz blanco (cocido)','carbohidrato',120,2),('Bowl de carne molida, arroz y fríjol','Fríjol rojo (cocido)','carbohidrato',80,3),('Bowl de carne molida, arroz y fríjol','Tomate','libre',50,4),('Bowl de carne molida, arroz y fríjol','Cebolla cabezona','libre',30,5),
  ('Pollo con plátano y brócoli','Pechuga de pollo (cocida)','proteina',170,1),('Pollo con plátano y brócoli','Plátano (cocido)','carbohidrato',150,2),('Pollo con plátano y brócoli','Brócoli (cocido)','libre',120,3),('Pollo con plátano y brócoli','Aceite vegetal','grasa',5,4),
  ('Ensalada de atún con aguacate y papa','Atún en agua (escurrido)','proteina',120,1),('Ensalada de atún con aguacate y papa','Papa (cocida)','carbohidrato',100,2),('Ensalada de atún con aguacate y papa','Aguacate','grasa',50,3),('Ensalada de atún con aguacate y papa','Lechuga','libre',50,4),('Ensalada de atún con aguacate y papa','Tomate','libre',60,5),('Ensalada de atún con aguacate y papa','Pepino','libre',50,6),
  ('Pechuga con verduras salteadas','Pechuga de pollo (cocida)','proteina',160,1),('Pechuga con verduras salteadas','Arroz blanco (cocido)','carbohidrato',80,2),('Pechuga con verduras salteadas','Brócoli (cocido)','libre',80,3),('Pechuga con verduras salteadas','Zanahoria','libre',60,4),('Pechuga con verduras salteadas','Habichuela (cocida)','libre',60,5),('Pechuga con verduras salteadas','Aceite de oliva','grasa',5,6),
  ('Huevos con champiñones y arepa','Huevo entero','proteina',150,1),('Huevos con champiñones y arepa','Arepa de maíz','carbohidrato',50,2),('Huevos con champiñones y arepa','Champiñones','libre',70,3),('Huevos con champiñones y arepa','Pimentón','libre',40,4),('Huevos con champiñones y arepa','Cebolla cabezona','libre',30,5)
), nuevas as (
  insert into public.recipes (user_id, name, meal_type, prep_minutes, instructions)
  select null, s.name, s.meal_type, s.prep, s.instructions from seed_recipes s
  where not exists (select 1 from public.recipes r where r.user_id is null and lower(r.name) = lower(s.name))
  returning id, name
)
insert into public.recipe_ingredients (user_id, recipe_id, food_id, role, base_grams, sort_order)
select null, n.id, f.id, i.role, i.grams, i.ord
from nuevas n
join seed_ing i on i.recipe = n.name
join public.food_items f on f.user_id is null and lower(f.name) = lower(i.food);

commit;

-- ---------------------------------------------------------------------
-- 9) Verificación (debe dar 51 · 12 · 59 · 9)
-- ---------------------------------------------------------------------
select 'alimentos base' as que, count(*) as total from public.food_items where user_id is null
union all select 'recetas base', count(*) from public.recipes where user_id is null
union all select 'ingredientes de recetas base', count(*) from public.recipe_ingredients where user_id is null
union all select 'tablas con RLS', count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
    and c.relname in ('nutrition_plans','food_items','recipes','recipe_ingredients','meal_plan_items','meal_entries','agenda_events','progress_photos','weekly_reviews');
