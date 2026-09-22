"""
Mango Market Platform - Flask Server Entry Point
Uses the modular Flask application factory architecture.
"""

import os
from dotenv import load_dotenv

load_dotenv()

try:
    from backend.app import app
except ImportError:
    from app import app

if __name__ == '__main__':
    port = int(os.getenv('PORT', '5000'))
    app.run(
        debug=False,
        host='0.0.0.0',
        port=port,
        use_reloader=False,
        threaded=True
    )
