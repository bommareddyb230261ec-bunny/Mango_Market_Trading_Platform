"""
Audit logging utility for Mango Market Platform.
Logs key actions to a database table for traceability.
"""
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class AuditLog(db.Model):
    __tablename__ = 'audit_logs'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, nullable=True)
    action = db.Column(db.String(100), nullable=False)
    details = db.Column(db.Text, nullable=True)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow)

    def __init__(self, user_id, action, details=None):
        self.user_id = user_id
        self.action = action
        self.details = details
        self.timestamp = datetime.utcnow()

def log_audit(user_id, action, details=None):
    # Import main.db lazily and robustly to avoid circular import issues
    try:
        from main import db  # Use main app's db
    except Exception:
        from backend.main import db

    entry = AuditLog(user_id=user_id, action=action, details=details)
    try:
        db.session.add(entry)
        db.session.commit()
    except Exception:
        # Non-fatal: if logging fails, avoid crashing the calling flow
        try:
            db.session.rollback()
        except Exception:
            pass
