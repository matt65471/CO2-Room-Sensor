# CO2 Room Sensor

An ESP32-S3 + SCD41 sensor that measures room CO2 and uploads readings to Supabase, plus an app to view the data.

| Folder | What it is |
|---|---|
| [`firmware/`](firmware/) | ESP-IDF project for the ESP32-S3 (sensor, Wi-Fi, device ID, Supabase upload) |
| [`supabase/`](supabase/) | Database schema and setup instructions |
| [`app/`](app/) | Dashboard: React frontend + Node.js backend for viewing readings |

## Firmware quick start

```bash
cd firmware
source ~/.espressif/tools/activate_idf_v6.1.sh
idf.py menuconfig                                  # Wi-Fi + Supabase settings
idf.py -p /dev/cu.usbmodem101 flash monitor
```

In VS Code, open `CO2-Room-Sensor.code-workspace` (or just the `firmware/` folder) so the ESP-IDF extension finds the project.

Secrets (Wi-Fi password, Supabase key) live in `firmware/sdkconfig`, which is git-ignored. Shared, non-secret settings go in `firmware/sdkconfig.defaults`.

## App quick start

1. In Supabase's SQL Editor, run [`supabase/app_queries.sql`](supabase/app_queries.sql) (once, after `schema.sql`).
2. Copy `app/backend/.env.example` to `app/backend/.env` and fill in the Project URL and the **secret** key.
   The secret key stays on the backend only; `.env` is git-ignored.
3. Run:

```bash
cd app
npm install
npm run dev        # backend on :3001, frontend on http://localhost:5173
```

Other commands: `npm test` (backend unit tests), `npm run build` (type-check and build both).
