from flask import Flask, jsonify, request
from flask_cors import CORS
import random
import math
import time

app = Flask(__name__)
CORS(app)

# ─── Simulated Mesh Network Nodes ────────────────────────────────────────────
# In production, these would come from real microcontrollers via MQTT/BLE/Zigbee.
# For the hackathon demo, we simulate a realistic cluster of nodes.

NODES = [
    {
        "node_id": "SC-N01",
        "name": "Farm Gate Sensor",
        "lat": 12.9716,
        "lon": 77.5946,
        "type": "primary",
        "battery": 87,
        "mesh_connections": ["SC-N02", "SC-N03"],
    },
    {
        "node_id": "SC-N02",
        "name": "Orchard Canopy",
        "lat": 12.9745,
        "lon": 77.5980,
        "type": "relay",
        "battery": 64,
        "mesh_connections": ["SC-N01", "SC-N04"],
    },
    {
        "node_id": "SC-N03",
        "name": "Pond Edge Monitor",
        "lat": 12.9680,
        "lon": 77.5910,
        "type": "primary",
        "battery": 92,
        "mesh_connections": ["SC-N01", "SC-N05"],
    },
    {
        "node_id": "SC-N04",
        "name": "Hilltop Weather Post",
        "lat": 12.9770,
        "lon": 77.6020,
        "type": "gateway",
        "battery": 100,
        "mesh_connections": ["SC-N02", "SC-N06"],
    },
    {
        "node_id": "SC-N05",
        "name": "Riverside Node",
        "lat": 12.9650,
        "lon": 77.5870,
        "type": "primary",
        "battery": 45,
        "mesh_connections": ["SC-N03", "SC-N06"],
    },
    {
        "node_id": "SC-N06",
        "name": "Urban Heat Island Probe",
        "lat": 12.9690,
        "lon": 77.6050,
        "type": "relay",
        "battery": 73,
        "mesh_connections": ["SC-N04", "SC-N05", "SC-N07"],
    },
    {
        "node_id": "SC-N07",
        "name": "Flood Alert Sentinel",
        "lat": 12.9620,
        "lon": 77.5990,
        "type": "primary",
        "battery": 56,
        "mesh_connections": ["SC-N06"],
    },
    {
        "node_id": "SC-N08",
        "name": "Rooftop Station Alpha",
        "lat": 12.9750,
        "lon": 77.5900,
        "type": "primary",
        "battery": 81,
        "mesh_connections": ["SC-N01", "SC-N02"],
    },
]

RAIN_LEVELS = ["none", "light", "moderate", "heavy"]
WIND_LEVELS = ["calm", "light", "moderate", "strong"]


def generate_sensor_data(node):
    """Generate realistic simulated sensor readings for a node."""
    # Base temperature varies by node type/position
    base_temp = 28.0 + random.uniform(-3, 5)
    # Urban nodes tend to be warmer (heat island effect)
    if "urban" in node["name"].lower() or "rooftop" in node["name"].lower():
        base_temp += 2.5

    # Add time-of-day variation
    hour = time.localtime().tm_hour
    temp_offset = -3 * math.cos(2 * math.pi * (hour - 14) / 24)
    temperature = round(base_temp + temp_offset + random.uniform(-0.5, 0.5), 1)

    humidity = round(random.uniform(40, 85), 1)
    pressure = round(random.uniform(1008, 1018), 1)
    aqi = random.randint(30, 180)

    # ML-classified rain & wind intensity
    rain_intensity = random.choice(RAIN_LEVELS)
    wind_intensity = random.choice(WIND_LEVELS)

    # Audio confidence score (simulates edge ML model output)
    rain_confidence = round(random.uniform(0.72, 0.99), 2)
    wind_confidence = round(random.uniform(0.68, 0.97), 2)

    return {
        "temperature": temperature,
        "humidity": humidity,
        "pressure": pressure,
        "aqi": aqi,
        "rain_intensity": rain_intensity,
        "rain_confidence": rain_confidence,
        "wind_intensity": wind_intensity,
        "wind_confidence": wind_confidence,
        "altitude": round(random.uniform(800, 950), 1),
        "signal_strength": random.randint(-90, -30),
        "uptime_hours": random.randint(1, 720),
    }


@app.route("/")
def home():
    return jsonify({"status": "ok", "service": "SwarmCast API", "version": "1.0.0"})


@app.route("/api/nodes")
def get_nodes():
    """Return all nodes with live sensor data."""
    result = []
    for node in NODES:
        data = generate_sensor_data(node)
        result.append(
            {
                **node,
                **data,
                "last_seen": int(time.time()) - random.randint(0, 120),
                "status": "online" if node["battery"] > 20 else "low_battery",
            }
        )
    return jsonify(result)


@app.route("/api/nodes/<node_id>")
def get_node(node_id):
    """Return a single node's data."""
    for node in NODES:
        if node["node_id"] == node_id:
            data = generate_sensor_data(node)
            return jsonify(
                {
                    **node,
                    **data,
                    "last_seen": int(time.time()) - random.randint(0, 30),
                    "status": "online",
                }
            )
    return jsonify({"error": "Node not found"}), 404


@app.route("/api/mesh")
def get_mesh():
    """Return mesh topology: list of edges between connected nodes."""
    edges = set()
    node_map = {n["node_id"]: n for n in NODES}
    for node in NODES:
        for conn in node["mesh_connections"]:
            edge = tuple(sorted([node["node_id"], conn]))
            if conn in node_map:
                edges.add(edge)
    return jsonify(
        {
            "edges": [
                {
                    "from": e[0],
                    "to": e[1],
                    "from_lat": node_map[e[0]]["lat"],
                    "from_lon": node_map[e[0]]["lon"],
                    "to_lat": node_map[e[1]]["lat"],
                    "to_lon": node_map[e[1]]["lon"],
                    "signal_quality": random.choice(["excellent", "good", "fair"]),
                }
                for e in edges
            ],
            "total_nodes": len(NODES),
            "total_edges": len(edges),
        }
    )


@app.route("/api/network/stats")
def get_network_stats():
    """Return network-wide aggregated statistics."""
    temps = [generate_sensor_data(n)["temperature"] for n in NODES]
    humids = [generate_sensor_data(n)["humidity"] for n in NODES]
    aqis = [generate_sensor_data(n)["aqi"] for n in NODES]
    return jsonify(
        {
            "total_nodes": len(NODES),
            "online_nodes": sum(1 for n in NODES if n["battery"] > 20),
            "avg_temperature": round(sum(temps) / len(temps), 1),
            "avg_humidity": round(sum(humids) / len(humids), 1),
            "avg_aqi": round(sum(aqis) / len(aqis)),
            "network_health": "excellent" if all(n["battery"] > 30 for n in NODES) else "degraded",
        }
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)