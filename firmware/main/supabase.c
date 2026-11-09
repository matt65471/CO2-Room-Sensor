#include "supabase.h"

#include <stdio.h>
#include <string.h>

#include "esp_crt_bundle.h"
#include "esp_http_client.h"
#include "esp_log.h"

static const char *TAG = "supabase";

// Captures the response body so error messages from Supabase can be logged
typedef struct {
    char buf[256];
    int len;
} response_t;

static esp_err_t http_event_handler(esp_http_client_event_t *evt)
{
    response_t *resp = evt->user_data;
    if (evt->event_id == HTTP_EVENT_ON_DATA && resp != NULL) {
        int space = (int)sizeof(resp->buf) - 1 - resp->len;
        int n = evt->data_len < space ? evt->data_len : space;
        if (n > 0) {
            memcpy(resp->buf + resp->len, evt->data, n);
            resp->len += n;
            resp->buf[resp->len] = '\0';
        }
    }
    return ESP_OK;
}

esp_err_t supabase_send_reading(const char *device_id, int ppm)
{
    char body[96];
    snprintf(body, sizeof(body), "{\"device_id\":\"%s\",\"ppm\":%d}", device_id, ppm);

    response_t resp = {0};
    esp_http_client_config_t config = {
        .url = CONFIG_SUPABASE_URL "/rest/v1/readings",
        .method = HTTP_METHOD_POST,
        .crt_bundle_attach = esp_crt_bundle_attach,  // verifies Supabase's HTTPS certificate
        .event_handler = http_event_handler,
        .user_data = &resp,
        .timeout_ms = 10000,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    if (client == NULL) {
        return ESP_FAIL;
    }
    esp_http_client_set_header(client, "apikey", CONFIG_SUPABASE_ANON_KEY);
    esp_http_client_set_header(client, "Authorization", "Bearer " CONFIG_SUPABASE_ANON_KEY);
    esp_http_client_set_header(client, "Content-Type", "application/json");
    esp_http_client_set_header(client, "Prefer", "return=minimal");  // don't send the row back
    esp_http_client_set_post_field(client, body, strlen(body));

    esp_err_t err = esp_http_client_perform(client);
    if (err == ESP_OK) {
        int status = esp_http_client_get_status_code(client);
        if (status == 201) {
            ESP_LOGI(TAG, "Stored reading: %d ppm", ppm);
        } else {
            ESP_LOGE(TAG, "Supabase returned HTTP %d: %s", status, resp.buf);
            err = ESP_FAIL;
        }
    } else {
        ESP_LOGE(TAG, "Request failed: %s", esp_err_to_name(err));
    }

    esp_http_client_cleanup(client);
    return err;
}
