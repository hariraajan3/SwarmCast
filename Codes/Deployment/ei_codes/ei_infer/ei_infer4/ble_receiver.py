"""
ble_receiver.py  ─  ei_infer4 Python receiver
Scans for "EI_Weather4" BLE device, subscribes to notifications, and prints
a clean weather dashboard every inference window (~2 s).

BLE data format (from Arduino):
    <temp>|<humid>|<class_idx>|<m1_energy>|<m2_energy>

Class index → label mapping (alphabetical EI order):
    0 = HWHR  (High Wind, High Rain)
    1 = MWMR  (Medium Wind, Medium Rain)
    2 = NRHW  (No Rain, High Wind)
    3 = NWHR  (No Wind, High Rain)

Wind direction:
    Derived from the ratio of Mic1 (LEFT) and Mic2 (RIGHT) energies.
    Physical assignment is configurable via MIC1_DIRECTION / MIC2_DIRECTION.
    If energies are close (within ±25% of each other) wind is cross-axis.

Install:
    pip install bleak

Run:
    python ble_receiver.py
    python ble_receiver.py --mic1-dir N --mic2-dir S   # default
"""

import asyncio
import argparse
import sys
from bleak import BleakScanner, BleakClient

# ── BLE config ──────────────────────────────────────────────────────────────
DEVICE_NAME  = "EI_Weather4"
SERVICE_UUID = "12345678-1234-1234-1234-123456789abc"
CHAR_UUID    = "abcd1234-5678-1234-5678-abcdef123456"
SCAN_TIMEOUT = 15.0  # seconds

# ── EI class index → label ──────────────────────────────────────────────────
# Must match the alphabetical EI label order for your deployed model.
CLASS_LABELS = ["HWHR", "MWMR", "NRHW", "NWHR"]

# ── Class → derived weather parameters ─────────────────────────────────────
# These represent what the model class physically encodes.
CLASS_INFO = {
    "HWHR": {
        "rain":        "High",
        "wind_level":  "High",
        "clouds":      "Overcast",
        "description": "Heavy rain with strong wind",
    },
    "MWMR": {
        "rain":        "Medium",
        "wind_level":  "Medium",
        "clouds":      "Mostly Cloudy",
        "description": "Moderate rain with moderate wind",
    },
    "NRHW": {
        "rain":        "None",
        "wind_level":  "High",
        "clouds":      "Partly Cloudy",
        "description": "Dry but strong wind",
    },
    "NWHR": {
        "rain":        "High",
        "wind_level":  "Low",
        "clouds":      "Overcast",
        "description": "Heavy rain, calm wind",
    },
}

# ── Mic layout (configurable via CLI) ───────────────────────────────────────
# Change these if your physical mic orientation differs.
# Mic1 = LEFT channel (I2S stereo); Mic2 = RIGHT channel.
MIC1_DIRECTION = "N"   # cardinal direction mic1 faces (wind FROM that side = loud)
MIC2_DIRECTION = "S"   # cardinal direction mic2 faces


# ── Wind direction from 2-mic energy ratio ─────────────────────────────────
def wind_direction(m1: int, m2: int) -> str:
    """
    Determine wind direction from two-mic energy ratio.

    The mic with higher energy is facing INTO the wind.
    When energies are within 25% of each other the wind is roughly
    perpendicular to the mic axis (cross-wind).

    Returns a compass string, e.g. "N", "S", or "Cross (E/W)".
    """
    total = m1 + m2
    if total == 0:
        return "Calm"

    ratio = m1 / total   # 0.0 → all Mic2, 1.0 → all Mic1

    # Cross-wind threshold: energies within 25% → ratio in [0.375, 0.625]
    if 0.375 <= ratio <= 0.625:
        # Perpendicular axis label derived from the two mic directions
        cross = _cross_axis(MIC1_DIRECTION, MIC2_DIRECTION)
        return f"Cross ({cross})"

    return MIC1_DIRECTION if ratio > 0.625 else MIC2_DIRECTION


def _cross_axis(d1: str, d2: str) -> str:
    """Return the perpendicular axis label for a N/S or E/W mic pair."""
    pair = frozenset([d1, d2])
    if pair == frozenset(["N", "S"]):
        return "E or W"
    if pair == frozenset(["E", "W"]):
        return "N or S"
    # Diagonal mics → less informative
    return f"perp. to {d1}/{d2}"


# ── Wind intensity from mic energy magnitude ───────────────────────────────
def wind_intensity_from_energy(max_energy: int) -> str:
    """
    Coarse intensity bucket based on raw mean-absolute energy.
    Thresholds depend on mic hardware; tune these after calibration.
    """
    if max_energy < 300:
        return "Calm"
    elif max_energy < 1500:
        return "Low"
    elif max_energy < 5000:
        return "Medium"
    else:
        return "High"


# ── Parse and print one notification ───────────────────────────────────────
def parse_and_print(raw: bytes) -> None:
    try:
        text   = raw.decode("utf-8").strip()
        parts  = text.split("|")

        if len(parts) != 5:
            print(f"[WARN] Unexpected field count ({len(parts)}): {text!r}")
            return

        temp      = float(parts[0])
        humid     = float(parts[1])
        cls_idx   = int(parts[2])
        m1        = int(parts[3])
        m2        = int(parts[4])

    except (ValueError, UnicodeDecodeError) as exc:
        print(f"[WARN] Parse error: {exc} | raw={raw!r}")
        return

    # Map index to label
    label = CLASS_LABELS[cls_idx] if 0 <= cls_idx < len(CLASS_LABELS) else f"IDX{cls_idx}"
    info  = CLASS_INFO.get(label, {
        "rain": "?", "wind_level": "?", "clouds": "?", "description": label
    })

    # Wind from mic energies
    direction   = wind_direction(m1, m2)
    intensity   = wind_intensity_from_energy(max(m1, m2))

    print("┌" + "─" * 44 + "┐")
    print(f"│  Temperature   : {temp:>5.1f} °C          │")
    print(f"│  Humidity      : {humid:>5.1f} %           │")
    print(f"│  Cloud cover   : {info['clouds']:<22} │")
    print(f"│  Rain          : {info['rain']:<22} │")
    print(f"│  Wind (class)  : {info['wind_level']:<22} │")
    print(f"│  Wind direction: {direction:<22} │")
    print(f"│  Wind (energy) : {intensity:<22} │")
    print(f"│  Class         : [{cls_idx}] {label} – {info['description']:<15} │")
    print(f"│  Mic energies  : L={m1:<6}  R={m2:<6}         │")
    print("└" + "─" * 44 + "┘")


def notification_handler(_sender, data: bytearray) -> None:
    parse_and_print(bytes(data))


# ── BLE async main ──────────────────────────────────────────────────────────
async def run(mic1_dir: str, mic2_dir: str) -> None:
    global MIC1_DIRECTION, MIC2_DIRECTION
    MIC1_DIRECTION = mic1_dir.upper()
    MIC2_DIRECTION = mic2_dir.upper()

    print(f"Mic layout  : Mic1(LEFT)={MIC1_DIRECTION}  Mic2(RIGHT)={MIC2_DIRECTION}")
    print(f"Scanning for '{DEVICE_NAME}' (up to {SCAN_TIMEOUT:.0f}s)...")

    device = await BleakScanner.find_device_by_name(DEVICE_NAME, timeout=SCAN_TIMEOUT)
    if device is None:
        print(f"[ERROR] '{DEVICE_NAME}' not found. Make sure the ESP32 is powered.")
        sys.exit(1)

    print(f"Found: {device.name}  [{device.address}]")
    print("Connecting...")

    async with BleakClient(device, timeout=15.0) as client:
        print(f"Connected!  MTU={client.mtu_size} bytes\n")
        await client.start_notify(CHAR_UUID, notification_handler)
        print("Subscribed to notifications. Press Ctrl+C to stop.\n")

        try:
            while True:
                await asyncio.sleep(1.0)
        except KeyboardInterrupt:
            print("\nDisconnecting...")
        finally:
            await client.stop_notify(CHAR_UUID)


def main() -> None:
    parser = argparse.ArgumentParser(description="ei_infer4 BLE receiver")
    parser.add_argument("--mic1-dir", default="N",
                        help="Physical direction Mic1 (LEFT ch) faces. Default: N")
    parser.add_argument("--mic2-dir", default="S",
                        help="Physical direction Mic2 (RIGHT ch) faces. Default: S")
    args = parser.parse_args()
    asyncio.run(run(args.mic1_dir, args.mic2_dir))


if __name__ == "__main__":
    main()
