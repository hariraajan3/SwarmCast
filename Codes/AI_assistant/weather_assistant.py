"""

Run vLLM server first:
    vllm serve Qwen/Qwen3.5-0.8B --port 8000 --tensor-parallel-size 1 \
        --max-model-len 512 --gpu-memory-utilization 0.95 --dtype float16 \
        --cudagraph_capture_sizes 1

Usage:
    python weather_assistant.py                   # emulate sensor data
    python weather_assistant.py --no-emulate      # read from ESP32 (future)
"""

import argparse
import random
from datetime import datetime, timedelta
from openai import OpenAI


VLLM_BASE_URL = "http://localhost:8000/v1"
VLLM_API_KEY  = "EMPTY"         
MODEL_NAME    = "Qwen/Qwen3.5-0.8B"

MAX_TOKENS    = 512
TEMPERATURE   = 1.0
TOP_P         = 1.0
TOP_K         = 20
PRESENCE_PENALTY = 2.0

DEFAULT_N_SAMPLES = 5            


INTENSITY_LEVELS   = ["low", "medium", "high"]
WIND_DIRECTIONS    = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
CLOUD_LEVELS       = ["clear", "partly cloudy", "mostly cloudy", "overcast"]



def emulate_sample(timestamp: datetime) -> dict:
    """Return a single randomly generated sensor reading."""
    return {
        "timestamp":       timestamp.strftime("%Y-%m-%d %H:%M:%S"),
        "temperature_c":   round(random.uniform(15.0, 42.0), 1),
        "humidity_pct":    round(random.uniform(20.0, 95.0), 1),
        "wind_intensity":  random.choice(INTENSITY_LEVELS),
        "wind_direction":  random.choice(WIND_DIRECTIONS),
        "rain_intensity":  random.choice(INTENSITY_LEVELS),
        "cloud_coverage":  random.choice(CLOUD_LEVELS),
    }


def emulate_samples(n: int) -> list[dict]:
    """Return n samples spaced 10 minutes apart ending at now."""
    now = datetime.now()
    return [emulate_sample(now - timedelta(minutes=10 * (n - 1 - i))) for i in range(n)]


# ── ESP32 placeholder ──────────────────────────────────────────────────────────

def read_from_esp32(n: int) -> list[dict]:
    """
    TODO: replace with real BLE / serial / HTTP read from ESP32.
    Returns n most-recent samples from the device.
    """
    raise NotImplementedError(
        "ESP32 integration not yet implemented. Run with --emulate (default)."
    )



def build_sensor_context(samples: list[dict]) -> str:
    """Render sensor samples as a readable block for the system prompt."""
    lines = ["Sensor readings (oldest → newest):"]
    for i, s in enumerate(samples, 1):
        lines.append(
            f"  [{i}] {s['timestamp']} | "
            f"Temp: {s['temperature_c']}°C | "
            f"Humidity: {s['humidity_pct']}% | "
            f"Wind: {s['wind_intensity']} from {s['wind_direction']} | "
            f"Rain: {s['rain_intensity']} | "
            f"Cloud: {s['cloud_coverage']}"
        )
    return "\n".join(lines)


SYSTEM_PROMPT_TEMPLATE = """\
You are a helpful assistant for farmers and outdoor workers.
You have access to real-time local weather sensor data shown below.

{sensor_context}

Use this data to answer questions about:
- Farming decisions (irrigation, harvesting, planting, spraying pesticides, etc.)
- Weather forecasting and trends based on the readings
- Whether it is safe or advisable to go outside
- Any other agriculture-related queries

Be concise and practical. Refer to the sensor data explicitly when relevant.
If a trend is visible across multiple readings, mention it.
"""


def build_system_prompt(samples: list[dict]) -> str:
    ctx = build_sensor_context(samples)
    return SYSTEM_PROMPT_TEMPLATE.format(sensor_context=ctx)



TREND_KEYWORDS = [
    "trend", "history", "last", "past", "previous", "over time",
    "change", "rising", "falling", "pattern", "forecast", "predict",
]


def needs_history(query: str) -> bool:
    """Return True if the query likely benefits from multiple samples."""
    q = query.lower()
    return any(kw in q for kw in TREND_KEYWORDS)


# ── Main assistant loop ────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Weather farming assistant")
    parser.add_argument(
        "--emulate", dest="emulate", action="store_true", default=True,
        help="Use emulated ESP32 sensor data (default: True)",
    )
    parser.add_argument(
        "--no-emulate", dest="emulate", action="store_false",
        help="Read live data from ESP32",
    )
    parser.add_argument(
        "--n-samples", type=int, default=DEFAULT_N_SAMPLES,
        help=f"Max number of past samples to store (default: {DEFAULT_N_SAMPLES})",
    )
    args = parser.parse_args()

    client = OpenAI(base_url=VLLM_BASE_URL, api_key=VLLM_API_KEY)

    print("=== Weather Farming Assistant ===")
    print(f"Mode      : {'EMULATED' if args.emulate else 'ESP32 LIVE'}")
    print(f"Max samples kept : {args.n_samples}")
    print(f"Model     : {MODEL_NAME}")
    print(f"Server    : {VLLM_BASE_URL}")
    print("Type 'quit' or 'exit' to stop.\n")

    # Pre-fetch / emulate the initial batch of samples
    if args.emulate:
        all_samples = emulate_samples(args.n_samples)
        print(f"[Emulator] Generated {len(all_samples)} sensor samples.\n")
    else:
        all_samples = read_from_esp32(args.n_samples)

    while True:
        try:
            query = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nBye!")
            break

        if not query:
            continue
        if query.lower() in ("quit", "exit"):
            print("Bye!")
            break

        # Optionally refresh emulated data to simulate new readings arriving
        if args.emulate:
            new_sample = emulate_sample(datetime.now())
            all_samples.append(new_sample)
            all_samples = all_samples[-args.n_samples:]   # keep rolling window

        # Decide how many samples to send based on the query
        if needs_history(query):
            samples_to_use = all_samples          # full history
        else:
            samples_to_use = all_samples[-1:]     # latest reading only

        system_prompt = build_system_prompt(samples_to_use)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": query},
        ]

        try:
            response = client.chat.completions.create(
                model=MODEL_NAME,
                messages=messages,
                max_tokens=MAX_TOKENS,
                temperature=TEMPERATURE,
                top_p=TOP_P,
                presence_penalty=PRESENCE_PENALTY,
                extra_body={"top_k": TOP_K},
            )
            answer = response.choices[0].message.content.strip()
        except Exception as exc:
            print(f"[Error contacting vLLM server] {exc}")
            continue

        print(f"\nAssistant: {answer}\n")


if __name__ == "__main__":
    main()
