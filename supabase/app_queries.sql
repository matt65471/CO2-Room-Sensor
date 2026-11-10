-- Queries used by the dashboard app (app/backend).
-- Run in your Supabase project AFTER schema.sql (and add_temp_humidity.sql if your table predates it):
-- Dashboard -> SQL Editor -> New query -> paste -> Run. Safe to re-run; re-run it whenever this file changes.
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

-- Older versions of these functions returned different columns, and Postgres can't change a
-- function's return type in place, so drop them first.
drop function if exists get_readings(uuid, timestamptz, int);
drop function if exists get_summary(uuid);

-- Readings for the graph, averaged into fixed time buckets so even 3 days of readings
-- come back as a few hundred points. avg() skips NULLs, so CO2-only rows don't affect temp/humidity.
create function get_readings(p_device uuid, p_since timestamptz, p_bucket_secs int)
returns table (t timestamptz, ppm numeric, temp_c numeric, rh_pct numeric)
language sql
stable
set search_path = public
as $$
  select date_bin(make_interval(secs => p_bucket_secs), r.created_at, p_since) as t,
         round(avg(r.ppm), 1)    as ppm,
         round(avg(r.temp_c), 2) as temp_c,
         round(avg(r.rh_pct), 2) as rh_pct
  from readings r
  where r.device_id = p_device
    and r.created_at >= p_since
  group by 1
  order by 1;
$$;

-- Past-24-hour statistics, one row per metric ('co2', 'temp', 'humidity'), plus the CO2 trend over
-- the past hour (repeated on every row) and the latest values. The trend is the slope of a best-fit
-- straight line through the past hour's CO2 readings, in ppm per hour.
create function get_summary(p_device uuid)
returns table (
  metric             text,
  mean_24h           numeric,
  median_24h         double precision,
  low_24h            numeric,
  low_at             timestamptz,
  high_24h           numeric,
  high_at            timestamptz,
  count_24h          bigint,
  slope_ppm_per_hour double precision,
  first_1h           integer,
  latest_1h          integer,
  count_1h           bigint,
  latest_temp_c      numeric,
  latest_rh_pct      numeric
)
language sql
stable
set search_path = public
as $$
  with day as (
    select created_at, ppm::numeric as ppm, temp_c, rh_pct
    from readings
    where device_id = p_device
      and created_at >= now() - interval '24 hours'
  ),
  hour as (
    select created_at, ppm
    from day
    where created_at >= now() - interval '1 hour'
  ),
  -- Reshape to (metric, value, time) so one set of aggregates covers all three metrics
  metrics as (
    select 'co2' as metric, ppm as value, created_at from day
    union all
    select 'temp', temp_c, created_at from day where temp_c is not null
    union all
    select 'humidity', rh_pct, created_at from day where rh_pct is not null
  ),
  stats as (
    select m.metric,
           round(avg(m.value), 2)                              as mean_24h,
           percentile_cont(0.5) within group (order by m.value) as median_24h,
           min(m.value)                                        as low_24h,
           max(m.value)                                        as high_24h,
           count(*)                                            as count_24h
    from metrics m
    group by m.metric
  ),
  trend as (
    select regr_slope(ppm::float8, extract(epoch from created_at)::float8) * 3600 as slope,
           count(*) as n
    from hour
  ),
  latest as (
    select temp_c, rh_pct
    from day
    where temp_c is not null or rh_pct is not null
    order by created_at desc
    limit 1
  )
  select names.metric,
         s.mean_24h,
         s.median_24h,
         s.low_24h,
         (select m.created_at from metrics m
          where m.metric = names.metric
          order by m.value asc, m.created_at desc limit 1),
         s.high_24h,
         (select m.created_at from metrics m
          where m.metric = names.metric
          order by m.value desc, m.created_at desc limit 1),
         coalesce(s.count_24h, 0),
         trend.slope,
         (select ppm::int from hour order by created_at asc limit 1),
         (select ppm::int from hour order by created_at desc limit 1),
         trend.n,
         (select temp_c from latest),
         (select rh_pct from latest)
  from (values ('co2'), ('temp'), ('humidity')) as names(metric)
  left join stats s on s.metric = names.metric
  cross join trend;
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
