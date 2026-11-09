#include "scd41.h"

#include "driver/i2c_master.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

#define SCD41_SDA_GPIO   GPIO_NUM_8
#define SCD41_SCL_GPIO   GPIO_NUM_9
#define SCD41_ADDR       0x62
#define I2C_SPEED_HZ     100000
#define I2C_TIMEOUT_MS   100

// SCD41 commands: each one is a 16-bit number sent most-significant byte first
#define CMD_START_PERIODIC   0x21B1  // start measuring every 5 s
#define CMD_STOP_PERIODIC    0x3F86  // stop measuring (needs 500 ms before the next command)
#define CMD_DATA_READY       0xE4B8  // is a new sample waiting?
#define CMD_READ_MEASUREMENT 0xEC05  // fetch CO2, temperature, humidity

static const char *TAG = "scd41";

static i2c_master_dev_handle_t dev;

// Sensirion's CRC-8 (polynomial 0x31, start value 0xFF). Every 2 data bytes the sensor sends
// are followed by this checksum, so we can detect bits flipped by electrical noise.
static uint8_t crc8(const uint8_t *data, int len)
{
    uint8_t crc = 0xFF;
    for (int i = 0; i < len; i++) {
        crc ^= data[i];
        for (int bit = 0; bit < 8; bit++) {
            crc = (crc & 0x80) ? (uint8_t)((crc << 1) ^ 0x31) : (uint8_t)(crc << 1);
        }
    }
    return crc;
}

static esp_err_t send_command(uint16_t cmd)
{
    uint8_t buf[2] = {cmd >> 8, cmd & 0xFF};
    return i2c_master_transmit(dev, buf, sizeof(buf), I2C_TIMEOUT_MS);
}

// Send a command, wait 1 ms for the sensor to prepare its answer, then read `count` words.
// Each word arrives as [high byte, low byte, CRC].
static esp_err_t read_words(uint16_t cmd, uint16_t *words, int count)
{
    esp_err_t err = send_command(cmd);
    if (err != ESP_OK) {
        return err;
    }
    vTaskDelay(1);  // one RTOS tick, which is at least 1 ms

    uint8_t buf[9];  // up to 3 words
    err = i2c_master_receive(dev, buf, count * 3, I2C_TIMEOUT_MS);
    if (err != ESP_OK) {
        return err;
    }
    for (int i = 0; i < count; i++) {
        const uint8_t *w = &buf[i * 3];
        if (crc8(w, 2) != w[2]) {
            return ESP_ERR_INVALID_CRC;
        }
        words[i] = (uint16_t)((w[0] << 8) | w[1]);
    }
    return ESP_OK;
}

static esp_err_t new_bus(gpio_num_t sda, gpio_num_t scl, i2c_master_bus_handle_t *bus)
{
    i2c_master_bus_config_t bus_config = {
        .i2c_port = I2C_NUM_0,
        .sda_io_num = sda,
        .scl_io_num = scl,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,  // most SCD41 boards also have their own pull-ups
    };
    return i2c_new_master_bus(&bus_config, bus);
}

// Troubleshooting: list every device that answers on the bus, then check whether the sensor
// answers with SDA and SCL swapped (the most common wiring mistake).
static void diagnose_bus(i2c_master_bus_handle_t bus)
{
    int found = 0;
    for (uint16_t addr = 0x08; addr <= 0x77; addr++) {
        if (i2c_master_probe(bus, addr, 50) == ESP_OK) {
            ESP_LOGW(TAG, "I2C scan: device found at 0x%02X", addr);
            found++;
        }
    }
    if (found == 0) {
        ESP_LOGW(TAG, "I2C scan: nothing answered on SDA=%d, SCL=%d", SCD41_SDA_GPIO, SCD41_SCL_GPIO);
    }

    i2c_del_master_bus(bus);
    i2c_master_bus_handle_t swapped;
    if (new_bus(SCD41_SCL_GPIO, SCD41_SDA_GPIO, &swapped) == ESP_OK) {
        if (i2c_master_probe(swapped, SCD41_ADDR, 50) == ESP_OK) {
            ESP_LOGE(TAG, "SCD41 answers with the pins SWAPPED: SDA is on GPIO%d and SCL on GPIO%d. "
                          "Swap the two wires (or the pin numbers in scd41.c).",
                     SCD41_SCL_GPIO, SCD41_SDA_GPIO);
        }
        i2c_del_master_bus(swapped);
    }
}

esp_err_t scd41_init(void)
{
    i2c_master_bus_handle_t bus;
    esp_err_t err = new_bus(SCD41_SDA_GPIO, SCD41_SCL_GPIO, &bus);
    if (err != ESP_OK) {
        return err;
    }

    // The SCD41 needs up to 30 ms after power-up before it answers; give it a little margin
    vTaskDelay(pdMS_TO_TICKS(50));
    if (i2c_master_probe(bus, SCD41_ADDR, 50) != ESP_OK) {
        ESP_LOGE(TAG, "No response from SCD41 at 0x%02X: check wiring (SDA=%d, SCL=%d) and 3.3 V power",
                 SCD41_ADDR, SCD41_SDA_GPIO, SCD41_SCL_GPIO);
        diagnose_bus(bus);
        return ESP_ERR_NOT_FOUND;
    }

    i2c_device_config_t dev_config = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = SCD41_ADDR,
        .scl_speed_hz = I2C_SPEED_HZ,
    };
    err = i2c_master_bus_add_device(bus, &dev_config, &dev);
    if (err != ESP_OK) {
        return err;
    }

    // The sensor keeps power across an ESP32 reset, so it may still be measuring from last time.
    // It ignores most commands while measuring, so stop it first.
    err = send_command(CMD_STOP_PERIODIC);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "SCD41 rejected the stop command: %s", esp_err_to_name(err));
        return err;
    }
    vTaskDelay(pdMS_TO_TICKS(500));

    err = send_command(CMD_START_PERIODIC);
    if (err == ESP_OK) {
        ESP_LOGI(TAG, "Periodic measurement started (first sample in ~5 s)");
    }
    return err;
}

esp_err_t scd41_read(int *co2_ppm, float *temp_c, float *rh_pct)
{
    // The low 11 bits of the status word are non-zero when a new sample is waiting
    uint16_t status;
    esp_err_t err = read_words(CMD_DATA_READY, &status, 1);
    if (err != ESP_OK) {
        return err;
    }
    if ((status & 0x07FF) == 0) {
        return ESP_ERR_NOT_FINISHED;
    }

    uint16_t raw[3];
    err = read_words(CMD_READ_MEASUREMENT, raw, 3);
    if (err != ESP_OK) {
        return err;
    }

    // Conversion formulas from the SCD41 datasheet
    *co2_ppm = raw[0];
    *temp_c = -45.0f + 175.0f * raw[1] / 65535.0f;
    *rh_pct = 100.0f * raw[2] / 65535.0f;
    return ESP_OK;
}
