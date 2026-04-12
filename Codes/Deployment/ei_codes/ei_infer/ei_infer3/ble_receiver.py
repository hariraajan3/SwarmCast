"""
ble_receiver.py
Receives BLE notifications from EI_Weather ESP32 device and prints:
  - Temperature, Humidity
  - Weather class (HWHR / MWMR / NRHW / NWHR)
  - Wind direction from 4-mic energy analysis

BLE data format (pipe-delimited, sent per inference window):
  <temp>|<humid>|<class>|<M1>|<M2>|<M3>|<M4>
  e.g.  25.5|68.0|HWHR|12345|23456|34567|4567

Mic physical mapping (must match device mounting):
  M1 = North  (I2S0 LEFT)
  M2 = South  (I2S0 RIGHT)
  M3 = East   (I2S1 LEFT)
  M4 = West   (I2S1 RIGHT)

Install deps:
  pip install bleak
"""

import asyncio
import sys
from bleak import BleakScanner, BleakClient

# ── BLE config ─────────────────────────────────────────────────────────────
DEVICE_NAME  = "EI_Weather"
SERVICE_UUID = "12345678-0000-1000-8000-00805f9b34fb"
CHAR_UUID    = "12345679-0000-1000-8000-00805f9b34fb"
SCAN_TIMEOUT = 15.0   # seconds to scan before giving up

# ── Weather class human-readable labels ────────────────────────────────────
CLASS_LABELS = {
    "HWHR": "High Wind  | High Rain",
    "MWMR": "Med Wind   | Med Rain",
    "NRHW": "No Rain    | High Wind",
    "NWHR": "No Wind    | High Rain",
}


# ── Wind direction from 4-mic energies ─────────────────────────────────────
def wind_direction(m1: int, m2: int, m3: int, m4: int) -> str:
    """
    Determine compass wind direction from 4-mic mean absolute energies.

    Physical layout:
        M1 = North
        M2 = South
        M3 = East
        M4 = West

    Wind is assumed to come FROM the direction with the highest energy
    (mic facing into the wind picks up more signal).

    Diagonal rule: if the second-highest ADJACENT mic is >= 75% of the
    loudest, return the 45° diagonal toward it (e.g., N + E → NE).
    """
    energies = {"N": m1, "S": m2, "E": m3, "W": m4}

    # Cardinal primary direction
    primary = max(energies, key=energies.get)
    primary_val = energies[primary]

    if primary_val == 0:
        return "Calm"

    # Each cardinal direction's adjacent pair and the diagonal it forms
    adjacent = {
        "N": [("E", "NE"), ("W", "NW")],
        "S": [("E", "SE"), ("W", "SW")],
        "E": [("N", "NE"), ("S", "SE")],
        "W": [("N", "NW"), ("S", "SW")],
    }

    threshold = 0.75 * primary_val
    best_diag = None
    best_val  = 0

    for neighbor, diag in adjacent[primary]:
        val = energies[neighbor]
        if val >= threshold and val > best_val:
            best_val  = val
            best_diag = diag

    return best_diag if best_diag else primary


def wind_intensity(max_energy: int) -> str:
    """Rough intensity bucket based on raw mean-absolute energy."""
    if max_energy < 500:
        return "Calm"
    elif max_energy < 3000:
        return "Low"
    elif max_energy < 8000:
        return "Medium"
    else:
        return "High"


# ── Parse incoming BLE notification ────────────────────────────────────────
def parse_and_print(raw: bytes) -> None:
    try:
        line = raw.decode("utf-8").strip()
        parts = line.split("|")
        if len(parts) != 7:
            print(f"[WARN] Unexpected format: {line!r}")
            return

        temp    = float(parts[0])
        humid   = float(parts[1])
        cls     = parts[2].strip()
        m1, m2, m3, m4 = (int(p) for p in parts[3:7])

    except (ValueError, UnicodeDecodeError) as exc:
        print(f"[WARN] Parse error: {exc} | raw={raw!r}")
        return

    direction = wind_direction(m1, m2, m3, m4)
    intensity = wind_intensity(max(m1, m2, m3, m4))
    label     = CLASS_LABELS.get(cls, cls)

    print("─" * 42)
    print(f"  Temperature  : {temp:.1f} °C")
    print(f"  Humidity     : {humid:.1f} %")
    print(f"  Weather class: {cls}  ({label})")
    print()
    print(f"  Wind direction : {direction}")
    print(f"  Wind intensity : {intensity}")
    print()
    print(f"  Mic energies   : N={m1}  S={m2}  E={m3}  W={m4}")
    print("─" * 42)


def notification_handler(sender, data: bytearray) -> None:
    parse_and_print(bytes(data))


# ── BLE async main ─────────────────────────────────────────────────────────
async def main() -> None:
    print(f"Scanning for '{DEVICE_NAME}' (up to {SCAN_TIMEOUT:.0f}s)...")

    device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=SCAN_TIMEOUT)
    if device is None:
        print(f"[ERROR] '{DEVICE_NAME}' not found. Make sure the ESP32 is powered and advertising.")
        sys.exit(1)

    print(f"Found device: {device.name}  [{device.address}]")
    print("Connecting...")

    async with BleakClient(device, timeout=15.0) as client:
        print(f"Connected! MTU = {client.mtu_size} bytes")

        await client.start_notify(CHAR_UUID, notification_handler)
        print("Subscribed to notifications. Waiting for data...\n")

        try:
            while True:
                await asyncio.sleep(1.0)
        except KeyboardInterrupt:
            print("\nDisconnecting...")
        finally:
            await client.stop_notify(CHAR_UUID)


if __name__ == "__main__":
    asyncio.run(main())
