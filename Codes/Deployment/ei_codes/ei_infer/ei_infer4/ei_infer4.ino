/*
 * ei_infer4.ino
 * Single I2S stereo bus → Mic1 (LEFT) + Mic2 (RIGHT)
 * EI inference on Mic1 (LEFT channel, mono)
 * + DHT11 temperature/humidity (pin 14)
 * + OLED display (SDA=4, SCL=5, gracefully skipped if absent)
 * + BLE notification to Python receiver
 *
 * I2S pins (from reference AudioTools sketch):
 *   BCK = 2 | WS = 7 | DATA = 6
 *   Mic1 = LEFT  channel → used for EI audio inference
 *   Mic2 = RIGHT channel → energy only (wind direction axis)
 *
 * BLE data format (pipe-delimited, one notification per inference window):
 *   <temp>|<humid>|<class_idx>|<m1_energy>|<m2_energy>
 *   e.g.  25.5|68.0|0|9341|4102
 *
 * Class index → label mapping (alphabetical EI order):
 *   0 = HWHR  (High Wind, High Rain)
 *   1 = MWMR  (Medium Wind, Medium Rain)
 *   2 = NRHW  (No Rain, High Wind)
 *   3 = NWHR  (No Wind, High Rain)
 */

#define EIDSP_QUANTIZE_FILTERBANK 0

/* ── Includes ─────────────────────────────────────────────────────────── */
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

/* ── Pin config ───────────────────────────────────────────────────────── */
#define I2S_BCK     2
#define I2S_WS      7
#define I2S_DATA    6

#define DHTPIN      14
#define DHTTYPE     DHT11

#define OLED_SDA    4
#define OLED_SCL    5

/* ── BLE identifiers ──────────────────────────────────────────────────── */
#define BLE_DEVICE_NAME  "EI_Weather4"
#define SERVICE_UUID     "12345678-1234-1234-1234-123456789abc"
#define CHAR_UUID        "abcd1234-5678-1234-5678-abcdef123456"

/* ── Buffer sizing ────────────────────────────────────────────────────── */
// EI pipeline works on mono int16 chunks of sample_buffer_size bytes.
// Stereo read doubles the sample count (L+R interleaved).
static const uint32_t sample_buffer_size = 2048;     // bytes → 1024 mono int16

#define MONO_SAMPLES    (sample_buffer_size / 2)          // 1024 int16
#define STEREO_SAMPLES  (MONO_SAMPLES * 2)                // 2048 int16
#define STEREO_BYTES    (STEREO_SAMPLES * sizeof(int16_t)) // 4096 bytes

/* ── Audio buffers ────────────────────────────────────────────────────── */
static int16_t stereoBuffer[STEREO_SAMPLES]; // raw L+R interleaved from I2S
static int16_t sampleBuffer[MONO_SAMPLES];   // Mic1 (LEFT) mono, fed to EI

/* ── EI inference double-buffer ──────────────────────────────────────── */
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

/* ── Shared state (written by FreeRTOS task, read in loop) ───────────── */
static volatile int32_t mic1_energy = 0;  // LEFT  channel mean absolute energy
static volatile int32_t mic2_energy = 0;  // RIGHT channel mean absolute energy

/* ── Persistent sensor state ─────────────────────────────────────────── */
static float   last_temp      = 0.0f;
static float   last_humidity  = 0.0f;
static uint8_t last_class_idx = 0;  // best class index from EI

/* ── Peripherals ─────────────────────────────────────────────────────── */
DHT dht(DHTPIN, DHTTYPE);
U8G2_SH1106_128X32_VISIONOX_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);
static bool oled_ok = false;

static BLECharacteristic* pCharacteristic = nullptr;
static bool deviceConnected = false;

/* ── BLE server callbacks ─────────────────────────────────────────────── */
class ServerCB : public BLEServerCallbacks {
    void onConnect(BLEServer* s)    override { deviceConnected = true;  }
    void onDisconnect(BLEServer* s) override {
        deviceConnected = false;
        s->startAdvertising();
    }
};

/* ── Forward declarations ─────────────────────────────────────────────── */
static bool microphone_inference_start(uint32_t n_samples);
static bool microphone_inference_record(void);
static int  microphone_audio_signal_get_data(size_t offset, size_t length, float *out_ptr);
static void microphone_inference_end(void);
static void update_oled(float t, float h, uint8_t cls_idx, int32_t m1, int32_t m2);

/* ════════════════════════════════════════════════════════════════════════
   setup
   ════════════════════════════════════════════════════════════════════════ */
void setup()
{
    Serial.begin(115200);
    while (!Serial);
    Serial.println("ei_infer4: Single I2S Stereo + DHT11 + OLED + BLE");

    /* ── DHT11 ── */
    dht.begin();

    /* ── OLED (no hang if absent) ── */
    Wire.begin(OLED_SDA, OLED_SCL);
    Wire.setTimeOut(1000);
    oled_ok = (bool)u8g2.begin();
    if (!oled_ok) {
        Serial.println("OLED not found, display skipped.");
    } else {
        u8g2.clearBuffer();
        u8g2.setFont(u8g2_font_5x7_tr);
        u8g2.drawStr(0,  7, "EI Weather v4");
        u8g2.drawStr(0, 17, "Starting...");
        u8g2.sendBuffer();
    }

    /* ── BLE ── */
    BLEDevice::setMTU(185);
    BLEDevice::init(BLE_DEVICE_NAME);

    BLEServer*  pServer  = BLEDevice::createServer();
    pServer->setCallbacks(new ServerCB());

    BLEService* pService = pServer->createService(SERVICE_UUID);
    pCharacteristic = pService->createCharacteristic(
        CHAR_UUID, BLECharacteristic::PROPERTY_NOTIFY);
    pCharacteristic->addDescriptor(new BLE2902());
    pService->start();

    BLEAdvertising* pAdv = BLEDevice::getAdvertising();
    pAdv->addServiceUUID(SERVICE_UUID);
    pAdv->setScanResponse(true);
    BLEDevice::startAdvertising();
    Serial.printf("BLE advertising as \"%s\"\n", BLE_DEVICE_NAME);

    /* ── EI setup ── */
    ei_printf("Inferencing settings:\n");
    ei_printf("\tInterval: "); ei_printf_float((float)EI_CLASSIFIER_INTERVAL_MS); ei_printf(" ms.\n");
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
    ei_printf("Listening (Mic1=LEFT infer, Mic2=RIGHT energy)...\n");
}

/* ════════════════════════════════════════════════════════════════════════
   loop
   ════════════════════════════════════════════════════════════════════════ */
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

        /* -- Best class index -- */
        float   best_val = -1.0f;
        uint8_t best_idx = 0;
        for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
            if (result.classification[ix].value > best_val) {
                best_val = result.classification[ix].value;
                best_idx = (uint8_t)ix;
            }
        }
        last_class_idx = best_idx;

        /* -- DHT11 (keep last valid on NaN) -- */
        float h = dht.readHumidity();
        float t = dht.readTemperature();
        if (!isnan(h) && !isnan(t)) {
            last_humidity = h;
            last_temp     = t;
        }

        /* -- Snapshot mic energies -- */
        int32_t m1 = (int32_t)mic1_energy;
        int32_t m2 = (int32_t)mic2_energy;

        /* -- Serial print -- */
        ei_printf("\n=== ei_infer4 Result ===\n");
        ei_printf("Temp: %.1f C  Humidity: %.1f %%\n", last_temp, last_humidity);
        ei_printf("Predictions (DSP:%dms Cls:%dms):\n",
            result.timing.dsp, result.timing.classification);
        for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
            ei_printf("  [%d] %s: ", (int)ix, result.classification[ix].label);
            ei_printf_float(result.classification[ix].value);
            ei_printf("\n");
        }
#if EI_CLASSIFIER_HAS_ANOMALY == 1
        ei_printf("  anomaly: ");
        ei_printf_float(result.anomaly);
        ei_printf("\n");
#endif
        ei_printf("Best class idx: %d (%s)\n",
            (int)best_idx, result.classification[best_idx].label);
        ei_printf("Mic energies: Mic1(L)=%ld  Mic2(R)=%ld\n",
            (long)m1, (long)m2);

        /* -- OLED -- */
        update_oled(last_temp, last_humidity, best_idx, m1, m2);

        /* -- BLE notify: temp|humid|class_idx|m1_energy|m2_energy -- */
        if (deviceConnected && pCharacteristic != nullptr) {
            char buf[48];
            snprintf(buf, sizeof(buf), "%.1f|%.1f|%d|%ld|%ld",
                last_temp, last_humidity,
                (int)best_idx,
                (long)m1, (long)m2);
            pCharacteristic->setValue((uint8_t*)buf, strlen(buf));
            pCharacteristic->notify();
        }

        print_results = 0;
    }
}

/* ════════════════════════════════════════════════════════════════════════
   update_oled
   Line 1: T:XX.XC H:XX%
   Line 2: CLS: <label>
   Line 3: M1:XXXXX M2:XXXXX
   ════════════════════════════════════════════════════════════════════════ */
static void update_oled(float t, float h, uint8_t cls_idx, int32_t m1, int32_t m2)
{
    if (!oled_ok) return;

    // Map index to short label for display
    const char* labels[] = {"HWHR", "MWMR", "NRHW", "NWHR"};
    const char* lbl = (cls_idx < EI_CLASSIFIER_LABEL_COUNT)
                      ? labels[cls_idx] : "??";

    char l1[22], l2[22], l3[22];
    snprintf(l1, sizeof(l1), "T:%.1fC H:%.0f%%", t, h);
    snprintf(l2, sizeof(l2), "CLS: %s", lbl);
    snprintf(l3, sizeof(l3), "M1:%ld M2:%ld", (long)(m1/100), (long)(m2/100)); // /100 to fit

    u8g2.clearBuffer();
    u8g2.setFont(u8g2_font_5x7_tr);
    u8g2.drawStr(0,  7, l1);
    u8g2.drawStr(0, 17, l2);
    u8g2.drawStr(0, 27, l3);
    u8g2.sendBuffer();
}

/* ════════════════════════════════════════════════════════════════════════
   audio_inference_callback
   ════════════════════════════════════════════════════════════════════════ */
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

/* ════════════════════════════════════════════════════════════════════════
   capture_samples  — FreeRTOS task
   Reads stereo I2S → computes energy on both channels →
   extracts LEFT (Mic1) into sampleBuffer for EI.
   ════════════════════════════════════════════════════════════════════════ */
static void capture_samples(void* arg)
{
    const uint32_t mono_bytes = (uint32_t)arg;  // = sample_buffer_size = 2048
    size_t bytes_read = 0;

    while (record_status) {
        /* Read stereo from I2S (blocks until DMA fills the buffer) */
        i2s_read(I2S_NUM_0, (void*)stereoBuffer, STEREO_BYTES, &bytes_read, portMAX_DELAY);

        /* Compute per-channel mean absolute energy */
        int32_t e1 = 0, e2 = 0;
        for (int i = 0; i < MONO_SAMPLES; i++) {
            e1 += abs((int32_t)stereoBuffer[2 * i]);       // LEFT  = Mic1
            e2 += abs((int32_t)stereoBuffer[2 * i + 1]);   // RIGHT = Mic2
        }
        mic1_energy = e1 / MONO_SAMPLES;
        mic2_energy = e2 / MONO_SAMPLES;

        /* Extract Mic1 (LEFT) mono into sampleBuffer for EI inference */
        for (int i = 0; i < MONO_SAMPLES; i++) {
            sampleBuffer[i] = stereoBuffer[2 * i];
        }

        if (record_status) {
            audio_inference_callback(mono_bytes);
        } else {
            break;
        }
    }
    vTaskDelete(NULL);
}

/* ════════════════════════════════════════════════════════════════════════
   microphone_inference_start
   ════════════════════════════════════════════════════════════════════════ */
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

    /* Init I2S0 — stereo RX, same pins as reference AudioTools sketch */
    i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = EI_CLASSIFIER_FREQUENCY,
        .bits_per_sample      = (i2s_bits_per_sample_t)16,
        .channel_format       = I2S_CHANNEL_FMT_RIGHT_LEFT,  // stereo L+R interleaved
        .communication_format = I2S_COMM_FORMAT_I2S,
        .intr_alloc_flags     = 0,
        .dma_buf_count        = 8,
        .dma_buf_len          = 512,
        .use_apll             = false,
        .tx_desc_auto_clear   = false,
        .fixed_mclk           = -1,
    };
    i2s_pin_config_t pins = {
        .bck_io_num   = I2S_BCK,
        .ws_io_num    = I2S_WS,
        .data_out_num = -1,
        .data_in_num  = I2S_DATA,
    };

    esp_err_t ret = i2s_driver_install(I2S_NUM_0, &cfg, 0, NULL);
    if (ret != ESP_OK) {
        ei_printf("i2s_driver_install failed: %d\n", (int)ret);
        ei_free(inference.buffers[0]);
        ei_free(inference.buffers[1]);
        return false;
    }
    ret = i2s_set_pin(I2S_NUM_0, &pins);
    if (ret != ESP_OK) {
        ei_printf("i2s_set_pin failed: %d\n", (int)ret);
        i2s_driver_uninstall(I2S_NUM_0);
        ei_free(inference.buffers[0]);
        ei_free(inference.buffers[1]);
        return false;
    }
    i2s_zero_dma_buffer(I2S_NUM_0);

    ei_sleep(100);
    record_status = true;

    xTaskCreate(capture_samples, "CaptureSamples", 1024 * 32,
                (void*)sample_buffer_size, 10, NULL);
    return true;
}

/* ════════════════════════════════════════════════════════════════════════
   microphone_inference_record
   ════════════════════════════════════════════════════════════════════════ */
static bool microphone_inference_record(void)
{
    bool ret = true;
    if (inference.buf_ready == 1) {
        ei_printf("Error sample buffer overrun. Decrease EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW\n");
        ret = false;
    }
    while (inference.buf_ready == 0) { delay(1); }
    inference.buf_ready = 0;
    return ret;
}

/* ════════════════════════════════════════════════════════════════════════
   microphone_audio_signal_get_data
   ════════════════════════════════════════════════════════════════════════ */
static int microphone_audio_signal_get_data(size_t offset, size_t length, float* out_ptr)
{
    numpy::int16_to_float(
        &inference.buffers[inference.buf_select ^ 1][offset], out_ptr, length);
    return 0;
}

/* ════════════════════════════════════════════════════════════════════════
   microphone_inference_end
   ════════════════════════════════════════════════════════════════════════ */
static void microphone_inference_end(void)
{
    record_status = false;
    i2s_driver_uninstall(I2S_NUM_0);
    ei_free(inference.buffers[0]);
    ei_free(inference.buffers[1]);
}

#if !defined(EI_CLASSIFIER_SENSOR) || EI_CLASSIFIER_SENSOR != EI_CLASSIFIER_SENSOR_MICROPHONE
#error "Invalid model for current sensor."
#endif
