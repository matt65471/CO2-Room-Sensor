#pragma once

#include "esp_err.h"

// Insert one reading (CO2, temperature, humidity) into the Supabase `readings` table.
// The timestamp is filled in by the database. Returns ESP_OK if Supabase stored the row.
esp_err_t supabase_send_reading(const char *device_id, int ppm, float temp_c, float rh_pct);
