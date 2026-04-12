/* Edge Impulse 4-Mic Inference with Loudest-Mic Selection
 * Combines 4mics.ino hardware setup (2x I2S stereo buses = 4 mics)
 * with stream_mic.ino continuous sliding-window inference pipeline.
 *
 * I2S0 → Mic1 (LEFT)  + Mic2 (RIGHT)  | BCK=2,  WS=7,  DATA=6
 * I2S1 → Mic3 (LEFT)  + Mic4 (RIGHT)  | BCK=18, WS=16, DATA=17
 *
 * Each chunk: energy of all 4 channels computed → loudest mic selected →
 * its mono audio fed into Edge Impulse run_classifier_continuous.
 */

#define EIDSP_QUANTIZE_FILTERBANK 0

/* Includes ---------------------------------------------------------------- */
#include <edgeai_inferencing.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "driver/i2s.h"

// -------- I2S pin assignments (from 4mics.ino) ----------------------------
#define I2S0_BCK   2
#define I2S0_WS    7
#define I2S0_DATA  6

#define I2S1_BCK   18
#define I2S1_WS    16
#define I2S1_DATA  17

// -------- Buffer sizing ---------------------------------------------------
// sample_buffer_size is passed as n_bytes to audio_inference_callback.
// n_bytes/2 = number of int16 mono samples processed per chunk.
static const uint32_t sample_buffer_size = 2048; // bytes → 1024 mono int16 samples

// Stereo read: to produce MONO_SAMPLES mono samples we read MONO_SAMPLES
// stereo frames. Each frame = 2 × int16 → STEREO_BYTES bytes per I2S bus.
#define MONO_SAMPLES   (sample_buffer_size / 2)            // 1024
#define STEREO_SAMPLES (MONO_SAMPLES * 2)                  // 2048 int16 (L+R interleaved)
#define STEREO_BYTES   (STEREO_SAMPLES * sizeof(int16_t))  // 4096 bytes

static int16_t stereoBuffer0[STEREO_SAMPLES]; // I2S0 → Mic1(L), Mic2(R)
static int16_t stereoBuffer1[STEREO_SAMPLES]; // I2S1 → Mic3(L), Mic4(R)
static signed short sampleBuffer[MONO_SAMPLES]; // selected mic, mono output

// -------- Inference double-buffer struct ----------------------------------
typedef struct {
    signed short *buffers[2];
    unsigned char buf_select;
    unsigned char buf_ready;
    unsigned int  buf_count;
    unsigned int  n_samples;
} inference_t;

static inference_t inference;
static bool   debug_nn      = false;
static int    print_results = -(EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW);
static bool   record_status = true;
static volatile uint8_t active_mic = 1; // loudest mic 1–4, printed with predictions

// -------- Forward declarations --------------------------------------------
static bool microphone_inference_start(uint32_t n_samples);
static bool microphone_inference_record(void);
static int  microphone_audio_signal_get_data(size_t offset, size_t length, float *out_ptr);
static void microphone_inference_end(void);
static int  i2s_init_bus(i2s_port_t port, uint32_t sample_rate, int bck, int ws, int data_in);

// =========================================================================
// setup
// =========================================================================
void setup()
{
    Serial.begin(115200);
    while (!Serial);
    Serial.println("Edge Impulse 4-Mic Inferencing Demo");

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

// =========================================================================
// loop
// =========================================================================
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
        ei_printf("\n[Active mic: Mic%d]\n", (int)active_mic);
        ei_printf("Predictions (DSP: %d ms., Classification: %d ms., Anomaly: %d ms.):\n",
            result.timing.dsp, result.timing.classification, result.timing.anomaly);

        for (size_t ix = 0; ix < EI_CLASSIFIER_LABEL_COUNT; ix++) {
            ei_printf("    %s: ", result.classification[ix].label);
            ei_printf_float(result.classification[ix].value);
            ei_printf("\n");
        }
#if EI_CLASSIFIER_HAS_ANOMALY == 1
        ei_printf("    anomaly score: ");
        ei_printf_float(result.anomaly);
        ei_printf("\n");
#endif
        print_results = 0;
    }
}

// =========================================================================
// audio_inference_callback — same double-buffer fill as original
// =========================================================================
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

// =========================================================================
// capture_samples — reads both I2S buses, picks loudest mic, feeds inference
// =========================================================================
static void capture_samples(void* arg)
{
    const uint32_t mono_bytes = (uint32_t)arg; // = sample_buffer_size = 2048 bytes
    size_t bytes_read0 = 0, bytes_read1 = 0;

    while (record_status) {
        // --- Read stereo from both I2S buses ---
        i2s_read((i2s_port_t)0, (void*)stereoBuffer0, STEREO_BYTES, &bytes_read0, portMAX_DELAY);
        i2s_read((i2s_port_t)1, (void*)stereoBuffer1, STEREO_BYTES, &bytes_read1, portMAX_DELAY);

        // --- Compute mean absolute energy for each of the 4 mics ---
        int32_t energy[4] = {0, 0, 0, 0};
        for (int i = 0; i < MONO_SAMPLES; i++) {
            energy[0] += abs((int32_t)stereoBuffer0[2*i]);       // Mic1 (L of I2S0)
            energy[1] += abs((int32_t)stereoBuffer0[2*i + 1]);   // Mic2 (R of I2S0)
            energy[2] += abs((int32_t)stereoBuffer1[2*i]);       // Mic3 (L of I2S1)
            energy[3] += abs((int32_t)stereoBuffer1[2*i + 1]);   // Mic4 (R of I2S1)
        }

        // --- Select loudest mic ---
        int best = 0;
        for (int k = 1; k < 4; k++) {
            if (energy[k] > energy[best]) best = k;
        }
        active_mic = (uint8_t)(best + 1); // 1-indexed for display

        // --- Extract selected mic's mono samples into sampleBuffer ---
        switch (best) {
            case 0: // Mic1: LEFT channel of stereoBuffer0
                for (int i = 0; i < MONO_SAMPLES; i++) sampleBuffer[i] = stereoBuffer0[2*i];
                break;
            case 1: // Mic2: RIGHT channel of stereoBuffer0
                for (int i = 0; i < MONO_SAMPLES; i++) sampleBuffer[i] = stereoBuffer0[2*i + 1];
                break;
            case 2: // Mic3: LEFT channel of stereoBuffer1
                for (int i = 0; i < MONO_SAMPLES; i++) sampleBuffer[i] = stereoBuffer1[2*i];
                break;
            default: // Mic4: RIGHT channel of stereoBuffer1
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

// =========================================================================
// microphone_inference_start
// =========================================================================
static bool microphone_inference_start(uint32_t n_samples)
{
    inference.buffers[0] = (signed short *)malloc(n_samples * sizeof(signed short));
    if (!inference.buffers[0]) return false;

    inference.buffers[1] = (signed short *)malloc(n_samples * sizeof(signed short));
    if (!inference.buffers[1]) {
        ei_free(inference.buffers[0]);
        return false;
    }

    inference.buf_select = 0;
    inference.buf_count  = 0;
    inference.n_samples  = n_samples;
    inference.buf_ready  = 0;

    // Init I2S0 — Mic1 (L) + Mic2 (R)
    if (i2s_init_bus(I2S_NUM_0, EI_CLASSIFIER_FREQUENCY, I2S0_BCK, I2S0_WS, I2S0_DATA) != 0) {
        ei_printf("Failed to start I2S0!\n");
        ei_free(inference.buffers[0]);
        ei_free(inference.buffers[1]);
        return false;
    }

    // Init I2S1 — Mic3 (L) + Mic4 (R)
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

// =========================================================================
// microphone_inference_record
// =========================================================================
static bool microphone_inference_record(void)
{
    bool ret = true;

    if (inference.buf_ready == 1) {
        ei_printf(
            "Error sample buffer overrun. Decrease the number of slices per model window "
            "(EI_CLASSIFIER_SLICES_PER_MODEL_WINDOW)\n");
        ret = false;
    }

    while (inference.buf_ready == 0) {
        delay(1);
    }

    inference.buf_ready = 0;
    return ret;
}

// =========================================================================
// microphone_audio_signal_get_data
// =========================================================================
static int microphone_audio_signal_get_data(size_t offset, size_t length, float *out_ptr)
{
    numpy::int16_to_float(
        &inference.buffers[inference.buf_select ^ 1][offset], out_ptr, length);
    return 0;
}

// =========================================================================
// microphone_inference_end
// =========================================================================
static void microphone_inference_end(void)
{
    record_status = false;
    i2s_driver_uninstall(I2S_NUM_0);
    i2s_driver_uninstall(I2S_NUM_1);
    ei_free(inference.buffers[0]);
    ei_free(inference.buffers[1]);
}

// =========================================================================
// i2s_init_bus — stereo RX, shared config for both buses
// =========================================================================
static int i2s_init_bus(i2s_port_t port, uint32_t sample_rate, int bck, int ws, int data_in)
{
    i2s_config_t cfg = {
        .mode                 = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
        .sample_rate          = sample_rate,
        .bits_per_sample      = (i2s_bits_per_sample_t)16,
        .channel_format       = I2S_CHANNEL_FMT_RIGHT_LEFT, // stereo: L+R interleaved
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
    if (ret != ESP_OK) {
        ei_printf("Error i2s_driver_install port %d\n", (int)port);
        return (int)ret;
    }
    ret = i2s_set_pin(port, &pins);
    if (ret != ESP_OK) {
        ei_printf("Error i2s_set_pin port %d\n", (int)port);
        return (int)ret;
    }
    ret = i2s_zero_dma_buffer(port);
    if (ret != ESP_OK) {
        ei_printf("Error i2s_zero_dma_buffer port %d\n", (int)port);
        return (int)ret;
    }
    return 0;
}

#if !defined(EI_CLASSIFIER_SENSOR) || EI_CLASSIFIER_SENSOR != EI_CLASSIFIER_SENSOR_MICROPHONE
#error "Invalid model for current sensor."
#endif
