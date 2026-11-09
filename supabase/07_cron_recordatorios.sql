-- RENOVA · 07 · Cron de recordatorios (corre después del 06 y de desplegar la función)
-- Cada 15 minutos llama a tu función para que envíe los recordatorios que toquen.
-- Si cambias la dirección de la función, cambia la URL de abajo y vuelve a correr este archivo.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'renova-recordatorios',
  '*/15 * * * *',
  $cron$
  select net.http_post(
    url := 'https://dniegeedovdakfqfbcay.supabase.co/functions/v1/smooth-task',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-renova-cron', (select value from public.push_config where key = 'cron_secret')
    ),
    body := '{"kind":"cron"}'::jsonb,
    timeout_milliseconds := 20000
  );
  $cron$
);

-- Verificación: debe aparecer 'renova-recordatorios' activo
select jobname, schedule, active from cron.job where jobname = 'renova-recordatorios';
