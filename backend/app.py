from flask import Flask, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow frontend to connect

@app.route('/')
def home():
    return "Backend Running!"

@app.route('/nodes')
def get_nodes():
    return jsonify([
        {
            "node_id": "N01",
            "lat": 12.97,
            "lon": 77.59,
            "temperature": 30
        }
    ])

if __name__ == '__main__':
    app.run()