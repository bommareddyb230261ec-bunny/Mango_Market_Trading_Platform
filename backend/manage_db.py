"""
One-off DB maintenance script for Mango Market Platform
- Removes duplicate `order_id` entries from `weighments` (keeps earliest `created_at`)
- Drops any non-unique index that targets `order_id` on `weighments`
- Creates a unique index `ux_weighments_order_id` on `weighments(order_id)`

Usage:
    python backend/manage_db.py

Run this script from the repository root.
"""

import sys
import logging

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import Engine
from sqlalchemy import inspect

from backend.db import engine, SessionLocal

logger = logging.getLogger(__name__)


def find_duplicate_order_ids(conn: Engine):
    result = conn.execute(text("SELECT order_id, COUNT(*) as c FROM weighments GROUP BY order_id HAVING c > 1"))
    return [row[0] for row in result.fetchall()]


def delete_duplicates_keep_earliest(conn: Engine, order_id: str) -> int:
    # Get ids ordered by created_at, id (keep earliest)
    rows = conn.execute(text("SELECT id FROM weighments WHERE order_id=:oid ORDER BY created_at ASC, id ASC"), {"oid": order_id}).fetchall()
    ids = [r[0] for r in rows]
    if len(ids) <= 1:
        return 0
    to_delete = ids[1:]
    # Bulk delete
    for _id in to_delete:
        conn.execute(text("DELETE FROM weighments WHERE id = :id"), {"id": _id})
    return len(to_delete)


def drop_non_unique_order_index(conn: Engine):
    inspector = inspect(conn)
    indexes = inspector.get_indexes('weighments')
    dropped = []
    for idx in indexes:
        name = idx.get('name')
        unique = idx.get('unique', False)
        cols = idx.get('column_names', [])
        if unique:
            continue
        if 'order_id' in cols:
            logger.info(f"Dropping non-unique index '{name}' on weighments(order_id)")
            # MySQL syntax
            conn.execute(text(f"DROP INDEX {name} ON weighments"))
            dropped.append(name)
    return dropped


def create_unique_index(conn: Engine):
    logger.info("Creating unique index 'ux_weighments_order_id' ON weighments(order_id)")
    conn.execute(text("CREATE UNIQUE INDEX ux_weighments_order_id ON weighments(order_id)"))


def run_migration() -> int:
    """Run maintenance using SQLAlchemy engine.
    """
    # Use engine.begin() to run in a transaction
    with engine.begin() as conn:
        try:
            duplicates = find_duplicate_order_ids(conn)
            total_deleted = 0
            logger.info(f"Found {len(duplicates)} duplicate order_id groups")
            for oid in duplicates:
                deleted = delete_duplicates_keep_earliest(conn, oid)
                if deleted:
                    logger.info(f"Deleted {deleted} duplicate rows for order_id={oid}")
                total_deleted += deleted

            dropped = drop_non_unique_order_index(conn)
            if dropped:
                logger.info(f"Dropped indexes: {dropped}")

            try:
                create_unique_index(conn)
            except IntegrityError as e:
                logger.error("Failed to create unique index - duplicates may still exist: %s", e)
                raise

            logger.info(f"Migration completed. Total duplicate rows removed: {total_deleted}")

        except Exception as e:
            logger.exception("Migration failed: %s", e)
            return 1

    return 0


if __name__ == '__main__':
    code = run_migration()
    sys.exit(code)
