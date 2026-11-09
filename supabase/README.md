# Supabase setup

1. Create a free project at https://supabase.com.
2. Open **SQL Editor → New query**, paste `schema.sql`, and click **Run**. This creates the `readings` table.
3. Go to **Project Settings → API** and copy:
   - the **Project URL** (e.g. `https://abcdxyz.supabase.co`)
   - the **anon / publishable** key
4. From the `firmware/` folder, run `idf.py menuconfig`, open **Supabase**, and paste both values in.
5. Run `idf.py build flash monitor`. Every reading should log `Stored reading: … ppm`, and rows should appear under **Table Editor → readings**.

6. For the dashboard app, also run **`app_queries.sql`** in the SQL Editor. It adds a `devices` view and the
   `get_readings` / `get_summary` functions, readable only with the backend's secret key.

Only put the **anon/publishable** key on the device. Never use the `service_role` / secret key there: it bypasses all security rules. With `schema.sql`'s policy, the anon key can only *insert* readings.

## Table: `readings`

| column       | type             | set by                         |
|--------------|------------------|--------------------------------|
| `id`         | bigint           | database (auto-increment)      |
| `device_id`  | uuid             | ESP32 (stored in its flash)    |
| `created_at` | timestamptz(0)   | database, to the second        |
| `ppm`        | integer          | ESP32                          |
| `temp_c`     | numeric(4,1)     | ESP32, optional (°C)           |
| `rh_pct`     | numeric(4,1)     | ESP32, optional (% humidity)   |

If your table was created before `temp_c` / `rh_pct` existed, run `add_temp_humidity.sql` once.

## Device ID

- Generated once on first boot and saved in flash, so it survives reboots and Wi-Fi drops.
- To give the sensor a **new** ID (new owner / removed device): while it's running, hold the **BOOT** button for 5 seconds. It erases the ID, restarts, and logs the new one.
  (Don't hold BOOT while pressing RESET: that puts the chip in flashing mode.)
