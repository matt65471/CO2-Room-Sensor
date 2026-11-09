idf_component_register(SRCS "scd41.c" "main.c" "device_id.c" "supabase.c"
                       INCLUDE_DIRS "."
                       PRIV_REQUIRES esp_wifi esp_netif esp_event nvs_flash lwip
                                     esp_http_client mbedtls esp_driver_gpio esp_driver_i2c)
