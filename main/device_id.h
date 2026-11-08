#pragma once

// Length of a UUID string "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" plus the terminating NUL
#define DEVICE_ID_STR_LEN 37

// Load this device's UUID from flash, generating and saving a new one if none exists.
// Also starts a background task: holding the BOOT button (GPIO0) for 5 seconds at any time
// wipes the stored UUID and restarts, so a fresh one is generated (e.g. for a new user).
// Requires nvs_flash_init() to have been called first.
void device_id_init(void);

// The UUID loaded by device_id_init(), e.g. "3f2b8c1e-9a4d-4e7f-b2c1-0d5e6f7a8b9c".
const char *device_id_get(void);
