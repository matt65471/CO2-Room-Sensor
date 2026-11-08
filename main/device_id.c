#include "device_id.h"

#include <stdio.h>

#include "driver/gpio.h"
#include "esp_log.h"
#include "esp_random.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "nvs.h"

// BOOT button on most ESP32-S3 dev boards (pressed = low). It's a strapping pin, so it is
// watched while running: holding it during a reset would put the chip in flashing mode instead.
#define RESET_BUTTON_GPIO GPIO_NUM_0
#define RESET_HOLD_MS     5000
#define POLL_MS           100
#define NVS_NAMESPACE     "co2"
#define NVS_KEY           "device_id"

static const char *TAG = "device_id";

static char device_id[DEVICE_ID_STR_LEN];

// Random (version 4) UUID using the hardware random number generator.
static void generate_uuid(char *out)
{
    uint8_t b[16];
    esp_fill_random(b, sizeof(b));
    b[6] = (b[6] & 0x0F) | 0x40;  // version 4
    b[8] = (b[8] & 0x3F) | 0x80;  // RFC 4122 variant

    snprintf(out, DEVICE_ID_STR_LEN,
             "%02x%02x%02x%02x-%02x%02x-%02x%02x-%02x%02x-%02x%02x%02x%02x%02x%02x",
             b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7],
             b[8], b[9], b[10], b[11], b[12], b[13], b[14], b[15]);
}

// Erase the stored ID and reboot; device_id_init() then generates a fresh one.
static void reset_device_id(void)
{
    nvs_handle_t nvs;
    if (nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs) == ESP_OK) {
        nvs_erase_key(nvs, NVS_KEY);
        nvs_commit(nvs);
        nvs_close(nvs);
    }
    ESP_LOGW(TAG, "Device ID erased, restarting");
    esp_restart();
}

// Background task: holding BOOT for RESET_HOLD_MS resets the device ID.
static void button_task(void *arg)
{
    int held_ms = 0;
    while (1) {
        if (gpio_get_level(RESET_BUTTON_GPIO) == 0) {
            if (held_ms == 0) {
                ESP_LOGW(TAG, "BOOT pressed, hold for %d s to reset the device ID", RESET_HOLD_MS / 1000);
            }
            held_ms += POLL_MS;
            if (held_ms >= RESET_HOLD_MS) {
                reset_device_id();
            }
        } else {
            if (held_ms > 0) {
                ESP_LOGI(TAG, "BOOT released early, keeping the device ID");
            }
            held_ms = 0;
        }
        vTaskDelay(pdMS_TO_TICKS(POLL_MS));
    }
}

void device_id_init(void)
{
    nvs_handle_t nvs;
    ESP_ERROR_CHECK(nvs_open(NVS_NAMESPACE, NVS_READWRITE, &nvs));

    size_t len = sizeof(device_id);
    esp_err_t err = nvs_get_str(nvs, NVS_KEY, device_id, &len);
    if (err == ESP_ERR_NVS_NOT_FOUND) {
        generate_uuid(device_id);
        ESP_ERROR_CHECK(nvs_set_str(nvs, NVS_KEY, device_id));
        ESP_ERROR_CHECK(nvs_commit(nvs));
        ESP_LOGI(TAG, "Generated new device ID");
    } else {
        ESP_ERROR_CHECK(err);
    }
    nvs_close(nvs);

    gpio_config_t config = {
        .pin_bit_mask = 1ULL << RESET_BUTTON_GPIO,
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = GPIO_PULLUP_ENABLE,
    };
    ESP_ERROR_CHECK(gpio_config(&config));
    xTaskCreate(button_task, "id_reset_btn", 3072, NULL, 5, NULL);
}

const char *device_id_get(void)
{
    return device_id;
}
