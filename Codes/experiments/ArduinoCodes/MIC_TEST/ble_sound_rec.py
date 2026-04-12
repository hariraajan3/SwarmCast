import asyncio
from bleak import BleakClient, BleakScanner
import numpy as np
import sounddevice as sd
import time

SERVICE_UUID = "12345678-1234-1234-1234-123456789abc"
CHAR_UUID = "abcd1234-5678-1234-5678-abcdef123456"

audio_buffer = []

start_time = time.time()

def audio_callback(sender, data):
    global audio_buffer

    samples = np.frombuffer(data, dtype=np.int16)
    audio_buffer.extend(samples)

async def main():
    print("Scanning...")
    devices = await BleakScanner.discover()

    target = None
    for d in devices:
        if "ESP32_AUDIO" in d.name:
            target = d
            break

    if target is None:
        print("Device not found")
        return

    async with BleakClient(target.address) as client:
        print("Connected!")

        await client.start_notify(CHAR_UUID, audio_callback)

        while True:
            await asyncio.sleep(5)

            if len(audio_buffer) == 0:
                continue

            # Convert to numpy
            data = np.array(audio_buffer, dtype=np.int16)
            print(data.shape)
            # ===== PLAY =====
            sd.play(data, samplerate=16000)
            sd.wait()

            # ===== SAVE =====
            # filename = f"audio_{int(time.time())}.wav"

            # import wave
            # with wave.open(filename, 'wb') as f:
            #     f.setnchannels(1)
            #     f.setsampwidth(2)
            #     f.setframerate(16000)
            #     f.writeframes(data.tobytes())

            # print(f"Saved: {filename}")

            # audio_buffer.clear()

asyncio.run(main())