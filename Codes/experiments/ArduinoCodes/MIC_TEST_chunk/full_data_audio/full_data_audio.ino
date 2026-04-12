#include <Arduino.h>
#include <AudioTools.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// -------- I2S --------
I2SStream i2s0, i2s1;
I2SConfig config0, config1;

const int BUFFER_SAMPLES = 256;
int16_t buffer0[BUFFER_SAMPLES];
int16_t buffer1[BUFFER_SAMPLES];

// ===== BLE =====
BLECharacteristic *pCharacteristic;
bool deviceConnected = false;

#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "abcd1234-5678-1234-5678-abcdef123456"

// ===== STABILITY CONTROL =====
int currentMic = -1;
unsigned long lastSwitchTime = 0;

#define HOLD_TIME 100        // ms
#define SWITCH_MARGIN 25     // energy threshold

class MyCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) { deviceConnected = true; }
  void onDisconnect(BLEServer* pServer) { deviceConnected = false; }
};

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

  // ===== BLE =====
  BLEDevice::init("ESP32_AUDIO");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new MyCallbacks());

  BLEService *service = server->createService(SERVICE_UUID);
  pCharacteristic = service->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->addDescriptor(new BLE2902());

  service->start();
  server->getAdvertising()->start();
}

void loop() {
  // if (!deviceConnected) return;

  // ===== READ =====
  int bytes0 = i2s0.readBytes((uint8_t*)buffer0, sizeof(buffer0));
  int bytes1 = i2s1.readBytes((uint8_t*)buffer1, sizeof(buffer1));

  int samples0 = bytes0 / 2;
  int samples1 = bytes1 / 2;

  long e[4] = {0};

  // ===== ENERGY =====
  for (int i = 0; i < samples0 / 2; i++) {
    e[0] += abs(buffer0[2*i]);
    e[1] += abs(buffer0[2*i + 1]);
  }

  for (int i = 0; i < samples1 / 2; i++) {
    e[2] += abs(buffer1[2*i]);
    e[3] += abs(buffer1[2*i + 1]);
  }

  // ===== NORMALIZE =====
  e[0] /= (samples0 / 2);
  e[1] /= (samples0 / 2);
  e[2] /= (samples1 / 2);
  e[3] /= (samples1 / 2);

  // ===== FIND MAX =====
  int maxMic = 0;
  for (int i = 1; i < 4; i++) {
    if (e[i] > e[maxMic]) maxMic = i;
  }

  // ===== STABLE MIC SELECTION =====
  if (currentMic == -1) {
    currentMic = maxMic;
    lastSwitchTime = millis();
  } else {
    if ((millis() - lastSwitchTime > HOLD_TIME) &&
        (e[maxMic] > e[currentMic] + SWITCH_MARGIN)) {

      currentMic = maxMic;
      lastSwitchTime = millis();
      Serial.println("🔄 Switched mic!");
    }
  }

  // ===== DEBUG PRINT =====
  Serial.print("M1: "); Serial.print(e[0]);
  Serial.print(" | M2: "); Serial.print(e[1]);
  Serial.print(" | M3: "); Serial.print(e[2]);
  Serial.print(" | M4: "); Serial.print(e[3]);
  Serial.print(" | ACTIVE: "); Serial.println(currentMic);
  
  // ===== THRESHOLD =====
  if (e[currentMic] < 100) {
    Serial.println("No strong sound");
    delay(100);
    return;
  }

  Serial.println("Stable mic active\n");

  // ===== (OPTIONAL STREAM BLOCK - ENABLE IF NEEDED) =====
  /*
  int duration_ms = 2000;
  unsigned long start = millis();

  while (millis() - start < duration_ms) {

    int b0 = i2s0.readBytes((uint8_t*)buffer0, sizeof(buffer0));
    int b1 = i2s1.readBytes((uint8_t*)buffer1, sizeof(buffer1));

    int16_t chunk[128];
    int idx = 0;

    for (int i = 0; i < 64; i++) {
      if (currentMic == 0) chunk[idx++] = buffer0[2*i];
      else if (currentMic == 1) chunk[idx++] = buffer0[2*i + 1];
      else if (currentMic == 2) chunk[idx++] = buffer1[2*i];
      else chunk[idx++] = buffer1[2*i + 1];
    }

    pCharacteristic->setValue((uint8_t*)chunk, idx * 2);
    pCharacteristic->notify();

    delay(5);
  }
  */

  delay(200);
}