#include <Arduino.h>
#include <U8g2lib.h>
#include <Wire.h>

#define SDA_PIN 4
#define SCL_PIN 5

U8G2_SH1106_128X32_VISIONOX_F_HW_I2C u8g2(U8G2_R0, U8X8_PIN_NONE);

void setup() {
  Wire.begin(SDA_PIN, SCL_PIN);
  u8g2.begin();
}

void loop() {
  u8g2.clearBuffer();

  u8g2.setFont(u8g2_font_5x7_tr);  // small font for 32px screen

  u8g2.drawStr(0, 7,  "Temp: 96C");
  u8g2.drawStr(0, 15, "Hum: 36%");
  u8g2.drawStr(0, 23, "Rain: High");

  u8g2.sendBuffer();
  delay(2000);

  u8g2.clearBuffer();
  u8g2.setFont(u8g2_font_5x7_tr);

  u8g2.drawStr(0, 7,  "Wind: High");
  u8g2.drawStr(0, 15, "Time: 10:38");
  u8g2.drawStr(0, 23, ":12");

  u8g2.sendBuffer();
  delay(2000);
}