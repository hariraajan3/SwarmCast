from flask_sqlalchemy import SQLAlchemy
from datetime import datetime

db = SQLAlchemy()

class Node(db.Model):
    __tablename__ = 'node'

    node_id   = db.Column(db.String(50), primary_key=True)
    node_name = db.Column(db.String(100), nullable=False)
    latitude  = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    status    = db.Column(db.String(20), default='online')
    created_at = db.Column(db.DateTime, default=datetime.now)

    telemetry_history = db.relationship('NodeTelemetry', backref='node', lazy=True,
                                       cascade='all, delete-orphan')

    def to_dict(self):
        latest = NodeTelemetry.query.filter_by(node_id=self.node_id).order_by(NodeTelemetry.timestamp.desc()).first()
        
        return {
            "node_id":       self.node_id,
            "name":          self.node_name,
            "lat":           self.latitude,
            "lon":           self.longitude,
            "status":        self.status,
            "created_at":    self.created_at.isoformat() ,
            "telemetry":     latest.to_dict() if latest else None
        }

    def __repr__(self):
        return f"<Node {self.node_id}>"


class NodeTelemetry(db.Model):
    __tablename__ = 'node_telemetry'

    id        = db.Column(db.Integer, primary_key=True)
    node_id   = db.Column(db.String(50), db.ForeignKey('node.node_id', ondelete='CASCADE'),
                          nullable=False)
    temperature    = db.Column(db.Float)
    humidity       = db.Column(db.Float)
    pressure       = db.Column(db.Float)
    aqi            = db.Column(db.Integer)
    rain_intensity = db.Column(db.Float)
    wind_speed     = db.Column(db.Float)
    wind_direction = db.Column(db.String(5))
    battery        = db.Column(db.Integer)
    timestamp      = db.Column(db.DateTime, default=datetime.now)

    def to_dict(self):
        return {
            "temperature":    self.temperature,
            "humidity":       self.humidity,
            "pressure":       self.pressure,
            "aqi":            self.aqi,
            "rain_intensity": self.rain_intensity,
            "wind_speed":     self.wind_speed,
            "wind_direction": self.wind_direction,
            "battery":        self.battery,
            "timestamp":      self.timestamp.isoformat()
        }