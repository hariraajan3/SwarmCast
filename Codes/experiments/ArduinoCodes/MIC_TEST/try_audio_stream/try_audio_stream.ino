#include <Arduino.h>
#include <AudioTools.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ===== I2S =====
I2SStream i2s;
VolumeStream volume(i2s);

I2SConfig config;

const int BUFFER_SIZE = 256;
int16_t buffer[BUFFER_SIZE];

// ===== BLE =====
BLECharacteristic *pCharacteristic;
bool deviceConnected = false;

#define SERVICE_UUID        "12345678-1234-1234-1234-123456789abc"
#define CHARACTERISTIC_UUID "abcd1234-5678-1234-5678-abcdef123456"

class MyCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) {
    deviceConnected = true;
  }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
  }
};

void setup() {
  Serial.begin(115200);

  // ===== I2S =====
  config = i2s.defaultConfig(RX_MODE);
  config.sample_rate = 16000;
  config.channels = 1;   // mono for BLE
  config.bits_per_sample = 16;

  config.pin_bck = 2;
  config.pin_ws  = 7;
  config.pin_data = 6;

  i2s.begin(config);

  auto vcfg = volume.defaultConfig();
  vcfg.copyFrom(config);

  volume.begin(vcfg); // we need to provide the bits_per_sample and channels
  // volume.allow_boost(true);
  volume.setVolume(5);
  // ===== BLE =====
  BLEDevice::init("ESP32_AUDIO");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
                      CHARACTERISTIC_UUID,
                      BLECharacteristic::PROPERTY_NOTIFY
                    );

  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  pServer->getAdvertising()->start();
}

void loop() {
  if (!deviceConnected) return;

  int bytesRead = i2s.readBytes((uint8_t*)buffer, sizeof(buffer));

  // BLE MTU limit → send in chunks (~200 bytes safe)
  int chunkSize = 2000;

  for (int i = 0; i < bytesRead; i += chunkSize) {
    int len = min(chunkSize, bytesRead - i);
    pCharacteristic->setValue((uint8_t*)buffer + i, len);
    pCharacteristic->notify();
    delay(5); // avoid flooding BLE
  }
}