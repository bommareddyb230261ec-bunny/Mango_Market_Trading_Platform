"""
Mango Market Platform Backend
Main Flask application (Consolidated)
"""

# =====================================================
# STANDARD LIBRARY
# =====================================================
import os
import logging
from datetime import datetime, timezone, date
from typing import Optional, Any, cast, List, Dict, Union, Tuple
from dotenv import load_dotenv

# Load .env early so environment variables are available for Config
load_dotenv()

# =====================================================
# FLASK CORE
# =====================================================
from flask import Flask, session, Blueprint, request, jsonify, current_app, send_from_directory
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy

# =====================================================
# SQLALCHEMY
# =====================================================
from sqlalchemy import text, asc, desc, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool, QueuePool

# Use centralized DB URL builder. Try package import first, fall back to local module when
# running scripts where the project root isn't on sys.path.
try:
    from backend.db_config import get_database_url
except Exception:
    from db_config import get_database_url

# =====================================================
# SECURITY & UTILS
# =====================================================
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.utils import secure_filename
from itsdangerous import URLSafeTimedSerializer

# =====================================================
# OPTIONAL PACKAGE-SAFE IMPORTS
# =====================================================
try:
    from backend.notification_utils import send_notification
    from backend.encryption_utils import encrypt_value, decrypt_value, safe_decrypt
    from backend.audit_utils import log_audit
except Exception:
    from notification_utils import send_notification
    from encryption_utils import encrypt_value, decrypt_value, safe_decrypt
    from audit_utils import log_audit

# =====================================================
# ROUTES IMPORTS
# =====================================================
# NOTE: Blueprint imports moved inside create_app() to avoid circular dependencies
# This must happen AFTER db is initialized
host_bp = None



"""MANGO MARKET PLATFORM - CONSOLIDATED MAIN FILE
This file contains all application logic including:
- Configuration
- Database Models
- Routes & Blueprints
- Security utilities
"""

# Pyright settings: reduce false-positive diagnostics for dynamic SQLAlchemy models
# (these toggle a subset of checks that commonly flag SQLAlchemy declarative patterns)
# pyright: reportUnknownMemberType=false, reportUnknownVariableType=false, reportGeneralTypeIssues=false


def _desc(col: Any):
    """Return a typed desc() wrapper to satisfy static analyzers"""
    return desc(col)


def _asc(col: Any):
    """Return a typed asc() wrapper to satisfy static analyzers"""
    return asc(col)


# =====================================================
# RESPONSE FORMATTERS (standardized JSON responses)
# =====================================================

def success_response(message: str = "", data: Optional[Dict[str, Any]] = None, status: int = 200) -> tuple:
    """Return standardized success response"""
    response = {
        'success': True,
        'message': message or 'Operation successful'
    }
    if data is not None:
        response['data'] = data
    return jsonify(response), status


def error_response(message: str, status: int = 400, error_code: Optional[str] = None) -> tuple:
    """Return standardized error response"""
    response = {
        'success': False,
        'message': message or 'An error occurred'
    }
    if error_code:
        response['error_code'] = error_code
    return jsonify(response), status

# =====================================================
# DATABASE INITIALIZATION
# =====================================================
# DATABASE INITIALIZATION
# =====================================================
db = SQLAlchemy()

# =====================================================
# CONFIGURATION
# =====================================================
class Config:
    """
    Application configuration - UPDATED FOR MYSQL
    Uses environment variables from .env for secure credential management.
    For reference, see db_config.py for detailed MySQL configuration options.
    """
    SECRET_KEY = os.environ.get('SECRET_KEY', 'mango_market_secure_key_2026')
    
    # MySQL Database Configuration (from environment or .env)
    # Uses centralized builder in backend/db_config.get_database_url()
    SQLALCHEMY_DATABASE_URI = get_database_url()
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # MySQL connection pool configuration
    SQLALCHEMY_ENGINE_OPTIONS: dict[str, Any] = {
        'poolclass': QueuePool,    # Use QueuePool for MySQL (thread-safe)
        'pool_size': 10,           # Number of persistent connections
        'max_overflow': 20,        # Maximum overflow connections
        'pool_pre_ping': True,     # Verify connections before using
        'pool_recycle': 3600,      # Recycle connections after 1 hour (MySQL timeout)
        'connect_args': {
            'charset': 'utf8mb4',  # UTF-8 support for multi-byte characters
            'connect_timeout': 10,  # Connection timeout in seconds
        },
        'echo': False,             # Set to True for SQL debugging
    }


    # Debug helper: print DB connection info (without password)
    def _print_db_debug():
        try:
            db_user = os.getenv('DB_USER', 'root')
            db_host = os.getenv('DB_HOST', 'localhost')
            db_port = os.getenv('DB_PORT', '3306')
            db_name = os.getenv('DB_NAME', 'mango_market_db')
            driver = os.getenv('DB_DRIVER', 'pymysql')

            masked = f"{db_user}@{db_host}:{db_port}/{db_name} (driver={driver})"
            print(f"[DB DEBUG] Connecting to: {masked}")

            if not os.getenv('DB_PASSWORD'):
                print("[DB WARNING] DB_PASSWORD is empty. Connection will attempt without password.")
        except Exception:
            pass


    _print_db_debug()


# =====================================================
# MODELS
# =====================================================

# ==================== USER MODEL ====================
class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20), unique=True, nullable=False, index=True)
    email = db.Column(db.String(120), nullable=True)  # Removed unique constraint
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), nullable=False)  # "FARMER" or "BROKER"
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __init__(self, name: str, phone: str, email: Optional[str], password_hash: str, role: str, created_at: Optional[datetime] = None):
        """Explicit constructor used to help static type checkers (Pylance) and for clarity."""
        self.name = name
        self.phone = phone
        self.email = email
        self.password_hash = password_hash
        self.role = role
        if created_at:
            self.created_at = created_at


# ==================== PLACE MODEL ====================
class Place(db.Model):
    __tablename__ = 'places'

    id = db.Column(db.Integer, primary_key=True)
    state = db.Column(db.String(100), nullable=False)
    district = db.Column(db.String(100), nullable=False)
    market_area = db.Column(db.String(100), nullable=False)  # Also used for 'city' in broker context

    def __init__(self, state: str, district: str, market_area: str):
        self.state = state
        self.district = district
        self.market_area = market_area


# ==================== FARMER MODEL ====================
class Farmer(db.Model):
    __tablename__ = 'farmers'

    id = db.Column(db.Integer, primary_key=True)

    # Foreign Keys
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    # Allow farmer to be created without a place initially (can be set later)
    place_id = db.Column(db.Integer, db.ForeignKey('places.id'), nullable=True)

    # Banking Details (use TEXT to accommodate encrypted values)
    bank_account_number = db.Column(db.Text, nullable=True)
    ifsc_code = db.Column(db.Text, nullable=True)
    upi_id = db.Column(db.Text, nullable=True)
    # Additional bank metadata
    account_holder_name = db.Column(db.Text, nullable=True)
    bank_name = db.Column(db.Text, nullable=True)
    branch_name = db.Column(db.Text, nullable=True)
    # Free-form address (optional)
    address = db.Column(db.String(255), nullable=True)
    
    @property
    def decrypted_bank_account_number(self):
        return safe_decrypt(self.bank_account_number) if self.bank_account_number else None
    
    @property
    def decrypted_ifsc_code(self):
        return safe_decrypt(self.ifsc_code) if self.ifsc_code else None
    
    @property
    def decrypted_upi_id(self):
        return safe_decrypt(self.upi_id) if self.upi_id else None

    @property
    def decrypted_account_holder(self):
        return safe_decrypt(self.account_holder_name) if self.account_holder_name else None

    @property
    def decrypted_bank_name(self):
        return safe_decrypt(self.bank_name) if self.bank_name else None

    @property
    def decrypted_branch_name(self):
        return safe_decrypt(self.branch_name) if self.branch_name else None
    
    def set_bank_details(self, account_number: Optional[str], ifsc: Optional[str], upi: Optional[str], account_holder: Optional[str] = None, bank_name: Optional[str] = None, branch_name: Optional[str] = None) -> None:
        if account_number:
            self.bank_account_number = encrypt_value(str(account_number))
        if ifsc:
            self.ifsc_code = encrypt_value(str(ifsc))
        if upi:
            self.upi_id = encrypt_value(str(upi))
        if account_holder:
            self.account_holder_name = encrypt_value(str(account_holder))
        if bank_name:
            self.bank_name = encrypt_value(str(bank_name))
        if branch_name:
            self.branch_name = encrypt_value(str(branch_name))

    # Relationships
    user = db.relationship('User', backref=db.backref('farmer_profile', uselist=False))
    place = db.relationship('Place', backref='farmers')
    requests = db.relationship('SellRequest', backref='farmer', lazy=True)

    def __init__(self, user_id: int, place_id: Optional[int] = None, bank_account_number: Optional[str] = None, ifsc_code: Optional[str] = None, upi_id: Optional[str] = None, account_holder_name: Optional[str] = None, bank_name: Optional[str] = None, branch_name: Optional[str] = None):
        self.user_id = user_id
        self.place_id = place_id
        # Encrypt bank details when provided
        self.bank_account_number = encrypt_value(bank_account_number) if bank_account_number else None
        self.ifsc_code = encrypt_value(ifsc_code) if ifsc_code else None
        self.upi_id = encrypt_value(upi_id) if upi_id else None
        self.account_holder_name = encrypt_value(account_holder_name) if account_holder_name else None
        self.bank_name = encrypt_value(bank_name) if bank_name else None
        self.branch_name = encrypt_value(branch_name) if branch_name else None

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'user_id': self.user_id,
            'place_id': self.place_id,
            'bank_account': self.decrypted_bank_account_number,
            'ifsc': self.decrypted_ifsc_code,
            'upi': self.decrypted_upi_id,
            'account_holder': self.decrypted_account_holder,
            'bank_name': self.decrypted_bank_name,
            'branch_name': self.decrypted_branch_name,
            'address': self.address
        }


# ==================== BROKER MODEL ====================
class Broker(db.Model):
    __tablename__ = 'brokers'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    place_id = db.Column(db.Integer, db.ForeignKey('places.id'), nullable=False)
    market_name = db.Column(db.String(150), nullable=False)
    platform_fee_paid = db.Column(db.Boolean, default=False)
    registration_date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    
    # Trade License Verification Fields
    trade_license = db.Column(db.String(255), nullable=True)
    verification_status = db.Column(db.String(20), default="PENDING")
    rejection_reason = db.Column(db.String(255), nullable=True)

    user = db.relationship('User', backref=db.backref('broker_profile', uselist=False))
    place = db.relationship('Place', backref='brokers')

    def __init__(self, user_id: int, place_id: int, market_name: str, platform_fee_paid: bool = False, registration_date: Optional[datetime] = None, trade_license: Optional[str] = None, verification_status: str = "PENDING", rejection_reason: Optional[str] = None):
        self.user_id = user_id
        self.place_id = place_id
        self.market_name = market_name
        self.platform_fee_paid = platform_fee_paid
        if registration_date:
            self.registration_date = registration_date
        self.trade_license = trade_license
        self.verification_status = verification_status
        self.rejection_reason = rejection_reason


# ==================== MARKET PRICE MODEL ====================
class MarketPrice(db.Model):
    __tablename__ = 'market_prices'
    
    id = db.Column(db.Integer, primary_key=True)
    broker_id = db.Column(db.Integer, db.ForeignKey('brokers.id'), nullable=False)
    mango_variety = db.Column(db.String(50), nullable=False)
    price_per_kg = db.Column(db.Float, nullable=False)
    available_quantity = db.Column(db.Float, nullable=False) # in Tons
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationship to Broker
    broker = db.relationship('Broker', backref='market_prices')

    def __init__(self, broker_id: int, mango_variety: str, price_per_kg: float, available_quantity: float, updated_at: Optional[datetime] = None):
        self.broker_id = broker_id
        self.mango_variety = mango_variety
        self.price_per_kg = price_per_kg
        self.available_quantity = available_quantity
        if updated_at:
            self.updated_at = updated_at


# ==================== SELL REQUEST MODEL ====================
class SellRequest(db.Model):
    __tablename__ = 'sell_requests'

    id = db.Column(db.Integer, primary_key=True)

    farmer_id = db.Column(db.Integer, db.ForeignKey('farmers.id'), nullable=False)
    broker_id = db.Column(db.Integer, db.ForeignKey('brokers.id'), nullable=False)

    # Request Details (support both old and new naming conventions)
    quantity_tons = db.Column(db.Float, nullable=False)  # Estimated quantity in Tons
    variety = db.Column(db.String(50), nullable=False)  # Crop variety
    preferred_date = db.Column(db.Date, nullable=False)

    # Pre-Weighment / Order fields
    order_id = db.Column(db.String(100), unique=True, nullable=True)
    expected_delivery_date = db.Column(db.Date, nullable=True)
    agreed_price = db.Column(db.Float, nullable=True)  # price per kg at acceptance
    # Price captured at the time the farmer submitted the sell request (per kg)
    price_at_request = db.Column(db.Float, nullable=True)
    price_locked = db.Column(db.Boolean, default=False, nullable=False)

    # Status
    status = db.Column(db.String(20), default='PENDING')  # PENDING, ACCEPTED, REJECTED
    rejection_reason = db.Column(db.String(255), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    broker = db.relationship('Broker', backref='sell_requests')
    # One-to-One Transaction
    transaction = db.relationship('Transaction', backref='sell_request', uselist=False)

    def __init__(self, farmer_id: int, broker_id: int, quantity_tons: float, variety: str, preferred_date: date, order_id: Optional[str] = None, expected_delivery_date: Optional[date] = None, agreed_price: Optional[float] = None, price_at_request: Optional[float] = None, price_locked: bool = False, status: str = 'PENDING'):
        self.farmer_id = farmer_id
        self.broker_id = broker_id
        self.quantity_tons = quantity_tons
        self.variety = variety
        self.preferred_date = preferred_date
        self.order_id = order_id
        self.expected_delivery_date = expected_delivery_date
        self.agreed_price = agreed_price
        self.price_at_request = price_at_request
        self.price_locked = price_locked
        self.status = status

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'farmer_id': self.farmer_id,
            'broker_id': self.broker_id,
            'quantity_tons': self.quantity_tons,
            'variety': self.variety,
            'preferred_date': self.preferred_date.strftime('%Y-%m-%d') if self.preferred_date else None,
            'order_id': self.order_id,
            'expected_delivery_date': self.expected_delivery_date.strftime('%Y-%m-%d') if self.expected_delivery_date else None,
            'agreed_price': float(self.agreed_price) if self.agreed_price is not None else None,
            'price_at_request': float(self.price_at_request) if self.price_at_request is not None else None,
            'price_locked': bool(self.price_locked),
            'status': self.status,
            'rejection_reason': self.rejection_reason,
            'transaction': self.transaction.to_dict() if self.transaction else None
        }


# ==================== TRANSACTION MODEL ====================
class Transaction(db.Model):
    __tablename__ = 'transactions'

    id = db.Column(db.Integer, primary_key=True)

    request_id = db.Column(
        db.Integer,
        db.ForeignKey('sell_requests.id'),
        unique=True,
        nullable=False
    )

    # Financial Details
    market_price_at_sale = db.Column(db.Float, nullable=False)
    actual_weight = db.Column(db.Float, nullable=False)
    total_cost = db.Column(db.Float, nullable=False)
    commission = db.Column(db.Float, nullable=False)
    net_payable = db.Column(db.Float, nullable=False)

    # Payment Status
    payment_status = db.Column(db.String(20), default='PENDING')  # PENDING, PAID
    transaction_date = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __init__(self, request_id: int, market_price_at_sale: float, actual_weight: float, total_cost: float, commission: float, net_payable: float, payment_status: str = 'PENDING', transaction_date: Optional[datetime] = None):
        self.request_id = request_id
        self.market_price_at_sale = market_price_at_sale
        self.actual_weight = actual_weight
        self.total_cost = total_cost
        self.commission = commission
        self.net_payable = net_payable
        self.payment_status = payment_status
        if transaction_date:
            self.transaction_date = transaction_date

    def to_dict(self) -> dict[str, Any]:
        return {
            'market_price': self.market_price_at_sale,
            'actual_weight': self.actual_weight,
            'total_cost': self.total_cost,
            'commission': self.commission,
            'net_payable': self.net_payable,
            'payment_status': self.payment_status,
            # Backwards-compatible alias used by some frontends
            'status': self.payment_status,
            'transaction_date': self.transaction_date.strftime('%Y-%m-%d %H:%M:%S')
        }


# ==================== WEIGHMENT MODEL ====================
class Weighment(db.Model):
    __tablename__ = 'weighments'

    id = db.Column(db.Integer, primary_key=True)
    broker_id = db.Column(db.Integer, db.ForeignKey('brokers.id'), nullable=False)
    sell_request_id = db.Column(db.Integer, db.ForeignKey('sell_requests.id'), nullable=True)
    farmer_id = db.Column(db.Integer, db.ForeignKey('farmers.id'), nullable=True)
    farmer_name = db.Column(db.String(120), nullable=True)
    order_id = db.Column(db.String(100), nullable=True, index=True)

    mango_variety = db.Column(db.String(50), nullable=True)
    weighment_date = db.Column(db.Date, nullable=False)
    actual_weight_tons = db.Column(db.Float, nullable=False)
    quality_grade = db.Column(db.String(20), nullable=True)
    final_price_per_kg = db.Column(db.Float, nullable=False)
    remarks = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    broker = db.relationship('Broker', backref='weighments')
    sell_request = db.relationship('SellRequest', backref='weighments')

    def __init__(self, broker_id: int, sell_request_id: Optional[int], farmer_id: Optional[int], farmer_name: Optional[str], order_id: Optional[str], mango_variety: Optional[str], weighment_date: date, actual_weight_tons: float, quality_grade: Optional[str], final_price_per_kg: float, remarks: Optional[str] = None, created_at: Optional[datetime] = None):
        self.broker_id = broker_id
        self.sell_request_id = sell_request_id
        self.farmer_id = farmer_id
        self.farmer_name = farmer_name
        self.order_id = order_id
        self.mango_variety = mango_variety
        self.weighment_date = weighment_date
        self.actual_weight_tons = actual_weight_tons
        self.quality_grade = quality_grade
        self.final_price_per_kg = final_price_per_kg
        self.remarks = remarks
        if created_at:
            self.created_at = created_at

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'broker_id': self.broker_id,
            'sell_request_id': self.sell_request_id,
            'farmer_id': self.farmer_id,
            'farmer_name': self.farmer_name,
            'order_id': self.order_id,
            'mango_variety': self.mango_variety,
            'weighment_date': self.weighment_date.isoformat() if self.weighment_date else None,
            'actual_weight_tons': self.actual_weight_tons,
            'quality_grade': self.quality_grade,
            'final_price_per_kg': float(self.final_price_per_kg),
            'remarks': self.remarks,
            'created_at': self.created_at.isoformat()
        }


# ==================== FARMER ORDER MAPPING MODEL ====================
class FarmerOrder(db.Model):
    __tablename__ = 'farmer_orders'

    id = db.Column(db.Integer, primary_key=True)
    farmer_id = db.Column(db.Integer, db.ForeignKey('farmers.id'), nullable=True)
    farmer_name = db.Column(db.String(120), nullable=False, index=True)
    order_id = db.Column(db.String(100), nullable=False, unique=True, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __init__(self, farmer_id: Optional[int], farmer_name: str, order_id: str, created_at: Optional[datetime] = None):
        self.farmer_id = farmer_id
        self.farmer_name = farmer_name
        self.order_id = order_id
        if created_at:
            self.created_at = created_at

    def to_dict(self) -> dict[str, Any]:
        return {
            'id': self.id,
            'farmer_id': self.farmer_id,
            'farmer_name': self.farmer_name,
            'order_id': self.order_id,
            'created_at': self.created_at.isoformat()
        }

# Helper: Ensure new SellRequest columns exist (safe SQLite ALTER TABLE for dev)
def ensure_sell_request_columns(engine: Any):
    """
    Adds new columns to 'sell_requests' table if they're missing (idempotent).
    This keeps local development DBs backward-compatible without migrations.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info('sell_requests')"))
            cols = [r[1] for r in result]

            # Column additions if missing
            if 'order_id' not in cols:
                conn.execute(text("ALTER TABLE sell_requests ADD COLUMN order_id TEXT"))
            if 'expected_delivery_date' not in cols:
                conn.execute(text("ALTER TABLE sell_requests ADD COLUMN expected_delivery_date DATE"))
            if 'agreed_price' not in cols:
                conn.execute(text("ALTER TABLE sell_requests ADD COLUMN agreed_price FLOAT"))
            if 'price_at_request' not in cols:
                conn.execute(text("ALTER TABLE sell_requests ADD COLUMN price_at_request FLOAT"))
            if 'price_locked' not in cols:
                conn.execute(text("ALTER TABLE sell_requests ADD COLUMN price_locked BOOLEAN DEFAULT 0"))
    except Exception as e:
        # Fail gracefully in production; developer can remove DB to apply schema.
        print('Schema check warning (non-fatal):', str(e))


def ensure_farmer_columns(engine: Any):
    """
    Ensure optional columns exist on `farmers` table (idempotent).
    Adds `address` column when missing for profile storage.
    """
    try:
        with engine.connect() as conn:
            dialect = engine.dialect.name.lower()

            if dialect == 'sqlite':
                result = conn.execute(text("PRAGMA table_info('farmers')"))
                cols = [r[1] for r in result]
                if 'address' not in cols:
                    conn.execute(text("ALTER TABLE farmers ADD COLUMN address TEXT"))
                if 'account_holder_name' not in cols:
                    conn.execute(text("ALTER TABLE farmers ADD COLUMN account_holder_name TEXT"))
                if 'bank_name' not in cols:
                    conn.execute(text("ALTER TABLE farmers ADD COLUMN bank_name TEXT"))
                if 'branch_name' not in cols:
                    conn.execute(text("ALTER TABLE farmers ADD COLUMN branch_name TEXT"))

            elif dialect in ('mysql', 'mariadb'):
                # For MySQL, ensure optional columns exist and have sufficient type (TEXT)
                # Add columns if missing, or alter them to TEXT if they are too small
                result = conn.execute(text("SHOW COLUMNS FROM farmers"))
                cols = {r[0]: r[1] for r in result}

                # Add missing columns as TEXT
                for col in ("address", "account_holder_name", "bank_name", "branch_name", "bank_account_number", "ifsc_code", "upi_id"):
                    if col not in cols:
                        conn.execute(text(f"ALTER TABLE farmers ADD COLUMN {col} TEXT"))

                # Ensure sensitive/encrypted fields use TEXT (to accommodate encryption length)
                for col in ("bank_account_number", "ifsc_code", "upi_id", "account_holder_name", "bank_name", "branch_name"):
                    try:
                        # MODIFY COLUMN to TEXT (keeps NULL/NOT NULL as-is)
                        conn.execute(text(f"ALTER TABLE farmers MODIFY COLUMN {col} TEXT"))
                    except Exception:
                        # Ignore errors (permission/unsupported) - best-effort
                        pass

            else:
                # Unknown dialect - attempt SQLite approach as best-effort
                try:
                    result = conn.execute(text("PRAGMA table_info('farmers')"))
                    cols = [r[1] for r in result]
                    if 'address' not in cols:
                        conn.execute(text("ALTER TABLE farmers ADD COLUMN address TEXT"))
                except Exception:
                    pass
    except Exception as e:
        print('Farmer schema check warning (non-fatal):', str(e))


def ensure_broker_columns(engine: Any):
    """
    Ensure optional columns exist on `brokers` table for verification system (idempotent).
    Adds trade_license, verification_status, and rejection_reason columns when missing.
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("PRAGMA table_info('brokers')"))
            cols = [r[1] for r in result]
            if 'trade_license' not in cols:
                conn.execute(text("ALTER TABLE brokers ADD COLUMN trade_license TEXT"))
            if 'verification_status' not in cols:
                conn.execute(text("ALTER TABLE brokers ADD COLUMN verification_status VARCHAR(20) DEFAULT 'PENDING'"))
            if 'rejection_reason' not in cols:
                conn.execute(text("ALTER TABLE brokers ADD COLUMN rejection_reason TEXT"))
    except Exception as e:
        print('Broker schema check warning (non-fatal):', str(e))

# =====================================================
# SECURITY UTILITIES
# =====================================================

def validate_password(password: str) -> tuple[bool, str]:
    """
    Validates password meets requirements.
    Passwords can contain any combination of:
    - Alphabets (a-z, A-Z)
    - Numbers (0-9)
    - Symbols (!@#$%^&*_-+=)
    
    Returns: (is_valid: bool, error_message: str)
    """
    if not password:
        return False, "Password is required"
    
    if len(password) < 6:
        return False, "Password must be at least 6 characters long"
    
    if len(password) > 255:
        return False, "Password must be less than 255 characters"
    
    # Password is valid - accepts any character combination
    return True, ""


def hash_password(password: str) -> str:
    """
    Hash password using werkzeug.security (industry-standard)
    Supports all character types: letters, numbers, symbols
    """
    return generate_password_hash(password)

def verify_password(hash: str, password: str) -> bool:
    """
    Verify password against hash.
    Supports all character types: letters, numbers, symbols
    """
    return check_password_hash(hash, password)


# =====================================================
# SESSION TOKEN UTILITIES (development-friendly fallback)
# Allows short-lived token auth when cookies are not available
# =====================================================

def _get_serializer():
    return URLSafeTimedSerializer(Config.SECRET_KEY)


def generate_session_token(user_id: int) -> str:
    s = _get_serializer()
    return s.dumps({'user_id': user_id})


def verify_session_token(token: str, max_age: int = 3600) -> Optional[int]:
    s = _get_serializer()
    try:
        data = s.loads(token, max_age=max_age)
        return data.get('user_id')
    except Exception:
        return None


# =====================================================
# BLUEPRINTS - AUTHENTICATION ROUTES
# =====================================================

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/check-email', methods=['GET'])
def check_email():
    """Check if email is already registered"""
    email = request.args.get('email', '').strip()
    if not email:
        return jsonify({'available': True}), 200
    
    # email parameter already validated as non-empty; simple equality check is sufficient
    existing = User.query.filter_by(email=email).first()
    
    return jsonify({'available': existing is None}), 200

@auth_bp.route('/check-phone', methods=['GET'])
def check_phone():
    """Check if phone is already registered"""
    phone = request.args.get('phone', '').strip()
    if not phone:
        return jsonify({'available': True}), 200
    
    existing = User.query.filter_by(phone=phone).first()
    return jsonify({'available': existing is None}), 200

@auth_bp.route('/register', methods=['POST'])
def register():
    try:
        # Determine content type and parse accordingly - AVOID calling get_json() on multipart
        content_type = request.content_type or ''
        
        if 'multipart/form-data' in content_type or 'application/x-www-form-urlencoded' in content_type:
            # Multipart form data (with file upload) OR form-encoded data
            # DO NOT call request.get_json() here - causes 415 error
            data = {
                'full_name': request.form.get('full_name', '').strip(),
                'phone': request.form.get('phone', '').strip(),
                'email': request.form.get('email', '').strip(),
                'password': request.form.get('password', '').strip(),
                'confirm_password': request.form.get('confirm_password', '').strip(),
                'state': request.form.get('state', '').strip(),
                'district': request.form.get('district', '').strip(),
                'market_name': request.form.get('market_name', '').strip(),
                'city': request.form.get('city', '').strip(),
                'address': request.form.get('address', '').strip(),
                'role': request.form.get('role', '').strip(),
                'platform_fee_paid': request.form.get('platform_fee_paid', 'false').lower() in ['true', 'on', 'yes', '1'],
                'upi_id': request.form.get('upi_id', '').strip(),
                'bank_account': request.form.get('bank_account', '').strip(),
                'ifsc': request.form.get('ifsc', '').strip(),
                'account_holder': request.form.get('account_holder', '').strip(),
                'bank_name': request.form.get('bank_name', '').strip(),
                'branch_name': request.form.get('branch_name', '').strip(),
                'market_area': request.form.get('market_area', '').strip(),
            }
            print(f"[OK] Parsed multipart/form-data request")
        elif 'application/json' in content_type or request.is_json:
            # Standard JSON registration (farmers)
            data = request.get_json(force=False)
            if not data:
                data = {}
            print(f"[OK] Parsed JSON request")
        else:
            print(f"ERROR: Unsupported content type: {content_type}")
            return jsonify({'message': f'Unsupported content type: {content_type}. Use application/json or multipart/form-data'}), 415
        
        # Use logging; avoid printing raw request or sensitive fields (passwords)
        import logging
        logging.debug("Registration request received")
        
        if not data:
            logging.debug("Registration: no input data provided")
            return jsonify({'message': 'No input data provided'}), 400


        role = data.get('role', '').upper()
        logging.debug("Registration role: %s", role)
        
        if role not in ['FARMER', 'BROKER']:
            logging.debug("Registration: invalid role '%s'", role)
            return jsonify({'message': 'Invalid role. Must be FARMER or BROKER'}), 400

        # 1. Validate Common Fields
        common_fields = ['full_name', 'phone', 'password', 'state', 'district']
        missing = [f for f in common_fields if not data.get(f)]
        if missing:
            logging.debug("Registration: missing fields: %s", missing)
            return jsonify({'message': f"Missing fields: {', '.join(missing)}"}), 400

        # 2. Clean and validate data
        full_name = data.get('full_name', '').strip()
        phone = data.get('phone', '').strip()
        email = data.get('email', '').strip() if data.get('email') else None
        password = data.get('password', '').strip()
        state = data.get('state', '').strip()
        district = data.get('district', '').strip()
        
        logging.debug("Registration cleaned data: full_name=%s, phone=%s, email=%s, state=%s, district=%s", full_name, phone, email, state, district)

        # Validate required fields are not empty
        if not all([full_name, phone, password, state, district]):
            print(f"ERROR: Some required fields are empty")
            return jsonify({'message': 'All required fields must be filled'}), 400

        # Validate password (accepts any character combination: letters, numbers, symbols)
        is_valid_password, password_error = validate_password(password)
        if not is_valid_password:
            print(f"ERROR: Invalid password - {password_error}")
            return jsonify({'message': password_error}), 400

        print("[OK] Password validation passed - accepts all character types (letters, numbers, symbols)")

        # 3. Check if phone already exists
        print(f"\nChecking if phone '{phone}' exists...")
        existing_phone = User.query.filter_by(phone=phone).first()
        if existing_phone:
            print(f"ERROR: Phone {phone} already registered (User ID: {existing_phone.id})")
            return jsonify({'message': f'Phone number {phone} is already registered'}), 409

        # 4. Check if email already exists (if provided)
        if email:
            print(f"Checking if email '{email}' exists...")
            # Given 'email' is non-empty, use filter_by for simpler static typing
            existing_email = User.query.filter_by(email=email).first()
            if existing_email:
                print(f"ERROR: Email {email} already registered (User ID: {existing_email.id})")
                return jsonify({'message': f'Email {email} is already registered'}), 409
        
        # 4b. If an email is provided, ensure it has been OTP-verified. (Allows phone-only registration when no email supplied.)
        # Note: OTP verification remains optional if user doesn't provide an email, but when an email is present it MUST be verified.
        if email and not session.get(f"verified_{email}"):
            return jsonify({'message': 'Email not verified. Please verify OTP first.'}), 400

        print("[OK] Phone and Email validation passed")

        # 5. Create User
        print(f"\nCreating new user...")
        new_user = User(
            name=full_name,
            phone=phone,
            email=email,
            password_hash=generate_password_hash(password),
            role=role
        )
        db.session.add(new_user)
        db.session.flush()
        print(f"[OK] User created with ID: {new_user.id}")

        # 6. Handle Location (Place)
        location_name = data.get('market_area', '').strip() if role == 'FARMER' else data.get('city', '').strip()
        print(f"\nLocation name for {role}: '{location_name}'")
        
        if not location_name:
            print(f"ERROR: Location/Market Area is required for {role}")
            db.session.rollback()
            return jsonify({'message': 'Market Area/City is required'}), 400

        place = Place.query.filter_by(
            state=state,
            district=district,
            market_area=location_name
        ).first()

        if not place:
            print(f"Creating new place...")
            place = Place(
                state=state,
                district=district,
                market_area=location_name
            )
            db.session.add(place)
            db.session.flush()
            print(f"[OK] Place created with ID: {place.id}")
        else:
            print(f"[OK] Using existing place ID: {place.id}")

        # 7. Role Specific Data
        if role == 'FARMER':
            print(f"\nCreating Farmer profile...")
            # Capture address from registration form
            address = (data.get('address') or '').strip()
            bank_account = data.get('bank_account', '').strip()
            ifsc = data.get('ifsc', '').strip()
            upi_id = data.get('upi_id', '').strip() if data.get('upi_id') else None
            account_holder = data.get('account_holder', '').strip()
            bank_name = data.get('bank_name', '').strip()
            branch_name = data.get('branch_name', '').strip()
            
            # Accept whatever banking details the farmer provides (do not enforce presence/validation)
            # The frontend may send empty strings; store them as-is.
            # If stricter validation is needed later, reintroduce checks here.
            
            new_farmer = Farmer(
                user_id=int(new_user.id),
                place_id=int(place.id),
                bank_account_number=bank_account,
                ifsc_code=ifsc,
                upi_id=upi_id,
                account_holder_name=account_holder,
                bank_name=bank_name,
                branch_name=branch_name
            )
            # Save address if provided
            if address:
                try:
                    new_farmer.address = address
                except Exception:
                    pass
            db.session.add(new_farmer)
            print(f"[OK] Farmer profile created")

        elif role == 'BROKER':
            print(f"\nCreating Broker profile...")
            market_name = data.get('market_name', '').strip()
            platform_fee_paid = data.get('platform_fee_paid', False)
            
            if not market_name:
                print(f"ERROR: Market name is required for brokers")
                db.session.rollback()
                return jsonify({'message': 'Market/Agency Name is required for brokers'}), 400
            
            new_broker = Broker(
                user_id=int(new_user.id),
                place_id=int(place.id),
                market_name=market_name,
                platform_fee_paid=platform_fee_paid
            )
            db.session.add(new_broker)
            db.session.flush()  # Flush to get broker ID before handling file
            print(f"[OK] Broker profile created with ID: {new_broker.id}")
            
            # Handle trade license file upload for brokers
            if 'trade_license_file' in request.files and request.files['trade_license_file'].filename != '':
                print(f"\nProcessing trade license file upload...")
                trade_license_file = request.files['trade_license_file']
                
                # Validate file extension
                ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}
                if '.' not in trade_license_file.filename:
                    print(f"ERROR: File has no extension")
                    db.session.rollback()
                    return jsonify({'message': 'Invalid file. Must have an extension (PDF, JPG, PNG)'}), 400
                
                file_ext = trade_license_file.filename.rsplit('.', 1)[1].lower()
                if file_ext not in ALLOWED_EXTENSIONS:
                    print(f"ERROR: Invalid file extension '{file_ext}'. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
                    db.session.rollback()
                    return jsonify({'message': f'Invalid file type. Only PDF, JPG, and PNG are allowed. Got: {file_ext}'}), 400
                
                # Validate file size (5MB max)
                if trade_license_file.content_length and trade_license_file.content_length > 5 * 1024 * 1024:
                    print(f"ERROR: File too large (max 5MB)")
                    db.session.rollback()
                    return jsonify({'message': 'File is too large. Maximum size is 5MB'}), 400
                
                # Create upload directory if it doesn't exist
                # Use current_app.instance_path to match the endpoint that serves files
                upload_dir = os.path.join(current_app.instance_path, 'uploads', 'trade_licenses')
                os.makedirs(upload_dir, exist_ok=True)
                print(f"[OK] Upload directory ready: {upload_dir}")
                
                # Generate secure filename with broker ID
                timestamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')
                secure_fname = secure_filename(trade_license_file.filename)
                filename = f"broker_{new_broker.id}_{timestamp}_{secure_fname}"
                filepath = os.path.join(upload_dir, filename)
                
                # Save file to disk
                trade_license_file.save(filepath)
                print(f"[OK] Trade license file saved: {filename}")
                print(f"[OK] File path on disk: {filepath}")
                
                # Store relative path in database (from instance directory)
                relative_path = f"uploads/trade_licenses/{filename}"
                new_broker.trade_license = relative_path
                new_broker.verification_status = 'PENDING'
                print(f"[OK] Broker record updated with trade_license path: {relative_path}")
                print(f"[OK] Broker verification status set to PENDING")
            else:
                print(f"ERROR: Trade license file is required for broker registration")
                db.session.rollback()
                return jsonify({'message': 'Trade license file is required to register as a broker. Please upload a PDF, JPG, or PNG file.'}), 400

        # 8. Commit all changes
        print(f"\nCommitting to database...")
        db.session.commit()
        print("[OK] REGISTRATION SUCCESSFUL!")
        print(f"{'='*60}\n")
        
        if role == 'BROKER':
            return jsonify({
                'success': True,
                'message': 'Broker registered successfully. Your trade license is under verification. You will be able to login once it is approved.',
                'user_id': new_user.id,
                'role': role
            }), 201
        else:
            return jsonify({
                'success': True,
                'message': f'{role.capitalize()} registered successfully', 
                'user_id': new_user.id,
                'role': role
            }), 201

    except Exception as e:
        db.session.rollback()
        print(f"\n{'='*60}")
        print(f"ERROR DURING REGISTRATION")
        print(f"{'='*60}")
        print(f"Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        print(f"{'='*60}\n")
        return jsonify({'message': f'Error: {str(e)}'}), 500


# === OTP / Email Routes (also exposed on Flask for compatibility with frontend) ===
try:
    # Prefer package import when available
    from backend.email_service import send_otp_email, verify_otp, verify_otp_check, send_test_otp_email
except Exception:
    from email_service import send_otp_email, verify_otp, verify_otp_check, send_test_otp_email


@auth_bp.route('/send-otp', methods=['POST'])
def send_otp():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    if not email:
        return jsonify({'success': False, 'message': 'Email is required'}), 400
    try:
        success = send_otp_email(email)
    except ValueError as ve:
        logging.error(str(ve))
        return jsonify({'success': False, 'message': str(ve)}), 500
    except Exception as e:
        logging.exception('Unexpected error sending OTP: %s', e)
        return jsonify({'success': False, 'message': 'Failed to send OTP email. Please try again later.'}), 500
    if success:
        return jsonify({'success': True, 'message': 'OTP sent'}), 200
    return jsonify({'success': False, 'message': 'Failed to send OTP email. Please check your SMTP configuration.'}), 500


@auth_bp.route('/verify-otp', methods=['POST'])
def verify_otp_route():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    otp = (data.get('otp') or '').strip()
    if not (email and otp):
        return jsonify({'success': False, 'message': 'Email and OTP are required'}), 400
    if verify_otp_check(email, otp):
        session[f"verified_{email}"] = True
        return jsonify({'success': True, 'message': 'Verified'}), 200
    return jsonify({'success': False, 'message': 'Invalid or expired OTP'}), 400


@auth_bp.route('/test-otp-email', methods=['POST'])
def test_otp_email():
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    if not email:
        return jsonify({'success': False, 'message': 'Email is required'}), 400
    return jsonify(send_test_otp_email(email)), 200


@auth_bp.route('/login', methods=['POST'])
def login():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'message': 'No input data provided'}), 400

        identifier = data.get('identifier') # Can be Phone or Email
        password = data.get('password')

        if not identifier or not password:
            return jsonify({'message': 'Identifier and password are required'}), 400

        # 1. Find User by Phone OR Email
        user = User.query.filter(
            (User.phone == identifier) | (User.email == identifier)
        ).first()

        # 2. Verify User and Password
        if not user or not check_password_hash(user.password_hash, password):
            return jsonify({'message': 'Invalid credentials'}), 401

        # 3. Retrieve Role-Specific ID
        # This is useful so the frontend knows the ID of the Farmer/Broker profile immediately
        role_id = None
        if user.role == 'FARMER':
            farmer_profile = Farmer.query.filter_by(user_id=user.id).first()
            if farmer_profile:
                role_id = farmer_profile.id
        elif user.role == 'BROKER':
            broker_profile = Broker.query.filter_by(user_id=user.id).first()
            if broker_profile:
                role_id = broker_profile.id
                
                # Check broker verification status
                if broker_profile.verification_status == 'PENDING':
                    return jsonify({
                        'success': False,
                        'message': 'Verification under process. Please wait for approval.'
                    }), 403
                elif broker_profile.verification_status == 'REJECTED':
                    return jsonify({
                        'success': False,
                        'message': 'Your market is not valid on this platform.'
                    }), 403

        # 4. Set Flask Session
        session['user_id'] = user.id
        session['role'] = user.role
        session['role_id'] = role_id

        # 5. Generate a session token (fallback when cookies are blocked or frontend served from file://)
        token = generate_session_token(int(user.id))

        # 6. Return Success Response
        return jsonify({
            'success': True,
            'message': 'Login successful',
            'user_id': user.id,
            'role': user.role,
            'role_specific_id': role_id,
            'session_token': token
        }), 200

    except Exception as e:
        return jsonify({'message': f'Server Error: {str(e)}'}), 500


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """
    Clear user session
    """
    session.clear()
    return jsonify({
        'success': True,
        'message': 'Logged out successfully'
    }), 200


@auth_bp.route('/me', methods=['GET'])
def get_current_user():
    """
    Get current logged-in user information
    """
    user_id = session.get('user_id')
    if not user_id:
        auth_header = request.headers.get('Authorization') or request.headers.get('X-Session-Token')
        if auth_header:
            token = auth_header.split(' ', 1)[1] if auth_header.lower().startswith('bearer ') else auth_header
            uid = verify_session_token(token)
            if uid:
                user_id = uid

    if not user_id:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    try:
        user = User.query.get(user_id)
        if not user:
            return jsonify({'success': False, 'error': 'User not found'}), 404

        return jsonify({
            'success': True,
            'user_id': user.id,
            'name': user.name,
            'email': user.email,
            'phone': user.phone,
            'role': user.role,
            'verified': True  # User is logged in, so email is verified in session
        }), 200

    except Exception as e:
        return jsonify({'success': False, 'error': f'Failed to fetch user: {str(e)}'}), 500


@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
    Forgot Password: Send OTP to registered email
    Expects: email or phone
    """
    data = request.get_json() or {}
    identifier = (data.get('email') or data.get('phone') or '').strip()
    
    if not identifier:
        return jsonify({'success': False, 'message': 'Email or phone is required'}), 400
    
    try:
        # Find user by email or phone
        user = User.query.filter(
            (User.email == identifier) | (User.phone == identifier)
        ).first()
        
        if not user:
            # Don't reveal if user exists or not (security best practice)
            return jsonify({'success': True, 'message': 'If the account exists, OTP has been sent to registered email'}), 200
        
        # Send OTP to user's email
        if not user.email:
            return jsonify({'success': False, 'message': 'User does not have an email registered'}), 400
        
        success = send_otp_email(user.email)
        if success:
            return jsonify({'success': True, 'message': 'OTP sent to registered email', 'email': user.email}), 200
        else:
            return jsonify({'success': False, 'message': 'Failed to send OTP. Please try again later.'}), 500
    
    except Exception as e:
        logging.exception('Error in forgot_password: %s', e)
        return jsonify({'success': False, 'message': 'An error occurred. Please try again.'}), 500


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Reset Password: Verify OTP and update password
    Expects: email, otp, new_password, confirm_password
    Accepts passwords with any combination of characters:
    - Alphabets (a-z, A-Z)
    - Numbers (0-9)
    - Symbols (!@#$%^&*_-+=)
    """
    data = request.get_json() or {}
    email = (data.get('email') or '').strip()
    otp = (data.get('otp') or '').strip()
    new_password = data.get('new_password') or ''
    confirm_password = data.get('confirm_password') or ''
    
    # Validation
    if not all([email, otp, new_password, confirm_password]):
        return jsonify({'success': False, 'message': 'All fields are required'}), 400
    
    if new_password != confirm_password:
        return jsonify({'success': False, 'message': 'Passwords do not match'}), 400
    
    # Validate password (accepts any character combination: letters, numbers, symbols)
    is_valid_password, password_error = validate_password(new_password)
    if not is_valid_password:
        return jsonify({'success': False, 'message': password_error}), 400
    
    try:
        # Verify OTP
        if not verify_otp(email, otp):
            return jsonify({'success': False, 'message': 'Invalid or expired OTP'}), 400
        
        # Find user
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({'success': False, 'message': 'User not found'}), 404
        
        # Update password
        user.password_hash = generate_password_hash(new_password)
        db.session.commit()
        
        return jsonify({'success': True, 'message': 'Password reset successfully. Please login with your new password.'}), 200
    
    except Exception as e:
        db.session.rollback()
        logging.exception('Error in reset_password: %s', e)
        return jsonify({'success': False, 'message': 'An error occurred. Please try again.'}), 500

# =====================================================
# BLUEPRINTS - FARMER ROUTES
# =====================================================

farmer_bp = Blueprint('farmer', __name__)

def get_current_farmer() -> 'Farmer | None':
    """Helper: Get Logged-in Farmer
    Accepts Flask session cookie OR a bearer token via Authorization/X-Session-Token header (dev fallback).
    """
    user_id = session.get('user_id')
    if not user_id:
        auth_header = request.headers.get('Authorization') or request.headers.get('X-Session-Token')
        if auth_header:
            token = auth_header.split(' ', 1)[1] if auth_header.lower().startswith('bearer ') else auth_header
            uid = verify_session_token(token)
            if uid:
                user_id = uid

    if not user_id:
        return None
    return Farmer.query.filter_by(user_id=user_id).first()


@farmer_bp.route('/locations', methods=['GET'])
def get_locations():
    """
    Fetch all unique districts and market areas from the database
    that have registered brokers.
    """
    try:
        # Get all unique districts from places that have brokers
        active_places = (
            db.session.query(Place).with_entities(Place.district, Place.market_area)  # type: ignore
            .join(Broker, Broker.place_id == Place.id)
            .distinct()
            .all()
        )

        if not active_places:
            return jsonify({
                'locations': [],
                'message': 'No markets available yet'
            }), 200

        locations = []
        # active_places returns (district, market_area) tuples from the query
        for district, market_area in active_places:
            locations.append({
                'district': district,
                'market_area': market_area
            })

        # Remove duplicates while preserving order
        seen = set()
        unique_locations = []
        for loc in locations:
            key = (loc['district'], loc['market_area'])
            if key not in seen:
                seen.add(key)
                unique_locations.append(loc)

        return jsonify({
            'success': True,
            'locations': unique_locations,
            'count': len(unique_locations)
        }), 200

    except Exception as e:
        print("Location Error:", str(e))
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': 'Failed to fetch locations',
            'error': str(e)
        }), 500


@farmer_bp.route('/markets', methods=['GET'])
def get_markets():
    """
    Fetch markets (brokers) with pricing by district.
    Supports sorting by price (asc/desc).
    """
    try:
        district = request.args.get('district', '').strip()
        sort_order = request.args.get('sort', 'price_desc')

        if not district:
            return jsonify({
                'success': False,
                'message': 'District is required'
            }), 400

        # Fetch brokers in the requested district
        brokers = (
            db.session.query(Broker, Place)
            .join(Place, Broker.place_id == Place.id)
            .filter(func.lower(Place.district).like(f"%{district.lower()}%"))
            .all()
        )

        markets = []

        if not brokers:
            return jsonify({
                'success': True,
                'markets': [],
                'message': 'No markets found in this district yet'
            }), 200

        # For each broker, gather all available MarketPrice rows and return as a prices array
        for broker, place in brokers:
            price_query = MarketPrice.query.filter_by(broker_id=broker.id)
            if sort_order == 'price_asc':
                price_query = price_query.order_by(_asc(MarketPrice.price_per_kg))
            else:
                price_query = price_query.order_by(_desc(MarketPrice.price_per_kg))

            price_rows = price_query.all()

            prices = [
                {
                    'mango_variety': p.mango_variety,
                    'price_per_kg': float(p.price_per_kg),
                    'available_quantity': float(p.available_quantity)
                }
                for p in price_rows
            ]

            # Build varieties list for frontend consumption
            varieties = [
                {'name': p['mango_variety'], 'price': p['price_per_kg']}
                for p in prices
            ]

            primary_variety = prices[0]['mango_variety'] if prices else 'Mixed'
            primary_price = prices[0]['price_per_kg'] if prices else 0
            primary_qty = prices[0]['available_quantity'] if prices else 0

            # Broker user info (name/phone) may be available via relationship
            broker_name = broker.user.name if getattr(broker, 'user', None) else None
            broker_phone = broker.user.phone if getattr(broker, 'user', None) else None

            markets.append({
                'broker_id': broker.id,
                'market_name': broker.market_name,
                'broker_name': broker_name,
                'broker_phone': broker_phone,
                'city': place.market_area,
                'district': place.district,
                'variety': primary_variety,
                'price_per_kg': primary_price,
                'available_quantity': primary_qty,
                'prices': prices,
                'varieties': varieties
            })

        return jsonify({
            'success': True,
            'markets': markets,
            'count': len(markets)
        }), 200

    except Exception as e:
        print("Market Error:", str(e))
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': 'Failed to fetch markets',
            'error': str(e)
        }), 500


@farmer_bp.route('/varieties', methods=['GET'])
def get_varieties():
    """
    Return unique mango varieties available in a district across all brokers.
    Optional: include min/max price and total available quantity per variety.
    """
    try:
        district = request.args.get('district', '').strip()
        if not district:
            return jsonify({'success': False, 'message': 'District is required'}), 400

        # Query MarketPrice join Broker->Place to filter by district
        results = (
            db.session.query(MarketPrice)
            .join(Broker, MarketPrice.broker_id == Broker.id)
            .join(Place, Broker.place_id == Place.id)
            .filter(func.lower(Place.district).like(f"%{district.lower()}%"))
            .all()
        )

        if not results:
            return jsonify({'success': True, 'varieties': []}), 200

        # Aggregate varieties
        agg = {}
        for p in results:
            v = p.mango_variety
            if v not in agg:
                agg[v] = {
                    'variety': v,
                    'min_price': float(p.price_per_kg),
                    'max_price': float(p.price_per_kg),
                    'total_available': float(p.available_quantity)
                }
            else:
                agg[v]['min_price'] = min(agg[v]['min_price'], float(p.price_per_kg))
                agg[v]['max_price'] = max(agg[v]['max_price'], float(p.price_per_kg))
                agg[v]['total_available'] += float(p.available_quantity)

        varieties = list(agg.values())

        return jsonify({'success': True, 'varieties': varieties}), 200

    except Exception as e:
        print('Varieties Error:', str(e))
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'message': 'Failed to fetch varieties', 'error': str(e)}), 500


@farmer_bp.route('/sell-request', methods=['POST'])
def create_sell_request():
    """
    Submit a sell request from farmer to broker.
    Accepts both legacy and new field names for backward compatibility:
    - quantity or estimatedQuantity
    - variety or cropVariety
    - date or preferredDeliveryDate
    """
    farmer = get_current_farmer()
    if not farmer:
        return jsonify({
            'success': False,
            'error': 'Unauthorized - Please login first'
        }), 401

    data = request.get_json() or {}

    # Normalize fields (support both old and new names)
    broker_id = data.get('broker_id') or data.get('brokerId')
    quantity = data.get('quantity') or data.get('estimatedQuantity')
    variety = data.get('variety') or data.get('cropVariety')
    date_str = data.get('date') or data.get('preferredDeliveryDate') or data.get('preferred_date')

    required_fields = [broker_id, quantity, variety, date_str]
    if not all(required_fields):
        return jsonify({
            'success': False,
            'message': 'Missing required fields: broker_id, quantity, variety, date'
        }), 400

    try:
        # Validate numeric inputs
        try:
            broker_int = int(str(broker_id))
            qty_float = float(str(quantity))
        except (TypeError, ValueError):
            return jsonify({'success': False, 'message': 'Invalid broker_id or quantity format'}), 400

        # Verify broker exists before creating request
        broker_obj = Broker.query.get(broker_int)
        if not broker_obj:
            return jsonify({'success': False, 'message': 'Broker not found'}), 404

        try:
            pref_date = datetime.strptime(str(date_str), '%Y-%m-%d').date()
        except Exception:
            return jsonify({'success': False, 'message': 'Invalid date format for preferred date (expected YYYY-MM-DD)'}), 400

        # Capture the current market price for this variety (per kg) to lock-in buyer's request price
        market_price = MarketPrice.query.filter_by(broker_id=broker_int, mango_variety=str(variety)).order_by(_desc(MarketPrice.updated_at)).first()
        price_at_request = float(market_price.price_per_kg) if market_price else None

        # Cast to str() to satisfy static typing expectations
        sell_request = SellRequest(
            farmer_id=farmer.id,
            broker_id=broker_int,
            quantity_tons=qty_float,
            variety=str(variety),
            preferred_date=pref_date,
            price_at_request=price_at_request,
            status='PENDING'
        )

        db.session.add(sell_request)
        db.session.commit()
        # Audit log
        try:
            log_audit(farmer.user_id, 'CREATE_SELL_REQUEST', f"SellRequestID: {sell_request.id}, BrokerID: {broker_int}, Variety: {variety}, Qty: {quantity}, Date: {date_str}")
        except Exception as audit_exc:
            print(f"[AuditLog Error] {audit_exc}")
        return jsonify({
            'success': True,
            'message': 'Sell request submitted successfully',
            'data': sell_request.to_dict()
        }), 201

    except Exception as e:
        db.session.rollback()
        print("Sell Request Error:", str(e))
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': 'Failed to submit request',
            'error': str(e)
        }), 500


@farmer_bp.route('/dashboard', methods=['GET'])
def farmer_dashboard():
    """
    Get farmer's sell requests and transaction history.
    """
    farmer = get_current_farmer()
    if not farmer:
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    try:
        requests = (
            SellRequest.query
            .filter_by(farmer_id=farmer.id)
            .order_by(_desc(SellRequest.created_at))
            .all()
        )

        out = []
        for req in requests:
            # include latest weighment (if any) so farmer can see actual weight and broker's final price
            latest_weigh = Weighment.query.filter_by(sell_request_id=req.id).order_by(_desc(Weighment.created_at)).first()
            # Gather broker and place details safely
            broker_name = None
            market_location = None
            market_name = None
            try:
                if req.broker:
                    market_name = req.broker.market_name
                    # broker.user may be None in some dev DB states
                    broker_name = req.broker.user.name if getattr(req.broker, 'user', None) else None
                    place = getattr(req.broker, 'place', None)
                    if place:
                        market_location = f"{place.market_area}, {place.state}"
            except Exception:
                # Fail gracefully; keep None values if relationships missing
                broker_name = broker_name or None
                market_location = market_location or None

            out.append({
                'id': req.id,
                'date': req.preferred_date.strftime('%Y-%m-%d') if req.preferred_date else req.created_at.strftime('%Y-%m-%d'),
                'created_at': req.created_at.isoformat(),
                'variety': req.variety,
                'quantity': req.quantity_tons,
                'quantity_tons': req.quantity_tons,
                'status': req.status,
                'order_id': req.order_id,
                'market_name': market_name,
                'broker_name': broker_name,
                'market_location': market_location,
                'weighment_weight_tons': float(latest_weigh.actual_weight_tons) if latest_weigh else None,
                'broker_final_price': float(latest_weigh.final_price_per_kg) if latest_weigh else None,
                'latest_weighment': latest_weigh.to_dict() if latest_weigh else None,
                'expected_delivery_date': req.expected_delivery_date.strftime('%Y-%m-%d') if req.expected_delivery_date else None,
                'agreed_price': float(req.agreed_price) if req.agreed_price is not None else None,
                'price_at_request': float(req.price_at_request) if req.price_at_request is not None else None,
                'price_locked': bool(req.price_locked),
                'rejection_reason': req.rejection_reason,
                'transaction': req.transaction.to_dict() if hasattr(req, 'transaction') and req.transaction else None
            })
        return jsonify({'success': True, 'requests': out}), 200
    except Exception as e:
        print("Dashboard Error:", str(e))
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': 'Failed to load dashboard',
            'error': str(e)
        }), 500


@farmer_bp.route('/bank', methods=['GET'])
def get_bank_details():
    """
    Retrieve farmer's bank details (for prefilling forms).
    Returns decrypted bank details if farmer is logged in.
    """
    farmer = get_current_farmer()
    if not farmer:
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    try:
        acct = farmer.decrypted_bank_account_number
        ifsc = farmer.decrypted_ifsc_code
        upi = farmer.decrypted_upi_id

        bank_data = {
            'account_holder': farmer.decrypted_account_holder,
            'bank_name': farmer.decrypted_bank_name,
            'branch_name': farmer.decrypted_branch_name,
            'account_number': acct,
            'ifsc': ifsc,
            'upi': upi,
            'account_masked': (acct[:6] + '****' + acct[-4:]) if acct and len(acct) > 10 else (acct and ('****' + acct[-4:])),
            'ifsc_masked': (ifsc[:4] + '****') if ifsc else None,
            'upi_masked': (upi[:3] + '****') if upi else None,
        }
        
        return jsonify({
            'success': True,
            'bank': bank_data,
            'verified': True
        }), 200
    except Exception as e:
        print("Bank Retrieve Error:", str(e))
        return jsonify({
            'success': False,
            'message': 'Failed to retrieve bank details',
            'error': str(e)
        }), 500


@farmer_bp.route('/update-bank', methods=['POST'])
def update_bank_details():
    """
    Update farmer's bank details for payment.
    """
    farmer = get_current_farmer()
    if not farmer:
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    data = request.get_json()

    try:
        account_number = data.get('account_number')
        ifsc = data.get('ifsc')
        upi = data.get('upi')
        farmer.set_bank_details(account_number, ifsc, upi)
        db.session.commit()
        return jsonify({
            'success': True,
            'message': 'Bank details updated successfully'
        }), 200
    except Exception as e:
        db.session.rollback()
        print("Bank Update Error:", str(e))
        return jsonify({
            'success': False,
            'message': 'Failed to update bank details',
            'error': str(e)
        }), 500


# === PROFILE / OTP routes for farmer ===
@farmer_bp.route('/profile', methods=['GET'])
def get_farmer_profile():
    farmer = get_current_farmer()
    if not farmer:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    try:
        user = farmer.user
        place = farmer.place
        
        # Get decrypted bank details - use properties that handle decryption
        bank_account = farmer.decrypted_bank_account_number
        ifsc_val = farmer.decrypted_ifsc_code
        upi_val = farmer.decrypted_upi_id

        profile = {
            'full_name': user.name if user else None,
            'email': user.email if user else None,
            'phone': user.phone if user else None,
            'address': farmer.address,
            'state': place.state if place else None,
            'district': place.district if place else None,
            'city': place.market_area if place else None,
            'bank_account': bank_account,
            'ifsc': ifsc_val,
            'upi': upi_val,
            'account_holder': farmer.decrypted_account_holder,
            'bank_name': farmer.decrypted_bank_name,
            'branch_name': farmer.decrypted_branch_name
        }
        return jsonify({'success': True, 'profile': profile}), 200
    except Exception as e:
        print('Profile load error:', str(e))
        return jsonify({'success': False, 'message': 'Failed to load profile', 'error': str(e)}), 500


@farmer_bp.route('/send-otp', methods=['POST'])
def farmer_send_otp():
    farmer = get_current_farmer()
    if not farmer:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    email = farmer.user.email if farmer.user else None
    if not email:
        return jsonify({'success': False, 'message': 'No email on record for this user'}), 400
    try:
        ok = send_otp_email(email)
    except Exception as e:
        print('Send OTP error:', str(e))
        return jsonify({'success': False, 'message': 'Failed to send OTP', 'error': str(e)}), 500
    if ok:
        return jsonify({'success': True, 'message': 'OTP sent'}), 200
    return jsonify({'success': False, 'message': 'Failed to send OTP'}), 500


@farmer_bp.route('/verify-otp', methods=['POST'])
def farmer_verify_otp():
    farmer = get_current_farmer()
    if not farmer:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401
    data = request.get_json() or {}
    otp = (data.get('otp') or '').strip()
    if not otp:
        return jsonify({'success': False, 'message': 'OTP is required'}), 400
    email = farmer.user.email if farmer.user else None
    if not email:
        return jsonify({'success': False, 'message': 'No email on record for this user'}), 400
    try:
        valid = verify_otp(email, otp)
    except Exception as e:
        print('Verify OTP error:', str(e))
        valid = False
    if valid:
        session[f'profile_otp_verified_{farmer.id}'] = True
        return jsonify({'success': True, 'message': 'OTP verified'}), 200
    return jsonify({'success': False, 'message': 'Invalid or expired OTP'}), 400


@farmer_bp.route('/profile/update', methods=['PUT'])
def farmer_update_profile():
    farmer = get_current_farmer()
    if not farmer:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    # Require OTP verification specifically for this farmer id
    if not session.get(f'profile_otp_verified_{farmer.id}'):
        return jsonify({'success': False, 'message': 'OTP not verified. Please verify email OTP before updating profile.'}), 403

    data = request.get_json() or {}
    # Only allow updating these fields
    allowed = ['address', 'state', 'district', 'city', 'bank_account', 'ifsc', 'upi', 'account_holder', 'bank_name', 'branch_name']
    try:
        # Update address
        if 'address' in data:
            farmer.address = (data.get('address') or '').strip() or None

        # Update place/state/district/city
        state = (data.get('state') or '').strip()
        district = (data.get('district') or '').strip()
        city = (data.get('city') or '').strip()
        if state or district or city:
            # Use existing values when some are missing
            cur_state = state or (farmer.place.state if farmer.place else None)
            cur_district = district or (farmer.place.district if farmer.place else None)
            cur_city = city or (farmer.place.market_area if farmer.place else None)
            if cur_state and cur_district and cur_city:
                place = Place.query.filter_by(state=cur_state, district=cur_district, market_area=cur_city).first()
                if not place:
                    place = Place(state=cur_state, district=cur_district, market_area=cur_city)
                    db.session.add(place)
                    db.session.flush()
                farmer.place_id = place.id

        # Update bank details: read fields directly from JSON, encrypt and assign
        # Only modify columns for keys actually present in the incoming JSON payload
        try:
            # Helper to normalize incoming value (treat empty/whitespace as clearing the field)
            def _norm(val):
                if val is None:
                    return None
                s = str(val).strip()
                return s if s != '' else None

            if 'bank_account' in data:
                bank_account_val = _norm(data.get('bank_account'))
                farmer.bank_account_number = encrypt_value(bank_account_val) if bank_account_val is not None else None

            if 'ifsc' in data:
                ifsc_val = _norm(data.get('ifsc'))
                farmer.ifsc_code = encrypt_value(ifsc_val) if ifsc_val is not None else None

            if 'upi' in data:
                upi_val = _norm(data.get('upi'))
                farmer.upi_id = encrypt_value(upi_val) if upi_val is not None else None

            if 'account_holder' in data:
                acct_holder_val = _norm(data.get('account_holder'))
                farmer.account_holder_name = encrypt_value(acct_holder_val) if acct_holder_val is not None else None

            if 'bank_name' in data:
                bank_name_val = _norm(data.get('bank_name'))
                farmer.bank_name = encrypt_value(bank_name_val) if bank_name_val is not None else None

            if 'branch_name' in data:
                branch_name_val = _norm(data.get('branch_name'))
                farmer.branch_name = encrypt_value(branch_name_val) if branch_name_val is not None else None
        except Exception:
            db.session.rollback()
            raise

        db.session.commit()

        # Consume OTP verification (one-time use)
        try:
            del session[f'profile_otp_verified_{farmer.id}']
        except Exception:
            pass

        return jsonify({'success': True, 'message': 'Profile updated successfully'}), 200
    except Exception as e:
        db.session.rollback()
        print('Profile update error:', str(e))
        return jsonify({'success': False, 'message': 'Failed to update profile', 'error': str(e)}), 500

# =====================================================
# BLUEPRINTS - BROKER ROUTES
# =====================================================

broker_bp = Blueprint('broker', __name__)

def get_current_broker() -> 'Broker | None':
    """Get the current logged-in broker from session.
    Accepts cookie or bearer token via Authorization/X-Session-Token header (dev fallback).
    """
    user_id = session.get('user_id')
    if not user_id:
        auth_header = request.headers.get('Authorization') or request.headers.get('X-Session-Token')
        if auth_header:
            token = auth_header.split(' ', 1)[1] if auth_header.lower().startswith('bearer ') else auth_header
            uid = verify_session_token(token)
            if uid:
                user_id = uid

    if not user_id:
        return None
    return Broker.query.filter_by(user_id=user_id).first()


@broker_bp.route('/upload-license', methods=['POST'])
def upload_trade_license():
    """
    Handle trade license upload for broker verification.
    Expected: multipart/form-data with 'file' field
    """
    broker = get_current_broker()
    if not broker:
        return error_response('Unauthorized - Please login first', 401)

    try:
        # Check if file is in request
        if 'file' not in request.files:
            return error_response('No file provided', 400)

        file = request.files['file']
        if not file or not file.filename or file.filename == '':
            return error_response('No file selected', 400)

        # Validate file
        ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png'}
        filename_parts = file.filename.rsplit('.', 1)
        if len(filename_parts) < 2 or filename_parts[1].lower() not in ALLOWED_EXTENSIONS:
            return error_response('Invalid file type. Only PDF, JPG, and PNG are allowed', 400)

        # Check file size (5MB max)
        MAX_FILE_SIZE = 5 * 1024 * 1024
        file.seek(0, 2)  # Seek to end
        file_size = file.tell()
        file.seek(0)  # Seek back to beginning
        
        if file_size > MAX_FILE_SIZE:
            return error_response('File is too large. Maximum is 5MB', 400)

        # Create uploads directory structure
        uploads_dir = os.path.join(current_app.instance_path, 'uploads', 'trade_licenses')
        os.makedirs(uploads_dir, exist_ok=True)

        # Generate secure filename with broker_id prefix
        filename = secure_filename(f"{broker.id}_{datetime.now(timezone.utc).timestamp()}_{file.filename}")
        file_path = os.path.join(uploads_dir, filename)

        # Save file
        file.save(file_path)

        # Store relative path in database (for portability)
        relative_path = f"uploads/trade_licenses/{filename}"
        broker.trade_license = relative_path
        broker.verification_status = "PENDING"
        broker.rejection_reason = None

        db.session.commit()

        return success_response(
            message='Trade license uploaded successfully. Verification under process.',
            data={
                'trade_license': relative_path,
                'verification_status': broker.verification_status
            }
        )

    except Exception as e:
        db.session.rollback()
        return error_response(f'Upload failed: {str(e)}', 500)


@broker_bp.route('/dashboard', methods=['GET'])
def get_broker_dashboard():
    """
    Get broker's dashboard data including sell requests, transactions and pricing.
    """
    broker = get_current_broker()
    if not broker:
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    try:
        # Filtering params
        status_filter = request.args.get('status')
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        farmer_name = request.args.get('farmer_name')

        # Get all sell requests for this broker
        sell_requests_query = SellRequest.query.filter_by(broker_id=int(broker.id))
        if status_filter:
            sell_requests_query = sell_requests_query.filter(SellRequest.status == str(status_filter).upper())
        sell_requests = sell_requests_query.order_by(_desc(SellRequest.created_at)).all()

        # Get all transactions for this broker
        transactions_query = db.session.query(Transaction).join(SellRequest).filter(SellRequest.broker_id == int(broker.id))
        if status_filter:
            transactions_query = transactions_query.filter(Transaction.payment_status == str(status_filter).upper())
        if date_from:
            try:
                date_from_dt = datetime.strptime(str(date_from), '%Y-%m-%d')
                transactions_query = transactions_query.filter(Transaction.transaction_date >= date_from_dt)
            except Exception:
                pass
        if date_to:
            try:
                date_to_dt = datetime.strptime(str(date_to), '%Y-%m-%d')
                transactions_query = transactions_query.filter(Transaction.transaction_date <= date_to_dt)
            except Exception:
                pass
        if farmer_name:
            transactions_query = transactions_query.join(SellRequest, Transaction.request_id == SellRequest.id)
            transactions_query = transactions_query.join(Farmer, SellRequest.farmer_id == Farmer.id)
            transactions_query = transactions_query.join(User, Farmer.user_id == User.id)
            transactions_query = transactions_query.filter(func.lower(User.name).like(f"%{str(farmer_name).lower()}%"))
        transactions = transactions_query.order_by(_desc(Transaction.transaction_date)).all()

        # === Additional data required by the frontend ===
        # Defensive queries - wrap in try/except so a failure here doesn't make the whole dashboard 500
        try:
            market_prices = MarketPrice.query.filter_by(broker_id=broker.id).all()
        except Exception as qexc:
            print(f"Warning: Failed to load market_prices for broker {broker.id}: {qexc}")
            market_prices = []

        try:
            weighments = Weighment.query.filter_by(broker_id=broker.id).order_by(_desc(Weighment.created_at)).all()
        except Exception as qexc:
            print(f"Warning: Failed to load weighments for broker {broker.id}: {qexc}")
            weighments = []

        try:
            farmer_orders = FarmerOrder.query.order_by(_desc(FarmerOrder.created_at)).limit(50).all()
        except Exception as qexc:
            print(f"Warning: Failed to load farmer_orders: {qexc}")
            farmer_orders = []

        sell_requests_data: List[Dict[str, Any]] = []
        for sr in sell_requests:
            farmer = Farmer.query.get(int(sr.farmer_id)) if sr.farmer_id is not None else None
            farmer_name_val = farmer.user.name if farmer and hasattr(farmer, 'user') and farmer.user else f'Farmer #{sr.farmer_id}'
            sell_requests_data.append({
                'id': sr.id,
                'farmer_id': sr.farmer_id,
                'farmer_name': farmer_name_val,
                'variety': sr.variety,
                'quantity_tons': sr.quantity_tons,
                'preferred_date': sr.preferred_date.isoformat() if sr.preferred_date else None,
                'status': sr.status,
                'order_id': sr.order_id,
                'expected_delivery_date': sr.expected_delivery_date.isoformat() if sr.expected_delivery_date else None,
                'agreed_price': float(sr.agreed_price) if sr.agreed_price is not None else None,
                'price_at_request': float(sr.price_at_request) if sr.price_at_request is not None else None,
                'price_locked': bool(sr.price_locked),
                'created_at': sr.created_at.isoformat()
            })

        transactions_data = []
        for txn in transactions:
            sell_req = SellRequest.query.get(txn.request_id)
            farmer = Farmer.query.get(sell_req.farmer_id) if sell_req else None
            farmer_name_val = farmer.user.name if farmer and farmer.user else f'Farmer #{sell_req.farmer_id if sell_req else "Unknown"}'
            transactions_data.append({
                'id': txn.id,
                'request_id': txn.request_id,
                'farmer_id': sell_req.farmer_id if sell_req else None,
                'farmer_name': farmer_name_val,
                'variety': sell_req.variety if sell_req else 'Unknown',
                'date': txn.transaction_date.isoformat(),
                'actual_weight': txn.actual_weight,
                'market_price_at_sale': float(txn.market_price_at_sale),
                'total_cost': float(txn.total_cost),
                'commission': float(txn.commission),
                'net_payable': float(txn.net_payable),
                'payment_status': txn.payment_status
            })

        # Build response safely (guard against missing related objects)
        place = getattr(broker, 'place', None)
        place_obj = {
            'state': getattr(place, 'state', None) if place else None,
            'district': getattr(place, 'district', None) if place else None,
            'market_area': getattr(place, 'market_area', None) if place else None
        }

        return jsonify({
            'success': True,
            'broker': {
                'id': broker.id,
                'market_name': broker.market_name,
                'place': place_obj
            },
            'sell_requests': sell_requests_data,
            'transactions': transactions_data,
            'market_prices': [
                {
                    'id': mp.id,
                    'mango_variety': mp.mango_variety,
                    'price_per_kg': float(mp.price_per_kg),
                    'available_quantity': float(mp.available_quantity),
                    'updated_at': mp.updated_at.isoformat()
                }
                for mp in market_prices
            ],
            'weighments': [w.to_dict() for w in weighments],
            'farmer_orders': [fo.to_dict() for fo in farmer_orders]
        }), 200

    except Exception as e:
        print("Dashboard Error:", str(e))
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'message': 'Failed to load dashboard',
            'error': str(e)
        }), 500


@broker_bp.route('/profile', methods=['GET'])
def broker_get_profile():
    """
    Get broker's profile information (read-only).
    """
    broker = get_current_broker()
    if not broker:
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    try:
        user = broker.user
        place = broker.place
        
        profile_data = {
            'success': True,
            'profile': {
                'full_name': user.name if user else 'N/A',
                'email': user.email if user else 'N/A',
                'phone': user.phone if user else 'N/A',
                'market_name': broker.market_name or 'N/A',
                'state': place.state if place else 'N/A',
                'district': place.district if place else 'N/A',
                'market_area': place.market_area if place else 'N/A',
                'platform_fee_paid': broker.platform_fee_paid,
                'registration_date': broker.registration_date.isoformat() if broker.registration_date else None
            }
        }
        return jsonify(profile_data), 200
    except Exception as e:
        print(f'Broker profile error: {str(e)}')
        return jsonify({
            'success': False,
            'message': 'Failed to load profile',
            'error': str(e)
        }), 500


@broker_bp.route('/update-prices', methods=['POST'])
def update_market_prices():
    """
    Update mango prices and available quantities for the broker's market.
    """
    broker = get_current_broker()
    if not broker:
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    data = request.get_json()

    try:
        # Data should be a list of prices
        if not isinstance(data, list):
            data = [data]

        created_count = 0
        updated_count = 0
        deleted_count = 0
        skipped_varieties = []  # track varieties that cannot be updated because price is locked by accepted requests

        # Trace incoming payload for debugging
        print('Update Market Prices Payload:', data)
        for idx, price_data in enumerate(data):
            print(f"Processing price #{idx+1}: {price_data}")
            # Handle deletion requests: payload { mango_variety: ..., action: 'delete' }
            if isinstance(price_data, dict) and price_data.get('action') == 'delete':
                variety_to_delete = price_data.get('mango_variety')
                if not variety_to_delete:
                    print('  -> Delete request missing mango_variety')
                    continue
                existing_price = (
                    MarketPrice.query
                    .filter_by(broker_id=broker.id, mango_variety=variety_to_delete)
                    .first()
                )
                if existing_price:
                    try:
                        db.session.delete(existing_price)
                        db.session.flush()
                        deleted_count += 1
                        print(f"  -> Deleted variety: {variety_to_delete}")
                    except Exception as e:
                        print(f"  -> Failed to delete {variety_to_delete}: {e}")
                        db.session.rollback()
                        skipped_varieties.append(variety_to_delete)
                else:
                    print(f"  -> Variety not found for delete: {variety_to_delete}")
                # continue to next payload item
                continue

            required_fields = ['mango_variety', 'price_per_kg', 'available_quantity']
            if not all(field in price_data for field in required_fields):
                print('  -> Skipping: missing required fields')
                continue


            # Check if price already exists for this variety
            existing_price = (
                MarketPrice.query
                .filter_by(broker_id=broker.id, mango_variety=price_data['mango_variety'])
                .first()
            )

            # Allow updating prices even if there are accepted orders. Accepted orders retain their agreed price.

            try:
                price_val = float(price_data['price_per_kg'])
                qty_val = float(price_data['available_quantity'])
            except Exception as e:
                print(f"  -> Invalid numeric values for {price_data.get('mango_variety')}: {e}")
                continue

            if existing_price:
                existing_price.price_per_kg = price_val
                existing_price.available_quantity = qty_val
                existing_price.updated_at = datetime.now(timezone.utc)
                updated_count += 1
                print(f"  -> Updated existing price for {existing_price.mango_variety}: {price_val}")
            else:
                new_price = MarketPrice(
                    broker_id=broker.id,
                    mango_variety=price_data['mango_variety'],
                    price_per_kg=price_val,
                    available_quantity=qty_val
                )
                db.session.add(new_price)
                created_count += 1
                print(f"  -> Created new price for {price_data['mango_variety']}: {price_val}")

        db.session.commit()

        # Return the refreshed list of market prices for the broker so frontend can update immediately
        refreshed_prices = MarketPrice.query.filter_by(broker_id=broker.id).all()
        market_prices_serialized = [
            {
                'id': mp.id,
                'mango_variety': mp.mango_variety,
                'price_per_kg': float(mp.price_per_kg),
                'available_quantity': float(mp.available_quantity),
                'updated_at': mp.updated_at.isoformat()
            }
            for mp in refreshed_prices
        ]

        message = f'Prices updated: {created_count} created, {updated_count} updated, {deleted_count} deleted'
        if skipped_varieties:
            message += f'; skipped (locked): {", ".join(skipped_varieties)}'

        return jsonify({
            'success': True,
            'message': message,
            'market_prices': market_prices_serialized
        }), 200

    except Exception as e:
        db.session.rollback()
        print("Price Update Error:", str(e))
        return jsonify({
            'success': False,
            'message': 'Failed to update prices',
            'error': str(e)
        }), 500


@broker_bp.route('/fruits', methods=['GET'])
def broker_get_fruits():
    """Return current broker market prices (fruits) as a JSON list."""
    broker = get_current_broker()
    if not broker:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        market_prices = MarketPrice.query.filter_by(broker_id=broker.id).all()
        market_prices_serialized = [
            {
                'id': mp.id,
                'mango_variety': mp.mango_variety,
                'price_per_kg': float(mp.price_per_kg),
                'available_quantity': float(mp.available_quantity),
                'updated_at': mp.updated_at.isoformat()
            }
            for mp in market_prices
        ]

        return jsonify({'success': True, 'market_prices': market_prices_serialized}), 200
    except Exception as e:
        print('Broker get fruits error:', str(e))
        return jsonify({'success': False, 'message': 'Failed to fetch fruits', 'error': str(e)}), 500


@broker_bp.route('/fruits/<int:fruit_id>', methods=['DELETE'])
def broker_delete_fruit(fruit_id):
    """Delete a MarketPrice (fruit) by id for the current broker."""
    broker = get_current_broker()
    if not broker:
        return jsonify({'success': False, 'message': 'Unauthorized'}), 401

    try:
        mp = MarketPrice.query.filter_by(id=fruit_id, broker_id=broker.id).first()
        if not mp:
            return jsonify({'success': False, 'message': 'Fruit not found'}), 404

        db.session.delete(mp)
        db.session.commit()

        # return refreshed list
        refreshed_prices = MarketPrice.query.filter_by(broker_id=broker.id).all()
        market_prices_serialized = [
            {
                'id': r.id,
                'mango_variety': r.mango_variety,
                'price_per_kg': float(r.price_per_kg),
                'available_quantity': float(r.available_quantity),
                'updated_at': r.updated_at.isoformat()
            }
            for r in refreshed_prices
        ]

        return jsonify({'success': True, 'message': 'Fruit deleted successfully', 'market_prices': market_prices_serialized}), 200
    except Exception as e:
        db.session.rollback()
        print('Broker delete fruit error:', str(e))
        return jsonify({'success': False, 'message': 'Failed to delete fruit', 'error': str(e)}), 500


from typing import Any, Tuple, Dict, Union
def _broker_accept_sell_request(
    broker: 'Broker',
    sell_request: 'SellRequest',
    payload: Union[Dict[str, Any], None] = None
) -> Tuple[bool, Union[Dict[str, Any], str]]:
    """
    Core acceptance logic extracted to helper to be used by multiple endpoints.
    - Generates order_id
    - Determines agreed price using, in order of precedence: payload.agreed_price, sell_request.price_at_request (captured at request time), current MarketPrice
    - Finalizes expected_delivery_date (payload may include 'expected_delivery_date')
    - Marks status = 'ACCEPTED' (price_at_request ensures future operations use the request-time price)
    Returns a tuple (success: bool, data_or_message: dict|string)
    """
    payload = payload or {}

    if sell_request.status == 'ACCEPTED':
        return False, 'Request already accepted'

    # Ensure this sell_request belongs to broker
    if sell_request.broker_id != broker.id:
        return False, 'Unauthorized to accept this request'

    # Allow override_price to be provided in payload; if not provided, prefer sell_request.price_at_request (price captured at request time)
    override_price: Any = payload.get('agreed_price')

    market_price = None
    if override_price is None:
        # Use price captured when the farmer submitted the request if available
        if sell_request.price_at_request is not None:
            # Price captured at request (per kg) will be used as the agreed price
            pass
        else:
            # Fall back to latest market price if request-time price is missing
            market_price = MarketPrice.query.filter_by(broker_id=broker.id, mango_variety=sell_request.variety).order_by(_desc(MarketPrice.updated_at)).first()
            if not market_price:
                return False, 'No market price set for this variety and the request did not capture a price. Provide an agreed_price to accept.'

    try:
        # Generate a simple order id (unique-ish). In production use UUID
        order_id = f"ORD-{int(datetime.utcnow().timestamp())}-{sell_request.id}"

        sell_request.order_id = order_id

        # Allow broker to override agreed price at acceptance time (payload.agreed_price is expected in ₹/kg)
        if override_price is not None:
            try:
                override_price = float(override_price)
                if override_price <= 0:
                    return False, 'Invalid agreed_price supplied'
                sell_request.agreed_price = override_price
            except ValueError:
                return False, 'Invalid agreed_price supplied'
        else:
            # Prefer the price captured when the farmer created the request
            if sell_request.price_at_request is not None:
                sell_request.agreed_price = float(sell_request.price_at_request)
            else:
                # Fallback to current market price if request-time price missing
                if market_price is None:
                    return False, 'No market price available at acceptance time'
                sell_request.agreed_price = float(market_price.price_per_kg)

        # Mark request accepted; leave market prices mutable for brokers
        sell_request.price_locked = True

        # expected_delivery_date can be provided by broker (payload) or default to preferred_date
        exp_date: Any = payload.get('expected_delivery_date')
        if exp_date:
            sell_request.expected_delivery_date = datetime.strptime(exp_date, '%Y-%m-%d').date()
        else:
            sell_request.expected_delivery_date = sell_request.preferred_date

        sell_request.status = 'ACCEPTED'

        db.session.commit()

        # Notification: Inform farmer of acceptance
        try:
            farmer = Farmer.query.get(sell_request.farmer_id)
            if farmer and hasattr(farmer, 'user') and farmer.user:
                send_notification(
                    farmer.user,
                    subject="Your Sell Request has been ACCEPTED",
                    message=f"Your sell request for {sell_request.variety} ({sell_request.quantity_tons} tons) has been accepted by {broker.market_name}. Order ID: {sell_request.order_id}. Agreed Price: ₹{sell_request.agreed_price}/kg. Delivery Date: {sell_request.expected_delivery_date}.",
                    channels=None
                )
        except Exception as notify_exc:
            print(f"[Notification Error] Failed to notify farmer: {notify_exc}")

        # Create or update farmer - order mapping for quick lookup by farmer name
        try:
            farmer = Farmer.query.get(sell_request.farmer_id)
            farmer_name = farmer.user.name if farmer and farmer.user else 'Unknown Farmer'
            existing = FarmerOrder.query.filter_by(order_id=sell_request.order_id).first()
            if not existing:
                fo = FarmerOrder(
                    farmer_id=sell_request.farmer_id,
                    farmer_name=farmer_name,
                    order_id=sell_request.order_id
                )
                db.session.add(fo)
                db.session.commit()
        except Exception as _:
            # Non-fatal - mapping is convenience table
            db.session.rollback()

        return True, {
            'order_id': sell_request.order_id,
            'agreed_price': float(sell_request.agreed_price),
            'expected_delivery_date': sell_request.expected_delivery_date.strftime('%Y-%m-%d')
        }
    except Exception as e:
        db.session.rollback()
        return False, str(e)


@broker_bp.route('/request/<int:request_id>/status', methods=['POST'])
def update_request_status(request_id: int):
    """
    Update the status of a sell request (ACCEPT/REJECT).
    Backwards-compatible: Accept requests are routed to the same logic as the new accept endpoint.
    """
    broker = get_current_broker()
    data = request.get_json() or {}

    # Fallback: if get_current_broker() failed (no session/cookie/Authorization header),
    # allow session_token to be provided in the request body as a dev fallback.
    if not broker:
        token_candidate = data.get('session_token') or request.headers.get('X-Session-Token')
        if token_candidate:
            uid = verify_session_token(token_candidate)
            if uid:
                broker = Broker.query.filter_by(user_id=uid).first()

    if not broker:
        print(f"Unauthorized attempt to change request {request_id}. Headers: {dict(request.headers)} Payload: {data}")
        return jsonify({
            'success': False,
            'error': 'Unauthorized'
        }), 401

    new_status = data.get('status', '').upper()

    if new_status not in ['ACCEPTED', 'REJECTED']:
        return jsonify({
            'success': False,
            'message': 'Invalid status. Use ACCEPTED or REJECTED'
        }), 400

    try:
        sell_request = SellRequest.query.get(request_id)

        if not sell_request or sell_request.broker_id != broker.id:
            return jsonify({
                'success': False,
                'error': 'Request not found'
            }), 404

        if new_status == 'ACCEPTED':
            success, result = _broker_accept_sell_request(broker, sell_request, data)
            if not success:
                return jsonify({'success': False, 'message': result}), 400
            return jsonify({'success': True, 'message': 'Request accepted successfully', 'data': result}), 200

        # Handle rejection
        sell_request.status = 'REJECTED'
        sell_request.rejection_reason = data.get('reason', 'No reason provided')
        db.session.commit()

        # Notification: Inform farmer of rejection
        try:
            farmer = Farmer.query.get(sell_request.farmer_id)
            if farmer and hasattr(farmer, 'user') and farmer.user:
                send_notification(
                    farmer.user,
                    subject="Your Sell Request has been REJECTED",
                    message=f"Your sell request for {sell_request.variety} ({sell_request.quantity_tons} tons) was rejected by {broker.market_name}. Reason: {sell_request.rejection_reason}",
                    channels=None
                )
        except Exception as notify_exc:
            print(f"[Notification Error] Failed to notify farmer: {notify_exc}")

        return jsonify({
            'success': True,
            'message': f'Request rejected successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        print("Status Update Error:", str(e))
        return jsonify({
            'success': False,
            'message': 'Failed to update request status',
            'error': str(e)
        }), 500


@broker_bp.route('/weighment', methods=['POST'])
def record_weighment():
    """Record a new weighment. Expected payload:
    {
        "order_id": "ORD-...",            # optional
        "farmer_name": "Name",           # optional but helpful
        "mango_variety": "Alphonso",
        "weighment_date": "YYYY-MM-DD",  # optional, defaults to today
        "actual_weight_tons": 1.25,
        "quality_grade": "A",
        "final_price_per_kg": 120.50,
        "remarks": "optional"
    }
    """
    broker = get_current_broker()
    data = request.get_json() or {}

    # Debug: log origin and auth header presence to help diagnose client-side network/CORS issues
    try:
        origin = request.headers.get('Origin') or 'no-origin'
        auth_present = bool(request.headers.get('Authorization') or request.headers.get('X-Session-Token'))
        import logging
        logging.debug("Weighment origin=%s auth_present=%s", origin, auth_present)
    except Exception:
        pass

    # Accept session token fallback for dev convenience
    if not broker:
        token_candidate = data.get('session_token') or request.headers.get('X-Session-Token')
        if token_candidate:
            uid = verify_session_token(token_candidate)
            if uid:
                broker = Broker.query.filter_by(user_id=uid).first()

    if not broker:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    # Validate required fields
    try:
        weight = float(data.get('actual_weight_tons', 0))
        price = float(data.get('final_price_per_kg', 0))
    except Exception:
        return jsonify({'success': False, 'message': 'Invalid numeric values for weight or price'}), 400

    if not weight or weight <= 0:
        return jsonify({'success': False, 'message': 'actual_weight_tons is required and must be > 0'}), 400
    if not price or price <= 0:
        return jsonify({'success': False, 'message': 'final_price_per_kg is required and must be > 0'}), 400

    # Normalize inputs
    order_id_raw = (data.get('order_id') or '')
    order_id = order_id_raw.strip() or None
    farmer_name_input = (data.get('farmer_name') or '').strip() or None
    variety_input = (data.get('mango_variety') or '').strip() or None
    q_grade = (data.get('quality_grade') or '').strip() or None
    remarks = (data.get('remarks') or '').strip() or None

    w_date = data.get('weighment_date')
    if w_date:
        try:
            w_date = datetime.strptime(w_date, '%Y-%m-%d').date()
        except Exception:
            return jsonify({'success': False, 'message': 'Invalid date format for weighment_date (expected YYYY-MM-DD)'}), 400
    else:
        w_date = datetime.utcnow().date()

    # Attempt to resolve sell_request and farmer when order_id provided
    sell_request = None
    farmer = None
    norm_order_id = None
    if order_id:
        norm_order_id = order_id.strip().lower()
        # Prevent reuse: only block if a weighment with this order_id already exists.
        # It is valid and expected for the order to be present in FarmerOrder (mapping from accepted sell_request).
        existing_w = Weighment.query.filter(func.lower(func.trim(Weighment.order_id)) == norm_order_id).first()
        existing_fo = FarmerOrder.query.filter(func.lower(func.trim(FarmerOrder.order_id)) == norm_order_id).first()
        if existing_w:
            print(f"Duplicate check: order_id={order_id} already present in weighments (id={existing_w.id})")
            return jsonify({'success': False, 'message': 'Order ID already recorded as a weighment', 'existing': existing_w.to_dict()}), 409
        # If FarmerOrder exists, don't block weighment — it's a mapping created on acceptance for convenience.
        if existing_fo:
            print(f"Note: order_id={order_id} already exists in farmer_orders (id={existing_fo.id}); proceeding with weighment")

        # Try to find a SellRequest that matches the order id (case-insensitive, trimmed)
        sell_request = SellRequest.query.filter(func.lower(func.trim(SellRequest.order_id)) == norm_order_id).first()
        if sell_request:
            farmer = Farmer.query.get(sell_request.farmer_id) if sell_request.farmer_id is not None else None
            # Prefer DB values for farmer name and variety when available
            farmer_name_from_db = farmer.user.name if farmer and hasattr(farmer, 'user') and farmer.user else None
            farmer_name = farmer_name_from_db or farmer_name_input
            variety = sell_request.variety or variety_input
        else:
            farmer_name = farmer_name_input
            variety = variety_input
    else:
        farmer_name = farmer_name_input
        variety = variety_input

    # Validate that farmer_name is provided (required for weighments)
    if not farmer_name:
        return jsonify({'success': False, 'message': 'Farmer name is required. Please provide a farmer name.'}), 400

    try:
        # Create FarmerOrder mapping if order_id present and mapping doesn't exist
        if order_id and farmer_name:
            existing = FarmerOrder.query.filter(func.lower(func.trim(FarmerOrder.order_id)) == norm_order_id).first()
            if not existing:
                fo = FarmerOrder(
                    farmer_id=farmer.id if farmer else None,
                    farmer_name=farmer_name,
                    order_id=order_id
                )
                db.session.add(fo)

        # Create weighment record
        w = Weighment(
            broker_id=broker.id,
            sell_request_id=sell_request.id if sell_request else None,
            farmer_id=farmer.id if farmer else None,
            farmer_name=farmer_name,
            order_id=order_id,
            mango_variety=variety,
            weighment_date=w_date,
            actual_weight_tons=weight,
            quality_grade=q_grade,
            final_price_per_kg=price,
            remarks=remarks
        )
        db.session.add(w)
        db.session.commit()
        # Audit log
        try:
            log_audit(broker.user_id, 'RECORD_WEIGHMENT', f"WeighmentID: {w.id}, OrderID: {order_id}, Farmer: {farmer_name}, Weight: {weight}, Price: {price}")
        except Exception as audit_exc:
            print(f"[AuditLog Error] {audit_exc}")

        # Send confirmation email to farmer if farmer_id and email are available
        # This happens after successful commit to ensure transaction is saved
        if farmer and farmer.user and farmer.user.email:
            try:
                from backend.email_service import send_weighment_confirmation_email
            except Exception:
                from email_service import send_weighment_confirmation_email
            
            try:
                broker_name = broker.market_name
                market_name = broker.place.market_area if broker.place else 'Market'
                
                # Calculate formatted date string
                weighment_date_str = w_date.strftime('%d-%b-%Y') if w_date else 'N/A'
                
                email_sent = send_weighment_confirmation_email(
                    farmer_email=farmer.user.email,
                    farmer_name=farmer.user.name,
                    broker_name=broker_name,
                    market_name=market_name,
                    final_weight_tons=weight,
                    final_price_per_kg=price,
                    mango_variety=variety or 'N/A',
                    weighment_date=weighment_date_str
                )
                
                if email_sent:
                    print(f"[Email] Weighment confirmation sent to {farmer.user.email}")
                else:
                    print(f"[Email] Failed to send weighment confirmation to {farmer.user.email}")
            except Exception as email_exc:
                print(f"[Email Error] Failed to send weighment confirmation: {email_exc}")
                # Do NOT fail the entire transaction if email fails
                # The weighment is already saved; email is a non-critical notification

        # Prepare response payload including linked order details when available
        resp_data = w.to_dict()
        if order_id and sell_request:
            resp_data['linked_order'] = {
                'sell_request_id': sell_request.id,
                'farmer_name': farmer_name,
                'mango_variety': variety
            }

        return jsonify({'success': True, 'message': 'weighment is successfully recorded', 'data': resp_data}), 200
    except IntegrityError as ie:
        db.session.rollback()
        print('Weighment integrity error (possible duplicate order_id):', str(ie))
        return jsonify({'success': False, 'message': 'Your order id is invalid it is used before. Enter New order id for weighment'}), 409

    except Exception as e:
        db.session.rollback()
        print('Weighment error:', str(e))
        return jsonify({'success': False, 'message': 'Failed to record weighment', 'error': str(e)}), 500


# Dev-only debug endpoint: Lookup order_id across weighments, farmer_orders and sell_requests
@broker_bp.route('/debug/order-lookup', methods=['GET'])
def debug_order_lookup():
    """Dev-only: return any matches for an order_id across weighments, farmer_orders and sell_requests.
    Enabled when app is running with TESTING=True or when the environment variable DEBUG_ORDER_LOOKUP=1 is set.
    """
    enabled = current_app.config.get('TESTING') or os.environ.get('DEBUG_ORDER_LOOKUP') == '1'
    if not enabled:
        return jsonify({'success': False, 'message': 'Debug endpoint disabled'}), 403

    order_id = (request.args.get('order_id') or '').strip()
    if not order_id:
        return jsonify({'success': False, 'message': 'Missing required parameter: order_id'}), 400

    norm = order_id.strip().lower()

    weighments = Weighment.query.filter(func.lower(func.trim(Weighment.order_id)) == norm).all()
    farmer_orders = FarmerOrder.query.filter(func.lower(func.trim(FarmerOrder.order_id)) == norm).all()
    sell_requests = SellRequest.query.filter(func.lower(func.trim(SellRequest.order_id)) == norm).all()

    return jsonify({
        'success': True,
        'order_id': order_id,
        'weighments': [w.to_dict() for w in weighments],
        'farmer_orders': [f.to_dict() for f in farmer_orders],
        'sell_requests': [s.to_dict() for s in sell_requests]
    }), 200


# New explicit accept endpoint matching requested API: PUT /sell-request/:id/accept
# We register this below on the app object so it resolves as '/sell-request/<id>/accept'
def sell_request_accept(request_id):
    broker = get_current_broker()
    payload = request.get_json() or {}

    # Fallback: allow session_token in payload or X-Session-Token header for dev environments
    if not broker:
        token_candidate = payload.get('session_token') or request.headers.get('X-Session-Token')
        if token_candidate:
            uid = verify_session_token(token_candidate)
            if uid:
                broker = Broker.query.filter_by(user_id=uid).first()

    if not broker:
        import logging
        logging.warning("Unauthorized attempt to accept request %s", request_id)
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    sell_request = SellRequest.query.get(request_id)
    if not sell_request or sell_request.broker_id != broker.id:
        return jsonify({'success': False, 'error': 'Request not found'}), 404

    success, result = _broker_accept_sell_request(broker, sell_request, payload)

    if not success:
        return jsonify({'success': False, 'message': result}), 400

    print(f"Request {request_id} accepted by broker {broker.id}")
    return jsonify({'success': True, 'message': 'Request accepted', 'data': result}), 200


@broker_bp.route('/process-payment', methods=['POST'])
def process_payment():
    """
    Process payment for a transaction.
    Marks the transaction as PAID.
    """
    broker = get_current_broker()
    if not broker:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    try:
        data = request.get_json() or {}
        transaction_id = data.get('transaction_id')
        farmer_id = data.get('farmer_id')
        amount = data.get('amount')

        if not transaction_id:
            return jsonify({'success': False, 'error': 'transaction_id is required'}), 400

        # For weighment-based transactions (format: w-<id>), we don't update a transaction record
        # since weighments don't have traditional transaction records yet
        if isinstance(transaction_id, str) and transaction_id.startswith('w-'):
            # Weighment-based transaction - just return success
            # In a full implementation, you'd create a payment record for this weighment
            return jsonify({
                'success': True,
                'message': 'Payment processed successfully',
                'transaction_id': transaction_id,
                'amount': amount
            }), 200

        try:
            tx_id = int(transaction_id)
        except (ValueError, TypeError):
            return jsonify({'success': False, 'error': 'Invalid transaction_id format'}), 400

        # Find transaction
        transaction = Transaction.query.get(tx_id)
        if not transaction:
            return jsonify({'success': False, 'error': 'Transaction not found'}), 404

        # Verify broker has access to this transaction
        sell_request = transaction.sell_request
        if not sell_request or sell_request.broker_id != broker.id:
            return jsonify({'success': False, 'error': 'Unauthorized access to transaction'}), 403

        # Update transaction payment status
        transaction.payment_status = 'PAID'
        db.session.commit()

        # Audit log
        try:
            log_audit(broker.user_id, 'PROCESS_PAYMENT', f"TransactionID: {tx_id}, FarmerID: {farmer_id}, Amount: {amount}")
        except Exception as audit_exc:
            print(f"[AuditLog Error] {audit_exc}")

        return jsonify({
            'success': True,
            'message': 'Payment processed successfully',
            'transaction_id': tx_id,
            'payment_status': 'PAID',
            'amount': float(amount) if amount else 0.0
        }), 200

    except Exception as e:
        db.session.rollback()
        print(f'Payment processing error: {str(e)}')
        import traceback
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': 'Payment processing failed',
            'message': str(e)
        }), 500

@broker_bp.route('/farmer/<int:farmer_id>', methods=['GET'])
def broker_get_farmer(farmer_id: int):
    """Broker endpoint to fetch farmer details by ID for payment modal."""
    broker = get_current_broker()
    if not broker:
        return jsonify({'success': False, 'error': 'Unauthorized'}), 401

    try:
        farmer = Farmer.query.get(int(farmer_id))
        if not farmer:
            return jsonify({'success': False, 'error': 'Farmer not found'}), 404

        user = getattr(farmer, 'user', None)

        profile = {
            'id': farmer.id,
            'full_name': user.name if user else None,
            'phone': user.phone if user else None,
            'account_holder': user.name if user else None,
            'account_number': safe_decrypt(farmer.bank_account_number) if getattr(farmer, 'bank_account_number', None) is not None else None,
            'ifsc_code': safe_decrypt(farmer.ifsc_code) if getattr(farmer, 'ifsc_code', None) is not None else None,
            'bank_name': safe_decrypt(farmer.bank_name) if getattr(farmer, 'bank_name', None) is not None else None,
            'branch_name': safe_decrypt(farmer.branch_name) if getattr(farmer, 'branch_name', None) is not None else None
        }

        return jsonify({'success': True, 'farmer': profile}), 200
    except Exception as e:
        print(f'Broker get farmer error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


# =====================================================
# PUBLIC ENDPOINTS (App-level Routes)
# =====================================================

# Public blueprint for routes that should be available at module import
# and registered on the app inside the factory. Using a blueprint avoids
# referencing the `app` variable at module import time.
public_bp = Blueprint('public', __name__)

@public_bp.route('/farmers/<int:farmer_id>', methods=['GET'])
def get_farmer_public(farmer_id: int):
    """
    Public / authenticated endpoint to fetch farmer details by id.
    Frontend expects `/farmers/{id}` so we provide a compatible route.
    """
    try:
        farmer = Farmer.query.get(int(farmer_id))
        if not farmer:
            return jsonify({'success': False, 'error': 'Farmer not found'}), 404

        user = getattr(farmer, 'user', None)

        profile = {
            'id': farmer.id,
            'full_name': user.name if user else None,
            'phone': user.phone if user else None,
            'account_holder': user.name if user else None,
            'account_number': safe_decrypt(farmer.bank_account_number) if getattr(farmer, 'bank_account_number', None) is not None else None,
            'ifsc_code': safe_decrypt(farmer.ifsc_code) if getattr(farmer, 'ifsc_code', None) is not None else None,
            'bank_name': safe_decrypt(farmer.bank_name) if getattr(farmer, 'bank_name', None) is not None else None,
            'branch_name': safe_decrypt(farmer.branch_name) if getattr(farmer, 'branch_name', None) is not None else None
        }

        return jsonify({'success': True, 'farmer': profile}), 200
    except Exception as e:
        print(f'Get farmer error: {e}')
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


@public_bp.route('/uploads/<path:filename>', methods=['GET'])
def serve_upload(filename: str):
    """
    Serve uploaded files (trade licenses, documents, etc.)
    Path format: uploads/folder/filename
    Downloads file automatically instead of opening in browser.
    """
    try:
        # Route strips '/uploads/' prefix, so we need to add 'uploads/' back
        # URL: /uploads/trade_licenses/filename
        # Received as filename: trade_licenses/filename
        # Need to construct: instance_path/uploads/trade_licenses/filename
        full_path = os.path.join(current_app.instance_path, 'uploads', filename)
        
        print(f"[DEBUG] Full path being checked: {full_path}")
        print(f"[DEBUG] Instance path: {current_app.instance_path}")
        print(f"[DEBUG] Requested filename: {filename}")
        
        # Security check: ensure the resolved path is within instance directory/uploads
        uploads_directory = os.path.join(current_app.instance_path, 'uploads')
        if not os.path.abspath(full_path).startswith(os.path.abspath(uploads_directory)):
            print(f"[ERROR] Security violation: path outside uploads directory")
            return jsonify({'error': 'Access denied'}), 403
        
        # Check if file exists
        if not os.path.exists(full_path):
            print(f"[ERROR] File not found: {full_path}")
            print(f"[ERROR] Expected directory: {os.path.dirname(full_path)}")
            print(f"[ERROR] Expected file: {os.path.basename(full_path)}")
            # List directory contents for debugging
            try:
                if os.path.isdir(os.path.dirname(full_path)):
                    files_in_dir = os.listdir(os.path.dirname(full_path))
                    print(f"[DEBUG] Files in directory: {files_in_dir}")
            except Exception as e:
                print(f"[DEBUG] Could not list directory: {e}")
            return jsonify({'error': 'File not found'}), 404
        
        # Extract directory and filename for send_from_directory
        directory = os.path.dirname(full_path)
        file_only = os.path.basename(full_path)
        
        print(f"[OK] Serving file: {file_only} from {directory}")
        
        # as_attachment=True triggers download dialog in browser
        return send_from_directory(directory, file_only, as_attachment=True)
    
    except Exception as e:
        print(f"[ERROR] Failed to serve file: {str(e)}")
        return jsonify({'error': f'Failed to serve file: {str(e)}'}), 500

# =====================================================
# BLUEPRINTS - MARKET ROUTES
# =====================================================

market_bp = Blueprint('market', __name__)

@market_bp.route('/farmer/markets', methods=['GET'])
def get_markets_by_district():
    """Delegate to the farmer markets handler to ensure a single
    consistent implementation and response shape across routes.
    """
    # Reuse the farmer-facing `get_markets` handler so both
    # `/farmer/markets` (under the farmer blueprint) and
    # `/market/farmer/markets` (under the market blueprint) return
    # the same JSON structure and semantics.
    return get_markets()


# =====================================================
# BLUEPRINTS - ADMIN ROUTES
# =====================================================

admin_bp = Blueprint('admin', __name__)


def get_admin_user() -> 'User | None':
    """Get the current logged-in admin from session.
    TODO: Implement proper admin authentication.
    For now, accepts any logged-in user as admin.
    """
    user_id = session.get('user_id')
    if not user_id:
        auth_header = request.headers.get('Authorization') or request.headers.get('X-Session-Token')
        if auth_header:
            token = auth_header.split(' ', 1)[1] if auth_header.lower().startswith('bearer ') else auth_header
            uid = verify_session_token(token)
            if uid:
                user_id = uid

    if not user_id:
        return None
    return User.query.filter_by(id=user_id).first()


@admin_bp.route('/brokers/pending', methods=['GET'])
def get_pending_brokers():
    """
    Get all brokers with PENDING verification status.
    Returns broker details including trade license status.
    """
    admin = get_admin_user()
    if not admin:
        return error_response('Unauthorized - Please login as admin', 401)

    try:
        pending_brokers = Broker.query.filter_by(
            verification_status='PENDING'
        ).all()

        brokers_data = []
        for broker in pending_brokers:
            user = User.query.filter_by(id=broker.user_id).first()
            place = Place.query.filter_by(id=broker.place_id).first()

            brokers_data.append({
                'id': broker.id,
                'user_id': broker.user_id,
                'name': user.name if user else 'N/A',
                'user_name': user.name if user else 'N/A',
                'phone': user.phone if user else 'N/A',
                'email': user.email if user else 'N/A',
                'market_name': broker.market_name,
                'state': place.state if place else 'N/A',
                'district': place.district if place else 'N/A',
                'city': place.market_area if place else 'N/A',
                'trade_license': broker.trade_license,
                'verification_status': broker.verification_status,
                'rejection_reason': broker.rejection_reason,
                'registration_date': broker.registration_date.isoformat() if broker.registration_date else None
            })

        return success_response(
            message='Pending brokers retrieved successfully',
            data=brokers_data
        )

    except Exception as e:
        return error_response(f'Failed to retrieve brokers: {str(e)}', 500)


@admin_bp.route('/brokers/<int:broker_id>/approve', methods=['POST'])
def approve_broker(broker_id: int):
    """
    Approve a pending broker application.
    Sets verification_status to APPROVED.
    """
    admin = get_admin_user()
    if not admin:
        return error_response('Unauthorized - Please login as admin', 401)

    try:
        broker = Broker.query.filter_by(id=broker_id).first()
        if not broker:
            return error_response('Broker not found', 404)

        if broker.verification_status != 'PENDING':
            return error_response('Only pending brokers can be approved', 400)

        broker.verification_status = 'APPROVED'
        broker.rejection_reason = None

        db.session.commit()

        # Log audit trail
        try:
            log_audit(
                admin_id=admin.id,
                action='BROKER_APPROVED',
                target_id=broker_id,
                details=f'Approved broker: {broker.market_name}'
            )
        except:
            pass

        return success_response(
            message='Broker approved successfully',
            data={
                'id': broker.id,
                'verification_status': broker.verification_status
            }
        )

    except Exception as e:
        db.session.rollback()
        return error_response(f'Approval failed: {str(e)}', 500)


@admin_bp.route('/brokers/<int:broker_id>/reject', methods=['POST'])
def reject_broker(broker_id: int):
    """
    Reject a pending broker application.
    Sets verification_status to REJECTED and optionally stores rejection reason.
    """
    admin = get_admin_user()
    if not admin:
        return error_response('Unauthorized - Please login as admin', 401)

    try:
        data = request.get_json() or {}
        rejection_reason = data.get('rejection_reason', '').strip()

        broker = Broker.query.filter_by(id=broker_id).first()
        if not broker:
            return error_response('Broker not found', 404)

        if broker.verification_status != 'PENDING':
            return error_response('Only pending brokers can be rejected', 400)

        broker.verification_status = 'REJECTED'
        broker.rejection_reason = rejection_reason if rejection_reason else None

        db.session.commit()

        # Log audit trail
        try:
            log_audit(
                admin_id=admin.id,
                action='BROKER_REJECTED',
                target_id=broker_id,
                details=f'Rejected broker: {broker.market_name}. Reason: {rejection_reason}'
            )
        except:
            pass

        return success_response(
            message='Broker rejected successfully',
            data={
                'id': broker.id,
                'verification_status': broker.verification_status,
                'rejection_reason': broker.rejection_reason
            }
        )

    except Exception as e:
        db.session.rollback()
        return error_response(f'Rejection failed: {str(e)}', 500)

# =====================================================
# APPLICATION FACTORY
# =====================================================

from typing import Any

def create_app(test_config: dict[str, Any] | None = None) -> Flask:
    """Factory: Create Flask app.
    Accepts an optional test_config dict (for CI / testing). When `TESTING` is True
    the app uses an in-memory SQLite DB with StaticPool so tests run in isolation.
    """
    # Load environment variables at app startup (idempotent). Tests can override env as needed.
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except Exception:
        pass

    app = Flask(__name__)
    app.config.from_object(Config)

    # Apply test overrides (used by tests & CI)
    if test_config:
        app.config.update(test_config)

    # Session Configuration - CRITICAL for authentication
    app.config['SESSION_COOKIE_SECURE'] = False  # Set to True in production with HTTPS
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_NAME'] = 'mango_session'
    app.config['PERMANENT_SESSION_LIFETIME'] = 3600  # 1 hour
    app.config['SESSION_COOKIE_DOMAIN'] = None  # Allow localhost

    # If running tests, prefer in-memory DB with a StaticPool so multiple connections work
    if app.config.get('TESTING'):
        app.config['SQLALCHEMY_DATABASE_URI'] = app.config.get('SQLALCHEMY_DATABASE_URI', 'sqlite:///:memory:')
        app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {
            'connect_args': {'check_same_thread': False},
            'poolclass': StaticPool,
            'echo': False
        }

    # CORS Configuration - MUST allow credentials and specify origins
    # Broaden allowed headers to include dev fallback tokens and common AJAX headers
    # Support environment variable CORS_ORIGINS for production deployment
    cors_origins = os.environ.get('CORS_ORIGINS', '').split(',')
    if cors_origins and cors_origins[0]:  # If env var set, use it
        cors_origins = [o.strip() for o in cors_origins if o.strip()]
    else:
        # Default development origins
        cors_origins = [
            'http://127.0.0.1:5000', 'http://127.0.0.1:5500',
            'http://localhost:5000', 'http://localhost:5500',
            'http://127.0.0.1:8000', 'http://localhost:8000', 
            'null'  # For file:// protocol testing
        ]
    
    CORS(app,
         supports_credentials=True,
         origins=cors_origins,
         allow_headers=['Content-Type', 'Authorization', 'X-Session-Token', 'X-Requested-With', 'X-CSRF-Token'],
         expose_headers=['Content-Type'],
         methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
         max_age=3600)

    db.init_app(app)

    # Import blueprints HERE (after db is initialized) to avoid circular imports
    global host_bp
    host_bp_imported = None
    try:
        from routes.host_routes import host_bp as imported_host_bp
        host_bp_imported = imported_host_bp
        print("[OK] Host routes imported successfully from routes.host_routes")
    except Exception as e1:
        try:
            from backend.routes.host_routes import host_bp as imported_host_bp
            host_bp_imported = imported_host_bp
            print("[OK] Host routes imported successfully from backend.routes.host_routes")
        except Exception as e2:
            print(f"[WARN] Failed to import host_bp: {e1} | {e2}")
            host_bp_imported = None

    # Register Blueprints
    print("\n[REGISTERING BLUEPRINTS]")
    
    app.register_blueprint(auth_bp, url_prefix='/auth')
    print("  - /auth - Authentication routes")
    
    app.register_blueprint(farmer_bp, url_prefix='/farmer')
    print("  - /farmer - Farmer routes")
    
    app.register_blueprint(broker_bp, url_prefix='/broker')
    print("  - /broker - Broker routes")
    
    # Public routes (no prefix) for compatibility with frontend expectations
    app.register_blueprint(public_bp)
    print("  - / - Public routes (uploads, farmers)")
    
    app.register_blueprint(market_bp, url_prefix='/market')
    print("  - /market - Market routes")
    
    app.register_blueprint(admin_bp, url_prefix='/api/admin')
    print("  - /api/admin - Admin routes")
    
    # Host verification routes
    if host_bp_imported is not None:
        host_bp = host_bp_imported
        app.register_blueprint(host_bp, url_prefix='/api/host')
        print("  - /api/host - Host verification & broker management routes")
    else:
        print("  WARN: /api/host - Host routes NOT registered (import failed)")
        host_bp = None
        host_bp = None

    # Backwards-compatible API namespace for frontend expecting /api/farmer/*
    # Map the internal farmer handlers to /api/farmer/* paths.
    try:
        app.add_url_rule('/api/farmer/profile', endpoint='api_farmer_profile', view_func=get_farmer_profile, methods=['GET'])
        app.add_url_rule('/api/farmer/send-otp', endpoint='api_farmer_send_otp', view_func=farmer_send_otp, methods=['POST'])
        app.add_url_rule('/api/farmer/verify-otp', endpoint='api_farmer_verify_otp', view_func=farmer_verify_otp, methods=['POST'])
        # Backwards-compatible broker API mapping for frontend (/api/broker/*)
        app.add_url_rule('/api/broker/fruits', endpoint='api_broker_get_fruits', view_func=broker_get_fruits, methods=['GET'])
        app.add_url_rule('/api/broker/fruits/<int:fruit_id>', endpoint='api_broker_delete_fruit', view_func=broker_delete_fruit, methods=['DELETE'])
        app.add_url_rule('/api/farmer/profile/update', endpoint='api_farmer_profile_update', view_func=farmer_update_profile, methods=['PUT'])
        app.add_url_rule('/api/farmer/bank', endpoint='api_farmer_bank_get', view_func=get_bank_details, methods=['GET'])
        app.add_url_rule('/api/farmer/bank', endpoint='api_farmer_bank_update', view_func=update_bank_details, methods=['POST'])
        app.add_url_rule('/api/auth/me', endpoint='api_auth_me', view_func=get_current_user, methods=['GET'])
    except Exception:
        # If handlers are not defined yet or mapping fails, ignore — compatibility is best-effort.
        pass

    # Create tables and run lightweight schema updates for development
    with app.app_context():
        try:
            os.makedirs(app.instance_path)
        except OSError:
            pass

        # Create DB schema (in-memory or file-based depending on config)
        db.create_all()

        # Ensure new columns for SellRequest exist (idempotent, safe for SQLite)
        try:
            ensure_sell_request_columns(db.engine)
        except Exception as e:
            print('Warning: Failed to ensure sell_requests columns:', str(e))

        # Ensure farmer optional columns exist (address)
        try:
            ensure_farmer_columns(db.engine)
        except Exception as e:
            print('Warning: Failed to ensure farmer columns:', str(e))

        # Ensure broker optional columns exist (trade_license, verification_status, rejection_reason)
        try:
            ensure_broker_columns(db.engine)
        except Exception as e:
            print('Warning: Failed to ensure broker columns:', str(e))

        # Ensure unique indexes for order_id on weighments and farmer_orders
        try:
            with db.engine.begin() as conn:
                # Normalize order_id values (trim whitespace, treat empty strings as NULL)
                try:
                    conn.execute(text("UPDATE weighments SET order_id = TRIM(order_id) WHERE order_id IS NOT NULL"))
                    conn.execute(text("UPDATE weighments SET order_id = NULL WHERE order_id = ''"))
                    conn.execute(text("UPDATE farmer_orders SET order_id = TRIM(order_id) WHERE order_id IS NOT NULL"))
                    conn.execute(text("UPDATE farmer_orders SET order_id = NULL WHERE order_id = ''"))
                except Exception as e:
                    print('Warning: Failed to normalize order_id values:', str(e))

                # Delete duplicate weighments keeping the row with smallest id for each order_id
                try:
                    dup_query = text("SELECT order_id FROM weighments WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*)>1")
                    dup_rows = conn.execute(dup_query).fetchall()
                    for row in dup_rows:
                        oid = row[0]
                        ids = [r[0] for r in conn.execute(text("SELECT id FROM weighments WHERE order_id=:oid ORDER BY id ASC"), {'oid': oid}).fetchall()]
                        keep = ids[0]
                        to_delete = ids[1:]
                        for did in to_delete:
                            conn.execute(text("DELETE FROM weighments WHERE id=:did"), {'did': did})
                except Exception as e:
                    print('Warning: Failed to cleanup duplicate weighments:', str(e))

                # Delete duplicate farmer_orders keeping the row with smallest id for each order_id
                try:
                    dup_query = text("SELECT order_id FROM farmer_orders WHERE order_id IS NOT NULL GROUP BY order_id HAVING COUNT(*)>1")
                    dup_rows = conn.execute(dup_query).fetchall()
                    for row in dup_rows:
                        oid = row[0]
                        ids = [r[0] for r in conn.execute(text("SELECT id FROM farmer_orders WHERE order_id=:oid ORDER BY id ASC"), {'oid': oid}).fetchall()]
                        keep = ids[0]
                        to_delete = ids[1:]
                        for did in to_delete:
                            conn.execute(text("DELETE FROM farmer_orders WHERE id=:did"), {'did': did})
                except Exception as e:
                    print('Warning: Failed to cleanup duplicate farmer_orders:', str(e))

                # Remove any existing non-unique index on order_id so we can create a unique one
                try:
                    conn.execute(text("DROP INDEX IF EXISTS ix_weighments_order_id"))
                except Exception:
                    pass

                # Try to create unique indexes. If creation fails (likely due to remaining duplicates), log a clear warning but do not stop app startup
                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_weighments_order_id ON weighments(order_id)"))
                except Exception as e:
                    print('Warning: Could not create unique index ux_weighments_order_id (duplicates may remain):', str(e))

                try:
                    conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS ux_farmer_orders_order_id ON farmer_orders(order_id)"))
                except Exception as e:
                    print('Warning: Could not create unique index ux_farmer_orders_order_id (duplicates may remain):', str(e))
        except Exception as e:
            # Non-fatal; best effort
            print('Warning: Failed to ensure unique indexes for order_id:', str(e))

    # Lightweight health endpoint for availability checks
    @app.route('/health', methods=['GET'])
    def health_check():
        return jsonify({'status': 'ok'}), 200

    # Register top-level accept endpoint to match requested API: PUT /sell-request/:id/accept
    # This route enforces broker auth inside the handler
    app.add_url_rule('/sell-request/<int:request_id>/accept', endpoint='sell_request_accept', view_func=sell_request_accept, methods=['PUT'])

    # =====================================================
    # FRONTEND STATIC FILES SERVING
    # =====================================================
    @app.route('/', methods=['GET'])
    def index():
        """Serve home page"""
        return send_from_directory(os.path.join(app.root_path, '..', 'frontend', 'html'), 'home.html')

    @app.route('/<path:filename>', methods=['GET'])
    def serve_frontend(filename):
        """Serve frontend files from frontend/html directory"""
        try:
            if '.' not in filename:
                filename = filename + '.html'
            
            # Security: prevent directory traversal
            if '..' in filename or filename.startswith('/'):
                return jsonify({'error': 'Invalid file path'}), 400
            
            frontend_path = os.path.join(app.root_path, '..', 'frontend', 'html')
            file_path = os.path.join(frontend_path, filename)
            
            # Verify the file is within frontend/html
            if not os.path.abspath(file_path).startswith(os.path.abspath(frontend_path)):
                return jsonify({'error': 'Access denied'}), 403
            
            if os.path.exists(file_path):
                directory = os.path.dirname(file_path)
                file_only = os.path.basename(file_path)
                return send_from_directory(directory, file_only)
            
            return jsonify({'error': f'File not found: {filename}'}), 404
        except Exception as e:
            return jsonify({'error': f'Error serving file: {str(e)}'}), 500

    @app.route('/css/<path:filename>', methods=['GET'])
    def serve_css(filename):
        """Serve CSS files"""
        try:
            css_path = os.path.join(app.root_path, '..', 'frontend', 'css')
            return send_from_directory(css_path, filename)
        except Exception as e:
            return jsonify({'error': f'CSS file not found: {str(e)}'}), 404

    @app.route('/js/<path:filename>', methods=['GET'])
    def serve_js(filename):
        """Serve JavaScript files"""
        try:
            js_path = os.path.join(app.root_path, '..', 'frontend', 'js')
            return send_from_directory(js_path, filename)
        except Exception as e:
            return jsonify({'error': f'JS file not found: {str(e)}'}), 404

    @app.route('/assets/<path:filename>', methods=['GET'])
    def serve_assets(filename):
        """Serve asset files (images, etc.)"""
        try:
            assets_path = os.path.join(app.root_path, '..', 'frontend', 'assets')
            return send_from_directory(assets_path, filename)
        except Exception as e:
            return jsonify({'error': f'Asset file not found: {str(e)}'}), 404

    # =====================================================
    # STARTUP SUMMARY
    # =====================================================
    with app.app_context():
        print("\n" + "="*80)
        print("MANGO MARKET PLATFORM - SERVER STARTUP COMPLETE")
        print("="*80)
        print("\n[DATABASE]")
        print(f"    - Location: {app.config['SQLALCHEMY_DATABASE_URI']}")
        print(f"    - Mode: {'TESTING (in-memory)' if app.config.get('TESTING') else 'PRODUCTION (file-based)'}")
        
        print("\n[AUTHENTICATION SYSTEM]")
        print("    - /auth/register - Farmer & Broker registration")
        print("    - /auth/check-email - Email availability check")
        print("    - /auth/check-phone - Phone availability check")
        print("    - /auth/send-otp - Send OTP email")
        print("    - /auth/verify-otp - Verify OTP code")
        print("    - /api/auth/me - Get current user info")
        
        print("\n[FARMER SYSTEM]")
        print("    - /farmer/profile - Get/Update farmer profile")
        print("    - /farmer/dashboard - View sell requests & transactions")
        print("    - /farmer/markets - Browse markets by district")
        print("    - /farmer/varieties - Get mango varieties")
        print("    - /farmer/sell-request - Submit sell request")
        print("    - /farmer/bank - Manage bank details")
        print("    - /farmer/send-otp - Send verification OTP")
        
        print("\n[BROKER SYSTEM]")
        print("    - /broker/dashboard - View sell requests & transactions")
        print("    - /broker/upload-license - Upload trade license")
        print("    - /broker/fruits - Manage market prices")
        print("    - /broker/weighment - Record weighment")
        print("    - /broker/pay-farmer - Process farmer payment")
        print("    - /broker/sell-requests - View pending requests")
        print("    - /broker/farmer/<id> - Get farmer details for payment")
        
        print("\n[HOST VERIFICATION SYSTEM]")
        print("    - /api/host/verify - Verify host password (Charan.56)")
        print("    - /api/host/brokers/pending - View pending brokers")
        print("    - /api/host/brokers/<id>/approve - Approve broker")
        print("    - /api/host/brokers/<id>/reject - Reject broker")
        print("    - /api/host/brokers/verified - View approved brokers")
        print("    - /api/host/brokers/rejected - View rejected brokers")
        
        print("\n[ADMIN SYSTEM]")
        print("    - /api/admin/brokers/pending - List pending brokers")
        print("    - /api/admin/brokers/<id>/approve - Approve broker")
        print("    - /api/admin/brokers/<id>/reject - Reject broker")
        
        print("\n[PUBLIC & UTILITIES]")
        print("    - /uploads/<path> - Serve uploaded files")
        print("    - /farmers/<id> - Get farmer public profile")
        print("    - /health - Server health check")
        print("    - /market/farmer/markets - Browse markets")
        
        print("\n" + "="*80)
        print("FRONTEND ACCESS POINTS")
        print("="*80)
        print("\n  Farmer:")
        print("    - http://127.0.0.1:5000/frontend/html/farmer_login.html")
        print("    - http://127.0.0.1:5000/frontend/html/farmer_dashboard.html")
        print("\n  Broker:")
        print("    - http://127.0.0.1:5000/frontend/html/broker_login.html")
        print("    - http://127.0.0.1:5000/frontend/html/broker_dashboard.html")
        print("\n  Host (Admin):")
        print("    - http://127.0.0.1:5000/frontend/html/host_access.html (password: Charan.56)")
        print("    - http://127.0.0.1:5000/frontend/html/host_verification.html")
        
        print("\n" + "="*80)
        print("SERVER IS RUNNING - ALL SYSTEMS ACTIVE")
        print("="*80)
        print("\n")

    return app
