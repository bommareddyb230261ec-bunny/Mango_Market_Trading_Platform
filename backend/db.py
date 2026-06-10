"""
Database helpers for MySQL using SQLAlchemy.

Provides:
- `engine` (SQLAlchemy Engine)
- `SessionLocal` (session factory)
- `create_tables(metadata)` to create tables from a SQLAlchemy `MetaData` object
- `test_connection()` helper

Usage examples:

1) In Flask app context (recommended):
   from backend.db import engine
   from backend.main import db  # import models to register them on db.metadata

   # Create all tables declared using Flask-SQLAlchemy models
   db.metadata.create_all(engine)

2) Standalone (no Flask app):
   from backend.db import engine, SessionLocal
   # Import modules that declare models so tables are registered
   import backend.main  # registers models on the SQLAlchemy metadata
   from backend.main import db
   db.metadata.create_all(engine)

3) Simple connection test:
   from backend.db import test_connection
   test_connection()

Note: This module intentionally avoids importing the Flask `app` to prevent
app creation side-effects. Import model modules before calling `create_tables`.
"""

from typing import Callable
import os
from backend.db_config import create_db_engine, create_session_factory, test_database_connection

# Create engine and session factory at import-time (uses environment variables)
engine = create_db_engine()
SessionLocal = create_session_factory(engine)


def get_session() -> Callable:
    """Return a new SQLAlchemy Session (call as context manager: `with get_session()() as s:`).

    Example:
        with get_session()() as session:
            session.add(obj)
            session.commit()
    """
    return SessionLocal


def create_tables(metadata) -> None:
    """Create tables for the provided SQLAlchemy `MetaData` on the configured engine.

    Args:
        metadata: SQLAlchemy `MetaData` (for Flask-SQLAlchemy use `db.metadata`).
    """
    metadata.create_all(engine)


def test_connection() -> bool:
    """Test the DB connection using the configured engine. Returns True on success."""
    return test_database_connection(engine)


if __name__ == '__main__':
    print("Testing DB connection using backend/db.py...")
    ok = test_connection()
    if ok:
        print("Connection OK. You can run create_tables(db.metadata) to create tables.")
    else:
        print("Connection failed. Check environment variables and DB server.")
