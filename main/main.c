#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "co2_sensor";

void app_main(void)
{
    ESP_LOGI(TAG, "CO2 room sensor starting");

    while (1) {
        // Sensor reading will go here
        ESP_LOGI(TAG, "Running");
        vTaskDelay(pdMS_TO_TICKS(5000));
    }
}
