#include <string.h>

#include "device_id.h"
#include "esp_event.h"
#include "esp_log.h"
#include "esp_netif.h"
#include "esp_random.h"
#include "esp_wifi.h"
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"
#include "freertos/task.h"
#include "lwip/inet.h"
#include "lwip/netdb.h"
#include "nvs_flash.h"
#include "ping/ping_sock.h"
#include "supabase.h"

#define WIFI_CONNECTED_BIT BIT0

static const char *TAG = "co2_sensor";

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

static void on_ping_success(esp_ping_handle_t handle, void *args)
{
    uint16_t seqno;
    uint32_t time_ms;
    ip_addr_t from;
    esp_ping_get_profile(handle, ESP_PING_PROF_SEQNO, &seqno, sizeof(seqno));
    esp_ping_get_profile(handle, ESP_PING_PROF_TIMEGAP, &time_ms, sizeof(time_ms));
    esp_ping_get_profile(handle, ESP_PING_PROF_IPADDR, &from, sizeof(from));
    ESP_LOGI(TAG, "Ping reply from %s: seq=%u time=%lu ms", ipaddr_ntoa(&from), seqno, time_ms);
}

static void on_ping_timeout(esp_ping_handle_t handle, void *args)
{
    uint16_t seqno;
    esp_ping_get_profile(handle, ESP_PING_PROF_SEQNO, &seqno, sizeof(seqno));
    ESP_LOGW(TAG, "Ping timed out: seq=%u", seqno);
}

static void on_ping_end(esp_ping_handle_t handle, void *args)
{
    uint32_t sent;
    uint32_t received;
    esp_ping_get_profile(handle, ESP_PING_PROF_REQUEST, &sent, sizeof(sent));
    esp_ping_get_profile(handle, ESP_PING_PROF_REPLY, &received, sizeof(received));
    ESP_LOGI(TAG, "Ping finished: %lu sent, %lu received", sent, received);
    esp_ping_delete_session(handle);
}

static void ping_host(const char *host)
{
    struct addrinfo hints = {.ai_family = AF_INET};
    struct addrinfo *result = NULL;
    if (getaddrinfo(host, NULL, &hints, &result) != 0 || result == NULL) {
        ESP_LOGE(TAG, "Could not look up %s (DNS failed)", host);
        return;
    }

    ip_addr_t target = {0};
    struct in_addr address = ((struct sockaddr_in *)result->ai_addr)->sin_addr;
    inet_addr_to_ip4addr(ip_2_ip4(&target), &address);
    target.type = IPADDR_TYPE_V4;
    freeaddrinfo(result);

    ESP_LOGI(TAG, "Pinging %s (%s)", host, ipaddr_ntoa(&target));

    esp_ping_config_t config = ESP_PING_DEFAULT_CONFIG();
    config.target_addr = target;
    config.count = 4;

    esp_ping_callbacks_t callbacks = {
        .on_ping_success = on_ping_success,
        .on_ping_timeout = on_ping_timeout,
        .on_ping_end = on_ping_end,
    };

    esp_ping_handle_t handle;
    ESP_ERROR_CHECK(esp_ping_new_session(&config, &callbacks, &handle));
    ESP_ERROR_CHECK(esp_ping_start(handle));
}

static void nvs_init(void)
{
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        err = nvs_flash_init();
    }
    ESP_ERROR_CHECK(err);
}

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

// TODO: replace with a real sensor reading. Returns a fake value between 400 and 1200 ppm.
static int read_co2_ppm(void)
{
    return 400 + (int)(esp_random() % 801);
}

void app_main(void)
{
    ESP_LOGI(TAG, "CO2 room sensor starting");

    nvs_init();
    device_id_init();
    ESP_LOGI(TAG, "Device ID: %s", device_id_get());

    wifi_events = xEventGroupCreate();
    wifi_start();

    // Wait until the router has assigned an IP address
    xEventGroupWaitBits(wifi_events, WIFI_CONNECTED_BIT, pdFALSE, pdTRUE, portMAX_DELAY);
    ping_host("google.com");

    while (1) {
        int ppm = read_co2_ppm();

        // Only try to upload while Wi-Fi is up; readings taken while offline are skipped
        if (xEventGroupGetBits(wifi_events) & WIFI_CONNECTED_BIT) {
            supabase_send_reading(device_id_get(), ppm);
        } else {
            ESP_LOGW(TAG, "Wi-Fi down, skipping upload of %d ppm", ppm);
        }

        vTaskDelay(pdMS_TO_TICKS(CONFIG_READING_INTERVAL_SEC * 1000));
    }
}
