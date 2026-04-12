from flask import Flask, jsonify
from flask_cors import CORS
from dotenv import load_dotenv
import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from models import db
from routes.nodeRoutes import nodes_bp

load_dotenv()

def create_app():
    app = Flask(__name__)
    CORS(app)

    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set in .env")

    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

    db.init_app(app)
    app.register_blueprint(nodes_bp)

    with app.app_context():
        db.create_all()

    @app.route("/")
    def index():
        return jsonify({"message": "SwarmCast backend is running"})

    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Route not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error"}), 500

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(debug=True, port=5000)