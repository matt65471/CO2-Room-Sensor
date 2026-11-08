#pragma once

#include "esp_err.h"

// Sensirion SCD41 CO2 / temperature / humidity sensor over I2C.
// Wiring: SDA -> GPIO8, SCL -> GPIO9, VDD -> 3.3 V, GND -> GND.

// Set up the I2C bus and start periodic measurement (one new sample every 5 seconds).
esp_err_t scd41_init(void);

// Read the latest sample.
// Returns ESP_ERR_NOT_FINISHED if no new sample is ready since the last read (try again shortly),
// or ESP_ERR_INVALID_CRC if the data was corrupted on the wire.
esp_err_t scd41_read(int *co2_ppm, float *temp_c, float *rh_pct);
