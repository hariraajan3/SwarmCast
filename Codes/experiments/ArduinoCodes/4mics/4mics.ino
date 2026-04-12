#include "AudioTools.h"

// -------- I2S0 --------
I2SStream i2s0;
I2SConfig config0;

// -------- I2S1 --------
I2SStream i2s1;
I2SConfig config1;

const int BUFFER_SAMPLES = 256;
int16_t buffer0[BUFFER_SAMPLES];
int16_t buffer1[BUFFER_SAMPLES];

void setup() {
  Serial.begin(115200);

  // ===== I2S0 =====
  config0 = i2s0.defaultConfig(RX_MODE);
  config0.sample_rate = 16000;
  config0.channels = 2;
  config0.bits_per_sample = 16;

  config0.pin_bck = 2;
  config0.pin_ws  = 7;
  config0.pin_data = 6;

  i2s0.begin(config0);

  // ===== I2S1 =====
  config1 = i2s1.defaultConfig(RX_MODE);
  config1.sample_rate = 16000;
  config1.channels = 2;
  config1.bits_per_sample = 16;

  config1.pin_bck = 18;
  config1.pin_ws  = 16;
  config1.pin_data = 17;

  i2s1.begin(config1);
}

void loop() {
  int bytesRead0 = i2s0.readBytes((uint8_t*)buffer0, sizeof(buffer0));
  int bytesRead1 = i2s1.readBytes((uint8_t*)buffer1, sizeof(buffer1));

  int samples0 = bytesRead0 / 2;
  int samples1 = bytesRead1 / 2;

  long mic1_energy = 0;
  long mic2_energy = 0;
  long mic3_energy = 0;
  long mic4_energy = 0;

  // -------- I2S0 → Mic1 + Mic2 --------
  for (int i = 0; i < samples0 / 2; i++) {
    int16_t left  = buffer0[2*i];
    int16_t right = buffer0[2*i + 1];

    mic1_energy += abs(left);   // Mic1 (LEFT)
    mic2_energy += abs(right);  // Mic2 (RIGHT)
  }

  // -------- I2S1 → Mic3 + Mic4 --------
  for (int i = 0; i < samples1 / 2; i++) {
    int16_t left  = buffer1[2*i];
    int16_t right = buffer1[2*i + 1];

    mic3_energy += abs(left);   // Mic3 (LEFT)
    mic4_energy += abs(right);  // Mic4 (RIGHT)
  }

  // Normalize
  mic1_energy /= (samples0 / 2);
  mic2_energy /= (samples0 / 2);
  mic3_energy /= (samples1 / 2);
  mic4_energy /= (samples1 / 2);

  // Print all 4
  Serial.print("M1: ");
  Serial.print(mic1_energy);
  Serial.print(" | M2: ");
  Serial.print(mic2_energy);
  Serial.print(" | M3: ");
  Serial.print(mic3_energy);
  Serial.print(" | M4: ");
  Serial.println(mic4_energy);

  delay(200);
}