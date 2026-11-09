-- Queries used by the dashboard app (app/backend).
-- Run once in your Supabase project AFTER schema.sql: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Safe to re-run: everything uses "create or replace".
--
-- Only the backend's secret (service_role) key can use these. The device's anon key stays insert-only.

-- Every device that has sent at least one reading, for the device dropdown.
-- security_invoker makes the view obey the table's Row Level Security, so anon can't read it.
create or replace view devices with (security_invoker = true) as
select device_id,
       max(created_at) as last_seen,
       count(*)        as readings
from readings
group by device_id;

-- Readings for the graph, averaged into fixed time buckets so even 3 days of 5-second readings
-- come back as a few hundred points.
create or replace function get_readings(p_device uuid, p_since timestamptz, p_bucket_secs int)
returns table (t timestamptz, ppm numeric)
language sql
stable
set search_path = public
as $$
  select date_bin(make_interval(secs => p_bucket_secs), r.created_at, p_since) as t,
         round(avg(r.ppm), 1)                                                as ppm
  from readings r
  where r.device_id = p_device
    and r.created_at >= p_since
  group by 1
  order by 1;
$$;

-- Statistics for the past 24 hours, plus the CO2 trend over the past hour.
-- The trend is the slope of a best-fit straight line through the past hour's readings, in ppm per hour.
create or replace function get_summary(p_device uuid)
returns table (
  mean_24h           numeric,
  median_24h         double precision,
  high_24h           integer,
  high_at            timestamptz,
  count_24h          bigint,
  slope_ppm_per_hour double precision,
  first_1h           integer,
  latest_1h          integer,
  count_1h           bigint
)
language sql
stable
set search_path = public
as $$
  with day as (
    select created_at, ppm
    from readings
    where device_id = p_device
      and created_at >= now() - interval '24 hours'
  ),
  hour as (
    select created_at, ppm
    from day
    where created_at >= now() - interval '1 hour'
  )
  select
    (select round(avg(ppm), 1) from day),
    (select percentile_cont(0.5) within group (order by ppm) from day),
    (select max(ppm) from day),
    (select created_at from day order by ppm desc, created_at desc limit 1),
    (select count(*) from day),
    (select regr_slope(ppm::float8, extract(epoch from created_at)::float8) * 3600 from hour),
    (select ppm from hour order by created_at asc limit 1),
    (select ppm from hour order by created_at desc limit 1),
    (select count(*) from hour);
$$;

-- Only the backend's secret key may read. Supabase usually grants table access automatically,
-- but newer projects may not, so be explicit.
grant select on table readings to service_role;
grant select on devices to service_role;
revoke all on devices from anon, authenticated;

revoke execute on function get_readings(uuid, timestamptz, int) from public, anon, authenticated;
revoke execute on function get_summary(uuid) from public, anon, authenticated;
grant execute on function get_readings(uuid, timestamptz, int) to service_role;
grant execute on function get_summary(uuid) to service_role;
