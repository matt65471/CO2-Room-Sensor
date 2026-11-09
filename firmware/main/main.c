#include <string.h>

#include "device_id.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "nvs_flash.h"
#include "scd41.h"
#include "supabase.h"

static const char *TAG = "co2_sensor";

#if CONFIG_SUPABASE_UPLOAD
#define WIFI_CONNECTED_BIT BIT0

static EventGroupHandle_t wifi_events;

static void wifi_event_handler(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    if (base == WIFI_EVENT && id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (base == WIFI_EVENT && id == WIFI_EVENT_STA_DISCONNECTED) {
        wifi_event_sta_disconnected_t *event = data;
        xEventGroupClearBits(wifi_events, WIFI_CONNECTED_BIT);
        ESP_LOGW(TAG, "Wi-Fi disconnected (reason %d), retrying", event->reason);
        esp_wifi_connect();
    } else if (base == IP_EVENT && id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = data;
        ESP_LOGI(TAG, "Connected, IP address: " IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupSetBits(wifi_events, WIFI_CONNECTED_BIT);
    }
}
#endif

static void nvs_init(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
}

#if CONFIG_SUPABASE_UPLOAD
static void wifi_start(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t init_config = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&init_config));

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_EVENT, ESP_EVENT_ANY_ID, wifi_event_handler, NULL));
    ESP_ERROR_CHECK(esp_event_handler_register(IP_EVENT, IP_EVENT_STA_GOT_IP, wifi_event_handler, NULL));

    wifi_config_t wifi_config = {0};
    strlcpy((char *)wifi_config.sta.ssid, CONFIG_WIFI_SSID, sizeof(wifi_config.sta.ssid));
    strlcpy((char *)wifi_config.sta.password, CONFIG_WIFI_PASSWORD, sizeof(wifi_config.sta.password));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
}

#endif

void app_main(void)
{
    // The ESP32-S3's USB port disconnects on every reset and takes ~1 s to reconnect.
    // Wait so the serial monitor catches the startup messages (device ID etc.).
    vTaskDelay(pdMS_TO_TICKS(1500));
    ESP_LOGI(TAG, "CO2 room sensor starting");

    nvs_init();
    device_id_init();
    ESP_LOGI(TAG, "Device ID: %s", device_id_get());

    ESP_ERROR_CHECK(scd41_init());
    ESP_LOGI(TAG, "CO2 readings take a few minutes to fully settle after power-up");

#if CONFIG_SUPABASE_UPLOAD
    wifi_events = xEventGroupCreate();
    wifi_start();

    // Wait until the router has assigned an IP address
    xEventGroupWaitBits(wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
#else
    ESP_LOGI(TAG, "Supabase upload is off (menuconfig -> Supabase), Wi-Fi not started");
#endif

    while (1) {
        int ppm;
        float temp_c, rh_pct;
        esp_err_t err = scd41_read(&ppm, &temp_c, &rh_pct);

        if (err == ESP_ERR_NOT_FINISHED) {
            // The sensor makes a new sample every 5 s; check again in a second
            ESP_LOGD(TAG, "No new sample yet");
            vTaskDelay(pdMS_TO_TICKS(1000));
            continue;
        }

        if (err == ESP_OK) {
            ESP_LOGI(TAG, "CO2: %d ppm  T: %.1f C  RH: %.1f %%", ppm, temp_c, rh_pct);
#if CONFIG_SUPABASE_UPLOAD
            // Only try to upload while Wi-Fi is up; readings taken while offline are skipped
            if (xEventGroupGetBits(wifi_events) & WIFI_CONNECTED_BIT) {
                supabase_send_reading(device_id_get(), ppm, temp_c, rh_pct);
            } else {
                ESP_LOGW(TAG, "Wi-Fi down, skipping upload of %d ppm", ppm);
            }
#endif
        } else {
            ESP_LOGW(TAG, "Sensor read failed: %s", esp_err_to_name(err));
        }

        vTaskDelay(pdMS_TO_TICKS(CONFIG_READING_INTERVAL_SEC * 1000));
    }
}
