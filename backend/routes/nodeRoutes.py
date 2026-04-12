from flask import Blueprint, jsonify, request
from models import db, Node, NodeTelemetry
from datetime import datetime

nodes_bp = Blueprint('nodes', __name__)


@nodes_bp.route("/api/nodes", methods=['GET'])
def get_all_nodes():
    try:
        return jsonify([n.to_dict() for n in Node.query.all()]), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@nodes_bp.route("/api/nodes/<string:node_id>", methods=['GET'])
def get_node(node_id):
    node = Node.query.get(node_id)
    if not node:
        return jsonify({"error": f"Node '{node_id}' not found"}), 404
    return jsonify(node.to_dict()), 200


@nodes_bp.route("/api/nodes", methods=['POST'])
def deploy_node():
    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    missing = [f for f in ['node_id', 'lat', 'lon'] if data.get(f) is None or str(data.get(f)).strip() == ""]
    if missing:
        return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

    if Node.query.get(data['node_id']):
        return jsonify({"error": f"Node '{data['node_id']}' already exists"}), 409

    try:
        node = Node(
            node_id=data['node_id'],
            node_name=data.get('name', data['node_id']) or data['node_id'],
            latitude=float(data['lat']),
            longitude=float(data['lon']),
            status='online'
        )
        db.session.add(node)
        db.session.commit()
        return jsonify(node.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@nodes_bp.route("/api/nodes/<string:node_id>", methods=['PUT'])
def update_node(node_id):
    node = Node.query.get(node_id)
    if not node:
        return jsonify({"error": f"Node '{node_id}' not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    try:
        if 'name'    in data: node.node_name = data['name']
        if 'lat'     in data: node.latitude  = float(data['lat'])
        if 'lon'     in data: node.longitude = float(data['lon'])
        db.session.commit()
        return jsonify(node.to_dict()), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@nodes_bp.route("/api/nodes/<string:node_id>", methods=['DELETE'])
def decommission_node(node_id):
    node = Node.query.get(node_id)
    if not node:
        return jsonify({"error": f"Node '{node_id}' not found"}), 404
    try:
        db.session.delete(node)
        db.session.commit()
        return jsonify({"message": f"Node '{node_id}' decommissioned"}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500


@nodes_bp.route("/api/nodes/<string:node_id>/telemetry", methods=['POST'])
def log_telemetry(node_id):
    node = Node.query.get(node_id)
    if not node:
        return jsonify({"error": f"Node '{node_id}' not found"}), 404

    data = request.get_json(silent=True)
    if not data:
        return jsonify({"error": "Request body must be JSON"}), 400

    try:
        batt = data.get('battery')
        if batt is None:
            node.status = 'offline'
        else:
            if 'status' in data: 
                node.status = data['status']

        # Create a new historical telemetry record
        telemetry = NodeTelemetry(
            node_id=node_id,
            temperature=data.get('temperature'),
            humidity=data.get('humidity'),
            pressure=data.get('pressure'),
            aqi=data.get('aqi'),
            rain_intensity=data.get('rain_intensity'),
            wind_speed=data.get('wind_speed'),
            wind_direction=data.get('wind_direction'),
            battery=batt,
            timestamp=data.get('timestamp')
        )
        db.session.add(telemetry)
        db.session.commit()
        node_data = node.to_dict()
        return jsonify({
            "status": node.status,
            "node_id": node_id,
            "telemetry": node_data.get("telemetry")
        }), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({"error": str(e)}), 500