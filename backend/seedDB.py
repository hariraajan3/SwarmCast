import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app import create_app
from models import db

def reset_db():
    app = create_app()
    with app.app_context():
        print("Resetting database: Dropping and recreating all tables...")
        db.drop_all()
        db.create_all()
        print("Done: Database is now empty and ready for use.")

if __name__ == "__main__":
    reset_db()