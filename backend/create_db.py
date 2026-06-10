"""Create MySQL database from environment variables or defaults.

Run: python backend/create_db.py
"""
import os
from dotenv import load_dotenv
import pymysql

load_dotenv()

DB_HOST = os.getenv('DB_HOST', 'localhost')
DB_PORT = int(os.getenv('DB_PORT', '3306'))
DB_USER = os.getenv('DB_USER', 'root')
DB_PASSWORD = os.getenv('DB_PASSWORD', '')
DB_NAME = os.getenv('DB_NAME', 'mango_market')

def main():
    try:
        conn = pymysql.connect(host=DB_HOST, user=DB_USER, password=DB_PASSWORD, port=DB_PORT)
        conn.autocommit(True)
        cur = conn.cursor()
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
        print('CREATE_DB_OK')
        cur.close()
        conn.close()
    except Exception as e:
        print('CREATE_DB_ERROR', e)
        raise

if __name__ == '__main__':
    main()
