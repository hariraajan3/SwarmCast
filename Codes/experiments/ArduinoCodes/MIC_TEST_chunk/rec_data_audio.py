import asyncio
from bleak import BleakClient, BleakScanner
import numpy as np
import time
import wave

CHAR_UUID = "abcd1234-5678-1234-5678-abcdef123456"

buffer = []
current_mic = None
energies = None

def callback(sender, data):
    global buffer, current_mic, energies

    if len(data) == 20:
        current_mic = data[0]
        energies = np.frombuffer(data[1:], dtype=np.int32)

        print(f"\nMic selected: {current_mic}")
        print(f"Energies: {energies}")

        buffer = []
    else:
        samples = np.frombuffer(data, dtype=np.int16)
        buffer.extend(samples)

async def main():
    devices = await BleakScanner.discover()
    target = None

    for d in devices:
        if d.name and "ESP32_AUDIO" in d.name:
            target = d

    async with BleakClient(target.address) as client:
        await client.start_notify(CHAR_UUID, callback)

        while True:
            await asyncio.sleep(3)

            if len(buffer) > 0:
                data = np.array(buffer, dtype=np.int16)

                filename = f"mic{current_mic}_{int(time.time())}.wav"

                with wave.open(filename, 'wb') as f:
                    f.setnchannels(1)
                    f.setsampwidth(2)
                    f.setframerate(16000)
                    f.writeframes(data.tobytes())

                print(f"Saved {filename}")
                buffer.clear()

asyncio.run(main())