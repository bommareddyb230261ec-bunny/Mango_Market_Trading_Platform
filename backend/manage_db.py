"""
One-off DB maintenance script for Mango Market Platform
- Backs up the SQLite database file
- Removes duplicate `order_id` entries from `weighments` (keeps earliest `created_at`)
- Drops any non-unique index that targets `order_id` on `weighments`
- Creates a unique index `ux_weighments_order_id` on `weighments(order_id)`

Usage:
    python manage_db.py --db instance/database.db

Run this script from the repository root (where `instance/` is located).
"""

import argparse
import shutil
import sys
import time
from pathlib import Path
import logging

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.engine import Engine
from sqlalchemy import inspect

from backend.db import engine, SessionLocal

logger = logging.getLogger(__name__)


def backup_db_file(db_path: Path) -> Path:
    timestamp = time.strftime("%Y%m%d-%H%M%S")
    backup_path = db_path.with_name(f"{db_path.stem}.backup-{timestamp}{db_path.suffix}")
    shutil.copy2(db_path, backup_path)
    return backup_path


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
            # MySQL / MariaDB syntax
            conn.execute(text(f"DROP INDEX {name} ON weighments"))
            dropped.append(name)
    return dropped


def create_unique_index(conn: Engine):
    logger.info("Creating unique index 'ux_weighments_order_id' ON weighments(order_id)")
    conn.execute(text("CREATE UNIQUE INDEX ux_weighments_order_id ON weighments(order_id)"))


def run_migration(db_file_path: Path | None = None) -> int:
    """Run maintenance using SQLAlchemy engine.

    If `db_file_path` is provided and exists, it will be backed up and removed after
    a successful migration (this removes the old SQLite file).
    """
    sqlite_db = None
    if db_file_path:
        sqlite_db = db_file_path

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

    # If migration succeeded and a sqlite DB file was provided, back it up and remove it
    if sqlite_db and sqlite_db.exists():
        try:
            logger.info(f"Backing up SQLite DB file: {sqlite_db}")
            backup_path = backup_db_file(sqlite_db)
            logger.info(f"Backup created at: {backup_path}")
            logger.info(f"Removing SQLite DB file: {sqlite_db}")
            sqlite_db.unlink()
        except Exception as e:
            logger.exception("Failed to backup/remove sqlite DB file: %s", e)
            # Not fatal for migration success

    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='DB maintenance script for Mango Market')
    parser.add_argument('--db', default='instance/database.db', help='Path to the SQLite DB file')
    args = parser.parse_args()
    db_path = Path(args.db)
    code = run_migration(db_path)
    sys.exit(code)
