"""
Mango Market Platform - Production Flask App Entry Point

This module exposes the importable application object expected by Gunicorn.
The factory remains in main.py to avoid changing the app architecture.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import create_app

app = create_app()

if __name__ == '__main__':
    print("\nStarting Mango Market Platform...")
    print("   Creating Flask app with all systems (Farmer, Broker, Host)...\n")

    port = int(os.getenv('PORT', '5000'))
    print(f"\nStarting server on http://0.0.0.0:{port}")
    print("   Press CTRL+C to stop\n")

    app.run(
        debug=False,
        host='0.0.0.0',
        port=port,
        use_reloader=False,
        threaded=True,
    )