-- Adds temperature and humidity (also measured by the SCD41) to an EXISTING readings table.
-- Run once in the SQL Editor. Safe to re-run. Not needed for new setups: schema.sql already includes these.
--
-- Both columns allow NULL, so existing rows (CO2 only) stay valid and older firmware that sends
-- only ppm keeps working.

alter table readings
  add column if not exists temp_c numeric(4,1) check (temp_c between -40 and 125),  -- degrees C, 0.1 precision
  add column if not exists rh_pct numeric(4,1) check (rh_pct between 0 and 100);    -- relative humidity %, 0.1 precision
