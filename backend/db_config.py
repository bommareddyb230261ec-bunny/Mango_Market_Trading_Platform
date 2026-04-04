"""
Database Configuration Module
Handles connection to MySQL database using SQLAlchemy with environment variables.
Supports both Flask-SQLAlchemy and standalone SQLAlchemy usage.
"""

import os
from typing import Any
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import QueuePool

# Load environment variables from .env file
load_dotenv()


# =====================================================
# DATABASE CREDENTIALS FROM ENVIRONMENT VARIABLES
# =====================================================
DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = os.getenv('DB_PORT', '3306')
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'mango_market_db')
DB_DRIVER = os.getenv('DB_DRIVER', 'pymysql')  # Options: pymysql, mysqlconnector

# Optional: For development/testing environment flag
ENVIRONMENT = os.getenv('ENVIRONMENT', 'development')


# =====================================================
# DATABASE URL CONSTRUCTION
# =====================================================
def get_database_url() -> str:
    """
    Construct the database URL for MySQL.
    
    Format: mysql+{driver}://{user}:{password}@{host}:{port}/{database}
    
    Supported drivers:
    - pymysql (Pure Python implementation)
    - mysqlconnector (MySQL's official connector - requires mysql-connector-python)
    """
    if not DB_PASSWORD:
        # Handle case where password might be empty
        database_url = f"mysql+{DB_DRIVER}://{DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    else:
        # URL encode password to handle special characters
        # Using urllib for proper URL encoding
        from urllib.parse import quote_plus
        encoded_password = quote_plus(DB_PASSWORD)
        database_url = f"mysql+{DB_DRIVER}://{DB_USER}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    
    return database_url


# =====================================================
# SQLALCHEMY ENGINE CONFIGURATION
# =====================================================
def create_db_engine():
    """
    Create SQLAlchemy engine for MySQL database.
    
    Returns:
        Engine: SQLAlchemy engine instance
        
    Connection pool options:
    - QueuePool: Default, uses queue for thread-safe connections
    - NullPool: No pooling (useful for SQLite compatibility)
    - ThreadLocalPool: One connection per thread
    """
    database_url = get_database_url()
    
    engine = create_engine(
        database_url,
        # Connection pool settings
        poolclass=QueuePool,
        pool_size=10,                    # Number of persistent connections to keep open
        max_overflow=20,                 # Maximum overflow connections allowed
        pool_pre_ping=True,              # Verify connections before using them (detects lost connections)
        pool_recycle=3600,               # Recycle connections after 1 hour (MySQL default timeout)
        
        # Engine configuration
        echo=False,                      # Set to True for SQL debugging
        future=True,                     # Use SQLAlchemy 2.0 style
        
        # MySQL-specific connect arguments
        connect_args={
            'charset': 'utf8mb4',        # Full UTF-8 support for emoji/special chars
            'autocommit': False,         # Use transactions
            'connect_timeout': 10,       # Connection timeout in seconds
        }
    )
    
    return engine


# =====================================================
# SESSION FACTORY
# =====================================================
def create_session_factory(engine=None):
    """
    Create a session factory for database operations.
    
    Args:
        engine: SQLAlchemy engine (if None, creates a new one)
        
    Returns:
        sessionmaker: Session factory
    """
    if engine is None:
        engine = create_db_engine()
    
    return sessionmaker(
        bind=engine,
        expire_on_commit=False,  # Keep objects usable after commit
        class_=Session
    )


# =====================================================
# CONNECTION TESTING & UTILITIES
# =====================================================
def test_database_connection(engine=None) -> bool:
    """
    Test if database connection is working.
    
    Args:
        engine: SQLAlchemy engine (if None, creates a new one)
        
    Returns:
        bool: True if connection successful, False otherwise
    """
    try:
        if engine is None:
            engine = create_db_engine()
        
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            result.close()
            print(f"Database connection successful to {DB_NAME}@{DB_HOST}:{DB_PORT}")
            return True
    except Exception as e:
        print(f"✗ Database connection failed: {str(e)}")
        return False


def get_database_info(engine=None) -> dict[str, Any]:
    """
    Get information about the database.
    
    Args:
        engine: SQLAlchemy engine (if None, creates a new one)
        
    Returns:
        dict: Database information including tables, columns, etc.
    """
    if engine is None:
        engine = create_db_engine()
    
    inspector = inspect(engine)
    
    info = {
        'database_name': DB_NAME,
        'host': DB_HOST,
        'port': DB_PORT,
        'tables': inspector.get_table_names(),
        'table_count': len(inspector.get_table_names()),
    }
    
    return info


def print_database_info(engine=None) -> None:
    """Print formatted database information."""
    info = get_database_info(engine)
    print("\n" + "="*50)
    print("DATABASE INFORMATION")
    print("="*50)
    print(f"Database: {info['database_name']}")
    print(f"Host: {info['host']}")
    print(f"Port: {info['port']}")
    print(f"Total Tables: {info['table_count']}")
    if info['tables']:
        print("\nExisting Tables:")
        for table in info['tables']:
            print(f"  - {table}")
    else:
        print("\nNo tables found. Run Base.metadata.create_all() to create them.")
    print("="*50 + "\n")


# =====================================================
# FLASK-SQLALCHEMY CONFIGURATION CLASS
# =====================================================
class MySQLConfig:
    """
    Configuration class for Flask with MySQL backend.
    Can be used with app.config.from_object(MySQLConfig)
    """
    
    # Secret key for Flask sessions
    SECRET_KEY = os.environ.get('SECRET_KEY', 'mango_market_secure_key_2026')
    
    # Database configuration using MySQL instead of SQLite
    SQLALCHEMY_DATABASE_URI = get_database_url()
    
    # Disable SQLAlchemy modification tracking (slight performance boost)
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    
    # SQLAlchemy engine options for MySQL
    SQLALCHEMY_ENGINE_OPTIONS = {
        'poolclass': QueuePool,
        'pool_size': 10,
        'max_overflow': 20,
        'pool_pre_ping': True,
        'pool_recycle': 3600,
        'echo': False,
        'connect_args': {
            'charset': 'utf8mb4',
            'connect_timeout': 10,
        }
    }
    
    # Session configuration (security)
    SESSION_COOKIE_SECURE = os.getenv('SESSION_COOKIE_SECURE', 'False').lower() == 'true'
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    SESSION_COOKIE_NAME = 'mango_session'
    PERMANENT_SESSION_LIFETIME = 3600  # 1 hour


# =====================================================
# EXAMPLE USAGE REFERENCE
# =====================================================
"""
FLASK-SQLALCHEMY INTEGRATION (in main.py):
===========================================

from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from db_config import MySQLConfig

app = Flask(__name__)
app.config.from_object(MySQLConfig)  # Use MySQL config
db = SQLAlchemy(app)

# Create all tables
with app.app_context():
    db.create_all()


STANDALONE SQLALCHEMY USAGE:
============================

from sqlalchemy.orm import Session
from db_config import create_db_engine, create_session_factory, test_database_connection
from main import Base  # Import your declarative base

# Create engine and test connection
engine = create_db_engine()
if test_database_connection(engine):
    # Create all tables
    Base.metadata.create_all(engine)
    
    # Use session for queries
    SessionLocal = create_session_factory(engine)
    with SessionLocal() as session:
        # Your database operations here
        pass


EXAMPLE: CREATE ALL TABLES
==========================

# In Flask context:
with app.app_context():
    db.create_all()
    print("All tables created successfully!")

# Or standalone:
from db_config import create_db_engine, test_database_connection
from main import Base

engine = create_db_engine()
if test_database_connection(engine):
    Base.metadata.create_all(engine)
    print("All tables created successfully!")
"""


if __name__ == '__main__':
    """
    Test script: Run directly to verify MySQL connection and see database info
    
    Usage: python db_config.py
    """
    print("Testing MySQL Database Connection...\n")
    
    engine = create_db_engine()
    
    # Test connection
    if test_database_connection(engine):
        # Print database info
        print_database_info(engine)
    else:
        print("\nWARNING: Database connection failed. Check your credentials in .env file")
        print(f"\nCurrent Configuration:")
        print(f"  Host: {DB_HOST}")
        print(f"  Port: {DB_PORT}")
        print(f"  User: {DB_USER}")
        print(f"  Database: {DB_NAME}")
