import random
import math
import time

# Wind direction degrees — compass rose mapped to 0-360
WIND_DIRECTIONS_DEG = [0, 45, 90, 135, 180, 225, 270, 315]  # N NE E SE S SW W NW


def generate_sensor_data(node: dict) -> dict:
    name = node.get("name", "").lower()

    base_temp = 28.0 + random.uniform(-3, 5)
    if "urban" in name or "rooftop" in name:
        base_temp += 2.5
    hour = time.localtime().tm_hour
    temp_offset = -3 * math.cos(2 * math.pi * (hour - 14) / 24)
    temperature = round(base_temp + temp_offset + random.uniform(-0.5, 0.5), 1)
    humidity      = round(random.uniform(40, 85), 1)       
    pressure      = round(random.uniform(1008, 1018), 1)   
    aqi           = random.randint(30, 180)
    rain_intensity = round(random.uniform(0, 50), 2)        
    wind_speed    = round(random.uniform(0, 80), 1)      
    wind_direction = random.choice(WIND_DIRECTIONS_DEG)  
    battery = random.randint(0, 100)

    return {
        "temperature":   temperature,
        "humidity":      humidity,
        "pressure":      pressure,
        "aqi":           aqi,
        "rain_intensity": rain_intensity,
        "wind_speed":    wind_speed,
        "wind_direction": wind_direction,
        "altitude":      round(random.uniform(800, 950), 1),
        "signal_strength": random.randint(-90, -30),       # dBm
        "uptime_hours":  random.randint(1, 720),
        "battery":       battery,
        "last_updated":  time.strftime("%I:%M %p", time.localtime())
    }