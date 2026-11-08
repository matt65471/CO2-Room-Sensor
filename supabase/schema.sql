-- CO2 Room Sensor database schema.
-- Run once in your Supabase project: Dashboard -> SQL Editor -> New query -> paste -> Run.

create table readings (
  id         bigint generated always as identity primary key,
  device_id  uuid not null,                                -- generated on the ESP32, stored in its flash
  created_at timestamptz(0) not null default now(),        -- set by the DB, whole-second precision
  ppm        integer not null check (ppm >= 0)             -- CO2 concentration
);

-- Fast "latest readings for this device" queries
create index readings_device_time_idx on readings (device_id, created_at desc);

-- Row Level Security: the device uses the public anon key, which may ONLY insert.
-- It cannot read, update or delete anything. Your app reads with its own key / logged-in user.
alter table readings enable row level security;

create policy "devices can insert readings" on readings
  for insert to anon
  with check (true);
