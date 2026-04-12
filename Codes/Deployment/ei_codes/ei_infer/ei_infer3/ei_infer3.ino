/*
 * ei_infer3.ino
 * 4-Mic Edge Impulse Inference (loudest-mic selection)
 * + DHT11 temperature/humidity
 * + OLED display (graceful skip if not connected)
 * + BLE notifications to Python receiver
 *
 * Mic physical layout (assign based on device mounting):
 *   Mic1 (I2S0 LEFT)  = NORTH   BCK=2,  WS=7,  DATA=6
 *   Mic2 (I2S0 RIGHT) = SOUTH
 *   Mic3 (I2S1 LEFT)  = EAST    BCK=18, WS=16, DATA=17
 *   Mic4 (I2S1 RIGHT) = WEST
 *
 * DHT11  : pin 14
 * OLED   : SDA=4, SCL=5  (SH1106 128x32)
 *
 * BLE data format (pipe-delimited, notified per inference window):
 *   <temp>|<humid>|<class>|<M1_energy>|<M2_energy>|<M3_energy>|<M4_energy>
 *   e.g.  25.5|68.0|HWHR|12345|23456|34567|4567
 */

#define EIDSP_QUANTIZE_FILTERBANK 0

/* ---- Includes ---------------------------------------------------------- */
#include <edgeai_inferencing.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s.h"

#include <DHT.h>
#include <Arduino.h>
#include <U8g2lib.h>
#include <Wire.h>

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

#include <math.h>

/* ---- Pin definitions --------------------------------------------------- */
#define I2S0_BCK    2
#define I2S0_WS     7
#define I2S0_DATA   6

#define I2S1_BCK    18
#define I2S1_WS     16
#define I2S1_DATA   17

#define DHTPIN      14
#define DHTTYPE     DHT11

#define OLED_SDA    4
#define OLED_SCL    5

/* ---- BLE UUIDs --------------------------------------------------------- */
#define BLE_DEVICE_NAME   "EI_Weather"
#define SERVICE_UUID      "12345678-0000-1000-8000-00805f9b34fb"
#define CHAR_UUID         "12345679-0000-1000-8000-00805f9b34fb"

/* ---- Buffer sizing ----------------------------------------------------- */
static const uint32_t sample_buffer_size = 2048;        // bytes, mono int16 chunks for EI
#define MONO_SAMPLES    (sample_buffer_size / 2)         // 1024 int16 mono samples
#define STEREO_SAMPLES  (MONO_SAMPLES * 2)               // 2048 int16 (L+R interleaved)
#define STEREO_BYTES    (STEREO_SAMPLES * sizeof(int16_t)) // 4096 bytes per bus

/* ---- Audio buffers ----------------------------------------------------- */
static int16_t   stereoBuffer0[STEREO_SAMPLES];  // I2S0: Mic1(L), Mic2(R)
static int16_t   stereoBuffer1[STEREO_SAMPLES];  // I2S1: Mic3(L), Mic4(R)
static int16_t   sampleBuffer[MONO_SAMPLES];     // selected mono channel for EI

/* ---- EI inference double-buffer ---------------------------------------- */
typedef struct {
    signed short *buffers[2];
    unsigned char buf_select;
    unsigned char buf_ready;
    unsigned int  buf_count;
    unsigned int  n_samples;
} inference_t;

static inference_t inference;
static bool  debug_nn      = false;
static int   print_results = -(EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW);
static bool  record_status = true;

/* ---- Shared state updated by capture_samples task ---------------------- */
// Mean absolute energy per mic, updated every chunk (volatile: task writes, loop reads)
static volatile int32_t mic_energy[4] = {0, 0, 0, 0};  // [0]=N, [1]=S, [2]=E, [3]=W
static volatile uint8_t active_mic    = 1;               // 1-indexed loudest mic

/* ---- Persistent output state ------------------------------------------- */
static float last_temp     = 0.0f;
static float last_humidity = 0.0f;
static char  last_class[8] = "------";
static char  last_wind[4]  = "--";

/* ---- Peripheral objects ------------------------------------------------ */
DHT dht(DHTPIN, DHTTYPE);

U8G2_SH1106_128X32_VISIONOX_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
static bool oled_ok = false;

static BLECharacteristic* pCharacteristic = nullptr;
static bool deviceConnected = false;

/* ---- BLE server callbacks ---------------------------------------------- */
class WeatherServerCallbacks : public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) override {
        deviceConnected = true;
        ei_printf("BLE client connected\n");
    }
    void onDisconnect(BLEServer* pServer) override {
        deviceConnected = false;
        ei_printf("BLE client disconnected, restarting advertising\n");
        pServer->startAdvertising();
    }
};

/* ---- Forward declarations ---------------------------------------------- */
static bool        microphone_inference_start(uint32_t n_samples);
static bool        microphone_inference_record(void);
static int         microphone_audio_signal_get_data(size_t offset, size_t length, float *out_ptr);
static void        microphone_inference_end(void);
static int         i2s_init_bus(i2s_port_t port, uint32_t sample_rate, int bck, int ws, int data_in);
static const char* compute_wind_direction(volatile int32_t e[4]);
static void        update_oled(float t, float h, const char* cls, const char* wind);

/* ======================================================================== */
/* setup                                                                     */
/* ======================================================================== */
void setup()
{
    Serial.begin(115200);
    while (!Serial);
    Serial.println("ei_infer3: 4-Mic + DHT11 + OLED + BLE");

    /* --- DHT11 --- */
    dht.begin();

    /* --- OLED (graceful skip if not wired) --- */
    Wire.begin(OLED_SDA, OLED_SCL);
    Wire.setTimeOut(1000);  // 1 s timeout so we don't hang on missing OLED
    oled_ok = (bool)u8g2.begin();
    if (!oled_ok) {
        ei_printf("OLED not found, skipping display\n");
    } else {
        u8g2.clearBuffer();
        u8g2.setFont(u8g2_font_5x7_tr);
        u8g2.drawStr(0, 7,  "EI Weather v3");
        u8g2.drawStr(0, 17, "Starting...");
        u8g2.sendBuffer();
    }

    /* --- BLE --- */
    BLEDevice::setMTU(185);
    BLEDevice::init(BLE_DEVICE_NAME);

    BLEServer* pServer = BLEDevice::createServer();
    pServer->setCallbacks(new WeatherServerCallbacks());

    BLEService* pService = pServer->createService(SERVICE_UUID);

    pCharacteristic = pService->createCharacteristic(
        CHAR_UUID,
        BLECharacteristic::PROPERTY_NOTIFY
    );
    pCharacteristic->addDescriptor(new BLE2902());

    pService->start();
    BLEAdvertising* pAdvertising = BLEDevice::getAdvertising();
    pAdvertising->addServiceUUID(SERVICE_UUID);
    pAdvertising->setScanResponse(true);
    BLEDevice::startAdvertising();
    ei_printf("BLE advertising as \"%s\"\n", BLE_DEVICE_NAME);

    /* --- EI inferencing setup --- */
    ei_printf("Inferencing settings:\n");
    ei_printf("\tInterval: ");
    ei_printf_float((float)EI_CLASSIFIER_INTERVAL_MS);
    ei_printf(" ms.\n");
    ei_printf("\tFrame size: %d\n", EI_CLASSIFIER_DSP_INPUT_FRAME_SIZE);
    ei_printf("\tSample length: %d ms.\n", EI_CLASSIFIER_RAW_SAMPLE_COUNT / 16);
    ei_printf("\tNo. of classes: %d\n",
        sizeof(ei_classifier_inferencing_categories) /
        sizeof(ei_classifier_inferencing_categories[0]));

    run_classifier_init();
    ei_printf("\nStarting continuous inference in 2 seconds...\n");
    ei_sleep(2000);

    if (!microphone_inference_start(EI_CLASSIFIER_SLICE_SIZE)) {
        ei_printf("ERR: Could not allocate audio buffer (size %d)\r\n",
            EI_CLASSIFIER_RAW_SAMPLE_COUNT);
        return;
    }

    ei_printf("Listening on all 4 mics...\n");
}

/* ======================================================================== */
/* loop                                                                      */
/* ======================================================================== */
void loop()
{
    bool m = microphone_inference_record();
    if (!m) {
        ei_printf("ERR: Failed to record audio...\n");
        return;
    }

    signal_t signal;
    signal.total_length = EI_CLASSIFIER_SLICE_SIZE;
    signal.get_data     = &microphone_audio_signal_get_data;

    ei_impulse_result_t result = {0};
    EI_IMPULSE_ERROR r = run_classifier_continuous(&signal, &result, debug_nn);
    if (r != EI_IMPULSE_OK) {
        ei_printf("ERR: Failed to run classifier (%d)\n", r);
        return;
    }

    if (++print_results >= EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW) {

        /* --- Best inference class --- */
        float best_val = -1.0f;
        for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
            if (result.classification[ix].value > best_val) {
                best_val = result.classification[ix].value;
                strncpy(last_class, result.classification[ix].label, sizeof(last_class) - 1);
                last_class[sizeof(last_class) - 1] = '\0';
            }
        }

        /* --- DHT11 read (skip update on NaN, keep last valid values) --- */
        float h = dht.readHumidity();
        float t = dht.readTemperature();
        if (!isnan(h) && !isnan(t)) {
            last_temp     = t;
            last_humidity = h;
        }

        /* --- Snapshot mic energies for wind direction --- */
        int32_t e[4];
        for (int k = 0; k < 4; k++) e[k] = (int32_t)mic_energy[k];

        /* --- Wind direction --- */
        const char* dir = compute_wind_direction(mic_energy);
        strncpy(last_wind, dir, sizeof(last_wind) - 1);
        last_wind[sizeof(last_wind) - 1] = '\0';

        /* --- Serial output --- */
        ei_printf("\n=== Inference Result ===\n");
        ei_printf("Active mic: Mic%d\n", (int)active_mic);
        ei_printf("Temp: %.1f C  Humidity: %.1f %%\n", last_temp, last_humidity);
        ei_printf("Predictions (DSP:%dms Cls:%dms):\n",
            result.timing.dsp, result.timing.classification);
        for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
            ei_printf("  %s: ", result.classification[ix].label);
            ei_printf_float(result.classification[ix].value);
            ei_printf("\n");
        }
#if EI_CLASSIFIER_HAS_ANOMALY == 1
        ei_printf("  anomaly: ");
        ei_printf_float(result.anomaly);
        ei_printf("\n");
#endif
        ei_printf("Mic energies: N=%ld S=%ld E=%ld W=%ld\n", e[0], e[1], e[2], e[3]);
        ei_printf("Wind direction: %s\n", last_wind);

        /* --- OLED update --- */
        update_oled(last_temp, last_humidity, last_class, last_wind);

        /* --- BLE notify --- */
        if (deviceConnected && pCharacteristic != nullptr) {
            char buf[72];
            snprintf(buf, sizeof(buf), "%.1f|%.1f|%s|%ld|%ld|%ld|%ld",
                last_temp, last_humidity, last_class,
                (long)e[0], (long)e[1], (long)e[2], (long)e[3]);
            pCharacteristic->setValue((uint8_t*)buf, strlen(buf));
            pCharacteristic->notify();
        }

        print_results = 0;
    }
}

/* ======================================================================== */
/* compute_wind_direction                                                    */
/*   e[0]=Mic1=North, e[1]=Mic2=South, e[2]=Mic3=East, e[3]=Mic4=West      */
/*   If the second-highest adjacent mic >= 75% of loudest → diagonal        */
/* ======================================================================== */
static const char* compute_wind_direction(volatile int32_t e[4])
{
    int best = 0;
    for (int k = 1; k < 4; k++) {
        if (e[k] > e[best]) best = k;
    }
    if (e[best] == 0) return "?";

    // Adjacent mic indices and resulting diagonal for [best][adjacent_slot]
    // N(0): E(2)→"NE", W(3)→"NW"
    // S(1): E(2)→"SE", W(3)→"SW"
    // E(2): N(0)→"NE", S(1)→"SE"
    // W(3): N(0)→"NW", S(1)→"SW"
    static const int adj[4][2]      = {{2, 3}, {2, 3}, {0, 1}, {0, 1}};
    static const char* diag[4][2]   = {{"NE","NW"}, {"SE","SW"}, {"NE","SE"}, {"NW","SW"}};
    static const char* cardinal[4]  = {"N", "S", "E", "W"};

    float threshold = 0.75f * (float)e[best];
    int   best_slot = -1;
    int32_t best_adj_val = 0;

    for (int k = 0; k < 2; k++) {
        int idx = adj[best][k];
        if ((float)e[idx] >= threshold && e[idx] > best_adj_val) {
            best_adj_val = e[idx];
            best_slot    = k;
        }
    }

    return (best_slot >= 0) ? diag[best][best_slot] : cardinal[best];
}

/* ======================================================================== */
/* update_oled                                                               */
/* ======================================================================== */
static void update_oled(float t, float h, const char* cls, const char* wind)
{
    if (!oled_ok) return;

    char line1[22], line2[22], line3[22];
    snprintf(line1, sizeof(line1), "T:%.1fC H:%.0f%%", t, h);
    snprintf(line2, sizeof(line2), "Wx: %s", cls);
    snprintf(line3, sizeof(line3), "Wind: %s", wind);

    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_5x7_tr);
    u8g2.drawStr(0, 7,  line1);
    u8g2.drawStr(0, 17, line2);
    u8g2.drawStr(0, 27, line3);
    u8g2.sendBuffer();
}

/* ======================================================================== */
/* audio_inference_callback                                                  */
/* ======================================================================== */
static void audio_inference_callback(uint32_t n_bytes)
{
    for (int i = 0; i < (int)(n_bytes >> 1); i++) {
        inference.buffers[inference.buf_select][inference.buf_count++] = sampleBuffer[i];
        if (inference.buf_count >= inference.n_samples) {
            inference.buf_select ^= 1;
            inference.buf_count   = 0;
            inference.buf_ready   = 1;
        }
    }
}

/* ======================================================================== */
/* capture_samples — FreeRTOS task                                           */
/*   Reads both I2S stereo buses, computes per-mic energy, selects           */
/*   loudest mono channel, feeds EI inference pipeline.                     */
/* ======================================================================== */
static void capture_samples(void* arg)
{
    const uint32_t mono_bytes = (uint32_t)arg;  // = sample_buffer_size = 2048
    size_t bytes_read0 = 0, bytes_read1 = 0;

    while (record_status) {
        /* --- Read stereo from both buses --- */
        i2s_read(I2S_NUM_0, (void*)stereoBuffer0, STEREO_BYTES, &bytes_read0, portMAX_DELAY);
        i2s_read(I2S_NUM_1, (void*)stereoBuffer1, STEREO_BYTES, &bytes_read1, portMAX_DELAY);

        /* --- Compute mean absolute energy for each of the 4 mics --- */
        int32_t e[4] = {0, 0, 0, 0};
        for (int i = 0; i < MONO_SAMPLES; i++) {
            e[0] += abs((int32_t)stereoBuffer0[2*i]);       // Mic1 North (L ch I2S0)
            e[1] += abs((int32_t)stereoBuffer0[2*i + 1]);   // Mic2 South (R ch I2S0)
            e[2] += abs((int32_t)stereoBuffer1[2*i]);       // Mic3 East  (L ch I2S1)
            e[3] += abs((int32_t)stereoBuffer1[2*i + 1]);   // Mic4 West  (R ch I2S1)
        }
        for (int k = 0; k < 4; k++) {
            e[k] /= MONO_SAMPLES;   // mean energy
            mic_energy[k] = e[k];   // publish for loop()
        }

        /* --- Select loudest mic --- */
        int best = 0;
        for (int k = 1; k < 4; k++) {
            if (e[k] > e[best]) best = k;
        }
        active_mic = (uint8_t)(best + 1);  // 1-indexed

        /* --- Extract selected mic into mono sampleBuffer --- */
        switch (best) {
            case 0:  // Mic1 North: L of stereoBuffer0
                for (int i = 0; i < MONO_SAMPLES; i++) sampleBuffer[i] = stereoBuffer0[2*i];
                break;
            case 1:  // Mic2 South: R of stereoBuffer0
                for (int i = 0; i < MONO_SAMPLES; i++) sampleBuffer[i] = stereoBuffer0[2*i + 1];
                break;
            case 2:  // Mic3 East: L of stereoBuffer1
                for (int i = 0; i < MONO_SAMPLES; i++) sampleBuffer[i] = stereoBuffer1[2*i];
                break;
            default: // Mic4 West: R of stereoBuffer1
                for (int i = 0; i < MONO_SAMPLES; i++) sampleBuffer[i] = stereoBuffer1[2*i + 1];
                break;
        }

        if (record_status) {
            audio_inference_callback(mono_bytes);
        } else {
            break;
        }
    }
    vTaskDelete(NULL);
}

/* ======================================================================== */
/* microphone_inference_start                                                */
/* ======================================================================== */
static bool microphone_inference_start(uint32_t n_samples)
{
    inference.buffers[0] = (signed short*)malloc(n_samples * sizeof(signed short));
    if (!inference.buffers[0]) return false;

    inference.buffers[1] = (signed short*)malloc(n_samples * sizeof(signed short));
    if (!inference.buffers[1]) {
        ei_free(inference.buffers[0]);
        return false;
    }

    inference.buf_select = 0;
    inference.buf_count  = 0;
    inference.n_samples  = n_samples;
    inference.buf_ready  = 0;

    if (i2s_init_bus(I2S_NUM_0, EI_CLASSIFIER_FREQUENCY, I2S0_BCK, I2S0_WS, I2S0_DATA) != 0) {
        ei_printf("Failed to start I2S0!\n");
        ei_free(inference.buffers[0]);
        ei_free(inference.buffers[1]);
        return false;
    }
    if (i2s_init_bus(I2S_NUM_1, EI_CLASSIFIER_FREQUENCY, I2S1_BCK, I2S1_WS, I2S1_DATA) != 0) {
        ei_printf("Failed to start I2S1!\n");
        i2s_driver_uninstall(I2S_NUM_0);
        ei_free(inference.buffers[0]);
        ei_free(inference.buffers[1]);
        return false;
    }

    ei_sleep(100);
    record_status = true;

    xTaskCreate(capture_samples, "CaptureSamples", 1024 * 32,
                (void*)sample_buffer_size, 10, NULL);
    return true;
}

/* ======================================================================== */
/* microphone_inference_record                                               */
/* ======================================================================== */
static bool microphone_inference_record(void)
{
    bool ret = true;
    if (inference.buf_ready == 1) {
        ei_printf(
            "Error sample buffer overrun. Decrease EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW\n");
        ret = false;
    }
    while (inference.buf_ready == 0) { delay(1); }
    inference.buf_ready = 0;
    return ret;
}

/* ======================================================================== */
/* microphone_audio_signal_get_data                                          */
/* ======================================================================== */
static int microphone_audio_signal_get_data(size_t offset, size_t length, float* out_ptr)
{
    numpy::int16_to_float(
        &inference.buffers[inference.buf_select ^ 1][offset], out_ptr, length);
    return 0;
}

/* ======================================================================== */
/* microphone_inference_end                                                  */
/* ======================================================================== */
static void microphone_inference_end(void)
{
    record_status = false;
    i2s_driver_uninstall(I2S_NUM_0);
    i2s_driver_uninstall(I2S_NUM_1);
    ei_free(inference.buffers[0]);
    ei_free(inference.buffers[1]);
}

/* ======================================================================== */
/* i2s_init_bus — stereo RX config shared by both buses                     */
/* ======================================================================== */
static int i2s_init_bus(i2s_port_t port, uint32_t sample_rate, int bck, int ws, int data_in)
{
    i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = sample_rate,
        .bits_per_sample      = (i2s_bits_per_sample_t)16,
        .channel_format       = I2S_CHANNEL_FMT_RIGHT_LEFT,  // stereo: L+R interleaved
        .communication_format = I2S_COMM_FORMAT_I2S,
        .intr_alloc_flags     = 0,
        .dma_buf_count        = 8,
        .dma_buf_len          = 512,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = -1,
    };
    i2s_pin_config_t pins = {
        .bck_io_num   = bck,
        .ws_io_num    = ws,
        .data_out_num = -1,
        .data_in_num  = data_in,
    };

    esp_err_t ret = i2s_driver_install(port, &cfg, 0, NULL);
    if (ret != ESP_OK) { ei_printf("i2s_driver_install failed port %d\n", (int)port); return (int)ret; }

    ret = i2s_set_pin(port, &pins);
    if (ret != ESP_OK) { ei_printf("i2s_set_pin failed port %d\n", (int)port); return (int)ret; }

    ret = i2s_zero_dma_buffer(port);
    if (ret != ESP_OK) { ei_printf("i2s_zero_dma_buffer failed port %d\n", (int)port); return (int)ret; }

    return 0;
}

#if !defined(EI_CLASSIFIER_SENSOR) || EI_CLASSIFIER_SENSOR != EI_CLASSIFIER_SENSOR_MICROPHONE
#error "Invalid model for current sensor."
#endif
